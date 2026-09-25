const {
  getCtx,
  api,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado
} = require('./setup');

/** Rotas protegidas representativas de cada módulo (método + path). */
const ROTAS_PROTEGIDAS = [
  { method: 'get', path: '/api/usuarios' },
  { method: 'get', path: '/api/turmas' },
  { method: 'get', path: '/api/disciplinas' },
  { method: 'get', path: '/api/horarios/slots' },
  { method: 'get', path: '/api/presenca/visao-geral' },
  { method: 'get', path: '/api/painel/secretaria' },
  { method: 'get', path: '/api/painel/professor' },
  { method: 'get', path: '/api/painel/aluno' },
  { method: 'get', path: '/api/painel/diretor' },
  { method: 'get', path: '/api/relatorios/gestao-boletins' },
  { method: 'get', path: '/api/promocao/preview' },
  { method: 'get', path: '/api/bncc' },
  { method: 'get', path: '/api/htpc' },
  { method: 'get', path: '/api/pei' },
  { method: 'get', path: '/api/simulados' },
  { method: 'get', path: '/api/push/vapid-public-key' },
  { method: 'post', path: '/api/notificacoes/geral' },
  { method: 'get', path: '/api/documentos/tipos/aluno' }
];

describe('API — contrato HTTP transversal (auth)', () => {
  test('health público → 200', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.database).toBe('connected');
  });

  test('rota API inexistente → 404 JSON', async () => {
    const res = await api().get('/api/rota-totalmente-inexistente-xyz');
    expect(res.status).toBe(404);
    expect(res.body.sucesso).toBe(false);
  });

  test.each(ROTAS_PROTEGIDAS)(
    '4. sem autenticação $method $path → 401',
    async ({ method, path }) => {
      const res = await api()[method](path);
      expect(res.status).toBe(401);
    }
  );

  test.each(ROTAS_PROTEGIDAS)(
    '5. token inválido $method $path → 401',
    async ({ method, path }) => {
      const res = await api()[method](path).set('Authorization', tokenInvalido());
      expect(res.status).toBe(401);
    }
  );

  test('6. token expirado → 401', async () => {
    const ctx = getCtx();
    const res = await api()
      .get('/api/turmas')
      .set('Authorization', tokenExpirado(ctx.secretariaA._id));
    expect(res.status).toBe(401);
  });
});

describe('API — autorização (403) e tenant', () => {
  test('7. aluno em painel secretaria → 403', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api().get('/api/painel/secretaria').set(auth(token));
    expect(res.status).toBe(403);
  });

  test('7. professor em promoção → 403', async () => {
    const token = await tokenOf('professor.a@api.test');
    const res = await api().get('/api/promocao/preview').set(auth(token));
    expect(res.status).toBe(403);
  });

  test('7. aluno listando usuários → 403', async () => {
    const token = await tokenOf('aluno.a@api.test');
    const res = await api().get('/api/usuarios').set(auth(token));
    expect(res.status).toBe(403);
  });

  test('10. secretaria A não vê aluno da escola B', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/usuarios/${ctx.alunoB._id}`)
      .set(auth(token));
    // 403 ou 404 — ambos aceitáveis para isolamento (sem vazar existência)
    expect([403, 404]).toContain(res.status);
    expect(res.body.sucesso).toBe(false);
  });

  test('10. relatório boletim de outra escola → 403/404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/relatorios/boletim/${ctx.alunoB._id}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });

  test('9. ID inexistente usuário → 404', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const res = await api()
      .get(`/api/usuarios/${ctx.idInexistente}`)
      .set(auth(token));
    expect([403, 404]).toContain(res.status);
  });
});
