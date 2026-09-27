const { Avaliacao, Presenca, Turma, Usuario, Escola } = require('../database/schema');

const BIMESTRES = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
/** Média mínima para aprovação (alinhada à promoção escolar). */
const MEDIA_APROVACAO = Number(process.env.MEDIA_APROVACAO || 6);

function resultadoPorMedia(media) {
  if (media == null || Number.isNaN(Number(media))) return 'Sem notas';
  const m = Number(media);
  if (m < 5) return 'Reprovado';
  if (m < MEDIA_APROVACAO) return 'Recuperação';
  return 'Aprovado';
}

function avaliarSituacaoGeral(disciplinas) {
  const comNota = (disciplinas || []).filter((d) => d.mediaFinal != null);
  if (!comNota.length) {
    return { situacaoGeral: 'Sem notas', mediaGeral: null };
  }
  const mediaGeral =
    Math.round((comNota.reduce((s, d) => s + Number(d.mediaFinal), 0) / comNota.length) * 100) / 100;
  const reprovadas = comNota.filter((d) => Number(d.mediaFinal) < MEDIA_APROVACAO);
  if (reprovadas.length > 0 || mediaGeral < MEDIA_APROVACAO) {
    return {
      situacaoGeral: reprovadas.some((d) => Number(d.mediaFinal) < 5) ? 'Reprovado' : 'Recuperação',
      mediaGeral,
      disciplinasEmRecuperacao: reprovadas.map((d) => d.disciplina)
    };
  }
  return { situacaoGeral: 'Aprovado', mediaGeral, disciplinasEmRecuperacao: [] };
}

function pesoTipo(tipo) {
  return tipo === 'comportamental' ? 0.5 : 1;
}

function calcularMedia(notas) {
  let soma = 0;
  let peso = 0;
  if (notas.prova != null) { soma += notas.prova * 1; peso += 1; }
  if (notas.teste != null) { soma += notas.teste * 1; peso += 1; }
  if (notas.comportamental != null) { soma += notas.comportamental * 0.5; peso += 0.5; }
  return peso > 0 ? Math.round((soma / peso) * 100) / 100 : null;
}

function mapaAvaliacoes(avaliacoes) {
  const mapa = {};
  avaliacoes.forEach(av => {
    const key = `${av.disciplina}_${av.periodo}`;
    if (!mapa[key]) mapa[key] = {};
    if (av.tipo === 'prova_bimestral') mapa[key].prova = av.nota;
    if (av.tipo === 'teste_bimestral') mapa[key].teste = av.nota;
    if (av.tipo === 'comportamental') mapa[key].comportamental = av.nota;
  });
  return mapa;
}

function contarFaltasDisciplina(presencas, turmaId, disciplina) {
  return presencas.filter(p =>
    String(p.turma_id) === String(turmaId) &&
    p.status === 'falta' &&
    (p.disciplina === disciplina || (!p.disciplina && disciplina === 'Geral'))
  ).length;
}

async function obterDadosAluno(alunoId) {
  const aluno = await Usuario.findById(alunoId).select('-senha');
  if (!aluno) return null;

  const turma = await Turma.findOne({ alunos: alunoId })
    .populate('professor_id', 'nome');
  const escola = aluno.escola_id ? await Escola.findById(aluno.escola_id) : null;

  return { aluno, turma, escola };
}

async function montarBoletimCompleto(alunoId, disciplinaFiltro) {
  const { aluno, turma, escola } = await obterDadosAluno(alunoId);
  if (!aluno) return null;

  const avaliacoes = await Avaliacao.find({ aluno_id: alunoId });
  const presencas = await Presenca.find({ aluno_id: alunoId });
  const mapa = mapaAvaliacoes(avaliacoes);

  const disciplinas = [...new Set(avaliacoes.map(a => a.disciplina))];
  if (disciplinaFiltro) {
    return montarBoletimDisciplinas(aluno, turma, escola, [disciplinaFiltro], mapa, presencas);
  }
  if (!disciplinas.length) {
    disciplinas.push('Biologia', 'Matemática', 'Português');
  }

  return montarBoletimDisciplinas(aluno, turma, escola, disciplinas, mapa, presencas);
}

