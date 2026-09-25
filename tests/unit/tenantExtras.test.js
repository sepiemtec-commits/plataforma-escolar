const {
  idsIguais,
  mesmaEscola,
  negarSeOutraEscola,
  TenantError
} = require('../../backend/utils/tenant');

describe('tenant — comparação e mesma escola', () => {
  test('idsIguais compara string e ObjectId-like', () => {
    expect(idsIguais('abc', 'abc')).toBe(true);
    expect(idsIguais('abc', 'xyz')).toBe(false);
    expect(idsIguais(null, 'abc')).toBe(false);
  });

  test('mesmaEscola libera admin global e bloqueia outra escola', () => {
    const admin = { usuario: { tipo: 'admin' } };
    expect(mesmaEscola(admin, 'escola-x')).toBe(true);

    const diretor = { usuario: { tipo: 'diretor', escola_id: 'e1' } };
    expect(mesmaEscola(diretor, 'e1')).toBe(true);
    expect(mesmaEscola(diretor, 'e2')).toBe(false);
  });

  test('negarSeOutraEscola lança TenantError 403', () => {
    const req = { usuario: { tipo: 'secretaria', escola_id: 'e1' } };
    expect(() => negarSeOutraEscola(req, 'e2')).toThrow(TenantError);
    try {
      negarSeOutraEscola(req, 'e2');
    } catch (err) {
      expect(err.status).toBe(403);
    }
    expect(() => negarSeOutraEscola(req, 'e1')).not.toThrow();
  });
});
