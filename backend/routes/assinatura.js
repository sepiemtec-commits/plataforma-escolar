const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { AssinaturaPendente, Escola, Usuario, IdempotencyRecord } = require('../database/schema');
const { listarPlanosPublicos, obterPlano } = require('../constants/planos');
const {
  stripeHabilitado,
  modoDevSemStripe,
  criarCheckoutAssinatura,
  recuperarSessao,
  criarPortalCliente
} = require('../services/stripe');
const {
  ativarEscolaDePendente,
  hashSenhaAdmin,
  atualizarAssinaturaEscolaPorCustomer
} = require('../services/onboarding');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const { withLock } = require('../utils/concurrencyLock');

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

async function responderIdempotente(req, res, status, body) {
  const key = req.get('Idempotency-Key') || req.get('idempotency-key');
  if (key && String(key).trim()) {
    const id = String(key).trim().slice(0, 200);
    try {
      await IdempotencyRecord.findOneAndUpdate(
        { _id: id },
        { $setOnInsert: { status, body, createdAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch {
      /* ignore race no cache */
    }
  }
  return res.status(status).json(body);
}

// ==================== PLANOS PÚBLICOS ====================
router.get('/planos', (_req, res) => {
  res.json({
    sucesso: true,
    planos: listarPlanosPublicos(),
    stripeHabilitado: stripeHabilitado(),
    modoDev: modoDevSemStripe()
  });
});

// ==================== CHECKOUT / CADASTRO ESCOLA ====================
router.post('/checkout', [
  body('nomeEscola').trim().isLength({ min: 3 }),
  body('cnpj').trim().isLength({ min: 14, max: 18 }),
  body('emailEscola').isEmail(),
  body('adminNome').trim().isLength({ min: 3 }),
  body('adminEmail').isEmail(),
  body('adminSenha').isLength({ min: 8 }),
  body('plano').isIn(['essencial', 'profissional', 'completo']),
  body('aceiteTermos').custom((v) => v === true || v === 'true').withMessage('É necessário aceitar os Termos e a Política de Privacidade')
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array(), mensagem: 'Dados inválidos' });
    }

    const idemKey = (req.get('Idempotency-Key') || req.get('idempotency-key') || '').trim();
    if (idemKey) {
      const cached = await IdempotencyRecord.findById(idemKey.slice(0, 200)).lean();
      if (cached) {
        return res.status(cached.status).json(cached.body);
      }
    }

    const {
      nomeEscola, cnpj, telefone, emailEscola, endereco,
      adminNome, adminEmail, adminSenha, plano
    } = req.body;

    if (!obterPlano(plano)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Plano inválido' });
    }

    const cnpjNorm = soDigitos(cnpj);
    if (cnpjNorm.length !== 14) {
      return res.status(400).json({ sucesso: false, mensagem: 'CNPJ deve ter 14 dígitos' });
    }

    const emailAdmin = adminEmail.trim().toLowerCase();
    const lockKey = idemKey
      ? `checkout:idem:${idemKey.slice(0, 180)}`
      : `checkout:cnpj:${cnpjNorm}`;

    const resultado = await withLock(lockKey, async () => {
      if (idemKey) {
        const cached = await IdempotencyRecord.findById(idemKey.slice(0, 200)).lean();
        if (cached) return { cached: true, status: cached.status, body: cached.body };
      }

      const escolaCnpj = await Escola.findOne({ cnpj: cnpjNorm });
      if (escolaCnpj) {
        return {
          status: 409,
          body: { sucesso: false, mensagem: 'CNPJ já cadastrado' }
        };
      }

      const emailEmUso = await Usuario.findOne({ email: emailAdmin });
      if (emailEmUso) {
        return {
          status: 409,
          body: { sucesso: false, mensagem: 'Email do administrador já cadastrado' }
        };
      }

      const adminSenhaHash = await hashSenhaAdmin(adminSenha);

      let pendente;
      try {
        pendente = await AssinaturaPendente.create({
          nomeEscola: nomeEscola.trim(),
          cnpj: cnpjNorm,
          telefone: telefone?.trim(),
          emailEscola: emailEscola.trim().toLowerCase(),
          endereco: endereco?.trim(),
          adminNome: adminNome.trim(),
          adminEmail: emailAdmin,
          adminSenhaHash,
          plano,
          status: 'pendente'
        });
      } catch (err) {
        if (err && err.code === 11000) {
          return {
            status: 409,
            body: { sucesso: false, mensagem: 'Checkout já em andamento para este CNPJ ou email' }
          };
        }
        throw err;
      }

      // Desenvolvimento sem Stripe: ativa na hora
      if (modoDevSemStripe()) {
        try {
          const { escola, diretor } = await ativarEscolaDePendente(pendente, {
            statusAssinatura: 'active'
          });
          return {
            status: 200,
            body: {
              sucesso: true,
              modoDev: true,
              mensagem: 'Escola ativada em modo desenvolvimento (sem Stripe).',
              escola: { id: escola._id, nome: escola.nome },
              adminEmail: diretor.email,
              redirectUrl: '/assinatura-sucesso.html?dev=1'
            }
          };
        } catch (err) {
          if (err.status === 409 || (err && err.code === 11000)) {
            return {
              status: 409,
              body: { sucesso: false, mensagem: err.message || 'CNPJ ou email já cadastrado' }
            };
          }
          throw err;
        }
      }

      if (!stripeHabilitado()) {
        await AssinaturaPendente.deleteOne({ _id: pendente._id });
        return {
          status: 503,
          body: {
            sucesso: false,
            mensagem: 'Pagamentos não configurados. Defina STRIPE_SECRET_KEY e os Price IDs, ou ASSINATURA_MODO_DEV=true.'
          }
        };
      }

      const session = await criarCheckoutAssinatura({
        pendenteId: pendente._id,
        plano,
        adminEmail: emailAdmin,
        nomeEscola: pendente.nomeEscola
      });

      pendente.stripeSessionId = session.id;
      await pendente.save();

      return {
        status: 200,
        body: {
          sucesso: true,
          checkoutUrl: session.url,
          sessionId: session.id
        }
      };
    });

    if (resultado.cached) {
      return res.status(resultado.status).json(resultado.body);
    }

    return responderIdempotente(req, res, resultado.status, resultado.body);
  } catch (error) {
    console.error('Erro no checkout:', error);
    const status = error.status || 500;
    const body = {
      sucesso: false,
      mensagem: error.message || 'Erro ao iniciar assinatura'
    };
    return res.status(status).json(body);
  }
});

