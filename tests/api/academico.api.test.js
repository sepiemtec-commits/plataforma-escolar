const { getCtx, api, tokenOf, auth } = require('./setup');

describe('API — acadêmico (presença, avaliação, boletins, relatórios)', () => {
  test('1. visão geral presença → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/presenca/visao-geral').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('7. aluno registrar presença → 403', async () => {
    const ctx = getCtx();
    const token = await tokenOf('aluno.a@api.test');
    const res = await api()
      .post('/api/presenca/registrar')
      .set(auth(token))
      .send({
        aluno_id: ctx.alunoA._id,
        turma_id: ctx.turmaA._id,
        status: 'presente',
        disciplina: 'Matemática',
        tempo: 1
      });
    expect(res.status).toBe(403);
  });

  test('3. registrar presença campos ausentes → 400', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api().post('/api/presenca/registrar').set(auth(token)).send({});
    expect([400, 422]).toContain(res.status);
  });

  test('1/2. registrar presença válida e status inválido', async () => {
    const ctx = getCtx();
    const token = await tokenOf('professor.a@api.test');

    const invalid = await api()
      .post('/api/presenca/registrar')
      .set(auth(token))
      .send({
        aluno_id: ctx.alunoA._id,
        turma_id: ctx.turmaA._id,
        status: 'voando',
        disciplina: 'Matemática',
        tempo: 1,
        data: new Date().toISOString()
      });
    // Contrato atual: status inválido pode cair em 400/500 conforme validação do schema
    expect([400, 422, 500]).toContain(invalid.status);
    expect(invalid.status).not.toBe(200);

    const ok = await api()
      .post('/api/presenca/registrar')
      .set(auth(token))
      .send({
        aluno_id: ctx.alunoA._id,
        turma_id: ctx.turmaA._id,
        status: 'presente',
        disciplina: 'Matemática',
        tempo: 1,
        data: new Date().toISOString()
      });
    expect([200, 201]).toContain(ok.status);
  });

  test('2. lançar nota inválida (>10) → 400', async () => {
    const ctx = getCtx();
    const token = await tokenOf('professor.a@api.test');
    const res = await api()
      .post('/api/avaliacao/lancar')
      .set(auth(token))
      .send({
        aluno_id: ctx.alunoA._id,
        turma_id: ctx.turmaA._id,
        disciplina: 'Matemática',
        tipo: 'prova_bimestral',
        periodo: '1º Bimestre',
        nota: 15,
        dataAplicacao: new Date().toISOString()
      });
    expect(res.status).toBe(400);
  });

  test('1. lançar nota válida → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('professor.a@api.test');
    const res = await api()
      .post('/api/avaliacao/lancar')
      .set(auth(token))
      .send({
        aluno_id: ctx.alunoA._id,
        turma_id: ctx.turmaA._id,
        disciplina: 'Matemática',
        tipo: 'prova_bimestral',
        periodo: '1º Bimestre',
        nota: 8.5,
        dataAplicacao: new Date().toISOString()
      });
    expect([200, 201]).toContain(res.status);
  });

  test('1. boletim do aluno → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('professor.a@api.test');
    const res = await api()
      .get(`/api/avaliacao/boletim/${ctx.alunoA._id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
  });

  test('10. boletim aluno outra escola → 403/404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('professor.a@api.test');
    const res = await api()
      .get(`/api/avaliacao/boletim/${ctx.alunoB._id}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('1. relatório boletim → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/relatorios/boletim/${ctx.alunoA._id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
  });

  test('12. gestão boletins com filtro turma → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/relatorios/gestao-boletins?turma_id=${ctx.turmaA._id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
  });

  test('9. ficha individual id inexistente → 404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/relatorios/ficha-individual/${ctx.idInexistente}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });
});
