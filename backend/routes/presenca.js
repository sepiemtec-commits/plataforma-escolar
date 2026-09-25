// backend/routes/presenca.js - Rotas de Presença e Faltas
const express = require('express');
const router = express.Router();
const { Presenca, Usuario, Turma, DisciplinaConfig, Responsavel, Escola, Log } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { despachar } = require('../services/notificacaoDispatcher');
const { disciplinasDoProfessor, professorTemDisciplina } = require('../utils/professorDisciplinas');
const { disciplinaPermitidaParaTurma } = require('../constants/disciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');
const {
  filtroEscola,
  assertTurmaEscola,
  assertAlunoEscola,
  responderErroTenant
} = require('../utils/tenant');
const { validarConflitoPresencaTempo } = require('../utils/conflitosAgenda');

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

function montarResumoAluno(aluno, statuses) {
  const presentes = statuses.filter(s => s === 'presente').length;
  const faltas = statuses.filter(s => s === 'falta').length;
  const justificadas = statuses.filter(s => s === 'justificada').length;
  const atrasos = statuses.filter(s => s === 'atraso').length;
  const lancados = presentes + faltas + justificadas + atrasos;

  return {
    _id: aluno._id,
    nome: aluno.nome,
    cpf: aluno.cpf,
    presentes,
    faltas,
    justificadas,
    atrasos,
    lancados,
    taxaPresenca: lancados > 0 ? Number(((presentes / lancados) * 100).toFixed(1)) : null,
    taxaFalta: lancados > 0 ? Number(((faltas / lancados) * 100).toFixed(1)) : null
  };
}

async function notificarFaltaSeNecessario(presenca, data, statusAnterior) {
  if (statusAnterior === 'falta' || statusAnterior === presenca.status) return;
  if (presenca.status !== 'falta') return;

  const aluno = await Usuario.findById(presenca.aluno_id);
  if (!aluno) return;

  const escola = await Escola.findById(aluno.escola_id).select('configuracao');
  const cfg = escola?.configuracao || {};
  const canais = {
    whatsapp: cfg.alertasWhatsapp !== false,
    sms: Boolean(cfg.alertasSms),
    push: Boolean(cfg.alertasPush)
  };
  if (!canais.whatsapp && !canais.sms && !canais.push) return;

  const responsaveis = await Responsavel.find({ aluno_id: presenca.aluno_id });
  const numeros = new Set();
  const userIds = new Set();

  for (const responsavel of responsaveis) {
    if (responsavel.recebeNotificacoes === false) continue;
    if (responsavel.whatsapp) numeros.add(responsavel.whatsapp);
    if (responsavel.usuario_id) userIds.add(String(responsavel.usuario_id));
  }
  if (aluno.whatsapp_responsavel) numeros.add(aluno.whatsapp_responsavel);

  const dataFmt = new Date(data).toLocaleDateString('pt-BR');
  const resultado = await despachar({
    canais,
    numeros: [...numeros],
    userIds: [...userIds],
    escolaId: aluno.escola_id,
    titulo: 'Alerta de Falta',
    corpo: `${aluno.nome} teve falta registrada em ${dataFmt}.`,
    tipo: 'falta',
    meta: { nomeAluno: aluno.nome, data: dataFmt },
    url: '/painel-responsavel.html'
  });

  if (resultado.total > 0) {
    presenca.notificadoWhatsapp = true;
    await presenca.save();
  }
}

async function validarRegistroPresenca(usuario, { turma_id, disciplina, tempo, aluno_id }) {
  const disciplinaNome = formatarNomeDisciplina(disciplina?.trim());
  if (!disciplinaNome) {
    return { erro: { status: 400, mensagem: 'Selecione a disciplina' } };
  }

  if (usuario.tipo === 'professor') {
    const minhas = disciplinasDoProfessor(usuario);
    if (!minhas.length) {
      return { erro: { status: 403, mensagem: 'Nenhuma disciplina vinculada ao seu cadastro. Contate a secretaria.' } };
    }
    if (!professorTemDisciplina(usuario, disciplinaNome)) {
      return { erro: { status: 403, mensagem: `Você só pode registrar presença em: ${minhas.join(', ')}` } };
    }
  }

  const turma = await Turma.findOne({ _id: turma_id, escola_id: usuario.escola_id });
  if (!turma) {
    return { erro: { status: 403, mensagem: 'Turma não disponível para o seu cadastro' } };
  }

  if (aluno_id && !(turma.alunos || []).some(id => String(id) === String(aluno_id))) {
    return { erro: { status: 400, mensagem: 'Aluno não pertence a esta turma' } };
  }

  if (!disciplinaPermitidaParaTurma(disciplinaNome, turma)) {
    return {
      erro: {
        status: 400,
        mensagem: `${disciplinaNome} não é ofertada para esta turma/série`
      }
    };
  }

  const tempoNum = parseInt(tempo, 10);
  if (!tempoNum || tempoNum < 1) {
    return { erro: { status: 400, mensagem: 'Informe o tempo da aula' } };
  }

  const configDisciplina = await DisciplinaConfig.findOne({
    escola_id: usuario.escola_id,
    nome: disciplinaNome,
    ativo: true
  });

  if (!configDisciplina) {
    return { erro: { status: 400, mensagem: 'Disciplina não configurada pela secretaria' } };
  }

  if (tempoNum > configDisciplina.quantidadeTempos) {
    return {
      erro: {
        status: 400,
        mensagem: `${disciplinaNome} possui apenas ${configDisciplina.quantidadeTempos} tempo(s)`
      }
    };
  }

  return { turma, disciplinaNome, tempoNum, configDisciplina };
}

