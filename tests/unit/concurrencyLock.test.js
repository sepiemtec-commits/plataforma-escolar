const { withLock } = require('../../backend/utils/concurrencyLock');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('withLock (TOKEN 14)', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    // carrega modelos
    require('../../backend/database/schema');
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('serializa callbacks com a mesma chave', async () => {
    const order = [];
    await Promise.all([
      withLock('k-unit', async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 40));
        order.push('a-end');
      }),
      withLock('k-unit', async () => {
        order.push('b-start');
        order.push('b-end');
      })
    ]);
    const joined = order.join(',');
    // Ordem entre A/B é disputa de lock; não pode intercalar
    expect(
      joined === 'a-start,a-end,b-start,b-end' || joined === 'b-start,b-end,a-start,a-end'
    ).toBe(true);
  });
});
