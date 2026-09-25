#!/usr/bin/env node
/**
 * migrate:check — Mongo não usa SQL migrations; valida que índices críticos
 * do schema aplicam via syncIndexes (MongoMemory em CI).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'veho_migrate_check_' + 'a1b2c3d4e5f6'.repeat(3);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CRITICAL = [
  'Usuario',
  'Escola',
  'AssinaturaPendente',
  'Presenca',
  'Avaliacao',
  'Desempenho',
  'Turma',
  'DisciplinaConfig'
];

async function main() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const schema = require('../backend/database/schema');

  const report = [];
  for (const name of CRITICAL) {
    const Model = schema[name];
    if (!Model) {
      report.push({ name, ok: false, error: 'modelo ausente' });
      continue;
    }
    try {
      await Model.syncIndexes();
      const indexes = await Model.collection.indexes();
      report.push({ name, ok: true, indexes: indexes.length });
    } catch (err) {
      report.push({ name, ok: false, error: err.message });
    }
  }

  await mongoose.disconnect();
  await mongo.stop();

  const failed = report.filter((r) => !r.ok);
  for (const r of report) {
    console.log(
      r.ok
        ? `✓ ${r.name} — ${r.indexes} índice(s)`
        : `✗ ${r.name} — ${r.error}`
    );
  }

  if (failed.length) {
    console.error(`migrate:check FALHOU (${failed.length})`);
    process.exit(1);
  }
  console.log('migrate:check OK — índices críticos sincronizados');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