async function upsertPresenca(usuario, { aluno_id, turma_id, status, data, observacoes, disciplina, tempo }) {
  const validacao = await validarRegistroPresenca(usuario, { turma_id, disciplina, tempo, aluno_id });
  if (validacao.erro) {
    const err = new Error(validacao.erro.mensagem);
    err.status = validacao.erro.status;
    throw err;
  }

  const { disciplinaNome, tempoNum } = validacao;
  const { inicio, fim } = intervaloDia(data);

  // Mesmo aluno / mesma turma: um tempo do dia = uma disciplina
  const conflito = await validarConflitoPresencaTempo({
    alunoId: aluno_id,
    turmaId: turma_id,
    dataInicio: inicio,
    dataFim: fim,
    tempo: tempoNum,
    disciplinaNome
  });
  if (!conflito.ok) {
    const err = new Error(conflito.mensagem);
    err.status = 409;
    throw err;
  }

  // Chave: aluno + dia + tempo (disciplina só pode ser a mesma ou inexistente)
  let presenca = await Presenca.findOne({
    aluno_id,
    tempo: tempoNum,
    data: { $gte: inicio, $lt: fim }
  });

  const statusAnterior = presenca?.status;

  if (presenca) {
    if (presenca.disciplina !== disciplinaNome) {
      const err = new Error(
        `Conflito: o ${tempoNum}º tempo já está com ${presenca.disciplina}`
      );
      err.status = 409;
      throw err;
    }
    presenca.status = status;
    presenca.observacoes = observacoes || presenca.observacoes;
    presenca.professor_id = usuario._id;
    presenca.turma_id = turma_id;
    await presenca.save();
  } else {
    try {
      presenca = await Presenca.create({
        aluno_id,
        turma_id,
        professor_id: usuario._id,
        disciplina: disciplinaNome,
        tempo: tempoNum,
        status,
        data: inicio,
        observacoes
      });
    } catch (err) {
      if (err.code === 11000) {
        // Corrida: outro request criou no meio — atualiza o existente se for a mesma disciplina
        presenca = await Presenca.findOne({
          aluno_id,
          tempo: tempoNum,
          data: { $gte: inicio, $lt: fim }
        });
        if (!presenca) throw err;
        if (presenca.disciplina !== disciplinaNome) {
          const e = new Error(
            `Conflito de horário: o aluno já tem aula no ${tempoNum}º tempo deste dia`
          );
          e.status = 409;
          throw e;
        }
        presenca.status = status;
        presenca.observacoes = observacoes || presenca.observacoes;
        presenca.professor_id = usuario._id;
        presenca.turma_id = turma_id;
        await presenca.save();
      } else {
        throw err;
      }
    }
  }

  await notificarFaltaSeNecessario(presenca, data, statusAnterior);

  return presenca;
}

// ==================== REGISTRAR PRESENÇA (upsert por aluno/turma/dia/disciplina/tempo) ====================
router.post('/registrar', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { aluno_id, turma_id, status, data, observacoes, disciplina, tempo } = req.body;

    const presenca = await upsertPresenca(req.usuario, {
      aluno_id,
      turma_id,
      status,
      data,
      observacoes,
      disciplina,
      tempo
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'REGISTROU_PRESENÇA',
      modulo: 'presenca',
      descricao: `${status} — ${disciplina} ${tempo}º tempo`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Presença registrada com sucesso',
      presenca
    });
  } catch (error) {
    console.error('Erro ao registrar presença:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao registrar presença'
    });
  }
});

