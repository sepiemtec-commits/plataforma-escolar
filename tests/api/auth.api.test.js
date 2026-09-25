const {
  getCtx,
  api,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado,
  login
} = require('./setup');

describe('API — auth', () => {
  test('1. login válido → 200 + token', async () => {
    const ctx = getCtx();
    const res = await login('secretaria.a@api.test', ctx.senha);
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario.tipo).toBe('secretaria');
  });

  test('2. dados inválidos (email malformado) → 400', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nao-email', senha: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.sucesso).toBe(false);
  });

  test('3. campos ausentes → 400', async () => {
    const res = await api().post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('4. senha errada → 401', async () => {
    const res = await login('secretaria.a@api.test', 'senha-errada-xx');
    expect(res.status).toBe(401);
  });

  test('5. usuário inexistente → 401', async () => {
    const res = await login('naoexiste@api.test', 'SenhaApiTeste99');
    expect(res.status).toBe(401);
  });

  test('6. usuário inativo → 403', async () => {
    const ctx = getCtx();
    const res = await login('inativo.a@api.test', ctx.senha);
    expect(res.status).toBe(403);
  });

  test('7. verificar sem token → 401', async () => {
    const res = await api().get('/api/auth/verificar');
    expect(res.status).toBe(401);
  });

  test('8. verificar com token inválido → 401', async () => {
    const res = await api().get('/api/auth/verificar').set('Authorization', tokenInvalido());
    expect(res.status).toBe(401);
  });

  test('9. verificar com token expirado → 401', async () => {
    const ctx = getCtx();
    const res = await api()
      .get('/api/auth/verificar')
      .set('Authorization', tokenExpirado(ctx.secretariaA._id));
    expect(res.status).toBe(401);
  });

  test('10. verificar com token válido → 200', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().get('/api/auth/verificar').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
  });

  test('11. logout autenticado → 200 e invalida token', async () => {
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api().post('/api/auth/logout').set(auth(token));
    expect([200, 201]).toContain(res.status);
    const check = await api().get('/api/auth/verificar').set(auth(token));
    expect(check.status).toBe(401);
  });

  test('15. rate limit login → 429 (quando habilitado)', async () => {
    const prevDisable = process.env.DISABLE_RATE_LIMIT;
    const prevMax = process.env.RATE_LIMIT_LOGIN_MAX;
    process.env.DISABLE_RATE_LIMIT = '0';
    process.env.RATE_LIMIT_LOGIN_MAX = '3';

    const email = `rate.limit.${Date.now()}@api.test`;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await api()
        .post('/api/auth/login')
        .send({ email, senha: '12345678' });
      statuses.push(res.status);
    }

    process.env.DISABLE_RATE_LIMIT = prevDisable;
    process.env.RATE_LIMIT_LOGIN_MAX = prevMax;

    expect(statuses).toContain(429);
  });
});
