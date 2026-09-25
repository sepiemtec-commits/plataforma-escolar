const {
  senhaEFraca,
  gerarSenhaTemporaria,
  obterSenhaSeed,
  obterSenhaCadastro
} = require('../../backend/utils/senhaPadrao');
const { withEnv } = require('../helpers/env');

describe('senhaPadrao', () => {
  test('detecta senhas fracas conhecidas e curtas', () => {
    expect(senhaEFraca('senha123')).toBe(true);
    expect(senhaEFraca('12345678')).toBe(true);
    expect(senhaEFraca('abc')).toBe(true);
    expect(senhaEFraca('Tr0caSegura!99')).toBe(false);
  });

  test('gerarSenhaTemporaria produz tamanho pedido e não é fraca', () => {
    const s = gerarSenhaTemporaria(14);
    expect(s).toHaveLength(14);
    expect(senhaEFraca(s)).toBe(false);
  });

  test('obterSenhaSeed em produção exige ALLOW e senha forte', () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: 'production',
          ALLOW_SEED_IN_PRODUCTION: undefined,
          SEED_DEFAULT_PASSWORD: undefined
        },
        () => obterSenhaSeed()
      )
    ).toThrow(/Seed bloqueado/);

    expect(() =>
      withEnv(
        {
          NODE_ENV: 'production',
          ALLOW_SEED_IN_PRODUCTION: 'true',
          SEED_DEFAULT_PASSWORD: 'senha123'
        },
        () => obterSenhaSeed()
      )
    ).toThrow(/SEED_DEFAULT_PASSWORD/);

    const ok = withEnv(
      {
        NODE_ENV: 'production',
        ALLOW_SEED_IN_PRODUCTION: 'true',
        SEED_DEFAULT_PASSWORD: 'SenhaProducaoForte99'
      },
      () => obterSenhaSeed()
    );
    expect(ok).toBe('SenhaProducaoForte99');
  });

  test('obterSenhaCadastro em produção rejeita fraca e gera se vazia', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'production' }, () => obterSenhaCadastro('senha123'))
    ).toThrow(/Senha fraca/);

    const gerada = withEnv({ NODE_ENV: 'production' }, () => obterSenhaCadastro(''));
    expect(gerada.gerada).toBe(true);
    expect(gerada.senha.length).toBeGreaterThanOrEqual(12);
  });
});
