/**
 * Helpers de ambiente para testes — não altera .env de produção.
 */
function withEnv(overrides, fn) {
  const previous = {};
  const keys = Object.keys(overrides);

  for (const key of keys) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  };

  if (typeof fn !== 'function') {
    return restore;
  }

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function apiBase() {
  return process.env.TEST_API_URL || process.env.API_BASE || 'http://localhost:3000';
}

function temServidorParaApi() {
  return process.env.RUN_API_TESTS === '1' || process.env.RUN_API_TESTS === 'true';
}

module.exports = {
  withEnv,
  apiBase,
  temServidorParaApi
};
