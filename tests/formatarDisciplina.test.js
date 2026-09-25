const {
  formatarNomeDisciplina
} = require('../backend/utils/formatarDisciplina');

describe('formatarNomeDisciplina', () => {
  test('não corrompe Espanhol', () => {
    expect(formatarNomeDisciplina('Espanhol')).toBe('Espanhol');
    expect(formatarNomeDisciplina('Espanho I')).toBe('Espanhol');
  });

  test('normaliza sufixos com espaço (OCR)', () => {
    expect(formatarNomeDisciplina('Física l')).toBe('Física I');
    expect(formatarNomeDisciplina('Química ll')).toBe('Química II');
  });
});
