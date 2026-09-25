const {
  obterPlano,
  priceIdDoPlano,
  assinaturaPermiteAcesso,
  mensagemBloqueioAssinatura,
  listarPlanosPublicos
} = require('../../backend/constants/planos');
const {
  stripeHabilitado,
  modoDevSemStripe,
  urlBaseFrontend,
  criarCheckoutAssinatura
} = require('../../backend/services/stripe');
const { withEnv } = require('../helpers/env');

describe('escolas / assinaturas — acesso SaaS', () => {
  test('escola ativa sem status (seed) libera', () => {
    expect(assinaturaPermiteAcesso({ ativo: true })).toBe(true);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: {} })).toBe(true);
  });

  test('escola null / inativa bloqueia', () => {
    expect(assinaturaPermiteAcesso(null)).toBe(false);
    expect(assinaturaPermiteAcesso({ ativo: false })).toBe(false);
  });

  test('status active e past_due liberam; canceled/unpaid/incomplete bloqueiam', () => {
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'active' } })).toBe(true);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'past_due' } })).toBe(true);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'canceled' } })).toBe(false);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'unpaid' } })).toBe(false);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'incomplete' } })).toBe(
      false
    );
  });

  test('mensagens de bloqueio por status', () => {
    expect(mensagemBloqueioAssinatura({ ativo: false })).toMatch(/desativada/i);
    expect(mensagemBloqueioAssinatura({ assinatura: { status: 'canceled' } })).toMatch(/Assinatura/);
    expect(mensagemBloqueioAssinatura({ assinatura: { status: 'incomplete' } })).toMatch(
      /incompleta/i
    );
  });
});

describe('pagamentos Stripe — configuração (sem chamar API Stripe)', () => {
  test('planos conhecidos e inválidos', () => {
    expect(obterPlano('essencial').nome).toBe('Essencial');
    expect(obterPlano('profissional')).toBeTruthy();
    expect(obterPlano('completo')).toBeTruthy();
    expect(obterPlano('ultra')).toBeNull();
    expect(obterPlano('')).toBeNull();
    expect(listarPlanosPublicos()).toHaveLength(3);
  });

  test('priceId ausente quando env vazio', () => {
    withEnv(
      {
        STRIPE_PRICE_ESSENCIAL: undefined,
        STRIPE_PRICE_PROFISSIONAL: undefined,
        STRIPE_PRICE_COMPLETO: undefined
      },
      () => {
        expect(priceIdDoPlano('essencial')).toBeNull();
        expect(priceIdDoPlano('fantasma')).toBeNull();
      }
    );
  });

  test('priceId Do plano quando configurado', () => {
    withEnv({ STRIPE_PRICE_ESSENCIAL: 'price_abc' }, () => {
      expect(priceIdDoPlano('essencial')).toBe('price_abc');
    });
  });

  test('stripeHabilitado e modoDev', () => {
    withEnv({ STRIPE_SECRET_KEY: undefined, ASSINATURA_MODO_DEV: 'true' }, () => {
      expect(stripeHabilitado()).toBe(false);
      expect(modoDevSemStripe()).toBe(true);
    });
    withEnv({ STRIPE_SECRET_KEY: 'sk_test_x', ASSINATURA_MODO_DEV: 'true' }, () => {
      expect(stripeHabilitado()).toBe(true);
      expect(modoDevSemStripe()).toBe(false);
    });
  });

  test('urlBaseFrontend remove barra final', () => {
    withEnv({ FRONTEND_URL: 'https://app.veho.edu/' }, () => {
      expect(urlBaseFrontend()).toBe('https://app.veho.edu');
    });
  });

  test('erro: checkout sem Price ID não chama Stripe', async () => {
    await withEnv(
      {
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_PRICE_ESSENCIAL: undefined,
        STRIPE_PRICE_PROFISSIONAL: undefined,
        STRIPE_PRICE_COMPLETO: undefined
      },
      async () => {
        await expect(
          criarCheckoutAssinatura({
            pendenteId: 'p1',
            plano: 'essencial',
            adminEmail: 'a@b.com',
            nomeEscola: 'Escola'
          })
        ).rejects.toMatchObject({ status: 503 });
      }
    );
  });
});
