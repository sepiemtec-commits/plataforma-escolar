// backend/services/diario.js — Diário de aula (presença + conteúdo programático)
const {
  Presenca,
  Conteudo,
  Turma,
  Escola,
  Usuario,
  DisciplinaConfig
} = require('../database/schema');
const {
  disciplinasDoProfessor,
  professorTemDisciplina
} = require('../utils/professorDisciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');

function parseDataLocal(data) {
  if (data instanceof Date) {
    const d = new Date(data);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const texto = String(data || '').trim();
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  }

  const d = new Date(texto);
  d.setHours(0, 0, 0, 0);
  return d;
}

function intervaloDia(data) {
  const inicio = parseDataLocal(data);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);
  return { inicio, fim };
}

function intervaloPeriodo(anoLetivo, periodo) {
  const ano = Number(anoLetivo) || new Date().getFullYear();
  const ranges = {
    '1º Bimestre': { inicio: new Date(ano, 1, 1), fim: new Date(ano, 4, 1) },
    '2º Bimestre': { inicio: new Date(ano, 4, 1), fim: new Date(ano, 7, 1) },
    '3º Bimestre': { inicio: new Date(ano, 7, 1), fim: new Date(ano, 9, 1) },
    '4º Bimestre': { inicio: new Date(ano, 9, 1), fim: new Date(ano + 1, 0, 1) },
    Anual: { inicio: new Date(ano, 1, 1), fim: new Date(ano + 1, 0, 1) }
  };
  return ranges[periodo] || ranges.Anual;
}

