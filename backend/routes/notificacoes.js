// backend/routes/notificacoes.js - Rotas de Notificações (WhatsApp / SMS / Push)
const express = require('express');
const router = express.Router();
const { Presenca, Desempenho, Responsavel, Usuario, Turma, Log } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { despachar, resolverCanais } = require('../services/notificacaoDispatcher');
const {
  assertAlunoEscola,
  assertTurmaEscola,
  responderErroTenant
} = require('../utils/tenant');

function numerosResponsaveis(aluno, responsaveis, { paraSms = false } = {}) {
  const numeros = new Set();
  (responsaveis || []).forEach((r) => {
    if (r.recebeNotificacoes === false) return;
    if (paraSms && r.recebeSms === false) return;
    if (r.whatsapp) numeros.add(r.whatsapp);
  });
  if (aluno?.whatsapp_responsavel) numeros.add(aluno.whatsapp_responsavel);
  return [...numeros];
}

function userIdsResponsaveis(responsaveis) {
  const ids = new Set();
  (responsaveis || []).forEach((r) => {
    if (r.recebeNotificacoes === false) return;
    if (r.usuario_id) ids.add(String(r.usuario_id));
  });
  return [...ids];
}

async function coletarDestinosDosAlunos(alunoIds) {
  const ids = [...new Set((alunoIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) {
    return { numeros: [], userIds: [], alunos: [] };
  }

  const [alunos, responsaveis] = await Promise.all([
    Usuario.find({ _id: { $in: ids }, tipo: 'aluno' }).select('nome whatsapp_responsavel'),
    Responsavel.find({ aluno_id: { $in: ids } })
  ]);

  const responsaveisPorAluno = {};
  responsaveis.forEach((r) => {
    const key = String(r.aluno_id);
    if (!responsaveisPorAluno[key]) responsaveisPorAluno[key] = [];
    responsaveisPorAluno[key].push(r);
  });

  const numeros = new Set();
  const userIds = new Set();
  alunos.forEach((aluno) => {
    const lista = responsaveisPorAluno[String(aluno._id)] || [];
    numerosResponsaveis(aluno, lista).forEach((n) => numeros.add(n));
    userIdsResponsaveis(lista).forEach((id) => userIds.add(id));
    // Push também para o próprio aluno, se estiver logado com PWA
    userIds.add(String(aluno._id));
  });

  return {
    numeros: [...numeros],
    userIds: [...userIds],
    alunos
  };
}

async function canaisDaEscola(req, canaisBody) {
  const canais = resolverCanais(canaisBody);
  // Se o cliente não enviou objeto canais, manter default whatsapp.
  // Se enviou, respeitar. Toggles da escola só bloqueiam auto-envios (presença).
  return canais;
}

function mensagemResumo(enviados) {
  const partes = [];
  if (enviados.whatsapp) partes.push(`${enviados.whatsapp} WhatsApp`);
  if (enviados.sms) partes.push(`${enviados.sms} SMS`);
  if (enviados.push) partes.push(`${enviados.push} Push`);
  return partes.length ? partes.join(', ') : 'nenhum envio confirmado';
}

// ==================== ENVIAR ALERTA DE FALTA ====================
router.post('/falta/:presencaId', autenticacao, verificarRole('professor'), requerEscola, async (req, res) => {
  try {
    const { presencaId } = req.params;
    const canais = await canaisDaEscola(req, req.body?.canais);

    const presenca = await Presenca.findById(presencaId).populate('aluno_id');

    if (!presenca) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Presença não encontrada'
      });
    }

    await assertTurmaEscola(req, presenca.turma_id);

    const responsaveis = await Responsavel.find({
      aluno_id: presenca.aluno_id._id
    });

    const dataFmt = new Date(presenca.data).toLocaleDateString('pt-BR');
    const numeros = numerosResponsaveis(presenca.aluno_id, responsaveis);
    const userIds = userIdsResponsaveis(responsaveis);

    const resultado = await despachar({
      canais,
      numeros,
      userIds,
      escolaId: req.usuario.escola_id,
      titulo: 'Alerta de Falta',
      corpo: `${presenca.aluno_id.nome} teve falta registrada em ${dataFmt}.`,
      tipo: 'falta',
      meta: { nomeAluno: presenca.aluno_id.nome, data: dataFmt },
      url: '/painel-responsavel.html'
    });

    if (resultado.total > 0) {
      presenca.notificadoWhatsapp = true;
      await presenca.save();
    }

    res.json({
      sucesso: true,
      mensagem: `Alertas: ${mensagemResumo(resultado.enviados)}`,
      enviados: resultado.enviados
    });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao enviar alerta:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar alerta'
    });
  }
});

// ==================== ENVIAR BOLETIM ====================
router.post('/boletim/:alunoId', autenticacao, verificarRole('professor', 'coordenador'), requerEscola, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const canais = await canaisDaEscola(req, req.body?.canais);

    const aluno = await assertAlunoEscola(req, alunoId);
    const desempenho = await Desempenho.findOne({ aluno_id: alunoId });
    const responsaveis = await Responsavel.find({ aluno_id: alunoId });

    const numeros = numerosResponsaveis(aluno, responsaveis);
    const userIds = [...userIdsResponsaveis(responsaveis), String(aluno._id)];

    const resultado = await despachar({
      canais,
      numeros,
      userIds,
      escolaId: req.usuario.escola_id,
      titulo: 'Boletim Escolar',
      corpo: `Boletim de ${aluno.nome} disponível.`,
      tipo: 'boletim',
      meta: { nomeAluno: aluno.nome, desempenho },
      url: '/painel-responsavel.html'
    });

    res.json({
      sucesso: true,
      mensagem: `Boletins: ${mensagemResumo(resultado.enviados)}`,
      enviados: resultado.enviados
    });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao enviar boletim:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar boletim'
    });
  }
});

