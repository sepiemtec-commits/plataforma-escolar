#!/usr/bin/env node
/**
 * Servidor E2E Playwright — MongoMemoryServer + seed multi-perfil.
 * Porta padrão 3013. Escreve tests/e2e/.auth/users.json
 */
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DISABLE_RATE_LIMIT = '1';
process.env.ASSINATURA_MODO_DEV = 'true';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '2h';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'veho_e2e_playwright_' + 'c0ffee'.repeat(6);
}

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../../backend/app');
const { obterSenhaSeed } = require('../../../backend/utils/senhaPadrao');
const { connectMongo } = require('../../../backend/utils/mongoConnect');

const PORT = Number(process.env.E2E_PORT || 3013);
const HOST = process.env.E2E_HOST || '127.0.0.1';
const AUTH_DIR = path.join(__dirname, '../.auth');
const READY_FILE = path.join(AUTH_DIR, 'ready.json');

async function seed() {
  const {
    Escola, Usuario, Turma, DisciplinaConfig, Avaliacao, Presenca, Responsavel
  } = require('../../../backend/database/schema');

  const senha = obterSenhaSeed();
  const escola = await Escola.create({
    nome: 'Escola E2E Playwright',
    cnpj: '11222333000155',
    ativo: true,
    configuracao: { anoLetivo: 2026, alertasWhatsapp: false },
    assinatura: { plano: 'completo', status: 'active' }
  });

  async function user(data) {
    return Usuario.create({
      senha,
      ativo: true,
      whatsapp: '11999990000',
      escola_id: escola._id,
      ...data
    });
  }

  const diretor = await user({
    nome: 'Admin Diretor E2E',
    email: 'diretor.e2e@escola.com',
    cpf: '10000000001',
    tipo: 'diretor'
  });
  const coordenador = await user({
    nome: 'Coord E2E',
    email: 'coord.e2e@escola.com',
    cpf: '10000000002',
    tipo: 'coordenador'
  });
  const secretaria = await user({
    nome: 'Secretaria E2E',
    email: 'secretaria.e2e@escola.com',
    cpf: '10000000003',
    tipo: 'secretaria'
  });
  const professor = await user({
    nome: 'Professor E2E',
    email: 'professor.e2e@escola.com',
    cpf: '10000000004',
    tipo: 'professor',
    disciplina: 'Matemática',
    disciplinas: ['Matemática']
  });
  const aluno = await user({
    nome: 'Aluno E2E Seed',
    email: 'aluno.e2e@escola.com',
    cpf: '10000000005',
    tipo: 'aluno',
    matriculaNumero: 1001
  });
  const responsavel = await user({
    nome: 'Responsavel E2E',
    email: 'resp.e2e@escola.com',
    cpf: '10000000006',
    tipo: 'responsavel'
  });
  await Responsavel.create({
    usuario_id: responsavel._id,
    aluno_id: aluno._id,
    grau_parentesco: 'mae',
    whatsapp: '11988887777'
  });

  await DisciplinaConfig.create({
    escola_id: escola._id,
    nome: 'Matemática',
    quantidadeTempos: 2,
    ativo: true
  });

  const turma = await Turma.create({
    nome: '5º Ano E2E',
    serie: 'A',
    ano: 5,
    nivel: 'Fundamental I',
    turno: 'Manhã',
    escola_id: escola._id,
    professor_id: professor._id,
    alunos: [aluno._id]
  });

  await Avaliacao.create({
    aluno_id: aluno._id,
    professor_id: professor._id,
    turma_id: turma._id,
    disciplina: 'Matemática',
    tipo: 'prova_bimestral',
    periodo: '1º Bimestre',
    nota: 8,
    dataAplicacao: new Date('2026-03-10')
  });
  await Presenca.create({
    aluno_id: aluno._id,
    turma_id: turma._id,
    professor_id: professor._id,
    disciplina: 'Matemática',
    tempo: 1,
    data: new Date('2026-03-10'),
    status: 'presente'
  });

  const users = {
    senha,
    baseURL: `http://${HOST}:${PORT}`,
    escolaId: String(escola._id),
    turmaId: String(turma._id),
    alunoId: String(aluno._id),
    diretor: { email: diretor.email, senha, painel: 'painel-diretor.html' },
    coordenador: { email: coordenador.email, senha, painel: 'painel-coordenador.html' },
    secretaria: { email: secretaria.email, senha, painel: 'painel-secretaria.html' },
    professor: { email: professor.email, senha, painel: 'painel-professor.html' },
    aluno: { email: aluno.email, senha, painel: 'painel-aluno.html' },
    responsavel: { email: responsavel.email, senha, painel: 'painel-responsavel.html' }
  };

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUTH_DIR, 'users.json'), JSON.stringify(users, null, 2));
  return users;
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await connectMongo(mongoose, process.env.MONGODB_URI, { maxPoolSize: 20, minPoolSize: 1 });
  await seed();
  const app = createApp({ isTest: false });
  const server = app.listen(PORT, HOST, () => {
    fs.writeFileSync(READY_FILE, JSON.stringify({ ready: true, port: PORT, at: new Date().toISOString() }));
    console.log(`E2E server http://${HOST}:${PORT}`);
  });

  const shutdown = async () => {
    try { fs.unlinkSync(READY_FILE); } catch { /* */ }
    server.close();
    await mongoose.disconnect().catch(() => {});
    await mongo.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
