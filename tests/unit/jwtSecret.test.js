const { obterJwtSecret, MIN_LENGTH } = require('../../backend/utils/jwtSecret');
const { withEnv } = require('../helpers/env');

describe('obterJwtSecret', () => {
  test('exige secret definido', () => {
    expect(() => withEnv({ JWT_SECRET: undefined }, () => obterJwtSecret())).toThrow(/não definida/);
  });

  test(`rejeita secret com menos de ${MIN_LENGTH} caracteres`, () => {
    expect(() =>
      withEnv({ JWT_SECRET: 'curto-demais-123' }, () => obterJwtSecret())
    ).toThrow(/mínimo/);
  });

  test('rejeita placeholders conhecidos', () => {
    expect(() =>
      withEnv(
        { JWT_SECRET: 'change_me_change_me_change_me_change_me_xx' },
        () => obterJwtSecret()
      )
    ).toThrow(/placeholder/);
  });

  test('aceita secret forte', () => {
    const secret = 'a'.repeat(32) + 'b9f3';
    expect(withEnv({ JWT_SECRET: secret }, () => obterJwtSecret())).toBe(secret);
  });
});
