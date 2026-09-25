const Stripe = require('stripe');
const { priceIdDoPlano } = require('../constants/planos');

let cliente = null;

function stripeHabilitado() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function modoDevSemStripe() {
  return process.env.ASSINATURA_MODO_DEV === 'true' && !stripeHabilitado();
}

function obterStripe() {
  if (!stripeHabilitado()) {
    const err = new Error('Stripe não configurado (defina STRIPE_SECRET_KEY)');
    err.status = 503;
    throw err;
  }
  if (!cliente) {
    cliente = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cliente;
}

function urlBaseFrontend() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Cria Checkout Session em modo subscription.
 * Não passa payment_method_types (dynamic payment methods).
 */
async function criarCheckoutAssinatura({ pendenteId, plano, adminEmail, nomeEscola, metadata = {} }) {
  const priceId = priceIdDoPlano(plano);
  if (!priceId) {
    const err = new Error(`Price ID não configurado para o plano ${plano}`);
    err.status = 503;
    throw err;
  }

  const stripe = obterStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: adminEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${urlBaseFrontend()}/assinatura-sucesso.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${urlBaseFrontend()}/assinar.html?cancelado=1&plano=${encodeURIComponent(plano)}`,
    client_reference_id: String(pendenteId),
    metadata: {
      pendenteId: String(pendenteId),
      plano,
      nomeEscola,
      ...metadata
    },
    subscription_data: {
      metadata: {
        pendenteId: String(pendenteId),
        plano
      }
    },
    locale: 'pt-BR'
  });

  return session;
}

async function recuperarSessao(sessionId) {
  const stripe = obterStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer']
  });
}

async function construirEventoWebhook(rawBody, signature) {
  const stripe = obterStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET não configurado');
    err.status = 503;
    throw err;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

async function criarPortalCliente(customerId) {
  const stripe = obterStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${urlBaseFrontend()}/painel-diretor.html`
  });
}

module.exports = {
  stripeHabilitado,
  modoDevSemStripe,
  obterStripe,
  criarCheckoutAssinatura,
  recuperarSessao,
  construirEventoWebhook,
  criarPortalCliente,
  urlBaseFrontend
};
