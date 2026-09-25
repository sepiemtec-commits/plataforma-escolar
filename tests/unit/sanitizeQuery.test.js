const { asScalar, asScalarString } = require('../../backend/utils/sanitizeQuery');

describe('sanitizeQuery', () => {
  test('asScalarString rejeita objetos estilo NoSQL ($ne)', () => {
    expect(asScalarString({ $ne: null })).toBeUndefined();
    expect(asScalarString({ $gt: 0 })).toBeUndefined();
    expect(asScalarString(['a'])).toBeUndefined();
  });

  test('asScalarString aceita escalares', () => {
    expect(asScalarString('turma-1')).toBe('turma-1');
    expect(asScalarString(10)).toBe('10');
    expect(asScalarString('')).toBeUndefined();
    expect(asScalarString(null)).toBeUndefined();
  });

  test('asScalar preserva tipo escalar e rejeita objeto', () => {
    expect(asScalar(7)).toBe(7);
    expect(asScalar(true)).toBe(true);
    expect(asScalar({ $in: [1] })).toBeUndefined();
  });
});
