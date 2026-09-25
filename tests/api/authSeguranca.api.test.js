/**
 * TOKEN 05 — Segurança de autenticação
 */
const jwt = require('jsonwebtoken');
const {
  getCtx,
  api,
  tokenOf,
  auth,
  tokenInvalido,
  tokenExpirado,
  login
} = require('./setup');

describe('TOKEN 05 — segurança de autenticação', () => {
  describe('login / credenciais', () => {
    test('login válido emite access + refresh', async () => {
      const ctx = getCtx();
      const res = await login('secretaria.a@api.test', ctx.senha);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.refreshToken).not.toBe(res.body.token);
      const payload = jwt.decode(res.body.token);
      expect(payload.id).toBeTruthy();
      expect(payload.v).toBeDefined();
      expect(payload.tipo).toBeUndefined(); // papel não vai no JWT
    });

    test('e-mail case-insensitive', async () => {
      const ctx = getCtx();
      const res = await login('Secretaria.A@Api.Test', ctx.senha);
      expect(res.status).toBe(200);
    });

    test('senha incorreta → 401 (mesma mensagem genérica)', async () => {
      const res = await login('secretaria.a@api.test', 'totalmente-errada');
      expect(res.status).toBe(401);
      expect(res.body.mensagem).toMatch(/inválidos/i);
    });

    test('usuário inexistente → 401 (sem enumeração)', async () => {
      const res = await login('nao.existe.xyz@api.test', 'SenhaApiTeste99');
      expect(res.status).toBe(401);
      expect(res.body.mensagem).toMatch(/inválidos/i);
    });

    test('usuário inativo → 403', async () => {
      const ctx = getCtx();
      const res = await login('inativo.a@api.test', ctx.senha);
      expect(res.status).toBe(403);
    });
  });

  describe('JWT adulteração / expiração / reuso', () => {
    test('sem Authorization → 401', async () => {
      const res = await api().get('/api/usuarios');
      expect(res.status).toBe(401);
    });

    test('Bearer ausente / malformado → 401', async () => {
      let res = await api().get('/api/auth/verificar').set('Authorization', 'Token abc');
      expect(res.status).toBe(401);
      res = await api().get('/api/auth/verificar').set('Authorization', 'Bearer');
      expect(res.status).toBe(401);
    });

    test('token inválido / lixo → 401', async () => {
      const res = await api()
        .get('/api/auth/verificar')
        .set('Authorization', tokenInvalido());
      expect(res.status).toBe(401);
    });

    test('token expirado não acessa → 401', async () => {
      const ctx = getCtx();
      const res = await api()
        .get('/api/auth/verificar')
        .set('Authorization', tokenExpirado(ctx.secretariaA._id));
      expect(res.status).toBe(401);
    });

    test('assinatura adulterada → 401', async () => {
      const token = await tokenOf('aluno.a@api.test');
      const partes = token.split('.');
      const adulterado = `${partes[0]}.${partes[1]}.adulteradoassinatura`;
      const res = await api()
        .get('/api/auth/verificar')
        .set('Authorization', `Bearer ${adulterado}`);
      expect(res.status).toBe(401);
    });

    test('alg none rejeitado → 401', async () => {
      const ctx = getCtx();
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(
        JSON.stringify({ id: String(ctx.alunoA._id), v: 0 })
      ).toString('base64url');
      const res = await api()
        .get('/api/auth/verificar')
        .set('Authorization', `Bearer ${header}.${body}.`);
      expect(res.status).toBe(401);
    });

    test('claim tipo=admin no JWT não escala privilégio', async () => {
      const ctx = getCtx();
      const falso = jwt.sign(
        { id: String(ctx.alunoA._id), v: 0, tipo: 'admin' },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const res = await api().get('/api/usuarios').set(auth(falso));
      expect(res.status).toBe(403);
    });

    test('token com id de outro usuário (roubo de id) exige segredo — assinatura errada falha', async () => {
      const ctx = getCtx();
      const falso = jwt.sign(
        { id: String(ctx.diretorA._id), v: 0 },
        'segredo-errado-nao-e-o-do-servidor-xxxxxx',
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const res = await api().get('/api/painel/diretor').set(auth(falso));
      expect(res.status).toBe(401);
    });
  });

  describe('logout invalida sessão', () => {
    test('após logout o access token antigo falha', async () => {
      const ctx = getCtx();
      const loginRes = await login('professor.a@api.test', ctx.senha);
      const token = loginRes.body.token;
      expect(loginRes.status).toBe(200);

      const out = await api()
        .post('/api/auth/logout')
        .set(auth(token))
        .send({ refreshToken: loginRes.body.refreshToken });
      expect(out.status).toBe(200);

      const res = await api().get('/api/auth/verificar').set(auth(token));
      expect(res.status).toBe(401);
      expect(res.body.codigo === 'TOKEN_REVOGADO' || /invalid|expir|Sessão/i.test(res.body.mensagem || '')).toBe(
        true
      );
    });
  });

  describe('refresh token', () => {
    test('refresh válido renova access + rotaciona refresh', async () => {
      const ctx = getCtx();
      const loginRes = await login('aluno.a@api.test', ctx.senha);
      const oldRefresh = loginRes.body.refreshToken;

      const res = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.refreshToken).not.toBe(oldRefresh);

      // refresh antigo não reutiliza (rotação)
      const reuse = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh });
      expect(reuse.status).toBe(401);
    });

    test('refresh lixo / ausente → 400/401', async () => {
      let res = await api().post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
      res = await api().post('/api/auth/refresh').send({ refreshToken: 'curto' });
      expect(res.status).toBe(400);
      res = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: 'x'.repeat(40) });
      expect(res.status).toBe(401);
    });
  });

  describe('alteração e recuperação de senha', () => {
    test('alterar senha com atual errada → 401', async () => {
      const token = await tokenOf('responsavel.a@api.test');
      const res = await api()
        .post('/api/auth/alterar-senha')
        .set(auth(token))
        .send({ senhaAtual: 'erradaaaaa', senhaNova: 'NovaSenhaForte99' });
      expect(res.status).toBe(401);
    });

    test('alterar senha fraca → 400', async () => {
      const ctx = getCtx();
      const token = await tokenOf('responsavel.a@api.test');
      const res = await api()
        .post('/api/auth/alterar-senha')
        .set(auth(token))
        .send({ senhaAtual: ctx.senha, senhaNova: 'senha123' });
      expect(res.status).toBe(400);
    });

    test('alterar senha ok invalida token antigo', async () => {
      const ctx = getCtx();
      // usuário dedicado para não quebrar outros testes
      const stamp = Date.now();
      const email = `senha.chg.${stamp}@api.test`;
      const sec = await tokenOf('secretaria.a@api.test');
      const cri = await api()
        .post('/api/usuarios')
        .set(auth(sec))
        .send({
          nome: 'Troca Senha',
          email,
          cpf: `7${String(stamp).slice(-10)}`,
          whatsapp: '11971112222',
          tipo: 'aluno',
          senha: ctx.senha
        });
      expect([200, 201]).toContain(cri.status);

      const login1 = await login(email, ctx.senha);
      const token1 = login1.body.token;

      const alt = await api()
        .post('/api/auth/alterar-senha')
        .set(auth(token1))
        .send({ senhaAtual: ctx.senha, senhaNova: 'OutraSenhaForte88' });
      expect(alt.status).toBe(200);

      const velho = await api().get('/api/auth/verificar').set(auth(token1));
      expect(velho.status).toBe(401);

      const login2 = await login(email, 'OutraSenhaForte88');
      expect(login2.status).toBe(200);
    });

    test('recuperar-senha não enumera e-mail', async () => {
      const a = await api()
        .post('/api/auth/recuperar-senha')
        .send({ email: 'secretaria.a@api.test' });
      const b = await api()
        .post('/api/auth/recuperar-senha')
        .send({ email: 'naoexiste999@api.test' });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.mensagem).toBe(b.body.mensagem);
    });

    test('redefinir senha com token válido', async () => {
      const stamp = Date.now();
      const email = `recup.${stamp}@api.test`;
      const ctx = getCtx();
      const sec = await tokenOf('secretaria.a@api.test');
      await api()
        .post('/api/usuarios')
        .set(auth(sec))
        .send({
          nome: 'Recup',
          email,
          cpf: `6${String(stamp).slice(-10)}`,
          whatsapp: '11973334444',
          tipo: 'aluno',
          senha: ctx.senha
        });

      const sol = await api().post('/api/auth/recuperar-senha').send({ email });
      expect(sol.status).toBe(200);
      expect(sol.body.resetToken).toBeTruthy(); // só fora de production

      const red = await api()
        .post('/api/auth/redefinir-senha')
        .send({ token: sol.body.resetToken, senhaNova: 'RecuperadaForte77' });
      expect(red.status).toBe(200);

      expect((await login(email, ctx.senha)).status).toBe(401);
      expect((await login(email, 'RecuperadaForte77')).status).toBe(200);
    });

    test('redefinir com token inválido → 400', async () => {
      const res = await api()
        .post('/api/auth/redefinir-senha')
        .send({ token: 'z'.repeat(40), senhaNova: 'QualquerForte99' });
      expect(res.status).toBe(400);
    });
  });

  describe('escalada de privilégios / admin', () => {
    test('aluno não acessa painel diretor / usuarios / promocao', async () => {
      const token = await tokenOf('aluno.a@api.test');
      for (const path of ['/api/painel/diretor', '/api/usuarios', '/api/promocao/preview']) {
        const res = await api().get(path).set(auth(token));
        expect(res.status).toBe(403);
      }
    });

    test('professor não executa promoção', async () => {
      const token = await tokenOf('professor.a@api.test');
      const res = await api().post('/api/promocao/executar').set(auth(token)).send({});
      expect(res.status).toBe(403);
    });

    test('responsável não cadastra usuário', async () => {
      const token = await tokenOf('responsavel.a@api.test');
      const res = await api()
        .post('/api/usuarios')
        .set(auth(token))
        .send({
          nome: 'X',
          email: 'x@y.com',
          cpf: '111',
          whatsapp: '11',
          tipo: 'admin'
        });
      expect(res.status).toBe(403);
    });
  });

  describe('e-mail / CPF duplicados', () => {
    test('e-mail duplicado → 400', async () => {
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .post('/api/usuarios')
        .set(auth(token))
        .send({
          nome: 'Dup Email',
          email: 'aluno.a@api.test',
          cpf: `5${Date.now().toString().slice(-10)}`,
          whatsapp: '11975556666',
          tipo: 'aluno'
        });
      expect([400, 409]).toContain(res.status);
      expect(res.body.sucesso).toBe(false);
    });

    test('CPF duplicado → 400', async () => {
      const token = await tokenOf('secretaria.a@api.test');
      const res = await api()
        .post('/api/usuarios')
        .set(auth(token))
        .send({
          nome: 'Dup CPF',
          email: `dup.cpf.${Date.now()}@api.test`,
          cpf: '10000000004', // aluno A
          whatsapp: '11975556667',
          tipo: 'aluno'
        });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe('brute force / rate limit', () => {
    test('excesso de falhas de login → 429', async () => {
      const prevDisable = process.env.DISABLE_RATE_LIMIT;
      const prevMax = process.env.RATE_LIMIT_LOGIN_MAX;
      process.env.DISABLE_RATE_LIMIT = '0';
      process.env.RATE_LIMIT_LOGIN_MAX = '3';

      const email = `brute.${Date.now()}@api.test`;
      const statuses = [];
      for (let i = 0; i < 5; i++) {
        const res = await api()
          .post('/api/auth/login')
          .send({ email, senha: '12345678' });
        statuses.push(res.status);
      }

      process.env.DISABLE_RATE_LIMIT = prevDisable;
      process.env.RATE_LIMIT_LOGIN_MAX = prevMax;

      expect(statuses.some((s) => s === 429)).toBe(true);
      expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
    });
  });

  describe('sessões simultâneas', () => {
    test('dois logins válidos até logout em um invalidar access via version', async () => {
      const ctx = getCtx();
      const a = await login('secretaria.a@api.test', ctx.senha);
      const b = await login('secretaria.a@api.test', ctx.senha);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      // ambos funcionam (sessões paralelas permitidas)
      expect((await api().get('/api/auth/verificar').set(auth(a.body.token))).status).toBe(200);
      expect((await api().get('/api/auth/verificar').set(auth(b.body.token))).status).toBe(200);

      await api()
        .post('/api/auth/logout')
        .set(auth(a.body.token))
        .send({ refreshToken: a.body.refreshToken });

      // logout incrementa tokenVersion → ambas access antigas caem
      expect((await api().get('/api/auth/verificar').set(auth(a.body.token))).status).toBe(401);
      expect((await api().get('/api/auth/verificar').set(auth(b.body.token))).status).toBe(401);
    });
  });
});
