#!/usr/bin/env node
/**
 * Alvo local para carga/spike (TOKEN 07/08).
 * MongoMemoryServer + seed + Express (DISABLE_RATE_LIMIT=1, LOAD_DIAGNOSTICS=1).
 *
 * Env: PORT, LOAD_USER_POOL (default 200), LOAD_DIAGNOSTICS=1
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.ASSINATURA_MODO_DEV = 'true';
process.env.LOAD_DIAGNOSTICS = process.env.LOAD_DIAGNOSTICS || '1';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '2h';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET =
    process.env.JWT_SECRET_TEST ||
    'veho_load_target_' + 'a1b2c3d4e5f6'.repeat(3);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
process.env.DISABLE_RATE_LIMIT = '1';
process.env.LOAD_DIAGNOSTICS = process.env.LOAD_DIAGNOSTICS || '1';

const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../../backend/app');
const { obterSenhaSeed } = require('../../../backend/utils/senhaPadrao');
const { connectMongo } = require('../../../backend/utils/mongoConnect');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const POOL = Math.max(50, Number(process.env.LOAD_USER_POOL || 200));


async function seedMinimo() {
  const {
    Escola,
    Usuario,
    Turma,
    Avaliacao,
    Presenca,
    Responsavel
  } = require('../../../backend/database/schema');

  const senha = obterSenhaSeed();
  let escola = await Escola.findOne({ cnpj: '11222333000181' });
  if (!escola) {
    escola = await Escola.create({
      nome: 'Escola Load Target',
      cnpj: '11222333000181',
      ativo: true,
      configuracao: { anoLetivo: 2026 }
    });
  }

  async function ensureUser(data) {
    let u = await Usuario.findOne({ email: data.email });
    if (u) return u;
    return Usuario.create({
      senha,
      ativo: true,
      whatsapp: '11999990000',
      escola_id: escola._id,
      ...data
    });
  }

  const professor = await ensureUser({
    nome: 'Professor Load',
    email: 'professor@escola.com',
    cpf: '10000000003',
    tipo: 'professor',
    disciplina: 'Matemática',
    disciplinas: ['Matemática']
  });
  await ensureUser({
    nome: 'Secretaria Load',
    email: 'secretaria@escola.com',
    cpf: '10000000002',
    tipo: 'secretaria'
  });
  await ensureUser({
    nome: 'Diretor Load',
    email: 'diretor@escola.com',
    cpf: '10000000001',
    tipo: 'diretor'
  });

  let turma = await Turma.findOne({ escola_id: escola._id, nome: '5º Ano Load' });
  if (!turma) {
    turma = await Turma.create({
      nome: '5º Ano Load',
      serie: 'A',
      ano: 5,
      nivel: 'Fundamental I',
      turno: 'Manhã',
      escola_id: escola._id,
      professor_id: professor._id,
      alunos: []
    });
  }

  const secPool = [];
  const respPool = [];
  const alunoIds = [];

  for (let i = 1; i <= POOL; i++) {
    const aluno = await ensureUser({
      nome: `Aluno Load ${i}`,
      email: `load.aluno.${i}@escola.com`,
      cpf: String(30000000000 + i).slice(0, 11),
      tipo: 'aluno'
    });
    alunoIds.push(aluno._id);

    if (!(await Avaliacao.findOne({ aluno_id: aluno._id }))) {
      await Avaliacao.create({
        aluno_id: aluno._id,
        professor_id: professor._id,
        turma_id: turma._id,
        disciplina: 'Matemática',
        tipo: 'prova_bimestral',
        periodo: '1º Bimestre',
        nota: 6 + (i % 4),
        dataAplicacao: new Date()
      });
    }
    if (!(await Presenca.findOne({ aluno_id: aluno._id }))) {
      await Presenca.create({
        aluno_id: aluno._id,
        turma_id: turma._id,
        professor_id: professor._id,
        disciplina: 'Matemática',
        tempo: 1,
        status: i % 7 === 0 ? 'falta' : 'presente',
        data: new Date()
      });
    }

    const resp = await ensureUser({
      nome: `Resp Load ${i}`,
      email: `load.resp.${i}@escola.com`,
      cpf: String(40000000000 + i).slice(0, 11),
      tipo: 'responsavel'
    });
    const vinculo = await Responsavel.findOne({ usuario_id: resp._id, aluno_id: aluno._id });
    if (!vinculo) {
      await Responsavel.create({
        usuario_id: resp._id,
        aluno_id: aluno._id,
        grau_parentesco: 'mae',
        whatsapp: '11988880000',
        recebeNotificacoes: true
      });
    }
    respPool.push({
      email: resp.email,
      password: senha,
      tipo: 'responsavel',
      alunoId: String(aluno._id)
    });

    const emailSec = `load.sec.${i}@escola.com`;
    await ensureUser({
      nome: `Sec Load ${i}`,
      email: emailSec,
      cpf: String(20000000000 + i).slice(0, 11),
      tipo: 'secretaria'
    });
    secPool.push({ email: emailSec, password: senha, tipo: 'secretaria' });
  }

  turma.alunos = alunoIds.slice(0, Math.min(40, alunoIds.length));
  await turma.save();

  const resultsDir = path.join(__dirname, '../results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, 'load-users.json'),
    JSON.stringify({ senha, users: secPool }, null, 2)
  );
  fs.writeFileSync(
    path.join(resultsDir, 'load-users-responsaveis.json'),
    JSON.stringify({ senha, users: respPool }, null, 2)
  );

  console.log(`✓ Seed spike/load: ${respPool.length} responsáveis + ${secPool.length} secretarias`);
  console.log(`  senha=${senha}`);
  console.log(`  turma=${turma._id}`);
  return { senha };
}

async function main() {
  console.log('Iniciando MongoMemoryServer para carga/spike…');
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  process.env.MONGODB_URI = uri;
  // Padrão alto no alvo de carga (override via MONGO_MAX_POOL)
  if (!process.env.MONGO_MAX_POOL) process.env.MONGO_MAX_POOL = '300';
  if (!process.env.LOGIN_CONCURRENCY) process.env.LOGIN_CONCURRENCY = '60';
  const opts = await connectMongo(mongoose, uri);
  console.log(`✓ Mongo em memória (maxPoolSize=${opts.maxPoolSize})`);

  await seedMinimo();

  const app = createApp({ isTest: false });
  // /health/diag já anexado via LOAD_DIAGNOSTICS em createApp

  const server = app.listen(PORT, HOST, () => {
    console.log(`\n🎯 Load/spike target: http://${HOST}:${PORT}`);
    console.log('   DISABLE_RATE_LIMIT=1 LOAD_DIAGNOSTICS=1');
    console.log('   GET /health/diag');
    console.log('   Ctrl+C para encerrar\n');
  });

  const shutdown = async () => {
    console.log('\nEncerrando…');
    server.close();
    await mongoose.disconnect().catch(() => {});
    await mongo.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
