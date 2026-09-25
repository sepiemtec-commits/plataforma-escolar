/**
 * TOKEN 06 — Segurança da aplicação (probes não destrutivos)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
const { getCtx, api, tokenOf, auth, login } = require('./setup');

describe('TOKEN 06 — segurança da aplicação', () => {
  describe('headers HTTP / Helmet', () => {
    test('respostas incluem headers de proteção', async () => {
      const res = await api().get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toMatch(/SAMEORIGIN|DENY/i);
      expect(res.headers['content-security-policy']).toBeTruthy();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    test('preflight com Origin responde Access-Control-Allow-Origin', async () => {
      const res = await api()
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBeTruthy();
    });
  });

  describe('cookies / sessões', () => {
    test('login não define cookie de sessão (auth é Bearer JWT)', async () => {
      const ctx = getCtx();
      const res = await login('secretaria.a@api.test', ctx.senha);
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body.token).toBeTruthy();
    });
  });

  describe('NoSQL injection', () => {
    test('login com operadores Mongo no body não autentica', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: { $ne: null }, senha: { $ne: null } });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.token).toBeUndefined();
    });

    test('query com $gt em listagem admin é sanitizada (não 500)', async () => {
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .get('/api/usuarios')
        .query({ tipo: { $gt: '' } })
        .set(auth(token));
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.usuarios)).toBe(true);
      }
    });
  });

  describe('RegExp injection / ReDoS (busca)', () => {
    test('GET /api/bncc com metacaracteres não quebra', async () => {
      const token = await tokenOf('professor.a@api.test');
      const res = await api()
        .get('/api/bncc')
        .query({ q: '(a+)+$' })
        .set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body.sucesso).toBe(true);
    });

    test('GET /api/simulados/itens com metacaracteres não quebra', async () => {
      const token = await tokenOf('professor.a@api.test');
      const res = await api()
        .get('/api/simulados/itens')
        .query({ q: '.*|admin' })
        .set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body.sucesso).toBe(true);
    });
  });

  describe('XSS (escapeHtml)', () => {
    test('escapeHtml neutraliza payload hostil', () => {
      const { escapeHtml } = require('../../backend/utils/escapeHtml');
      const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
      const out = escapeHtml(payload);
      expect(out).not.toMatch(/</);
      expect(out).toContain('&lt;script');
      expect(out).toContain('&lt;img');
    });
  });

  describe('CSRF', () => {
    test('mutação sem Bearer → 401 (sem cookie de sessão para CSRF clássico)', async () => {
      const res = await api()
        .post('/api/usuarios')
        .set('Origin', 'https://evil.example')
        .send({
          nome: 'Attacker',
          email: 'evil@x.test',
          cpf: '99999999999',
          whatsapp: '11999999999',
          tipo: 'aluno'
        });
      expect(res.status).toBe(401);
    });
  });

  describe('IDOR / Broken Access Control (admin)', () => {
    test('aluno não acessa listagem administrativa de usuários', async () => {
      const token = await tokenOf('aluno.a@api.test');
      const res = await api().get('/api/usuarios').set(auth(token));
      expect([401, 403]).toContain(res.status);
    });

    test('professor não cria usuário administrativo', async () => {
      const token = await tokenOf('professor.a@api.test');
      const stamp = Date.now();
      const res = await api()
        .post('/api/usuarios')
        .set(auth(token))
        .send({
          nome: 'Fake Admin',
          email: `fake.admin.${stamp}@api.test`,
          cpf: `9${String(stamp).slice(-10)}`,
          whatsapp: '11999999999',
          tipo: 'diretor',
          senha: 'SenhaForte99Aa'
        });
      expect([401, 403]).toContain(res.status);
    });

    test('download de documento de outra escola → 403 (IDOR)', async () => {
      const ctx = getCtx();
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .get(`/api/documentos/${ctx.B.documento._id}/download`)
        .set(auth(token));
      expect(res.status).toBe(403);
    });
  });

  describe('path traversal / upload malicioso', () => {
    test('URL pública /uploads/documentos bloqueada', async () => {
      const ctx = getCtx();
      const res = await api().get(
        `/uploads/documentos/${ctx.A.escola._id}/${ctx.A.aluno._id}/rg-A.pdf`
      );
      expect(res.status).toBe(404);
      expect(res.body.mensagem).toMatch(/indisponível|autenticado/i);
    });

    test('path traversal via static não lê package.json do projeto', async () => {
      const res = await api().get('/uploads/../package.json');
      if (res.status === 200) {
        const text = typeof res.text === 'string' ? res.text : '';
        expect(text).not.toMatch(/"name"\s*:\s*"plataforma-escolar"/);
      } else {
        expect([403, 404]).toContain(res.status);
      }
    });

    test('download rejeita caminho fora do private/documentos', async () => {
      const ctx = getCtx();
      const { DocumentoArquivo } = require('../../backend/database/schema');
      const fora = path.join(os.tmpdir(), `veho-leak-${Date.now()}.pdf`);
      fs.writeFileSync(fora, '%PDF-1.4 leaked');
      const doc = await DocumentoArquivo.create({
        usuario_id: ctx.A.aluno._id,
        escola_id: ctx.A.escola._id,
        categoria: 'aluno',
        tipo: 'cpf',
        nomeOriginal: '../../../etc/passwd',
        nomeArquivo: 'evil.pdf',
        mimeType: 'application/pdf',
        tamanho: 12,
        caminho: fora,
        enviadoPor: ctx.A.secretaria._id
      });

      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .get(`/api/documentos/${doc._id}/download`)
        .set(auth(token));
      expect(res.status).toBe(400);
      expect(res.body.mensagem).toMatch(/inválido/i);

      await DocumentoArquivo.findByIdAndDelete(doc._id);
      fs.unlinkSync(fora);
    });

    test('upload de documento rejeita extensão perigosa (.php)', async () => {
      const ctx = getCtx();
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .post(`/api/documentos/usuario/${ctx.A.aluno._id}`)
        .set(auth(token))
        .field('tipo', 'rg')
        .attach('arquivo', Buffer.from('%PDF-1.4'), {
          filename: '../../../shell.php',
          contentType: 'application/pdf'
        });
      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });

    test('download autenticado da própria escola funciona', async () => {
      const ctx = getCtx();
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .get(`/api/documentos/${ctx.A.documento._id}/download`)
        .set(auth(token));
      expect(res.status).toBe(200);
    });
  });

  describe('exposição de informações', () => {
    test('404 de API não vaza stack', async () => {
      const res = await api().get('/api/rota-que-nao-existe-xyz');
      expect(res.status).toBe(404);
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/at Object|node_modules/);
    });

    test('health não expõe segredos', async () => {
      const res = await api().get('/health');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/JWT|SECRET|password|senha|mongodb:\/\//i);
    });

    test('arquivos sensíveis não são públicos na raiz estática', async () => {
      for (const p of ['/.env', '/backend/.env', '/.git/config', '/database/seeds.js']) {
        const res = await api().get(p);
        expect([403, 404]).toContain(res.status);
      }
    });
  });

  describe('JWT / APIs admin', () => {
    test('token com claims adulterados (tipo/escola) não amplia acesso', async () => {
      const ctx = getCtx();
      const bad = jwt.sign(
        {
          id: ctx.A.aluno._id.toString(),
          v: Number(ctx.A.aluno.tokenVersion || 0),
          escola_id: ctx.B.escola._id.toString(),
          tipo: 'diretor'
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const res = await api().get('/api/usuarios').set(auth(bad));
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('logs / senhaInicial', () => {
    test('cadastro de usuário não grava senhaInicial no Log', async () => {
      const ctx = getCtx();
      const token = await tokenOf('secretaria.a@api.test');
      const stamp = Date.now();
      const senha = 'SenhaForte99Aa';
      const create = await api()
        .post('/api/usuarios')
        .set(auth(token))
        .send({
          nome: 'User Log Check',
          email: `sec.log.${stamp}@api.test`,
          cpf: `8${String(stamp).slice(-10)}`,
          whatsapp: '11988887777',
          tipo: 'aluno',
          senha
        });
      expect([200, 201]).toContain(create.status);
      expect(create.body.senhaInicial).toBeTruthy();

      const { Log } = require('../../backend/database/schema');
      const logs = await Log.find({
        usuario_id: ctx.A.secretaria._id,
        acao: 'CADASTROU_USUARIO'
      })
        .sort({ dataCriacao: -1 })
        .limit(5)
        .lean();
      const blob = JSON.stringify(logs);
      expect(blob).not.toMatch(senha);
      expect(blob).not.toMatch(/senhaInicial/);
    });
  });
});
