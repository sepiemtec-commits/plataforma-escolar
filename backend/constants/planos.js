/**
 * Planos comerciais VEHO e helpers de assinatura.
 * Preços Stripe vêm de variáveis de ambiente (Price IDs).
 */
const PLANOS = {
  essencial: {
    id: 'essencial',
    nome: 'Essencial',
    descricao: 'Gestão escolar completa para escolas menores — até 300 alunos.',
    destaque: ['Presença e boletim', 'Painéis por perfil', 'Multi-escola isolado'],
    envPrice: 'STRIPE_PRICE_ESSENCIAL',
    valorExibicao: 'R$ 199/mês'
  },
  profissional: {
    id: 'profissional',
    nome: 'Profissional',
    descricao: 'Para escolas em crescimento — até 1.000 alunos.',
    destaque: ['Tudo do Essencial', 'Diário de classe', 'Relatórios e promoção'],
    envPrice: 'STRIPE_PRICE_PROFISSIONAL',
    valorExibicao: 'R$ 399/mês'
  },
  completo: {
    id: 'completo',
    nome: 'Completo',
    descricao: 'Rede ou escola grande — alunos ilimitados* e suporte prioritário.',
    destaque: ['Tudo do Profissional', 'WhatsApp (Twilio)', 'Onboarding assistido'],
    envPrice: 'STRIPE_PRICE_COMPLETO',
    valorExibicao: 'R$ 699/mês'
  }
};

function listarPlanosPublicos() {
  return Object.values(PLANOS).map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    destaque: p.destaque,
    valorExibicao: p.valorExibicao,
    stripeConfigurado: Boolean(process.env[p.envPrice] && process.env.STRIPE_SECRET_KEY)
  }));
}

function obterPlano(planoId) {
  return PLANOS[planoId] || null;
}

function priceIdDoPlano(planoId) {
  const plano = obterPlano(planoId);
  if (!plano) return null;
  return process.env[plano.envPrice] || null;
}

/** Escolas de seed sem status de assinatura continuam ativas. */
function assinaturaPermiteAcesso(escola) {
  if (!escola) return false;
  if (escola.ativo === false) return false;
  const status = escola.assinatura?.status;
  if (!status) return true; // legado / seed
  return status === 'active' || status === 'past_due';
}

function mensagemBloqueioAssinatura(escola) {
  const status = escola?.assinatura?.status;
  if (escola?.ativo === false) {
    return 'Escola desativada. Entre em contato com o suporte VEHO.';
  }
  if (status === 'canceled' || status === 'unpaid') {
    return 'Assinatura inativa. Regularize o pagamento em Assinar / Portal Stripe.';
  }
  if (status === 'incomplete') {
    return 'Assinatura incompleta. Conclua o pagamento para acessar o sistema.';
  }
  return 'Acesso bloqueado pela assinatura da escola.';
}

module.exports = {
  PLANOS,
  listarPlanosPublicos,
  obterPlano,
  priceIdDoPlano,
  assinaturaPermiteAcesso,
  mensagemBloqueioAssinatura
};
