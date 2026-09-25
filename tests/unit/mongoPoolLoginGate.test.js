const { createSemaphore } = require('../../backend/utils/semaphore');
const { mongoPoolOptions } = require('../../backend/utils/mongoConnect');

describe('semaphore', () => {
  test('limita concorrência e libera fila', async () => {
    const gate = createSemaphore(2);
    let maxActive = 0;
    let active = 0;
    const jobs = Array.from({ length: 6 }, () =>
      gate.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
      }, 2000)
    );
    await Promise.all(jobs);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test('timeout gera CONCURRENCY_LIMIT', async () => {
    const gate = createSemaphore(1);
    const hold = gate.run(() => new Promise((r) => setTimeout(r, 200)), 5000);
    await expect(gate.run(() => Promise.resolve(), 50)).rejects.toMatchObject({
      code: 'CONCURRENCY_LIMIT',
      status: 503
    });
    await hold;
  });
});

describe('mongoPoolOptions', () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env.MONGO_MAX_POOL = prev.MONGO_MAX_POOL;
    process.env.MONGO_MIN_POOL = prev.MONGO_MIN_POOL;
    process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS = prev.MONGO_WAIT_QUEUE_TIMEOUT_MS;
  });

  test('default ≥ 200 (acima do antigo 100 que saturava no spike)', () => {
    delete process.env.MONGO_MAX_POOL;
    const opts = mongoPoolOptions();
    expect(opts.maxPoolSize).toBeGreaterThanOrEqual(200);
    expect(opts.waitQueueTimeoutMS).toBeGreaterThanOrEqual(1000);
  });
});
