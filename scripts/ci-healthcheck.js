#!/usr/bin/env node
/**
 * Health checks de CI — sobe app de teste e valida /health, /live, /ready, /metrics.
 */
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.ASSINATURA_MODO_DEV = 'true';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'veho_ci_health_' + 'a1b2c3d4e5f6'.repeat(3);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

async function main() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { createApp } = require('../backend/app');
  const app = createApp({ isTest: true });

  const checks = [
    { path: '/health', expect: 200, bodyKey: 'status' },
    { path: '/health/live', expect: 200, bodyKey: 'status' },
    { path: '/health/ready', expect: 200, bodyKey: 'status' },
    { path: '/metrics', expect: 200, textIncludes: 'veho_up' }
  ];

  let failed = 0;
  for (const c of checks) {
    const res = await request(app).get(c.path);
    const okStatus = res.status === c.expect;
    const okBody = c.textIncludes
      ? String(res.text || '').includes(c.textIncludes)
      : c.bodyKey
        ? res.body && res.body[c.bodyKey]
        : true;
    if (okStatus && okBody) {
      console.log(`✓ ${c.path} → ${res.status}`);
    } else {
      failed += 1;
      console.error(`✗ ${c.path} → ${res.status}`, res.body || res.text?.slice(0, 120));
    }
  }

  await mongoose.disconnect();
  await mongo.stop();

  if (failed) {
    console.error(`healthcheck: ${failed} falha(s)`);
    process.exit(1);
  }
  console.log('healthcheck: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
