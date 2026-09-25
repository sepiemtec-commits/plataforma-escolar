// backend/services/webPush.js — Web Push (VAPID)
const webpush = require('web-push');
const { PushSubscription } = require('../database/schema');

let vapidPronto = false;

function configurarVapid() {
  if (vapidPronto) return true;
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@escola.local').trim();

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidPronto = true;
  return true;
}

function vapidPublicKey() {
  return (process.env.VAPID_PUBLIC_KEY || '').trim() || null;
}

function pushDisponivel() {
  return Boolean(vapidPublicKey() && (process.env.VAPID_PRIVATE_KEY || '').trim());
}

/**
 * Envia push para um ou mais usuários da escola.
 * @returns {Promise<number>} quantidade enviada com sucesso
 */
async function enviarParaUsuarios({ escolaId, userIds, titulo, corpo, url }) {
  if (!configurarVapid()) {
    console.warn('⚠ Web Push não configurado (VAPID) — notificação não enviada');
    return 0;
  }

  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return 0;

  const filtro = {
    usuario_id: { $in: ids }
  };
  if (escolaId) filtro.escola_id = escolaId;

  const subs = await PushSubscription.find(filtro).lean();
  if (!subs.length) return 0;

  const payload = JSON.stringify({
    title: titulo || 'VEHO Edu',
    body: corpo || '',
    url: url || '/'
  });

  let enviados = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys?.p256dh,
          auth: sub.keys?.auth
        }
      };
      try {
        await webpush.sendNotification(subscription, payload);
        enviados++;
      } catch (err) {
        const status = err.statusCode || err.status;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => {});
          console.warn('Push subscription removida (inválida):', sub.endpoint.slice(0, 48));
        } else {
          console.error('✗ Erro Web Push:', err.message || err);
        }
      }
    })
  );

  return enviados;
}

async function salvarSubscription({ escolaId, usuarioId, subscription, userAgent }) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const err = new Error('Subscription inválida');
    err.status = 400;
    throw err;
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        escola_id: escolaId,
        usuario_id: usuarioId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        userAgent: userAgent || '',
        dataAtualizacao: new Date()
      },
      $setOnInsert: { dataCriacao: new Date() }
    },
    { upsert: true, new: true }
  );
}

async function removerSubscription({ usuarioId, endpoint }) {
  const filtro = { usuario_id: usuarioId };
  if (endpoint) filtro.endpoint = endpoint;
  await PushSubscription.deleteMany(filtro);
}

module.exports = {
  vapidPublicKey,
  pushDisponivel,
  configurarVapid,
  enviarParaUsuarios,
  salvarSubscription,
  removerSubscription
};
