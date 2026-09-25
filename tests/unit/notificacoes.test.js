const { resolverCanais } = require('../../backend/services/notificacaoDispatcher');

describe('notificações — canais', () => {
  test('comportamento normal: objeto de canais', () => {
    expect(resolverCanais({ whatsapp: true, sms: true, push: false })).toEqual({
      whatsapp: true,
      sms: true,
      push: false
    });
  });

  test('dados ausentes: default só WhatsApp (compatibilidade)', () => {
    expect(resolverCanais(null)).toEqual({ whatsapp: true, sms: false, push: false });
    expect(resolverCanais(undefined)).toEqual({ whatsapp: true, sms: false, push: false });
  });

  test('dados inválidos: não-objeto → default', () => {
    expect(resolverCanais('whatsapp')).toEqual({ whatsapp: true, sms: false, push: false });
    expect(resolverCanais(1)).toEqual({ whatsapp: true, sms: false, push: false });
  });

  test('boolean coercion: valores truthy/falsy', () => {
    expect(resolverCanais({ whatsapp: 0, sms: 'sim', push: 1 })).toEqual({
      whatsapp: false,
      sms: true,
      push: true
    });
  });
});
