/**
 * Semáforo simples — limita trabalho CPU/DB concorrente (ex.: login + bcrypt).
 */
function createSemaphore(limit) {
  const max = Math.max(1, Number(limit) || 1);
  let active = 0;
  const waiters = [];

  function acquire(timeoutMs = 8000) {
    if (active < max) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: () => {
          active += 1;
          resolve();
        },
        reject,
        timer: null
      };
      waiter.timer = setTimeout(() => {
        const idx = waiters.indexOf(waiter);
        if (idx >= 0) waiters.splice(idx, 1);
        const err = new Error('Servidor sob carga — tente novamente em alguns segundos');
        err.status = 503;
        err.code = 'CONCURRENCY_LIMIT';
        reject(err);
      }, timeoutMs);
      waiters.push(waiter);
    });
  }

  function release() {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    }
  }

  async function run(fn, timeoutMs) {
    await acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    run,
    stats: () => ({ active, waiting: waiters.length, max })
  };
}

module.exports = { createSemaphore };
