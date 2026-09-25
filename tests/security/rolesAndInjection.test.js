/**
 * Segurança em nível de utilitário / contrato.
 * Isolamento multi-escola E2E: scripts/test-isolamento-escola.js (não duplicar).
 */
const { asScalarString } = require('../../backend/utils/sanitizeQuery');
const { escapeHtml } = require('../../backend/utils/escapeHtml');
const { verificarRole } = require('../../backend/middleware/autenticacao');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

describe('segurança — NoSQL / XSS / roles', () => {
  test('payload com operador Mongo é descartado na sanitização de query', () => {
    expect(asScalarString({ $ne: 'admin' })).toBeUndefined();
    expect(asScalarString({ $regex: '.*' })).toBeUndefined();
  });

  test('conteúdo hostil é escapado antes de HTML', () => {
    const raw = '<img src=x onerror=alert(1)>';
    const safe = escapeHtml(raw);
    expect(safe).not.toMatch(/</);
    expect(safe).toContain('&lt;img');
  });

  test('verificarRole bloqueia perfil insuficiente com 403', () => {
    const mw = verificarRole('secretaria', 'diretor');
    const req = { usuario: { tipo: 'aluno' } };
    const res = mockRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.sucesso).toBe(false);
  });

  test('verificarRole permite role autorizado', () => {
    const mw = verificarRole('professor', 'coordenador');
    const req = { usuario: { tipo: 'professor' } };
    const res = mockRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  test('verificarRole exige autenticação prévia', () => {
    const mw = verificarRole('admin');
    const res = mockRes();
    mw({}, res, () => {});
    expect(res.statusCode).toBe(401);
  });
});
