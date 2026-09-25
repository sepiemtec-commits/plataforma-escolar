#!/usr/bin/env node
/**
 * Alvo TOKEN 11 — resiliência (porta 3011).
 * Usa Mongo Docker persistente (veho_resilience) para sobreviver a restart do Node.
 */
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.ASSINATURA_MODO_DEV = 'true';
process.env.LOAD_DIAGNOSTICS = '1';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '2h';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'veho_resilience_target_' + 'a1b2c3d4e5f6'.repeat(3);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
process.env.DISABLE_RATE_LIMIT = '1';
process.env.LOAD_DIAGNOSTICS = '1';

const fs = require('fs');
const mongoose = require('mongoose');
const { createApp } = require('../../../backend/app');
const { obterSenhaSeed } = require('../../../backend/utils/senhaPadrao');
const { connectMongo } = require('../../../backend/utils/mongoConnect');

const PORT = Number(process.env.RESILIENCE_PORT || 3011);
const HOST = process.env.HOST || '127.0.0.1';
const URI =
  process.env.RESILIENCE_MONGODB_URI ||
  'mongodb://127.0.0.1:27017/veho_resilience';

async function seed() {
  const { Escola, Usuario, Turma, Avaliacao, Presenca } = require('../../../backend/database/schema');
  const senha = obterSenhaSeed();

  let escola = await Escola.findOne({ cnpj: '99888777000166' });
  if (!escola) {
    escola = await Escola.create({
      nome: 'Escola Resiliência',
      cnpj: '99888777000166',
      ativo: true,
      configuracao: { anoLetivo: 2026 }
    });
  }

  async function ensure(data) {
    let u = await Usuario.findOne({ email: data.email });
    if (u) return u;
    return Usuario.create({ senha, ativo: true, whatsapp: '11988887777', escola_id: escola._id, ...data });
  }

  const professor = await ensure({
    nome: 'Prof Resiliencia',
    email: 'prof.resilience@escola.com',
    cpf: '90000000001',
    tipo: 'professor',
    disciplina: 'Matemática',
    disciplinas: ['Matemática']
  });
  const secretaria = await ensure({
    nome: 'Sec Resiliencia',
    email: 'sec.resilience@escola.com',
    cpf: '90000000002',
    tipo: 'secretaria'
  });
  const aluno = await ensure({
    nome: 'Aluno Resiliencia Marker',
    email: 'aluno.resilience@escola.com',
    cpf: '90000000003',
    tipo: 'aluno',
    matriculaNumero: 99001
  });

  let turma = await Turma.findOne({ escola_id: escola._id, nome: 'Turma Resiliencia' });
  if (!turma) {
    turma = await Turma.create({
      nome: 'Turma Resiliencia',
      serie: 'A',
      ano: 5,
      nivel: 'Fundamental I',
      turno: 'Manhã',
      escola_id: escola._id,
      professor_id: professor._id,
      alunos: [aluno._id]
    });
  } else if (!turma.alunos.map(String).includes(String(aluno._id))) {
    turma.alunos.push(aluno._id);
    await turma.save();
  }

  if (!(await Avaliacao.findOne({ aluno_id: aluno._id }))) {
    await Avaliacao.create({
      aluno_id: aluno._id,
      professor_id: professor._id,
      turma_id: turma._id,
      disciplina: 'Matemática',
      tipo: 'prova_bimestral',
      periodo: '1º Bimestre',
      nota: 8.5,
      dataAplicacao: new Date('2026-03-15')
    });
  }
  if (!(await Presenca.findOne({ aluno_id: aluno._id }))) {
    await Presenca.create({
      aluno_id: aluno._id,
      turma_id: turma._id,
      professor_id: professor._id,
      disciplina: 'Matemática',
      tempo: 1,
      data: new Date('2026-03-15'),
      status: 'presente'
    });
  }

  const meta = {
    escolaId: String(escola._id),
    alunoId: String(aluno._id),
    turmaId: String(turma._id),
    secretariaEmail: secretaria.email,
    senha,
    marker: 'TOKEN11_MARKER_v1'
  };
  const outDir = path.join(__dirname, '../results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'resilience-meta.json'), JSON.stringify(meta, null, 2));
  console.log('✓ Seed resiliência', meta.secretariaEmail);
  return meta;
}

async function main() {
  console.log('Conectando Mongo resiliência:', URI.replace(/\/\/.*@/, '//***@'));
  process.env.MONGODB_URI = URI;
  process.env.MONGO_MAX_POOL = process.env.MONGO_MAX_POOL || '50';
  await connectMongo(mongoose, URI, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_MS || 5000),
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 10000)
  });
  await seed();
  const app = createApp({ isTest: false });
  const server = app.listen(PORT, HOST, () => {
    console.log(`\n🛡️  Resilience target: http://${HOST}:${PORT}`);
    console.log('   GET /health  GET /health/diag\n');
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
