// backend/server.js - Servidor Express Principal

require('dotenv').config();

const mongoose = require('mongoose');
const { obterJwtSecret } = require('./utils/jwtSecret');
const { createApp } = require('./app');
const { connectMongo } = require('./utils/mongoConnect');

const isProd = process.env.NODE_ENV === 'production';

// ==================== VALIDAÇÃO DE VARIÁVEIS ====================
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida no .env');
  process.exit(1);
}

try {
  obterJwtSecret();
  console.log('✓ JWT_SECRET validada');
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

if (isProd && (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === '*')) {
  console.warn('⚠️  FRONTEND_URL deve ser a URL pública em produção (CORS).');
}

const app = createApp();

// ==================== CONEXÃO MONGODB ====================
connectMongo(mongoose, process.env.MONGODB_URI)
  .then((opts) => {
    console.log(`✓ Conectado ao MongoDB (maxPoolSize=${opts.maxPoolSize}, waitQueueTimeoutMS=${opts.waitQueueTimeoutMS})`);
  })
  .catch((err) => {
    console.error('✗ Erro ao conectar MongoDB:', err.message);
    process.exit(1);
  });

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function obterIpsLan() {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const nome of Object.keys(nets || {})) {
      for (const net of nets[nome] || []) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    return ips;
  } catch {
    return [];
  }
}

app.listen(PORT, HOST, () => {
  console.log('\n🚀 Servidor iniciado');
  console.log(`📌 Porta: ${PORT} (bind ${HOST})`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 http://localhost:${PORT}`);
  const lan = obterIpsLan();
  if (lan.length) {
    console.log('📱 No celular (mesma Wi‑Fi), abra:');
    lan.forEach((ip) => console.log(`   http://${ip}:${PORT}`));
  }
  console.log('');
});

module.exports = app;
