/**
 * Harness de API: Mongo em memória + app Express + fixtures multi-escola.
 * TOKEN 04: ESCOLA_A / ESCOLA_B com Admin, Professor, Aluno, Responsável em ambos.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

let mongoServer;
let app;
let ctx;

function ensureTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET_TEST ||
    'veho_api_harness_' + 'f9c2a81b7e4d'.repeat(4);
  process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '2h';
  process.env.DISABLE_RATE_LIMIT = '1';
  process.env.ASSINATURA_MODO_DEV = 'true';
  delete process.env.STRIPE_SECRET_KEY;
}

async function startApiHarness() {
  ensureTestEnv();
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // eslint-disable-next-line global-require
  const { createApp } = require('../../backend/app');
  app = createApp({ isTest: true });
  ctx = await seedFixtures();
  return { app, ctx, request: request(app) };
}

async function stopApiHarness() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.connection.close(true);
    }
  } catch {
    /* ignore */
  }
  try {
    if (mongoServer) await mongoServer.stop({ doCleanup: true, force: true });
  } catch {
    /* ignore */
  }
  mongoServer = null;
  app = null;
  ctx = null;
}

async function seedSide(letra, cnpjBase) {
  const {
    Escola,
    Usuario,
    Turma,
    Responsavel,
    DisciplinaConfig,
    HistoricoEscolar,
    Avaliacao,
    Presenca,
    Conteudo,
    DocumentoArquivo,
    Pei,
    HtpcReuniao
  } = require('../../backend/database/schema');

  const senha = 'SenhaApiTeste99';
  const prefix = letra === 'A' ? '1' : '2';

  const escola = await Escola.create({
    nome: `Escola ${letra}`,
    cnpj: cnpjBase,
    ativo: true,
    configuracao: { anoLetivo: 2026, alertasWhatsapp: false }
  });

  async function user(data) {
    return Usuario.create({
      senha,
      ativo: true,
      whatsapp: `1199999${prefix}000`,
      escola_id: escola._id,
      ...data
    });
  }

  const admin = await user({
    nome: `Admin ${letra}`,
    email: `diretor.${letra.toLowerCase()}@api.test`,
    cpf: `${prefix}0000000001`,
    tipo: 'diretor'
  });

  const secretaria = await user({
    nome: `Secretaria ${letra}`,
    email: `secretaria.${letra.toLowerCase()}@api.test`,
    cpf: `${prefix}0000000002`,
    tipo: 'secretaria'
  });

  const professor = await user({
    nome: `Professor ${letra}`,
    email: `professor.${letra.toLowerCase()}@api.test`,
    cpf: `${prefix}0000000003`,
    tipo: 'professor',
    disciplina: 'Matemática',
    disciplinas: ['Matemática']
  });

  const aluno = await user({
    nome: `Aluno ${letra}`,
    email: `aluno.${letra.toLowerCase()}@api.test`,
    cpf: `${prefix}0000000004`,
    tipo: 'aluno'
  });

  const responsavel = await user({
    nome: `Responsavel ${letra}`,
    email: `responsavel.${letra.toLowerCase()}@api.test`,
    cpf: `${prefix}0000000005`,
    tipo: 'responsavel'
  });

  await Responsavel.create({
    usuario_id: responsavel._id,
    aluno_id: aluno._id,
    grau_parentesco: 'mae',
    whatsapp: `1198888${prefix}777`,
    recebeNotificacoes: true
  });

  const turma = await Turma.create({
    nome: letra === 'A' ? '5º Ano A' : '6º Ano B',
    serie: letra,
    ano: letra === 'A' ? 5 : 6,
    nivel: letra === 'A' ? 'Fundamental I' : 'Fundamental II',
    turno: 'Manhã',
    escola_id: escola._id,
    professor_id: professor._id,
    alunos: [aluno._id]
  });

  const disciplina = await DisciplinaConfig.create({
    escola_id: escola._id,
    nome: 'Matemática',
    quantidadeTempos: 5,
    ativo: true
  });

  const historico = await HistoricoEscolar.create({
    aluno_id: aluno._id,
    escola_id: escola._id,
    anoLetivo: 2025,
    serie: '4º Ano',
    turma: letra,
    turno: 'Manhã',
    resultado: 'Progressão Plena',
    instituicao: escola.nome,
    notas: [{ disciplina: 'Matemática', cargaHoraria: 40, nota: 8, faltas: 0 }]
  });

  const avaliacao = await Avaliacao.create({
    aluno_id: aluno._id,
    professor_id: professor._id,
    turma_id: turma._id,
    disciplina: 'Matemática',
    tipo: 'prova_bimestral',
    periodo: '1º Bimestre',
    nota: 7.5,
    dataAplicacao: new Date('2026-03-01')
  });

  const presenca = await Presenca.create({
    aluno_id: aluno._id,
    turma_id: turma._id,
    professor_id: professor._id,
    disciplina: 'Matemática',
    tempo: 1,
    status: 'presente',
    data: new Date('2026-03-10T12:00:00.000Z')
  });

  const conteudo = await Conteudo.create({
    turma_id: turma._id,
    professor_id: professor._id,
    disciplina: 'Matemática',
    titulo: `Aula ${letra}`,
    descricao: `Conteúdo escola ${letra}`,
    data: new Date('2026-03-10')
  });

  const pei = await Pei.create({
    escola_id: escola._id,
    aluno_id: aluno._id,
    turma_id: turma._id,
    diagnostico: `Diagnóstico ${letra}`,
    metas: [{ descricao: 'Meta 1' }],
    criadoPor: professor._id
  });

  const htpc = await HtpcReuniao.create({
    escola_id: escola._id,
    titulo: `HTPC ${letra}`,
    data: new Date('2026-04-01'),
    turno: 'Tarde',
    publico: 'professores',
    criadoPor: admin._id
  });

  const uploadRoot = path.join(__dirname, '../../private/documentos');
  const docDir = path.join(uploadRoot, String(escola._id), String(aluno._id));
  fs.mkdirSync(docDir, { recursive: true });
  const tmpFile = path.join(docDir, `rg-${letra}.pdf`);
  fs.writeFileSync(tmpFile, `%PDF-1.4 fake doc escola ${letra}`);

  const documento = await DocumentoArquivo.create({
    usuario_id: aluno._id,
    escola_id: escola._id,
    categoria: 'aluno',
    tipo: 'rg',
    nomeOriginal: `rg-${letra}.pdf`,
    nomeArquivo: `rg-${letra}.pdf`,
    mimeType: 'application/pdf',
    tamanho: 32,
    caminho: tmpFile,
    enviadoPor: secretaria._id
  });

  return {
    escola,
    admin,
    secretaria,
    professor,
    aluno,
    responsavel,
    turma,
    disciplina,
    historico,
    avaliacao,
    presenca,
    conteudo,
    pei,
    htpc,
    documento,
    tmpFile
  };
}

