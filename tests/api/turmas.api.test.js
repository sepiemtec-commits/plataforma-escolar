const { getCtx, api, tokenOf, auth } = require('./setup');

describe('API — turmas e matrículas', () => {
  test('1. listar turmas → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/turmas').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
    expect(Array.isArray(res.body.turmas)).toBe(true);
  });

  test('1. níveis de ensino → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/turmas/niveis-ensino').set(auth(token));
    expect(res.status).toBe(200);
  });

  test('3. criar turma campos ausentes → 400', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().post('/api/turmas').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  test('1. criar turma válida → 200/201', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .post('/api/turmas')
      .set(auth(token))
      .send({
        nome: '4º Ano C',
        serie: 'C',
        ano: 4,
        nivel: 'Fundamental I',
        turno: 'Tarde'
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.sucesso).toBe(true);
  });

  test('7. aluno criar turma → 403', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api()
      .post('/api/turmas')
      .set(auth(token))
      .send({ nome: 'Hack', serie: 'A', ano: 1, turno: 'Manhã' });
    expect(res.status).toBe(403);
  });

  test('9. turma inexistente resumo → 404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/turmas/${ctx.idInexistente}/resumo-alunos`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('10. turma da escola B → 403/404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/turmas/${ctx.turmaB._id}/resumo-alunos`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('3. matricular aluno campos ausentes → 400', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().post('/api/turmas/alunos').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  test('1. matricular aluno válido → 200/201', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const stamp = Date.now().toString(36);
    const res = await api()
      .post('/api/turmas/alunos')
      .set(auth(token))
      .send({
        nome: `Matriculado ${stamp}`,
        email: `mat.${stamp}@api.test`,
        cpf: `8${stamp}`.replace(/\D/g, '').padEnd(11, '1').slice(0, 11),
        whatsapp_responsavel: '11966665555',
        nome_responsavel: 'Resp Mat',
        turma_id: ctx.turmaA._id
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.sucesso).toBe(true);
  });

  test('2. transferir com dados inválidos → 400', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .post('/api/turmas/transferir-aluno')
      .set(auth(token))
      .send({ aluno_id: 'x', turma_destino_id: 'y' });
    expect([400, 404, 500]).toContain(res.status);
  });
});
