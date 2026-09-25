/**
 * Timeout + retry simples para serviços externos (TOKEN 11).
 * Sem circuit breaker global no projeto — este helper cobre timeout/retry idempotente.
 */
'use strict';

async function withTimeout(promiseFactory, timeoutMs = 5000, label = 'operacao') {
  const ms = Math.max(1, Number(timeoutMs) || 5000);
  let timer;
  try {
    return await Promise.race([
      typeof promiseFactory === 'function' ? promiseFactory() : promiseFactory,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`Timeout em ${label} após ${ms}ms`);
          err.code = 'ETIMEDOUT';
          err.timeout = true;
          reject(err);
        }, ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Retry com backoff linear. Só reexecuta se `isRetryable(err)` for true.
 * Operações devem ser idempotentes do lado do chamador.
 */
async function withRetry(fn, {
  retries = 2,
  delayMs = 100,
  timeoutMs,
  label = 'operacao',
  isRetryable = (err) => Boolean(err && (err.timeout || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET'))
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (timeoutMs) {
        return await withTimeout(() => fn(attempt), timeoutMs, label);
      }
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

module.exports = { withTimeout, withRetry };
