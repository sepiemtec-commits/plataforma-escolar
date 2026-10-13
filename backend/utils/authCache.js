/**
 * Cache curto do usuário autenticado no processo.
 * Logout e troca de senha invalidam na hora (tokenVersion), então a sessão
 * revogada não continua válida pelo tempo do cache.
 */
const TTL_MS = Math.max(1000, Number(process.env.AUTH_CACHE_TTL_MS || 8000));
const MAX = 8000;
const cache = new Map();

function ler(id) {
  const key = String(id);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.usuario;
}

function gravar(usuario) {
  if (!usuario || !usuario._id) return;
  const key = String(usuario._id);
  if (cache.size >= MAX && !cache.has(key)) {
    const antigo = cache.keys().next().value;
    cache.delete(antigo);
  }
  cache.set(key, { at: Date.now(), usuario });
}

function invalidar(id) {
  if (id) cache.delete(String(id));
}

module.exports = { ler, gravar, invalidar };
