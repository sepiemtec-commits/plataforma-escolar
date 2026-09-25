// backend/routes/push.js — inscrição Web Push
const express = require('express');
const router = express.Router();
const { autenticacao, requerEscola } = require('../middleware/autenticacao');
const webPush = require('../services/webPush');

router.get('/vapid-public-key', autenticacao, (req, res) => {
  const key = webPush.vapidPublicKey();
  if (!key) {
    return res.status(503).json({
      sucesso: false,
      mensagem: 'Web Push não configurado (defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY)'
    });
  }
  res.json({ sucesso: true, publicKey: key });
});

router.post('/subscribe', autenticacao, requerEscola, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    await webPush.salvarSubscription({
      escolaId: req.usuario.escola_id,
      usuarioId: req.usuario._id,
      subscription,
      userAgent: req.get('user-agent') || ''
    });
    res.status(201).json({ sucesso: true, mensagem: 'Notificações push ativadas neste aparelho' });
  } catch (error) {
    console.error('Erro ao salvar push subscription:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao ativar push'
    });
  }
});

router.delete('/subscribe', autenticacao, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || req.query?.endpoint;
    await webPush.removerSubscription({
      usuarioId: req.usuario._id,
      endpoint: endpoint || undefined
    });
    res.json({ sucesso: true, mensagem: 'Inscrição push removida' });
  } catch (error) {
    console.error('Erro ao remover push subscription:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao desativar push' });
  }
});

module.exports = router;
