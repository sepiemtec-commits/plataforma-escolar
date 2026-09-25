const bcrypt = require('bcryptjs');
const { Escola, Usuario, AssinaturaPendente, Log } = require('../database/schema');
const { obterPlano } = require('../constants/planos');
const { priceIdDoPlano } = require('../constants/planos');

/**
 * Ativa escola + diretor a partir de AssinaturaPendente paga.
 * Idempotente: se já concluída, retorna a escola existente.
 */
async function ativarEscolaDePendente(pendente, extras = {}) {
  if (!pendente) {
    const err = new Error('Assinatura pendente não encontrada');
    err.status = 404;
    throw err;
  }

  if (pendente.status === 'concluida' && pendente.escola_id) {
    const escola = await Escola.findById(pendente.escola_id);
    return { escola, jaAtivada: true };
  }

  const cnpjExistente = await Escola.findOne({ cnpj: pendente.cnpj });
  if (cnpjExistente) {
    const err = new Error('CNPJ já cadastrado em outra escola');
    err.status = 409;
    throw err;
  }

  const emailExistente = await Usuario.findOne({ email: pendente.adminEmail.toLowerCase() });
  if (emailExistente) {
    const err = new Error('Email do administrador já está em uso');
    err.status = 409;
    throw err;
  }

  const plano = obterPlano(pendente.plano)?.id || pendente.plano;
  const stripePriceId = extras.stripePriceId || priceIdDoPlano(plano) || undefined;

  let escola;
  try {
    escola = await Escola.create({
      nome: pendente.nomeEscola,
      cnpj: pendente.cnpj,
      telefone: pendente.telefone,
      email: pendente.emailEscola,
      endereco: pendente.endereco,
      ativo: true,
      assinatura: {
        plano,
        status: extras.statusAssinatura || 'active',
        stripeCustomerId: extras.stripeCustomerId || pendente.stripeCustomerId,
        stripeSubscriptionId: extras.stripeSubscriptionId,
        stripePriceId,
        currentPeriodEnd: extras.currentPeriodEnd || undefined,
        cancelAtPeriodEnd: false
      },
      configuracao: {
        tipoAvaliacao: 'bimestral',
        anoLetivo: new Date().getFullYear(),
        alertasWhatsapp: false
      }
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const e = new Error('CNPJ já cadastrado em outra escola');
      e.status = 409;
      throw e;
    }
    throw err;
  }

  // Senha já hasheada em AssinaturaPendente — evita double-hash do pre('save')
  const diretorTemp = await Usuario.create({
    nome: pendente.adminNome,
    email: pendente.adminEmail.toLowerCase(),
    senha: `Tmp!${Date.now()}Aa1`,
    tipo: 'diretor',
    escola_id: escola._id,
    whatsapp: pendente.telefone || undefined,
    ativo: true
  });
  await Usuario.collection.updateOne(
    { _id: diretorTemp._id },
    { $set: { senha: pendente.adminSenhaHash } }
  );
  const diretorDoc = await Usuario.findById(diretorTemp._id);

  escola.diretor_id = diretorDoc._id;
  await escola.save();

  pendente.status = 'concluida';
  pendente.escola_id = escola._id;
  pendente.stripeCustomerId = extras.stripeCustomerId || pendente.stripeCustomerId;
  pendente.dataConclusao = new Date();
  await pendente.save();

  await Log.create({
    usuario_id: diretorDoc._id,
    acao: 'ESCOLA_ATIVADA',
    modulo: 'assinatura',
    descricao: `Escola ${escola.nome} ativada no plano ${plano}`
  });

  return { escola, diretor: diretorDoc, jaAtivada: false };
}

async function atualizarAssinaturaEscolaPorCustomer(customerId, patch) {
  if (!customerId) return null;
  const escola = await Escola.findOne({ 'assinatura.stripeCustomerId': customerId });
  if (!escola) return null;
  Object.assign(escola.assinatura, patch);
  await escola.save();
  return escola;
}

async function hashSenhaAdmin(senha) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senha, salt);
}

module.exports = {
  ativarEscolaDePendente,
  atualizarAssinaturaEscolaPorCustomer,
  hashSenhaAdmin
};
