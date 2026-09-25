/**
 * Lock distribuído leve via coleção Mongo (unique _id).
 * Evita race em matrícula/checkout quando duas requisições competem pelo mesmo recurso.
 */
const { ConcurrencyLock } = require('../database/schema');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withLock(key, fn, { ttlMs = 15000, retries = 50, waitMs = 40 } = {}) {
  if (!key) return fn();

  const lockId = String(key).slice(0, 200);
  let lastErr;

  for (let i = 0; i < retries; i++) {
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      await ConcurrencyLock.create({ _id: lockId, expiresAt });
      try {
        return await fn();
      } finally {
        await ConcurrencyLock.deleteOne({ _id: lockId }).catch(() => {});
      }
    } catch (err) {
      lastErr = err;
      if (err && err.code !== 11000) throw err;
      await ConcurrencyLock.deleteMany({ expiresAt: { $lt: new Date() } }).catch(() => {});
      await sleep(waitMs + Math.floor(Math.random() * 20));
    }
  }

  const e = new Error('Operação em andamento para este recurso — tente novamente');
  e.status = 409;
  e.cause = lastErr;
  throw e;
}

module.exports = { withLock };
