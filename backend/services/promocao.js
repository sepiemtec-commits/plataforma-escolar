const {
  Turma, Usuario, Escola, HistoricoEscolar, Log
} = require('../database/schema');
const { montarBoletimCompleto } = require('./boletim');
const { emitirDeclaracao } = require('./declaracao');
const {
  inferirNivel,
  proximaSerie,
  textoSerie,
  sugerirNomeTurma,
  normalizarProfessorId
} = require('../constants/ensino');

const { disciplinasPadraoPorTurma } = require('../constants/disciplinas');

function avaliarAprovacao(boletim) {
  const medias = boletim?.disciplinas?.map(d => d.mediaFinal).filter(m => m != null) || [];
  if (!medias.length) {
    return { aprovado: false, mediaGeral: null, motivo: 'Sem notas lançadas' };
  }
  const mediaGeral = Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 100) / 100;
  const reprovadas = boletim.disciplinas.filter(d => d.mediaFinal != null && d.mediaFinal < 6);
  if (mediaGeral < 6 || reprovadas.length > 0) {
    return {
      aprovado: false,
      mediaGeral,
      motivo: reprovadas.length
        ? `Média abaixo de 6 em: ${reprovadas.map(r => r.disciplina).join(', ')}`
        : `Média geral ${mediaGeral} abaixo do mínimo (6,0)`
    };
  }
  return { aprovado: true, mediaGeral, motivo: 'Aprovado' };
}

async function obterTurmaDestino(escolaId, nivel, ano, turno, serie, professorId) {
  let turma = await Turma.findOne({
    escola_id: escolaId,
    nivel,
    ano,
    turno: turno || 'Manhã',
    serie: serie || 'A'
  });

  if (!turma) {
    turma = await Turma.create({
      nome: sugerirNomeTurma(nivel, ano, serie || 'A'),
      nivel,
      ano,
      serie: serie || 'A',
      turno: turno || 'Manhã',
      professor_id: normalizarProfessorId(nivel, professorId),
      escola_id: escolaId,
      alunos: []
    });
  }

  return turma;
}

async function registrarHistoricoAno(aluno, turma, escola, anoLetivo, resultado, boletim) {
  const notas = (boletim?.disciplinas || []).map(d => ({
    disciplina: d.disciplina,
    cargaHoraria: d.cargaHoraria || 40,
    nota: d.mediaFinal,
    faltas: d.faltas || 0
  }));

  if (!notas.length) {
    disciplinasPadraoPorTurma(turma).forEach(d => notas.push({ disciplina: d, cargaHoraria: 40, nota: null, faltas: 0 }));
  }

  const nivel = inferirNivel(turma);
  const existente = await HistoricoEscolar.findOne({ aluno_id: aluno._id, anoLetivo });
  const payload = {
    aluno_id: aluno._id,
    escola_id: escola._id,
    anoLetivo,
    serie: textoSerie(nivel, turma.ano),
    turma: turma.serie || 'A',
    turno: turma.turno || aluno.turno,
    resultado: resultado === 'Aprovado' ? 'Progressão Plena' : 'Retido',
    instituicao: escola.nome,
    notas
  };

  if (existente) {
    Object.assign(existente, payload);
    await existente.save();
    return existente;
  }
  return HistoricoEscolar.create(payload);
}

