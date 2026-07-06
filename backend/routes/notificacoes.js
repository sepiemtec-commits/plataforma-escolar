// backend/routes/notificacoes.js - Rotas de Notificações
const express = require('express');
const router = express.Router();
const { Presenca, Desempenho, Responsavel, Usuario, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const notificadorWhatsApp = require('../services/whatsapp');

function numerosResponsaveis(aluno, responsaveis) {
  const numeros = new Set();
  (responsaveis || []).forEach(r => {
    if (r.recebeNotificacoes !== false && r.whatsapp) numeros.add(r.whatsapp);
  });
  if (aluno?.whatsapp_responsavel) numeros.add(aluno.whatsapp_responsavel);
  return [...numeros];
}

// ==================== ENVIAR ALERTA DE FALTA ====================
router.post('/falta/:presencaId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { presencaId } = req.params;

    const presenca = await Presenca.findById(presencaId)
      .populate('aluno_id');

    if (!presenca) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Presença não encontrada'
      });
    }

    // Buscar responsáveis
    const responsaveis = await Responsavel.find({
      aluno_id: presenca.aluno_id._id
    });

    let enviados = 0;
    for (const numero of numerosResponsaveis(presenca.aluno_id, responsaveis)) {
      const sucesso = await notificadorWhatsApp.enviarAlertaFalta(
        numero,
        presenca.aluno_id.nome,
        new Date(presenca.data).toLocaleDateString('pt-BR')
      );

      if (sucesso) {
        enviados++;
        presenca.notificadoWhatsapp = true;
        await presenca.save();
      }
    }

    res.json({
      sucesso: true,
      mensagem: `Alertas enviados para ${enviados} responsável(is)`,
      enviados
    });

  } catch (error) {
    console.error('Erro ao enviar alerta:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar alerta'
    });
  }
});

// ==================== ENVIAR BOLETIM ====================
router.post('/boletim/:alunoId', autenticacao, verificarRole('professor', 'coordenador'), async (req, res) => {
  try {
    const { alunoId } = req.params;

    const aluno = await Usuario.findById(alunoId);
    if (!aluno) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Aluno não encontrado'
      });
    }

    // Buscar desempenho
    const desempenho = await Desempenho.findOne({ aluno_id: alunoId });

    // Buscar responsáveis
    const responsaveis = await Responsavel.find({ aluno_id: alunoId });

    let enviados = 0;
    for (const numero of numerosResponsaveis(aluno, responsaveis)) {
      const sucesso = await notificadorWhatsApp.enviarBoletim(
        numero,
        aluno.nome,
        desempenho
      );

      if (sucesso) enviados++;
    }

    res.json({
      sucesso: true,
      mensagem: `Boletins enviados para ${enviados} responsável(is)`,
      enviados
    });

  } catch (error) {
    console.error('Erro ao enviar boletim:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar boletim'
    });
  }
});

// ==================== ENVIAR ALERTA DE DESEMPENHO ====================
router.post('/desempenho/:alunoId', autenticacao, verificarRole('professor', 'coordenador'), async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { disciplina, media } = req.body;

    const aluno = await Usuario.findById(alunoId);
    if (!aluno) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Aluno não encontrado'
      });
    }

    const responsaveis = await Responsavel.find({ aluno_id: alunoId });

    let enviados = 0;
    for (const numero of numerosResponsaveis(aluno, responsaveis)) {
      const sucesso = await notificadorWhatsApp.enviarAlertaDesempenho(
        numero,
        aluno.nome,
        disciplina,
        media
      );

      if (sucesso) enviados++;
    }

    // Registrar no log
    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ENVIOU_ALERTA_DESEMPENHO',
      modulo: 'notificacoes',
      descricao: `Alerta de desempenho enviado para ${aluno.nome}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: `Alertas enviados para ${enviados} responsável(is)`,
      enviados
    });

  } catch (error) {
    console.error('Erro ao enviar alerta:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao enviar alerta'
    });
  }
});

// ==================== ENVIAR NOTIFICAÇÃO GERAL ====================
router.post('/geral', autenticacao, verificarRole('admin', 'diretor', 'coordenador'), async (req, res) => {
  try {
    const { titulo, mensagem, destinatarios } = req.body;

    let numeros = [];
    if (destinatarios === 'todos') {
      // Enviar para todos os responsáveis
      const responsaveis = await Responsavel.find();
      numeros = responsaveis.map(r => r.whatsapp);
    } else if (Array.isArray(destinatarios)) {
      numeros = destinatarios;
    }

    let enviados = 0;
    for (const numero of numeros) {
      const sucesso = await notificadorWhatsApp.enviarNotificacao(
        numero,
        titulo,
        mensagem
      );
      
      if (sucesso) enviados++;
    }

    res.json({
      sucesso: true,
      mensagem: `Notificações enviadas para ${enviados} destinatário(s)`,
      enviados
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