async function seedFixtures() {
  const A = await seedSide('A', '11111111000191');
  const B = await seedSide('B', '22222222000172');

  const { Usuario } = require('../../backend/database/schema');
  const inativo = await Usuario.create({
    nome: 'Inativo A',
    email: 'inativo.a@api.test',
    cpf: '10000000099',
    senha: 'SenhaApiTeste99',
    tipo: 'aluno',
    escola_id: A.escola._id,
    whatsapp: '11999990099',
    ativo: false
  });

  // Aliases legados (TOKEN 03) + estrutura TOKEN 04
  return {
    senha: 'SenhaApiTeste99',
    A,
    B,
    escolaA: A.escola,
    escolaB: B.escola,
    diretorA: A.admin,
    diretorB: B.admin,
    secretariaA: A.secretaria,
    secretariaB: B.secretaria,
    professorA: A.professor,
    professorB: B.professor,
    alunoA: A.aluno,
    alunoB: B.aluno,
    responsavelA: A.responsavel,
    responsavelB: B.responsavel,
    turmaA: A.turma,
    turmaB: B.turma,
    inativo,
    idInexistente: '507f1f77bcf86cd799439011'
  };
}

async function login(email, senha) {
  return request(app).post('/api/auth/login').send({ email, senha });
}

async function tokenOf(email) {
  const res = await login(email, ctx.senha);
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Login falhou para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function tokenInvalido() {
  return 'Bearer FAKE.TOKEN.INVALIDO';
}

function tokenExpirado(userId, tokenVersion = 0) {
  const t = jwt.sign(
    { id: String(userId), v: Number(tokenVersion) },
    process.env.JWT_SECRET,
    { expiresIn: -10, algorithm: 'HS256' }
  );
  return `Bearer ${t}`;
}

function getApp() {
  return app;
}

function getCtx() {
  return ctx;
}

function api() {
  return request(app);
}

/** Resposta cross-tenant não pode vazar sucesso nem payload do outro tenant. */
function expectBlocked(res, label = '') {
  expect([401, 403, 404]).toContain(res.status);
  if (res.body && typeof res.body === 'object') {
    expect(res.body.sucesso === true).toBe(false);
  }
  return label;
}

module.exports = {
  startApiHarness,
  stopApiHarness,
  login,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado,
  getApp,
  getCtx,
  api,
  ensureTestEnv,
  expectBlocked
};
