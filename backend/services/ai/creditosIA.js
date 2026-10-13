// backend/services/ai/creditosIA.js — créditos internos + limites + log de consumo
const mongoose = require('mongoose');
const { CreditoIAEscola, ConsumoIA } = require('../../database/schema');

const CREDITOS_PADRAO = () => Number(process.env.AI_CREDITOS_PADRAO_ESCOLA || 5000);
const LIMITE_DIA_USUARIO = () => Number(process.env.AI_LIMITE_DIA_USUARIO || 80);
const LIMITE_DIA_ESCOLA = () => Number(process.env.AI_LIMITE_DIA_ESCOLA || 800);
/** Quantos créditos internos cobrados por 1k tokens estimados (mín. 1 por chamada) */
const CREDITOS_POR_1K = () => Number(process.env.AI_CREDITOS_POR_1K_TOKENS || 1);

function inicioDoDiaUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function creditosParaTokens(tokensEstimados) {
  const t = Math.max(0, Number(tokensEstimados) || 0);
  return Math.max(1, Math.ceil((t / 1000) * CREDITOS_POR_1K()));
}

async function garantirCreditoEscola(escolaId) {
  let doc = await CreditoIAEscola.findOne({ escola_id: escolaId });
  if (!doc) {
    doc = await CreditoIAEscola.create({
      escola_id: escolaId,
      saldo: CREDITOS_PADRAO(),
      creditoInicial: CREDITOS_PADRAO()
    });
  }
  return doc;
}

async function consumoHoje({ escolaId, usuarioId }) {
  const desde = inicioDoDiaUTC();
  const filtroEscola = { escola_id: escolaId, dataCriacao: { $gte: desde } };
  const [aggEscola, aggUsuario] = await Promise.all([
    ConsumoIA.aggregate([
      { $match: filtroEscola },
      { $group: { _id: null, chamadas: { $sum: 1 }, creditos: { $sum: '$creditosDebitados' }, tokens: { $sum: '$tokensEstimados' } } }
    ]),
    ConsumoIA.aggregate([
      { $match: { ...filtroEscola, usuario_id: new mongoose.Types.ObjectId(String(usuarioId)) } },
      { $group: { _id: null, chamadas: { $sum: 1 }, creditos: { $sum: '$creditosDebitados' }, tokens: { $sum: '$tokensEstimados' } } }
    ])
  ]);
  return {
    escola: {
      chamadas: aggEscola[0]?.chamadas || 0,
      creditos: aggEscola[0]?.creditos || 0,
      tokens: aggEscola[0]?.tokens || 0
    },
    usuario: {
      chamadas: aggUsuario[0]?.chamadas || 0,
      creditos: aggUsuario[0]?.creditos || 0,
      tokens: aggUsuario[0]?.tokens || 0
    }
  };
}

/**
 * Valida saldo e limites diários antes de chamar o modelo.
 */
async function assertPodeUsarIA({ escolaId, usuarioId }) {
  if (!escolaId || !usuarioId) {
    const err = new Error('Escola e usuário são obrigatórios para usar a IA');
    err.status = 400;
    throw err;
  }

  const credito = await garantirCreditoEscola(escolaId);
  if (credito.saldo <= 0) {
    const err = new Error('Créditos de IA esgotados para esta escola. Contate a administração VEHO.');
    err.status = 402;
    err.codigo = 'IA_SEM_CREDITOS';
    throw err;
  }

  const hoje = await consumoHoje({ escolaId, usuarioId });
  if (hoje.usuario.chamadas >= LIMITE_DIA_USUARIO()) {
    const err = new Error(
      `Limite diário de IA por usuário atingido (${LIMITE_DIA_USUARIO()} usos/dia).`
    );
    err.status = 429;
    err.codigo = 'IA_LIMITE_USUARIO';
    throw err;
  }
  if (hoje.escola.chamadas >= LIMITE_DIA_ESCOLA()) {
    const err = new Error(
      `Limite diário de IA da escola atingido (${LIMITE_DIA_ESCOLA()} usos/dia).`
    );
    err.status = 429;
    err.codigo = 'IA_LIMITE_ESCOLA';
    throw err;
  }

  return { credito, consumoHoje: hoje };
}

async function registrarConsumoEDebitar({
  escolaId,
  usuarioId,
  finalidade,
  modelo,
  provider,
  tokensEstimados,
  promptTokens,
  completionTokens,
  sucesso,
  erroMensagem
}) {
  const creditosDebitados = sucesso ? creditosParaTokens(tokensEstimados) : 0;

  if (sucesso && creditosDebitados > 0) {
    await CreditoIAEscola.updateOne(
      { escola_id: escolaId, saldo: { $gte: creditosDebitados } },
      {
        $inc: { saldo: -creditosDebitados, totalConsumido: creditosDebitados },
        $set: { dataAtualizacao: new Date() }
      }
    );
  }

  await ConsumoIA.create({
    escola_id: escolaId,
    usuario_id: usuarioId,
    finalidade: finalidade || 'chat',
    modelo: modelo || '',
    provider: provider || 'ollama',
    tokensEstimados: tokensEstimados || 0,
    promptTokens: promptTokens || 0,
    completionTokens: completionTokens || 0,
    creditosDebitados,
    sucesso: Boolean(sucesso),
    erroMensagem: erroMensagem ? String(erroMensagem).slice(0, 500) : '',
    dataCriacao: new Date()
  });

  return { creditosDebitados };
}

async function obterStatusCreditos(escolaId, usuarioId) {
  const credito = await garantirCreditoEscola(escolaId);
  const hoje = await consumoHoje({ escolaId, usuarioId });
  return {
    saldo: credito.saldo,
    creditoInicial: credito.creditoInicial,
    totalConsumido: credito.totalConsumido,
    limites: {
      usuarioDia: LIMITE_DIA_USUARIO(),
      escolaDia: LIMITE_DIA_ESCOLA()
    },
    consumoHoje: hoje
  };
}

module.exports = {
  garantirCreditoEscola,
  assertPodeUsarIA,
  registrarConsumoEDebitar,
  obterStatusCreditos,
  creditosParaTokens,
  CREDITOS_PADRAO,
  LIMITE_DIA_USUARIO,
  LIMITE_DIA_ESCOLA
};
