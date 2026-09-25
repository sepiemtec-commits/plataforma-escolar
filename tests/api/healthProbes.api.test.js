const { api } = require('./setup');

describe('API — health / live / ready / metrics (TOKEN 15 ajuste)', () => {
  test('GET /health → 200 com database', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
    expect(res.body.status).toMatch(/OK/i);
  });

  test('GET /health/live → 200 alive', async () => {
    const res = await api().get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  test('GET /health/ready → 200 ready com mongo', async () => {
    const res = await api().get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database).toBe('connected');
  });

  test('GET /metrics → text/plain Prometheus', async () => {
    const res = await api().get('/metrics');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'] || '')).toMatch(/text\/plain/);
    expect(res.text).toMatch(/veho_up 1/);
    expect(res.text).toMatch(/veho_mongo_ready_state/);
  });
});
