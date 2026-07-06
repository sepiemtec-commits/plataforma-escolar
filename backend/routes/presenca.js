// backend/routes/presenca.js - Rotas de Presença e Faltas
const express = require('express');
const router = express.Router();
const { Presenca, Usuario, Turma, DisciplinaConfig, Responsavel, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const notificadorWhatsApp = require('../services/whatsapp');
const { disciplinasDoProfessor, professorTemDisciplina } = require('../utils/professorDisciplinas');
const { disciplinaPermitidaParaTurma } = require('../constants/disciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');

function intervaloDia(data) {
  const inicio = new Date(data);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);
  return { inicio, fim };
}

async function notificarFaltaSeNecessario(presenca, data, statusAnterior) {
  if (statusAnterior === 'falta' || statusAnterior === presenca.status) return;
  if (presenca.status !== 'falta') return;

  const responsaveis = await Responsavel.find({ aluno_id: presenca.aluno_id });
  const aluno = await Usuario.findById(presenca.aluno_id);

  for (const responsavel of responsaveis) {
    if (responsavel.recebeNotificacoes) {
      await notificadorWhatsApp.enviarAlertaFalta(
        responsavel.whatsapp,
        aluno.nome,
        new Date(data).toLocaleDateString('pt-BR')
      );
      presenca.notificadoWhatsapp = true;
      await presenca.save();
    }
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

  let presenca = await Presenca.findOne({
    aluno_id,
    turma_id,
    disciplina: disciplinaNome,
    tempo: tempoNum,
    data: { $gte: inicio, $lt: fim }
  });

  const statusAnterior = presenca?.status;

  if (presenca) {
    presenca.status = status;
    presenca.observacoes = observacoes || presenca.observacoes;
    presenca.professor_id = usuario._id;
    await presenca.save();
  } else {
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
router.get('/visao-geral', autenticacao, async (req, res) => {
  try {
    const { data, turma_id, disciplina } = req.query;
    const dataConsulta = data || new Date().toISOString().split('T')[0];
    const { inicio, fim } = intervaloDia(dataConsulta);

    const filtroTurma = req.usuario.escola_id
      ? { escola_id: req.usuario.escola_id }
      : {};
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

    const mapaPresenca = {};
    presencas.forEach(p => {
      const key = `${p.aluno_id}_${p.turma_id}_${p.disciplina || 'Geral'}_${p.tempo || 1}`;
      mapaPresenca[key] = p.status;
    });

    let disciplinasConfig = [];
    if (req.usuario.escola_id) {
      disciplinasConfig = await DisciplinaConfig.find({
        escola_id: req.usuario.escola_id,
        ativo: true
      }).sort({ nome: 1 });
    }

    const disciplinasVisao = disciplina
      ? disciplinasConfig.filter(d => d.nome === disciplina)
      : disciplinasConfig;

    const quadro = turmas.map(turma => ({
      turma: { _id: turma._id, nome: turma.nome },
      alunos: (turma.alunos || []).map(aluno => {
        const tempos = [];

        if (disciplinasVisao.length) {
          disciplinasVisao.forEach(disc => {
            for (let t = 1; t <= disc.quantidadeTempos; t++) {
              tempos.push({
                disciplina: disc.nome,
                tempo: t,
                status: mapaPresenca[`${aluno._id}_${turma._id}_${disc.nome}_${t}`] || null
              });
            }
          });
        } else {
          tempos.push({
            disciplina: 'Geral',
            tempo: 1,
            status: mapaPresenca[`${aluno._id}_${turma._id}_Geral_1`] || null
          });
        }

        return {
          _id: aluno._id,
          nome: aluno.nome,
          cpf: aluno.cpf,
          tempos
        };
      })
    }));

    res.json({
      sucesso: true,
      data: dataConsulta,
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
    const { data, disciplina } = req.query;

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
      const turma = await Turma.findOne({ _id: turmaId, escola_id: req.usuario.escola_id });
      if (!turma) {
        return res.status(403).json({ sucesso: false, mensagem: 'Turma não disponível' });
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

    const presencas = await Presenca.find({ aluno_id: alunoId })
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
    console.error('Erro ao listar presença do aluno:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar presença'
    });
  }
});

// ==================== ATUALIZAR PRESENÇA ====================
router.put('/:presencaId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { presencaId } = req.params;
    const { status, observacoes } = req.body;

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
    console.error('Erro ao gerar estatísticas:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar estatísticas'
    });
  }
});

module.exports = router;
