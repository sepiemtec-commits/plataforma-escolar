// backend/services/ai/providers/ollamaProvider.js — modelo open-source via Ollama (local)
const DEFAULT_TIMEOUT_MS = 60000;

function configOllama() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: (process.env.OLLAMA_MODEL || process.env.AI_MODEL || 'llama3.2').trim(),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  };
}

function estimarTokens(texto) {
  const t = String(texto || '');
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

/**
 * Chama Ollama /api/chat (sem API paga).
 * @returns {{ texto: string, modelo: string, tokensEstimados: number, promptTokens: number, completionTokens: number }}
 */
async function gerarComOllama({ system, messages }) {
  const { baseUrl, model, timeoutMs } = configOllama();
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: String(system).slice(0, 8000) });
  for (const m of messages || []) {
    if (!m?.content) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    msgs.push({ role, content: String(m.content).slice(0, 8000) });
  }
  if (!msgs.length) {
    const err = new Error('Mensagem vazia para o modelo');
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: msgs,
        options: {
          temperature: 0.5,
          num_predict: Number(process.env.AI_MAX_TOKENS || 900)
        }
      })
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      const err = new Error(
        `Ollama indisponível (${res.status}). Verifique se o serviço está rodando e o modelo foi baixado.`
      );
      err.status = 503;
      err.detalhe = corpo.slice(0, 300);
      throw err;
    }

    const data = await res.json();
    const texto = data?.message?.content;
    if (!texto || !String(texto).trim()) {
      const err = new Error('Ollama retornou resposta vazia');
      err.status = 502;
      throw err;
    }

    const promptTxt = msgs.map((m) => m.content).join('\n');
    const promptTokens = Number(data?.prompt_eval_count) || estimarTokens(promptTxt);
    const completionTokens = Number(data?.eval_count) || estimarTokens(texto);
    return {
      texto: String(texto).trim(),
      modelo: data?.model || model,
      tokensEstimados: promptTokens + completionTokens,
      promptTokens,
      completionTokens
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error(`Timeout ao consultar Ollama (>${timeoutMs}ms)`);
      err.status = 504;
      throw err;
    }
    if (e.status) throw e;
    const err = new Error(
      `Falha ao conectar no Ollama em ${baseUrl}. Inicie com: ollama serve`
    );
    err.status = 503;
    err.cause = e;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function healthOllama() {
  const { baseUrl, model } = configOllama();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, baseUrl, model, mensagem: `HTTP ${res.status}` };
    const data = await res.json();
    const nomes = (data.models || []).map((m) => m.name || m.model);
    const temModelo = nomes.some((n) => String(n).startsWith(model) || String(n).includes(model));
    return {
      ok: true,
      baseUrl,
      model,
      modeloDisponivel: temModelo,
      modelos: nomes.slice(0, 20)
    };
  } catch (e) {
    return { ok: false, baseUrl, model, mensagem: e.message || 'offline' };
  }
}

module.exports = {
  configOllama,
  gerarComOllama,
  healthOllama,
  estimarTokens
};