function formatarDataISO(d) {
  const data = d instanceof Date ? d : new Date(d);
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const day = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function montarResumoAluno(aluno, statuses) {
  const presentes = statuses.filter(s => s === 'presente').length;
  const faltas = statuses.filter(s => s === 'falta').length;
  const justificadas = statuses.filter(s => s === 'justificada').length;
  const atrasos = statuses.filter(s => s === 'atraso').length;
  const lancados = presentes + faltas + justificadas + atrasos;

  return {
    _id: aluno._id,
    nome: aluno.nome,
    matriculaNumero: aluno.matriculaNumero || null,
    presentes,
    faltas,
    justificadas,
    atrasos,
    lancados,
    taxaPresenca: lancados > 0 ? Number(((presentes / lancados) * 100).toFixed(1)) : null,
    taxaFalta: lancados > 0 ? Number(((faltas / lancados) * 100).toFixed(1)) : null
  };
}

/**
 * Monta o diário de aula completo (frequência + conteúdo programático).
 * @param {object} usuario - req.usuario
 * @param {object} query - { turma_id, disciplina, modo, data, periodo, ano, professor_id }
 */
async function montarDiarioAula(usuario, query = {}) {
  const {
    turma_id,
    disciplina,
    modo,
    data,
    periodo,
    ano,
    professor_id
  } = query;

  if (!turma_id) {
    const err = new Error('Selecione a turma');
    err.status = 400;
    throw err;
  }

  const disciplinaNome = formatarNomeDisciplina(disciplina?.trim() || '');
  if (!disciplinaNome) {
    const err = new Error('Selecione a disciplina');
    err.status = 400;
    throw err;
  }

  if (usuario.tipo === 'professor') {
    const minhas = disciplinasDoProfessor(usuario);
    if (!minhas.length) {
      const err = new Error('Nenhuma disciplina vinculada ao seu cadastro');
      err.status = 403;
      throw err;
    }
    if (!professorTemDisciplina(usuario, disciplinaNome)) {
      const err = new Error(`Você só pode consultar o diário de: ${minhas.join(', ')}`);
      err.status = 403;
      throw err;
    }
  }

  const turma = await Turma.findOne({
    _id: turma_id,
    ...(usuario.escola_id ? { escola_id: usuario.escola_id } : {})
  }).populate('alunos', 'nome matriculaNumero cpf');

  if (!turma) {
    const err = new Error('Turma não encontrada');
    err.status = 404;
    throw err;
  }

  const escola = await Escola.findById(turma.escola_id || usuario.escola_id);
  const anoLetivo = Number(ano) || escola?.configuracao?.anoLetivo || new Date().getFullYear();
  const modoVisao = modo === 'periodo' ? 'periodo' : 'dia';

  let inicio;
  let fim;
  let rotuloPeriodo;

  if (modoVisao === 'periodo') {
    rotuloPeriodo = periodo || 'Anual';
    ({ inicio, fim } = intervaloPeriodo(anoLetivo, rotuloPeriodo));
  } else {
    const dataConsulta = data || formatarDataISO(new Date());
    ({ inicio, fim } = intervaloDia(dataConsulta));
    rotuloPeriodo = dataConsulta;
  }

  const filtroBase = {
    turma_id: turma._id,
    disciplina: disciplinaNome,
    data: { $gte: inicio, $lt: fim }
  };

  // Professor: só o que ele lançou; coordenação pode filtrar por professor
  let professorFiltroId = null;
  if (usuario.tipo === 'professor') {
    professorFiltroId = usuario._id;
  } else if (professor_id) {
    professorFiltroId = professor_id;
  }

  if (professorFiltroId) {
    filtroBase.professor_id = professorFiltroId;
  }

  const [presencas, conteudos, disciplinaConfig, professorDoc] = await Promise.all([
    Presenca.find(filtroBase)
      .populate('aluno_id', 'nome matriculaNumero')
      .populate('professor_id', 'nome')
      .sort({ data: 1, tempo: 1 }),
    Conteudo.find(filtroBase)
      .populate('professor_id', 'nome')
      .sort({ data: 1 }),
    DisciplinaConfig.findOne({
      escola_id: turma.escola_id || usuario.escola_id,
      nome: disciplinaNome,
      ativo: true
    }),
    professorFiltroId
      ? Usuario.findById(professorFiltroId).select('nome')
      : Promise.resolve(null)
  ]);

  const statusesPorAluno = {};
  const detalhesPorAluno = {};
  const datasSet = new Set();

  presencas.forEach(p => {
    const alunoId = String(p.aluno_id?._id || p.aluno_id);
    if (!statusesPorAluno[alunoId]) statusesPorAluno[alunoId] = [];
    if (['presente', 'falta', 'justificada', 'atraso'].includes(p.status)) {
      statusesPorAluno[alunoId].push(p.status);
    }

    const dataKey = formatarDataISO(p.data);
    datasSet.add(dataKey);

    if (!detalhesPorAluno[alunoId]) detalhesPorAluno[alunoId] = {};
    if (!detalhesPorAluno[alunoId][dataKey]) detalhesPorAluno[alunoId][dataKey] = [];
    detalhesPorAluno[alunoId][dataKey].push({
      tempo: p.tempo,
      status: p.status,
      observacoes: p.observacoes || ''
    });
  });

  const alunos = (turma.alunos || [])
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(aluno => {
      const resumo = montarResumoAluno(aluno, statusesPorAluno[String(aluno._id)] || []);
      return {
        ...resumo,
        detalhes: detalhesPorAluno[String(aluno._id)] || {}
      };
    });

  const totalPresentes = alunos.reduce((s, a) => s + a.presentes, 0);
  const totalFaltas = alunos.reduce((s, a) => s + a.faltas, 0);
  const totalJustificadas = alunos.reduce((s, a) => s + a.justificadas, 0);
  const totalAtrasos = alunos.reduce((s, a) => s + a.atrasos, 0);
  const totalLancados = totalPresentes + totalFaltas + totalJustificadas + totalAtrasos;

  const nomesProfessores = [
    ...new Set(
      [
        ...(professorDoc?.nome ? [professorDoc.nome] : []),
        ...presencas.map(p => p.professor_id?.nome).filter(Boolean),
        ...conteudos.map(c => c.professor_id?.nome).filter(Boolean)
      ]
    )
  ];

  return {
    escola: {
      nome: escola?.nome || 'Escola',
      cnpj: escola?.cnpj || '',
      endereco: escola?.endereco || '',
      anoLetivo,
      assinatura: escola?.configuracao?.assinaturaInstituicao || {
        representante: 'Diretor(a) Escolar',
        cargo: 'Direção'
      }
    },
    turma: {
      _id: turma._id,
      nome: turma.nome,
      nivel: turma.nivel,
      ano: turma.ano,
      serie: turma.serie,
      turno: turma.turno || 'Manhã'
    },
    disciplina: disciplinaNome,
    quantidadeTempos: disciplinaConfig?.quantidadeTempos || null,
    professor: {
      nome: nomesProfessores.join(', ') || (usuario.tipo === 'professor' ? usuario.nome : '—')
    },
    modo: modoVisao,
    periodo: {
      rotulo: rotuloPeriodo,
      inicio,
      fim
    },
    datasAula: [...datasSet].sort(),
    alunos,
    conteudos: conteudos.map(c => ({
      _id: c._id,
      data: c.data,
      titulo: c.titulo,
      descricao: c.descricao || '',
      observacoes: c.observacoes || '',
      topicos: c.topicos || [],
      recursos: c.recursos || [],
      professor: c.professor_id?.nome || '—'
    })),
    resumoFrequencia: {
      presentes: totalPresentes,
      faltas: totalFaltas,
      justificadas: totalJustificadas,
      atrasos: totalAtrasos,
      lancados: totalLancados,
      taxaPresenca: totalLancados > 0
        ? Number(((totalPresentes / totalLancados) * 100).toFixed(1))
        : null,
      taxaFalta: totalLancados > 0
        ? Number(((totalFaltas / totalLancados) * 100).toFixed(1))
        : null
    },
    geradoEm: new Date()
  };
}

/**
 * Dados do diário de um dia específico para lançamento (presença + conteúdo + observações).
 */
async function montarDiaDiarioAula(usuario, query = {}) {
  const { turma_id, disciplina, data } = query;

  if (!turma_id || !disciplina?.trim() || !data) {
    const err = new Error('Informe turma, disciplina e data');
    err.status = 400;
    throw err;
  }

  const disciplinaNome = formatarNomeDisciplina(disciplina.trim());
  if (!disciplinaNome) {
    const err = new Error('Disciplina inválida');
    err.status = 400;
    throw err;
  }

  if (usuario.tipo === 'professor' && !professorTemDisciplina(usuario, disciplinaNome)) {
    const minhas = disciplinasDoProfessor(usuario);
    const err = new Error(`Você só pode lançar diário de: ${minhas.join(', ') || 'nenhuma disciplina'}`);
    err.status = 403;
    throw err;
  }

  const turma = await Turma.findOne({
    _id: turma_id,
    ...(usuario.escola_id ? { escola_id: usuario.escola_id } : {})
  }).populate('alunos', 'nome matriculaNumero');

  if (!turma) {
    const err = new Error('Turma não encontrada');
    err.status = 404;
    throw err;
  }

  const { inicio, fim } = intervaloDia(data);
  const filtroBase = {
    turma_id: turma._id,
    disciplina: disciplinaNome,
    data: { $gte: inicio, $lt: fim }
  };

  if (usuario.tipo === 'professor') {
    filtroBase.professor_id = usuario._id;
  }

  const [presencas, conteudos, disciplinaConfig, escola] = await Promise.all([
    Presenca.find(filtroBase)
      .populate('aluno_id', 'nome')
      .sort({ tempo: 1 }),
    Conteudo.find(filtroBase)
      .populate('professor_id', 'nome')
      .sort({ data: 1 }),
    DisciplinaConfig.findOne({
      escola_id: turma.escola_id || usuario.escola_id,
      nome: disciplinaNome,
      ativo: true
    }),
    Escola.findById(turma.escola_id || usuario.escola_id).select('nome configuracao')
  ]);

  const quantidadeTempos = disciplinaConfig?.quantidadeTempos || 1;
  const statuses = {};
  presencas.forEach(p => {
    const alunoId = String(p.aluno_id?._id || p.aluno_id);
    statuses[`${alunoId}_${p.tempo}`] = p.status;
  });

  const alunos = (turma.alunos || [])
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(a => ({
      _id: a._id,
      nome: a.nome,
      matriculaNumero: a.matriculaNumero || null
    }));

  const conteudoDia = conteudos[0] || null;

  return {
    escola: {
      nome: escola?.nome || 'Escola',
      anoLetivo: escola?.configuracao?.anoLetivo || new Date().getFullYear()
    },
    turma: {
      _id: turma._id,
      nome: turma.nome,
      nivel: turma.nivel,
      ano: turma.ano,
      serie: turma.serie,
      turno: turma.turno || 'Manhã'
    },
    disciplina: disciplinaNome,
    data,
    quantidadeTempos,
    podeEditar: usuario.tipo === 'professor',
    alunos,
    presencas: statuses,
    conteudo: conteudoDia
      ? {
          _id: conteudoDia._id,
          titulo: conteudoDia.titulo || '',
          descricao: conteudoDia.descricao || '',
          observacoes: conteudoDia.observacoes || '',
          topicos: conteudoDia.topicos || []
        }
      : null
  };
}

module.exports = {
  montarDiarioAula,
  montarDiaDiarioAula
};