function montarBoletimDisciplinas(aluno, turma, escola, disciplinas, mapa, presencas) {
  const linhas = disciplinas.map(disciplina => {
    const bimestres = {};
    const mediasBim = [];

    BIMESTRES.forEach(bim => {
      const dados = mapa[`${disciplina}_${bim}`] || {};
      const media = calcularMedia(dados);
      bimestres[bim] = {
        av1: dados.prova ?? null,
        av2: dados.teste ?? null,
        av3: dados.comportamental ?? null,
        media
      };
      if (media != null) mediasBim.push(media);
    });

    const mediaFinal = mediasBim.length
      ? Math.round((mediasBim.reduce((a, b) => a + b, 0) / mediasBim.length) * 100) / 100
      : null;

    const faltas = turma ? contarFaltasDisciplina(presencas, turma._id, disciplina) : 0;

    return {
      disciplina,
      cargaHoraria: 40,
      professor: turma?.professor_id?.nome || '—',
      bimestres,
      mediaFinal,
      faltas,
      resultado: resultadoPorMedia(mediaFinal),
      recuperacaoFinal: null
    };
  });

  const { situacaoGeral, mediaGeral, disciplinasEmRecuperacao } = avaliarSituacaoGeral(linhas);

  return {
    aluno: {
      id: aluno._id,
      nome: aluno.nome,
      cpf: aluno.cpf,
      email: aluno.email
    },
    turma: turma ? { nome: turma.nome, serie: turma.nome, ano: turma.ano } : null,
    escola: escola
      ? {
          nome: escola.nome,
          cnpj: escola.cnpj || null,
          endereco: escola.endereco || null,
          telefone: escola.telefone || null,
          email: escola.email || null
        }
      : null,
    anoLetivo: escola?.configuracao?.anoLetivo || new Date().getFullYear(),
    bimestres: BIMESTRES,
    disciplinas: linhas,
    mediaGeral,
    situacaoGeral,
    disciplinasEmRecuperacao: disciplinasEmRecuperacao || [],
    mediaAprovacao: MEDIA_APROVACAO
  };
}

async function montarFichaIndividual(alunoId) {
  const boletim = await montarBoletimCompleto(alunoId);
  if (!boletim) return null;

  const { aluno, turma, escola } = await obterDadosAluno(alunoId);

  return {
    aluno: {
      ...boletim.aluno,
      dataNascimento: aluno.dataNascimento,
      endereco: aluno.endereco,
      cidade: aluno.cidade,
      uf: aluno.uf,
      filiacao_pai: aluno.filiacao_pai,
      filiacao_mae: aluno.filiacao_mae,
      nome_responsavel: aluno.nome_responsavel,
        turno: turma?.turno || aluno.turno || 'Manhã'
    },
    turma: boletim.turma,
    escola: boletim.escola,
    anoLetivo: boletim.anoLetivo,
    componentes: boletim.disciplinas.map(d => ({
      disciplina: d.disciplina,
      cargaHoraria: d.cargaHoraria,
      resultadoFinal: d.mediaFinal,
      resultado: d.resultado,
      faltas: d.faltas
    })),
    mediaGeral: boletim.mediaGeral,
    situacaoGeral: boletim.situacaoGeral
  };
}

async function montarFichaMatricula(alunoId) {
  const { aluno, turma, escola } = await obterDadosAluno(alunoId);
  if (!aluno) return null;

  return {
    escola: escola
      ? {
          nome: escola.nome,
          cnpj: escola.cnpj || null,
          endereco: escola.endereco || null,
          telefone: escola.telefone || null,
          email: escola.email || null
        }
      : { nome: 'Escola' },
    matricula: aluno.matriculaNumero || aluno.cpf,
    dadosAcademicos: {
      anoLetivo: escola?.configuracao?.anoLetivo || new Date().getFullYear(),
        turno: turma?.turno || aluno.turno || 'Manhã',
      serie: turma?.nome || '—',
      turma: turma?.serie || 'A',
      tipoEnsino: turma?.ano <= 5 ? 'Fundamental I' : turma?.ano <= 9 ? 'Fundamental II' : 'Ensino Médio'
    },
    dadosAluno: {
      nome: aluno.nome,
      sexo: aluno.sexo || '—',
      dataNascimento: aluno.dataNascimento,
      nacionalidade: aluno.nacionalidade || '—',
      naturalidade: aluno.naturalidade || '—',
      religiao: aluno.religiao || '—',
      endereco: aluno.endereco || '—',
      bairro: aluno.bairro || '—',
      telefone: aluno.telefone || '—',
      cidade: aluno.cidade || '—',
      uf: aluno.uf || '—',
      cep: aluno.cep || '—',
      cpf: aluno.cpf,
      email: aluno.email
    }
  };
}

module.exports = {
  BIMESTRES,
  MEDIA_APROVACAO,
  montarBoletimCompleto,
  montarFichaIndividual,
  montarFichaMatricula,
  calcularMedia,
  mapaAvaliacoes,
  contarFaltasDisciplina,
  pesoTipo,
  resultadoPorMedia,
  avaliarSituacaoGeral
};
