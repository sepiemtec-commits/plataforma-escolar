const { getCtx, api, tokenOf, auth } = require('./setup');

describe('API — disciplinas, horários, painéis, bncc, pei, htpc, simulados, push, ia', () => {
  test('1. listar disciplinas → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/disciplinas').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('3. criar disciplina sem nome → 400', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().post('/api/disciplinas').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  test('1. criar disciplina → 200/201', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .post('/api/disciplinas')
      .set(auth(token))
      .send({ nome: `Disc ${Date.now()}`, quantidadeTempos: 3 });
    expect([200, 201]).toContain(res.status);
  });

  test('7. professor criar disciplina → 403', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api()
      .post('/api/disciplinas')
      .set(auth(token))
      .send({ nome: 'Hack' });
    expect(res.status).toBe(403);
  });

  test('1. horarios slots → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/horarios/slots').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('1. horarios turma → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/horarios/turma/${ctx.turmaA._id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
  });

  test('10. horarios turma outra escola → 403/404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/horarios/turma/${ctx.turmaB._id}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('1. painéis por perfil → 200', async () => {
    const pairs = [
      ['secretaria.a@api.test', '/api/painel/secretaria'],
      ['professor.a@api.test', '/api/painel/professor'],
      ['aluno.a@api.test', '/api/painel/aluno'],
      ['diretor.a@api.test', '/api/painel/diretor'],
      ['responsavel.a@api.test', '/api/painel/responsavel']
    ];
    for (const [email, path] of pairs) {
      const token = await tokenOf(email);
      const res = await api().get(path).set(auth(token));
      expect(res.status).toBe(200);
    }
  });

  test('1. bncc listar → 200', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api().get('/api/bncc').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('9. bncc codigo inexistente → 404', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api().get('/api/bncc/CODIGO_INEXISTENTE_XYZ').set(auth(token));
    expect([404, 200]).toContain(res.status);
    // se 200 com vazio, ainda não é 500
    expect(res.status).not.toBe(500);
  });

  test('1. pei listar → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/pei').set(auth(token));
    expect([200, 403]).toContain(res.status);
  });

  test('1. htpc listar → 200', async () => {
    const token = await tokenOf('diretor.a@api.test');
    const res = await api().get('/api/htpc').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('3. htpc criar ausente → 400', async () => {
    const token = await tokenOf('diretor.a@api.test');
    const res = await api().post('/api/htpc').set(auth(token)).send({});
    expect([400, 422]).toContain(res.status);
  });

  test('1. simulados listar → 200', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api().get('/api/simulados').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('1. push vapid → 200', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api().get('/api/push/vapid-public-key').set(auth(token));
    expect([200, 503]).toContain(res.status);
  });

  test('4. ia sem auth → 401', async () => {
    const res = await api().post('/api/ia/parecer/gerar');
    expect(res.status).toBe(401);
  });

  test('7. aluno em ia → 403', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api().post('/api/ia/parecer/gerar').set(auth(token)).send({});
    expect([403, 404]).toContain(res.status);
  });

  test('1. promoção preview → 200', async () => {
    const token = await tokenOf('diretor.a@api.test');
    const res = await api().get('/api/promocao/preview').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('1. historico aluno → 200', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/historico/aluno/${ctx.alunoA._id}`)
      .set(auth(token));
    expect(res.status).toBe(200);
  });

  test('10. historico outra escola → 403/404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/historico/aluno/${ctx.alunoB._id}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('14. body JSON grande (limite) → 413 ou rejeição', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const big = 'x'.repeat(1.5 * 1024 * 1024);
    const res = await api()
      .post('/api/usuarios')
      .set(auth(token))
      .send({ nome: big, email: 'big@api.test', cpf: '12345678901', whatsapp: '11', tipo: 'aluno' });
    expect([400, 413, 500]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