router.post('/registrar-lote', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { turma_id, data, disciplina, registros } = req.body;

    if (!turma_id || !data || !disciplina?.trim()) {
      return res.status(400).json({ sucesso: false, mensagem: 'Turma, data e disciplina são obrigatórios' });
    }

    if (!Array.isArray(registros) || !registros.length) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe ao menos um registro de presença' });
    }

    const salvos = [];
    for (const item of registros) {
      if (!item.aluno_id || !item.tempo || !item.status) continue;
      if (!['presente', 'falta', 'justificada', 'atraso'].includes(item.status)) continue;

      const presenca = await upsertPresenca(req.usuario, {
        aluno_id: item.aluno_id,
        turma_id,
        status: item.status,
        data,
        observacoes: item.observacoes || '',
        disciplina,
        tempo: item.tempo
      });
      salvos.push(presenca);
    }

    if (!salvos.length) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nenhum registro válido para salvar' });
    }

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'REGISTROU_PRESENÇA_LOTE',
      modulo: 'presenca',
      descricao: `${salvos.length} registro(s) — ${disciplina.trim()}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: `${salvos.length} registro(s) salvos`,
      total: salvos.length
    });
  } catch (error) {
    console.error('Erro ao registrar presença em lote:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao salvar frequência'
    });
  }
});

// ==================== VISÃO GERAL ====================
router.get('/visao-geral', autenticacao, requerEscola, async (req, res) => {
  try {
    const { data, turma_id, disciplina, modo, periodo, ano } = req.query;
    const modoVisao = modo === 'periodo' ? 'periodo' : 'dia';

    let inicio;
    let fim;
    let rotuloPeriodo = null;
    let anoLetivo = Number(ano) || new Date().getFullYear();

    if (modoVisao === 'periodo') {
      rotuloPeriodo = periodo || 'Anual';
      ({ inicio, fim } = intervaloPeriodo(anoLetivo, rotuloPeriodo));
    } else {
      const dataConsulta = data || new Date().toISOString().split('T')[0];
      ({ inicio, fim } = intervaloDia(dataConsulta));
      rotuloPeriodo = dataConsulta;
    }

    const filtroTurma = { ...filtroEscola(req) };
    if (turma_id) filtroTurma._id = turma_id;

    const turmas = await Turma.find(filtroTurma)
      .populate('alunos', 'nome cpf email')
      .sort({ nome: 1 });

    const turmaIds = turmas.map(t => t._id);
    const filtroPresenca = {
      turma_id: { $in: turmaIds },
      data: { $gte: inicio, $lt: fim }
    };
    if (disciplina) filtroPresenca.disciplina = disciplina;

    const presencas = await Presenca.find(filtroPresenca);

    const statusesPorAlunoTurma = {};
    presencas.forEach(p => {
      const key = `${p.aluno_id}_${p.turma_id}`;
      if (!statusesPorAlunoTurma[key]) statusesPorAlunoTurma[key] = [];
      if (['presente', 'falta', 'justificada', 'atraso'].includes(p.status)) {
        statusesPorAlunoTurma[key].push(p.status);
      }
    });

    let disciplinasConfig = [];
    if (req.usuario.escola_id) {
      disciplinasConfig = await DisciplinaConfig.find({
        escola_id: req.usuario.escola_id,
        ativo: true
      }).sort({ nome: 1 });
    }

    const quadro = turmas.map(turma => ({
      turma: { _id: turma._id, nome: turma.nome },
      alunos: (turma.alunos || []).map(aluno => {
        const key = `${aluno._id}_${turma._id}`;
        return montarResumoAluno(aluno, statusesPorAlunoTurma[key] || []);
      })
    }));

    res.json({
      sucesso: true,
      modo: modoVisao,
      periodo: rotuloPeriodo,
      anoLetivo,
      inicio,
      fim,
      disciplinas: disciplinasConfig.map(d => ({ nome: d.nome, quantidadeTempos: d.quantidadeTempos })),
      quadro
    });
  } catch (error) {
    console.error('Erro na visão geral:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar presenças' });
  }
});

// ==================== LISTAR PRESENÇA POR TURMA ====================
router.get('/turma/:turmaId', autenticacao, async (req, res) => {
  try {
    const { turmaId } = req.params;
    const data = typeof req.query.data === 'string' ? req.query.data : undefined;
    const disciplina = typeof req.query.disciplina === 'string' ? req.query.disciplina : undefined;

    await assertTurmaEscola(req, turmaId);

    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Disciplina não vinculada ao professor' });
      }
      if (disciplina && !professorTemDisciplina(req.usuario, disciplina)) {
        return res.status(403).json({
          sucesso: false,
          mensagem: `Você só pode consultar presença de: ${minhas.join(', ')}`
        });
      }
    }

    let filtro = { turma_id: turmaId };
    if (data) {
      const { inicio, fim } = intervaloDia(data);
      filtro.data = { $gte: inicio, $lt: fim };
    }
    if (disciplina) filtro.disciplina = disciplina;

    const presencas = await Presenca.find(filtro)
      .populate('aluno_id', 'nome email')
      .populate('professor_id', 'nome')
      .sort({ disciplina: 1, tempo: 1 });

    res.json({
      sucesso: true,
      total: presencas.length,
      presencas
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao listar presença:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar presença'
    });
  }
});

// ==================== HISTÓRICO DE PRESENÇA DO ALUNO ====================
router.get('/aluno/:alunoId', autenticacao, async (req, res) => {
  try {
    const { alunoId } = req.params;
    await assertAlunoEscola(req, alunoId);

    // Só a turma atual do aluno (evita misturar turmas antigas / duplicadas no seed)
    const turmasDoAluno = await Turma.find({ alunos: alunoId }).select('_id nome').lean();
    let turmaPrincipal = turmasDoAluno[0] || null;

    if (turmasDoAluno.length > 1) {
      const [top] = await Presenca.aggregate([
        { $match: { aluno_id: alunoId } },
        {
          $group: {
            _id: '$turma_id',
            n: { $sum: 1 },
            ultima: { $max: '$data' }
          }
        },
        { $sort: { ultima: -1, n: -1 } },
        { $limit: 1 }
      ]);
      if (top?._id) {
        turmaPrincipal = turmasDoAluno.find(t => String(t._id) === String(top._id)) || turmaPrincipal;
      }
    }

    const filtro = { aluno_id: alunoId };
    if (turmaPrincipal) {
      filtro.turma_id = turmaPrincipal._id;
    }

    const presencas = await Presenca.find(filtro)
      .populate('professor_id', 'nome')
      .populate('turma_id', 'nome')
      .sort({ data: -1, disciplina: 1, tempo: 1 });

    const totalAulas = presencas.length;
    const presentacoes = presencas.filter(p => p.status === 'presente').length;
    const faltas = presencas.filter(p => p.status === 'falta').length;
    const justificadas = presencas.filter(p => p.status === 'justificada').length;
    const atrasos = presencas.filter(p => p.status === 'atraso').length;

    const frequencia = totalAulas > 0 ? ((presentacoes / totalAulas) * 100).toFixed(2) : 0;

    res.json({
      sucesso: true,
      aluno_id: alunoId,
      turma: turmaPrincipal ? { _id: turmaPrincipal._id, nome: turmaPrincipal.nome } : null,
      presencas,
      estatisticas: {
        totalAulas,
        presentacoes,
        faltas,
        justificadas,
        atrasos,
        frequenciaPercentual: parseFloat(frequencia)
      }
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao listar presença do aluno:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar presença'
    });
  }
});

// ==================== ATUALIZAR PRESENÇA ====================
router.put('/:presencaId', autenticacao, verificarRole('professor'), requerEscola, async (req, res) => {
  try {
    const { presencaId } = req.params;
    const { status, observacoes } = req.body;

    const existente = await Presenca.findById(presencaId);
    if (!existente) {
      return res.status(404).json({ sucesso: false, mensagem: 'Presença não encontrada' });
    }
    await assertTurmaEscola(req, existente.turma_id);

    const presenca = await Presenca.findByIdAndUpdate(
      presencaId,
      { status, observacoes },
      { new: true }
    );

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ATUALIZOU_PRESENÇA',
      modulo: 'presenca',
      descricao: `Presença atualizada para ${status}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Presença atualizada',
      presenca
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao atualizar presença:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar presença'
    });
  }
});

// ==================== ESTATÍSTICAS DE PRESENÇA ====================
router.get('/estatisticas/:turmaId', autenticacao, async (req, res) => {
  try {
    const { turmaId } = req.params;
    await assertTurmaEscola(req, turmaId);

    const presencas = await Presenca.find({ turma_id: turmaId });
    
    const estatisticasPorAluno = {};
    
    presencas.forEach(p => {
      if (!estatisticasPorAluno[p.aluno_id]) {
        estatisticasPorAluno[p.aluno_id] = {
          aluno_id: p.aluno_id,
          total: 0,
          presente: 0,
          falta: 0,
          justificada: 0,
          atraso: 0
        };
      }
      estatisticasPorAluno[p.aluno_id].total++;
      estatisticasPorAluno[p.aluno_id][p.status]++;
    });

    const dados = Object.values(estatisticasPorAluno).map(est => ({
      ...est,
      frequencia: ((est.presente / est.total) * 100).toFixed(2)
    }));

    res.json({
      sucesso: true,
      estatisticas: dados
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao gerar estatísticas:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar estatísticas'
    });
  }
});

module.exports = router;
