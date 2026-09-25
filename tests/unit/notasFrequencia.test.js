const {
  validarNota,
  statusPresencaValido,
  montarResumoFrequencia,
  STATUS_PRESENCA
} = require('../../backend/utils/validacoesAcademicas');

describe('notas — validação', () => {
  test('comportamento normal: 0 a 10', () => {
    expect(validarNota(7.5)).toEqual({ ok: true, limpar: false, nota: 7.5 });
    expect(validarNota('10')).toEqual({ ok: true, limpar: false, nota: 10 });
    expect(validarNota(0)).toEqual({ ok: true, limpar: false, nota: 0 });
  });

  test('dados ausentes: limpa nota (contrato da rota)', () => {
    expect(validarNota(null).limpar).toBe(true);
    expect(validarNota('').limpar).toBe(true);
    expect(validarNota(undefined).limpar).toBe(true);
  });

  test('dados inválidos: fora da faixa ou NaN', () => {
    expect(validarNota(-1).ok).toBe(false);
    expect(validarNota(10.1).ok).toBe(false);
    expect(validarNota('abc').ok).toBe(false);
    expect(validarNota(11).mensagem).toMatch(/0 e 10/);
  });
});

describe('frequência — status e resumo', () => {
  test('status válidos e inválidos', () => {
    STATUS_PRESENCA.forEach((s) => expect(statusPresencaValido(s)).toBe(true));
    expect(statusPresencaValido('')).toBe(false);
    expect(statusPresencaValido('present')).toBe(false);
    expect(statusPresencaValido(null)).toBe(false);
  });

  test('resumo normal e lista vazia', () => {
    const r = montarResumoFrequencia([
      'presente',
      'presente',
      'falta',
      'justificada',
      'atraso'
    ]);
    expect(r).toMatchObject({
      presentes: 2,
      faltas: 1,
      justificadas: 1,
      atrasos: 1,
      lancados: 5,
      taxaPresenca: 40,
      taxaFalta: 20
    });
    expect(montarResumoFrequencia([])).toMatchObject({
      lancados: 0,
      taxaPresenca: null,
      taxaFalta: null
    });
  });
});
