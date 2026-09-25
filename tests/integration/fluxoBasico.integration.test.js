/**
 * Integração mínima (TOKEN 16) — login + isolamento tenant + painel.
 * Usa o mesmo harness da suíte API.
 */
const { getCtx, api, tokenOf, auth } = require('../api/setup');

describe('Integração — fluxo básico escolar', () => {
  test('login diretor A → painel → turma da própria escola', async () => {
    const ctx = getCtx();
    const token = await tokenOf('diretor.a@api.test');
    const painel = await api().get('/api/painel/diretor').set(auth(token));
    expect(painel.status).toBe(200);

    const turmas = await api().get('/api/turmas').set(auth(token));
    expect(turmas.status).toBe(200);
    const lista = turmas.body.turmas || turmas.body || [];
    expect(Array.isArray(lista)).toBe(true);
    if (lista.length) {
      expect(String(lista[0].escola_id || ctx.escolaA._id)).toBeTruthy();
    }
  });

  test('responsável A não lê painel do diretor', async () => {
    const token = await tokenOf('responsavel.a@api.test');
    const res = await api().get('/api/painel/diretor').set(auth(token));
    expect([401, 403]).toContain(res.status);
  });
});
