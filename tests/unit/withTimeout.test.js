'use strict';

const { withTimeout, withRetry } = require('../../backend/utils/withTimeout');

describe('withTimeout / withRetry (TOKEN 11)', () => {
  test('dispara timeout', async () => {
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(r, 500)), 50, 'teste')
    ).rejects.toMatchObject({ code: 'ETIMEDOUT', timeout: true });
  });

  test('resolve antes do timeout', async () => {
    const v = await withTimeout(async () => 42, 500, 'teste');
    expect(v).toBe(42);
  });

  test('retry idempotente em ETIMEDOUT', async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          const e = new Error('x');
          e.code = 'ETIMEDOUT';
          throw e;
        }
        return 'ok';
      },
      { retries: 5, delayMs: 5, label: 'x' }
    );
    expect(v).toBe('ok');
    expect(n).toBe(3);
  });

  test('não retenta erro não-retryable', async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n += 1;
          throw new Error('permanent');
        },
        { retries: 3, delayMs: 5 }
      )
    ).rejects.toThrow('permanent');
    expect(n).toBe(1);
  });
});
