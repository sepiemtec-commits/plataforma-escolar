/**
 * Índices Mongo recomendados (espelho do TOKEN 10).
 * NÃO aplica em produção automaticamente.
 * Uso seguro: apontar MONGODB_URI para instância de teste / memory-server.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/veho_scale_test \
 *     node tests/database/scripts/propose-mongo-indexes.js
 */
'use strict';

const mongoose = require('mongoose');

const INDEXES = [
  { collection: 'usuarios', keys: { escola_id: 1, tipo: 1, nome: 1 }, name: 'escola_tipo_nome' },
  { collection: 'turmas', keys: { escola_id: 1, nome: 1 }, name: 'escola_nome' },
  { collection: 'avaliacaos', keys: { turma_id: 1, disciplina: 1, periodo: 1 }, name: 'turma_disc_periodo' },
  { collection: 'avaliacaos', keys: { aluno_id: 1, periodo: 1, disciplina: 1 }, name: 'aluno_periodo_disc' },
  { collection: 'presencas', keys: { turma_id: 1, data: 1 }, name: 'turma_data' },
  { collection: 'presencas', keys: { aluno_id: 1, data: -1 }, name: 'aluno_data' },
  { collection: 'desempenhos', keys: { aluno_id: 1, periodo: 1, disciplina: 1 }, name: 'aluno_periodo_disc' },
  { collection: 'desempenhos', keys: { turma_id: 1, situacao: 1 }, name: 'turma_situacao' },
  { collection: 'desempenhos', keys: { situacao: 1, mediaGeral: 1 }, name: 'situacao_media', partial: { situacao: { $in: ['recuperacao', 'reprovado'] } } },
  { collection: 'responsavels', keys: { aluno_id: 1 }, name: 'aluno' },
  { collection: 'responsavels', keys: { usuario_id: 1 }, name: 'usuario' }
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Defina MONGODB_URI de TESTE. Abortando (não toca produção).');
    process.exit(2);
  }
  if (/atlas|prod|production/i.test(uri) && process.env.ALLOW_MONGO_INDEX_PROD !== '1') {
    console.error('URI parece produção. Use ALLOW_MONGO_INDEX_PROD=1 só se tiver certeza.');
    process.exit(2);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  for (const idx of INDEXES) {
    const opts = { name: idx.name, background: true };
    if (idx.partial) opts.partialFilterExpression = idx.partial;
    try {
      await db.collection(idx.collection).createIndex(idx.keys, opts);
      console.log('OK', idx.collection, idx.name);
    } catch (e) {
      console.warn('SKIP', idx.collection, idx.name, e.message);
    }
  }
  await mongoose.disconnect();
  console.log('Índices de teste aplicados.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
