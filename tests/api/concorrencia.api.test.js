/**
 * TOKEN 14 — Concorrência e condições de corrida
 *
 * Problemas cobertos (com correções):
 * - Nota: find+create → duplicidade → índice único + upsert atômico
 * - Frequência: create concorrente → 409 falso → retry update no 11000
 * - Matrícula: aluno em 2 turmas → lock por aluno
 * - Registro duplicado: mesma célula de nota / mesma presença
 * - Pagamento/checkout: double-submit → lock + Idempotency-Key + índice parcial
 * - Relatório: leituras simultâneas consistentes (sem side-effect)
 */
const { getCtx, api, tokenOf, auth } = require('../api/setup');
const {
  Avaliacao,
  Presenca,
  Turma,
  Usuario,
  Escola,
  AssinaturaPendente,
  Desempenho
} = require('../../backend/database/schema');

async function parallel(n, factory) {
  return Promise.all(Array.from({ length: n }, (_, i) => factory(i)));
}

describe('TOKEN 14 — concorrência', () => {
  let ctx;
  let professorB;

  beforeAll(async () => {
    ctx = getCtx();
    professorB = await Usuario.create({
      nome: 'Professor B Concorrencia',
      email: 'professor.b.conc@api.test',
      senha: 'SenhaApiTeste99',
      cpf: '19990000099',
      tipo: 'professor',
      disciplina: 'Matemática',
      disciplinas: ['Matemática'],
      escola_id: ctx.escolaA._id,
      whatsapp: '11999990099',
      ativo: true
    });
  });

  test('C1 — dois usuários alterando a mesma nota: 1 documento, last-write-wins', async () => {
    const tokenA = await tokenOf('professor.a@api.test');
    const tokenB = await tokenOf(professorB.email);
    const periodo = '2º Bimestre';
    const payload = {
      aluno_id: ctx.alunoA._id,
      turma_id: ctx.turmaA._id,
      disciplina: 'Matemática',
      tipo: 'teste_bimestral',
      periodo
    };

    const [r1, r2] = await Promise.all([
      api().put('/api/avaliacao/grade/celula').set(auth(tokenA)).send({ ...payload, nota: 6.0 }),
      api().put('/api/avaliacao/grade/celula').set(auth(tokenB)).send({ ...payload, nota: 9.0 })
    ]);

    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);

    const docs = await Avaliacao.find({
      aluno_id: ctx.alunoA._id,
      turma_id: ctx.turmaA._id,
      disciplina: 'Matemática',
      tipo: 'teste_bimestral',
      periodo
    });
    expect(docs).toHaveLength(1);
    expect([6, 9]).toContain(docs[0].nota);

    const des = await Desempenho.find({
      aluno_id: ctx.alunoA._id,
      disciplina: 'Matemática',
      periodo
    });
    expect(des.length).toBeLessThanOrEqual(1);
  });

  test('C2 — dois usuários alterando a mesma frequência: 1 presença, status final válido', async () => {
    const tokenA = await tokenOf('professor.a@api.test');
    const tokenB = await tokenOf(professorB.email);
    const data = '2026-06-15';

    const bodyBase = {
      aluno_id: ctx.alunoA._id,
      turma_id: ctx.turmaA._id,
      disciplina: 'Matemática',
      tempo: 2,
      data
    };

    const [r1, r2] = await Promise.all([
      api().post('/api/presenca/registrar').set(auth(tokenA)).send({ ...bodyBase, status: 'presente' }),
      api().post('/api/presenca/registrar').set(auth(tokenB)).send({ ...bodyBase, status: 'falta' })
    ]);

    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);

    const inicio = new Date(`${data}T00:00:00.000Z`);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 1);

    const docs = await Presenca.find({
      aluno_id: ctx.alunoA._id,
      tempo: 2,
      data: { $gte: inicio, $lt: fim }
    });
    expect(docs).toHaveLength(1);
    expect(['presente', 'falta']).toContain(docs[0].status);
  });

  test('C3 — dois usuários matriculando o mesmo aluno em turmas diferentes: fica em exatamente uma', async () => {
    const tokenSec = await tokenOf('secretaria.a@api.test');
    const tokenDir = await tokenOf('diretor.a@api.test');

    const alunoLivre = await Usuario.create({
      nome: 'Aluno Matricula Race',
      email: 'aluno.mat.race@api.test',
      senha: 'SenhaApiTeste99',
      cpf: '19990000101',
      tipo: 'aluno',
      escola_id: ctx.escolaA._id,
      whatsapp: '11999990101',
      ativo: true
    });

    const t1 = await Turma.create({
      nome: 'Turma Race 1',
      serie: 'R',
      ano: 5,
      nivel: 'Fundamental I',
      turno: 'Manhã',
      escola_id: ctx.escolaA._id,
      professor_id: ctx.professorA._id,
      alunos: []
    });
    const t2 = await Turma.create({
      nome: 'Turma Race 2',
      serie: 'S',
      ano: 5,
      nivel: 'Fundamental I',
      turno: 'Tarde',
      escola_id: ctx.escolaA._id,
      professor_id: ctx.professorA._id,
      alunos: []
    });

    const [r1, r2] = await Promise.all([
      api().post(`/api/turmas/${t1._id}/alunos/${alunoLivre._id}`).set(auth(tokenSec)),
      api().post(`/api/turmas/${t2._id}/alunos/${alunoLivre._id}`).set(auth(tokenDir))
    ]);

    expect([200, 201, 409]).toContain(r1.status);
    expect([200, 201, 409]).toContain(r2.status);
    expect(r1.status === 200 || r2.status === 200).toBe(true);

    const turmas = await Turma.find({
      escola_id: ctx.escolaA._id,
      alunos: alunoLivre._id
    }).select('_id nome');
    expect(turmas).toHaveLength(1);
  });

  test('C4 — duas criações simultâneas do mesmo registro de nota: sem duplicidade', async () => {
    const token = await tokenOf('professor.a@api.test');
    const payload = {
      aluno_id: ctx.alunoA._id,
      turma_id: ctx.turmaA._id,
      disciplina: 'Matemática',
      tipo: 'atividade',
      periodo: '3º Bimestre',
      nota: 8,
      dataAplicacao: new Date().toISOString()
    };

    const results = await parallel(8, () =>
      api().post('/api/avaliacao/lancar').set(auth(token)).send(payload)
    );

    for (const r of results) {
      expect([200, 201]).toContain(r.status);
    }

    const docs = await Avaliacao.find({
      aluno_id: ctx.alunoA._id,
      turma_id: ctx.turmaA._id,
      disciplina: 'Matemática',
      tipo: 'atividade',
      periodo: '3º Bimestre'
    });
    expect(docs).toHaveLength(1);
  });

  test('C5 — duas requisições simultâneas de pagamento/checkout: uma escola, idempotência', async () => {
    const stamp = Date.now().toString().slice(-10);
    const cnpj = `77${stamp}`.padEnd(14, '0').slice(0, 14);
    const body = {
      nomeEscola: `Escola Race ${stamp}`,
      cnpj,
      emailEscola: `escola.race.${stamp}@test.com`,
      adminNome: 'Admin Race',
      adminEmail: `admin.race.${stamp}@test.com`,
      adminSenha: 'SenhaForte99',
      plano: 'essencial',
      aceiteTermos: true
    };

    // Mesmo CNPJ sem Idempotency-Key: no máximo uma escola
    const [a, b] = await Promise.all([
      api().post('/api/assinatura/checkout').send(body),
      api().post('/api/assinatura/checkout').send(body)
    ]);

    const oks = [a, b].filter((r) => r.status === 200);
    const conflicts = [a, b].filter((r) => r.status === 409);
    expect(oks.length).toBe(1);
    expect(conflicts.length).toBe(1);

    const escolas = await Escola.find({ cnpj });
    expect(escolas).toHaveLength(1);
    const pendentes = await AssinaturaPendente.find({ cnpj });
    expect(pendentes.filter((p) => p.status === 'pendente')).toHaveLength(0);

    // Idempotency-Key: replay retorna a mesma resposta sem segunda escola
    const stamp2 = `${Date.now()}`.slice(-9);
    const cnpj2 = `88${stamp2}`.padEnd(14, '0').slice(0, 14);
    const body2 = {
      ...body,
      nomeEscola: `Escola Idem ${stamp2}`,
      cnpj: cnpj2,
      emailEscola: `escola.idem.${stamp2}@test.com`,
      adminEmail: `admin.idem.${stamp2}@test.com`
    };
    const idem = `idem-checkout-${stamp2}`;

    const [i1, i2] = await Promise.all([
      api().post('/api/assinatura/checkout').set('Idempotency-Key', idem).send(body2),
      api().post('/api/assinatura/checkout').set('Idempotency-Key', idem).send(body2)
    ]);

    expect(i1.status).toBe(200);
    expect(i2.status).toBe(200);
    expect(String(i1.body.escola?.id)).toBe(String(i2.body.escola?.id));
    expect(await Escola.countDocuments({ cnpj: cnpj2 })).toBe(1);
  });

  test('C6 — duas gerações simultâneas de relatório/boletim: consistentes e sem efeito colateral', async () => {
    const tokenSec = await tokenOf('secretaria.a@api.test');
    const tokenProf = await tokenOf('professor.a@api.test');
    const alunoId = ctx.alunoA._id;

    const before = await Avaliacao.countDocuments({ aluno_id: alunoId });

    const results = await Promise.all([
      api().get(`/api/relatorios/boletim/${alunoId}`).set(auth(tokenSec)),
      api().get(`/api/relatorios/boletim/${alunoId}`).set(auth(tokenProf)),
      api().get(`/api/relatorios/boletim/${alunoId}`).set(auth(tokenSec)),
      api().get(`/api/relatorios/gestao-boletins`).set(auth(tokenSec))
    ]);

    for (const r of results) {
      expect(r.status).toBe(200);
      expect(r.body.sucesso).toBe(true);
    }

    const media1 = results[0].body.boletim?.disciplinas?.find((d) => d.disciplina === 'Matemática')?.mediaFinal;
    const media2 = results[1].body.boletim?.disciplinas?.find((d) => d.disciplina === 'Matemática')?.mediaFinal;
    if (media1 != null && media2 != null) {
      expect(media1).toBe(media2);
    }

    const after = await Avaliacao.countDocuments({ aluno_id: alunoId });
    expect(after).toBe(before);
  });
});
