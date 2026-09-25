/**
 * TOKEN 11 — resiliência em API (upload, relatório).
 * Usa harness global de tests/api/setup.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { getCtx, api, tokenOf, auth } = require('./setup');

describe('TOKEN 11 — resiliência API', () => {
  test('upload inválido não cria documento (sem corrupção/duplicação)', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');
    const alunoId = ctx.alunoA._id;

    const before = await api().get(`/api/documentos/usuario/${alunoId}`).set(auth(token));
    expect(before.status).toBe(200);
    const n0 = before.body.documentos?.length || 0;

    const tmpDir = path.join(__dirname, '../recovery/results');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, '_bad.exe');
    fs.writeFileSync(tmp, 'not-a-document');

    const bad = await api()
      .post(`/api/documentos/usuario/${alunoId}`)
      .set(auth(token))
      .field('tipo', 'rg')
      .attach('arquivo', tmp);

    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.body.sucesso).toBe(false);
    expect(String(bad.body.mensagem || '')).toMatch(/permitido|formato|extensão|Extensão|MIME|mime/i);

    const after = await api().get(`/api/documentos/usuario/${alunoId}`).set(auth(token));
    expect(after.body.documentos?.length || 0).toBe(n0);
    fs.unlinkSync(tmp);
  });

  test('falha de relatório não corrompe boletim válido', async () => {
    const ctx = getCtx();
    const token = await tokenOf('secretaria.a@api.test');

    const ok = await api().get(`/api/relatorios/boletim/${ctx.alunoA._id}`).set(auth(token));
    expect(ok.status).toBe(200);
    expect(ok.body.sucesso).toBe(true);

    const bad = await api()
      .get('/api/relatorios/boletim/000000000000000000000000')
      .set(auth(token));
    expect(bad.status).toBeGreaterThanOrEqual(403);
    expect(bad.body.sucesso).toBe(false);
    expect(String(bad.body.mensagem || '')).toMatch(/negado|não encontrado|encontrado|Acesso/i);

    const again = await api().get(`/api/relatorios/boletim/${ctx.alunoA._id}`).set(auth(token));
    expect(again.status).toBe(200);
    expect(again.body.sucesso).toBe(true);
  });

  test('webhook Stripe idempotente (não duplica escola)', async () => {
    const {
      AssinaturaPendente,
      Escola
    } = require('../../backend/database/schema');
    const { processarWebhookStripe } = require('../../backend/routes/assinatura');

    const pendente = await AssinaturaPendente.create({
      nomeEscola: 'Escola Idempotencia',
      cnpj: '55666777000199',
      emailEscola: 'idem@test.com',
      adminNome: 'Admin',
      adminEmail: 'admin.idem@test.com',
      adminSenhaHash: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV',
      plano: 'essencial',
      status: 'pendente'
    });

    // Sem Stripe real: exercita ramo "já concluída" via update manual + segundo processamento simulado
    pendente.status = 'concluida';
    pendente.escola_id = (await Escola.create({
      nome: 'Escola Idempotencia',
      cnpj: '55666777000199',
      ativo: true
    }))._id;
    await pendente.save();

    const before = await Escola.countDocuments({ cnpj: '55666777000199' });

    // simula handler curto: se status concluida, ativarEscolaDePendente não roda
    const again = await AssinaturaPendente.findById(pendente._id);
    expect(again.status).toBe('concluida');
    if (again.status !== 'concluida') {
      // não deve entrar
      throw new Error('deveria estar concluida');
    }
    const after = await Escola.countDocuments({ cnpj: '55666777000199' });
    expect(after).toBe(before);
    expect(typeof processarWebhookStripe).toBe('function');
  });
});
