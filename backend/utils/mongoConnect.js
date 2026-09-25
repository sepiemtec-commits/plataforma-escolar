/**
 * Opções e conexão MongoDB — pool dimensionado para picos (ex.: publicação de boletim).
 *
 * Env:
 *   MONGO_MAX_POOL              default 200 (antes o driver usava 100 e saturava no spike)
 *   MONGO_MIN_POOL              default 10
 *   MONGO_WAIT_QUEUE_TIMEOUT_MS default 10000 (falha rápida vs hang de 30s)
 *   MONGO_MAX_IDLE_MS           default 60000
 */
function mongoPoolOptions(overrides = {}) {
  const maxPoolSize = Math.max(
    10,
    Number(process.env.MONGO_MAX_POOL || process.env.MONGO_POOL_SIZE || 200)
  );
  const minPoolSize = Math.min(
    maxPoolSize,
    Math.max(0, Number(process.env.MONGO_MIN_POOL || 10))
  );
  const waitQueueTimeoutMS = Math.max(
    1000,
    Number(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS || 10000)
  );
  const maxIdleTimeMS = Math.max(
    5000,
    Number(process.env.MONGO_MAX_IDLE_MS || 60000)
  );

  return {
    maxPoolSize,
    minPoolSize,
    maxIdleTimeMS,
    waitQueueTimeoutMS,
    // Evita abrir rajadas enormes de sockets de uma vez
    maxConnecting: Math.min(maxPoolSize, Number(process.env.MONGO_MAX_CONNECTING || 20)),
    ...overrides
  };
}

async function connectMongo(mongoose, uri, overrides = {}) {
  if (!uri) throw new Error('MONGODB_URI ausente');
  const opts = mongoPoolOptions(overrides);
  await mongoose.connect(uri, opts);
  return opts;
}

module.exports = { mongoPoolOptions, connectMongo };