async function processarAluno(alunoId, turma, escola, diretor, anoLetivo, executar) {
  const aluno = await Usuario.findById(alunoId);
  if (!aluno) return null;

  const boletim = await montarBoletimCompleto(alunoId);
  const avaliacao = avaliarAprovacao(boletim);
  const nivel = inferirNivel(turma);
  const serieCursada = textoSerie(nivel, turma.ano);

  const base = {
    alunoId: aluno._id,
    alunoNome: aluno.nome,
    turmaOrigem: turma.nome,
    serieCursada,
    mediaGeral: avaliacao.mediaGeral,
    aprovado: avaliacao.aprovado,
    motivo: avaliacao.motivo
  };

  if (!executar) {
    if (!avaliacao.aprovado) {
      return { ...base, acao: 'retido', turmaDestino: null, declaracaoId: null };
    }
    const prox = proximaSerie(nivel, turma.ano);
    if (!prox) {
      return { ...base, acao: 'concluinte', turmaDestino: 'Concluiu Ensino Médio', declaracaoId: null };
    }
    return {
      ...base,
      acao: 'promover',
      turmaDestino: sugerirNomeTurma(prox.nivel, prox.ano, turma.serie),
      seriePromovida: textoSerie(prox.nivel, prox.ano)
    };
  }

  await registrarHistoricoAno(
    aluno,
    turma,
    escola,
    anoLetivo,
    avaliacao.aprovado ? 'Aprovado' : 'Retido',
    boletim
  );

  if (!avaliacao.aprovado) {
    const decl = await emitirDeclaracao({
      aluno, escola, diretor, turmaOrigem: turma, turmaDestino: null,
      anoLetivo, nivel, serieCursada, seriePromovida: null,
      resultado: 'Retido', mediaGeral: avaliacao.mediaGeral,
      promovidoAutomaticamente: true
    });
    return { ...base, acao: 'retido', turmaDestino: null, declaracaoId: decl._id };
  }

  const prox = proximaSerie(nivel, turma.ano);
  if (!prox) {
    await Turma.findByIdAndUpdate(turma._id, { $pull: { alunos: aluno._id } });
    const decl = await emitirDeclaracao({
      aluno, escola, diretor, turmaOrigem: turma, turmaDestino: null,
      anoLetivo, nivel, serieCursada, seriePromovida: null,
      resultado: 'Concluinte', mediaGeral: avaliacao.mediaGeral,
      promovidoAutomaticamente: true
    });
    return { ...base, acao: 'concluinte', turmaDestino: null, declaracaoId: decl._id };
  }

  const turmaDestino = await obterTurmaDestino(
    escola._id,
    prox.nivel,
    prox.ano,
    turma.turno,
    turma.serie,
    turma.professor_id
  );

  await Turma.findByIdAndUpdate(turma._id, { $pull: { alunos: aluno._id } });
  await Turma.findByIdAndUpdate(turmaDestino._id, { $addToSet: { alunos: aluno._id } });
  await Usuario.findByIdAndUpdate(aluno._id, { turno: turmaDestino.turno });

  const seriePromovida = textoSerie(prox.nivel, prox.ano);
  const decl = await emitirDeclaracao({
    aluno, escola, diretor, turmaOrigem: turma, turmaDestino,
    anoLetivo, nivel, serieCursada, seriePromovida,
    resultado: 'Aprovado', mediaGeral: avaliacao.mediaGeral,
    promovidoAutomaticamente: true
  });

  return {
    ...base,
    acao: 'promover',
    turmaDestino: turmaDestino.nome,
    seriePromovida,
    declaracaoId: decl._id
  };
}

async function previewPromocao(escolaId, turmaId) {
  const filtro = { escola_id: escolaId };
  if (turmaId) filtro._id = turmaId;

  const turmas = await Turma.find(filtro);
  const escola = await Escola.findById(escolaId).populate('diretor_id', 'nome');
  const anoLetivo = escola?.configuracao?.anoLetivo || new Date().getFullYear();
  const resultados = [];

  for (const turma of turmas) {
    for (const alunoId of turma.alunos || []) {
      const r = await processarAluno(alunoId, turma, escola, escola?.diretor_id, anoLetivo, false);
      if (r) resultados.push(r);
    }
  }

  return {
    anoLetivo,
    total: resultados.length,
    promover: resultados.filter(r => r.acao === 'promover').length,
    retidos: resultados.filter(r => r.acao === 'retido').length,
    concluintes: resultados.filter(r => r.acao === 'concluinte').length,
    alunos: resultados
  };
}

async function executarPromocao(escolaId, turmaId, usuarioId, ip) {
  const filtro = { escola_id: escolaId };
  if (turmaId) filtro._id = turmaId;

  const turmas = await Turma.find(filtro);
  const escola = await Escola.findById(escolaId).populate('diretor_id', 'nome');
  const anoLetivo = escola?.configuracao?.anoLetivo || new Date().getFullYear();
  const resultados = [];

  for (const turma of turmas) {
    for (const alunoId of [...(turma.alunos || [])]) {
      const r = await processarAluno(alunoId, turma, escola, escola?.diretor_id, anoLetivo, true);
      if (r) resultados.push(r);
    }
  }

  await Log.create({
    usuario_id: usuarioId,
    acao: 'PROMOCAO_AUTOMATICA',
    modulo: 'promocao',
    descricao: `Promoção ${anoLetivo}: ${resultados.filter(r => r.acao === 'promover').length} promovidos`,
    ipAddress: ip
  });

  await Escola.findByIdAndUpdate(escolaId, {
    $set: { 'configuracao.anoLetivo': anoLetivo + 1 }
  });

  return {
    anoLetivo,
    total: resultados.length,
    promovidos: resultados.filter(r => r.acao === 'promover').length,
    retidos: resultados.filter(r => r.acao === 'retido').length,
    concluintes: resultados.filter(r => r.acao === 'concluinte').length,
    alunos: resultados
  };
}

module.exports = {
  avaliarAprovacao,
  previewPromocao,
  executarPromocao
};