// ==================== ENVIAR ALERTA DE DESEMPENHO ====================
router.post('/desempenho/:alunoId', autenticacao, verificarRole('professor', 'coordenador'), requerEscola, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { disciplina, media } = req.body;
    const canais = await canaisDaEscola(req, req.body?.canais);

    const aluno = await assertAlunoEscola(req, alunoId);
    const responsaveis = await Responsavel.find({ aluno_id: alunoId });

    const numeros = numerosResponsaveis(aluno, responsaveis);
    const userIds = userIdsResponsaveis(responsaveis);

    const resultado = await despachar({
      canais,
      numeros,
      userIds,
      escolaId: req.usuario.escola_id,
      titulo: 'Alerta de Desempenho',
      corpo: `${aluno.nome} — ${disciplina}: média ${media}`,
      tipo: 'desempenho',
      meta: { nomeAluno: aluno.nome, disciplina, media },
      url: '/painel-responsavel.html'
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ENVIOU_ALERTA_DESEMPENHO',
      modulo: 'notificacoes',
      descricao: `Alerta de desempenho enviado para ${aluno.nome}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: `Alertas: ${mensagemResumo(resultado.enviados)}`,
      enviados: resultado.enviados
    });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao enviar alerta:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar alerta'
    });
  }
});

// ==================== ENVIAR NOTIFICAÇÃO GERAL ====================
router.post('/geral', autenticacao, verificarRole('admin', 'diretor', 'coordenador'), requerEscola, async (req, res) => {
  try {
    const { titulo, mensagem, destinatarios, destino, turma_id, aluno_id, canais: canaisBody } = req.body;
    const canais = await canaisDaEscola(req, canaisBody);

    if (!titulo?.trim() || !mensagem?.trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Título e mensagem são obrigatórios'
      });
    }

    if (!canais.whatsapp && !canais.sms && !canais.push) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Selecione ao menos um canal (WhatsApp, SMS ou Push)'
      });
    }

    const escolaId = req.usuario.escola_id;
    if (!escolaId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Escola não identificada no usuário'
      });
    }

    const modo = destino || (Array.isArray(destinatarios) ? 'lista' : (destinatarios || 'todos'));
    let destinos = { numeros: [], userIds: [] };
    let escopo = 'todos os responsáveis';

    if (modo === 'lista' && Array.isArray(destinatarios)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Envio por lista livre não permitido. Use aluno, turma ou todos da escola.'
      });
    } else if (modo === 'aluno') {
      if (!aluno_id) {
        return res.status(400).json({ sucesso: false, mensagem: 'Selecione o aluno' });
      }

      const aluno = await Usuario.findOne({
        _id: aluno_id,
        tipo: 'aluno',
        escola_id: escolaId
      });

      if (!aluno) {
        return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado' });
      }

      destinos = await coletarDestinosDosAlunos([aluno._id]);
      escopo = `responsável(is) de ${aluno.nome}`;
    } else if (modo === 'turma') {
      if (!turma_id) {
        return res.status(400).json({ sucesso: false, mensagem: 'Selecione a turma' });
      }

      const turma = await Turma.findOne({
        _id: turma_id,
        escola_id: escolaId
      }).select('nome alunos');

      if (!turma) {
        return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
      }

      destinos = await coletarDestinosDosAlunos(turma.alunos || []);
      escopo = `responsáveis da turma ${turma.nome}`;
    } else {
      const alunos = await Usuario.find({
        tipo: 'aluno',
        ativo: true,
        escola_id: escolaId
      }).select('_id');
      destinos = await coletarDestinosDosAlunos(alunos.map((a) => a._id));
      escopo = 'todos os responsáveis da escola';
    }

    const precisaTelefone = canais.whatsapp || canais.sms;
    if (precisaTelefone && !destinos.numeros.length && !canais.push) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nenhum telefone de responsável encontrado para o destino selecionado'
      });
    }

    if (canais.push && !destinos.userIds.length && !destinos.numeros.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nenhum destinatário encontrado para o destino selecionado'
      });
    }

    const resultado = await despachar({
      canais,
      numeros: destinos.numeros,
      userIds: destinos.userIds,
      escolaId,
      titulo: titulo.trim(),
      corpo: mensagem.trim(),
      tipo: 'geral',
      url: '/painel-responsavel.html'
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ENVIOU_NOTIFICACAO_GERAL',
      modulo: 'notificacoes',
      descricao: `Notificação "${titulo.trim()}" para ${escopo} (${mensagemResumo(resultado.enviados)})`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: `Notificações para ${escopo}: ${mensagemResumo(resultado.enviados)}`,
      enviados: resultado.enviados,
      totalTelefones: destinos.numeros.length,
      totalPushTargets: destinos.userIds.length,
      escopo
    });
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar notificação'
    });
  }
});

module.exports = router;
