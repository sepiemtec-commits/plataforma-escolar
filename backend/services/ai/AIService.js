// backend/services/ai/AIService.js — fachada de IA (troca de modelo sem mudar o resto do app)
const { gerarComOllama, healthOllama, configOllama, estimarTokens } = require('./providers/ollamaProvider');
const {
  assertPodeUsarIA,
  registrarConsumoEDebitar,
  obterStatusCreditos
} = require('./creditosIA');

/**
 * Provider ativo via env. Hoje: ollama (local). Futuro: pode adicionar outros sem alterar rotas.
 */
function providerAtivo() {
  return String(process.env.AI_PROVIDER || 'ollama').trim().toLowerCase();
}

/**
 * Remove dados pessoais desnecessários do texto enviado ao modelo.
 * Mantém contexto pedagógico genérico (média, frequência, disciplina).
 */
function sanitizarContextoParaPrompt(contexto) {
  if (!contexto || typeof contexto !== 'object') return null;
  const out = {};
  if (contexto.disciplina) out.disciplina = String(contexto.disciplina).slice(0, 80);
  if (contexto.turmaNome) out.turma = String(contexto.turmaNome).slice(0, 80);
  if (contexto.media != null) out.media = Number(contexto.media);
  if (contexto.frequenciaPercentual != null) {
    out.frequenciaPercentual = Number(contexto.frequenciaPercentual);
  }
  if (contexto.nivel) out.nivel = String(contexto.nivel).slice(0, 40);
  if (contexto.totalFaltas != null) out.totalFaltas = Number(contexto.totalFaltas);
  // Não envia nome, CPF, e-mail, endereço, telefone
  return out;
}

function systemPedagogicoPadrao() {
  return (
    'Você é a NICE IA, assistente pedagógica da plataforma VEHO Edu (Brasil). ' +
    'Responda em português do Brasil, de forma prática e clara. ' +
    'Dê ideias de aula, estratégias, BNCC e autores reconhecidos sem inventar bibliografia. ' +
    'Não peça dados pessoais. Não invente notas ou faltas além do contexto JSON. ' +
    'O professor deve revisar antes de usar com a família. Preferência por listas e passos acionáveis.'
  );
}

/**
 * Gera texto com o provider configurado (Ollama local por padrão).
 * @param {object} opts
 * @param {string} opts.escolaId
 * @param {string} opts.usuarioId
 * @param {string} [opts.finalidade] chat|parecer|pergunta
 * @param {string} [opts.system]
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {object} [opts.contextoPedagogico] já sanitizado ou bruto (será sanitizado)
 */
async function generate(opts = {}) {
  const {
    escolaId,
    usuarioId,
    finalidade = 'chat',
    system,
    messages,
    contextoPedagogico
  } = opts;

  await assertPodeUsarIA({ escolaId, usuarioId });

  const provider = providerAtivo();
  const ctx = sanitizarContextoParaPrompt(contextoPedagogico);
  const systemFinal =
    (system || systemPedagogicoPadrao()) +
    (ctx ? `\n\nContexto pedagógico (sem dados pessoais):\n${JSON.stringify(ctx)}` : '');

  if (provider !== 'ollama') {
    const err = new Error(
      `Provider de IA "${provider}" não suportado. Use AI_PROVIDER=ollama`
    );
    err.status = 500;
    throw err;
  }

  try {
    const out = await gerarComOllama({ system: systemFinal, messages });
    const deb = await registrarConsumoEDebitar({
      escolaId,
      usuarioId,
      finalidade,
      modelo: out.modelo,
      provider: 'ollama',
      tokensEstimados: out.tokensEstimados,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      sucesso: true
    });

    return {
      texto: out.texto,
      fonte: 'ollama',
      provider: 'ollama',
      modelo: out.modelo,
      tokensEstimados: out.tokensEstimados,
      creditosDebitados: deb.creditosDebitados
    };
  } catch (e) {
    await registrarConsumoEDebitar({
      escolaId,
      usuarioId,
      finalidade,
      modelo: configOllama().model,
      provider: 'ollama',
      tokensEstimados: 0,
      promptTokens: 0,
      completionTokens: 0,
      sucesso: false,
      erroMensagem: e.message
    }).catch(() => {});
    throw e;
  }
}

async function status() {
  const ollama = await healthOllama();
  return {
    provider: providerAtivo(),
    ollama,
    env: {
      AI_PROVIDER: process.env.AI_PROVIDER || 'ollama',
      OLLAMA_MODEL: configOllama().model,
      OLLAMA_BASE_URL: configOllama().baseUrl,
      AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 60000)
    }
  };
}

module.exports = {
  generate,
  status,
  obterStatusCreditos,
  sanitizarContextoParaPrompt,
  systemPedagogicoPadrao,
  providerAtivo,
  estimarTokens
};
