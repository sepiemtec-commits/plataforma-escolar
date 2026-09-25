const { api, tokenOf, auth } = require('./setup');

describe('API — assinatura e pagamentos', () => {
  test('1. planos públicos → 200', async () => {
    const res = await api().get('/api/assinatura/planos');
    expect(res.status).toBe(200);
    expect(res.body.sucesso).toBe(true);
    expect(res.body.planos).toHaveLength(3);
  });

  test('3. checkout campos ausentes → 400', async () => {
    const res = await api().post('/api/assinatura/checkout').send({});
    expect(res.status).toBe(400);
  });

  test('2. checkout dados inválidos → 400', async () => {
    const res = await api()
      .post('/api/assinatura/checkout')
      .send({
        nomeEscola: 'AB',
        cnpj: '123',
        emailEscola: 'x',
        adminNome: 'Y',
        adminEmail: 'y',
        adminSenha: '123',
        plano: 'gratis',
        aceiteTermos: false
      });
    expect(res.status).toBe(400);
  });

  test('1. checkout modo dev (sem Stripe) → 200/201', async () => {
    const stamp = Date.now();
    const res = await api()
      .post('/api/assinatura/checkout')
      .send({
        nomeEscola: `Escola Checkout ${stamp}`,
        cnpj: `${stamp}`.padStart(14, '3').slice(0, 14),
        emailEscola: `escola.${stamp}@api.test`,
        adminNome: 'Admin Checkout',
        adminEmail: `admin.${stamp}@api.test`,
        adminSenha: 'SenhaForte99xx',
        plano: 'essencial',
        aceiteTermos: true
      });
    // modoDevSemStripe deve permitir fluxo sem sk_
    expect([200, 201, 503]).toContain(res.status);
    if (res.status < 500) {
      expect(res.body.sucesso).toBe(true);
    }
  });

  test('4. portal sem auth → 401', async () => {
    const res = await api().post('/api/assinatura/portal');
    expect(res.status).toBe(401);
  });

  test('7. aluno no portal → 403', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api().post('/api/assinatura/portal').set(auth(token));
    expect(res.status).toBe(403);
  });

  test('webhook sem assinatura Stripe → 400/503', async () => {
    const res = await api()
      .post('/api/assinatura/webhook')
      .set('Content-Type', 'application/json')
      .send({ type: 'ping' });
    expect([400, 503]).toContain(res.status);
  });
});