// ==================== CONFIRMAR SESSÃO (success_url) ====================
router.get('/confirmar', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ sucesso: false, mensagem: 'session_id obrigatório' });
    }

    if (modoDevSemStripe() && sessionId === 'dev') {
      return res.json({ sucesso: true, mensagem: 'Modo desenvolvimento' });
    }

    const session = await recuperarSessao(sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(402).json({
        sucesso: false,
        mensagem: 'Pagamento ainda não confirmado'
      });
    }

    const pendenteId = session.client_reference_id || session.metadata?.pendenteId;
    const pendente = await AssinaturaPendente.findById(pendenteId);
    if (!pendente) {
      return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado' });
    }

    const sub = session.subscription;
    const subId = typeof sub === 'string' ? sub : sub?.id;
    const customerId = typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;

    const { escola, jaAtivada } = await ativarEscolaDePendente(pendente, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subId,
      stripePriceId: typeof sub === 'object' ? sub?.items?.data?.[0]?.price?.id : undefined,
      currentPeriodEnd: typeof sub === 'object' && sub?.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : undefined,
      statusAssinatura: 'active'
    });

    res.json({
      sucesso: true,
      jaAtivada,
      escola: { id: escola._id, nome: escola.nome, plano: escola.assinatura?.plano },
      mensagem: jaAtivada
        ? 'Escola já estava ativada. Faça login.'
        : 'Escola ativada com sucesso. Faça login com o email do administrador.'
    });
  } catch (error) {
    console.error('Erro ao confirmar sessão:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao confirmar assinatura'
    });
  }
});

// ==================== PORTAL DO CLIENTE (diretor) ====================
router.post('/portal', autenticacao, verificarRole('diretor', 'admin'), async (req, res) => {
  try {
    if (!req.usuario.escola_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'Usuário sem escola' });
    }
    const escola = await Escola.findById(req.usuario.escola_id);
    if (!escola?.assinatura?.stripeCustomerId) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Esta escola não possui assinatura Stripe vinculada'
      });
    }
    const portal = await criarPortalCliente(escola.assinatura.stripeCustomerId);
    res.json({ sucesso: true, url: portal.url });
  } catch (error) {
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao abrir portal'
    });
  }
});

module.exports = router;

/** Handler de webhook Stripe (raw body) — montado no server.js */
async function processarWebhookStripe(req, res) {
  const { construirEventoWebhook } = require('../services/stripe');
  try {
    const sig = req.headers['stripe-signature'];
    const event = await construirEventoWebhook(req.body, sig);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const pendenteId = session.client_reference_id || session.metadata?.pendenteId;
        if (pendenteId) {
          const pendente = await AssinaturaPendente.findById(pendenteId);
          if (pendente && pendente.status !== 'concluida') {
            await ativarEscolaDePendente(pendente, {
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              statusAssinatura: 'active'
            });
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const mapStatus = {
          active: 'active',
          past_due: 'past_due',
          unpaid: 'unpaid',
          canceled: 'canceled',
          incomplete: 'incomplete',
          incomplete_expired: 'canceled',
          trialing: 'active',
          paused: 'past_due'
        };
        await atualizarAssinaturaEscolaPorCustomer(sub.customer, {
          status: mapStatus[sub.status] || sub.status,
          stripeSubscriptionId: sub.id,
          stripePriceId: sub.items?.data?.[0]?.price?.id,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : undefined,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end)
        });
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook Stripe:', error.message);
    res.status(error.status || 400).send(`Webhook Error: ${error.message}`);
  }
}

module.exports.processarWebhookStripe = processarWebhookStripe;
