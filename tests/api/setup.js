/**
 * setupFilesAfterEnv — um único harness para toda a suíte API.
 */
const {
  startApiHarness,
  stopApiHarness,
  getCtx,
  api,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado,
  login,
  expectBlocked
} = require('../helpers/apiHarness');

beforeAll(async () => {
  await startApiHarness();
}, 180000);

afterAll(async () => {
  await stopApiHarness();
}, 60000);

global.__vehoApi = {
  getCtx,
  api,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado,
  login,
  expectBlocked
};

module.exports = global.__vehoApi;
