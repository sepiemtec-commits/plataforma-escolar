// backend/routes/autenticacao.js - Rotas de Autenticação
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Usuario, Escola, Log } = require('../database/schema');
const { autenticacao } = require('../middleware/autenticacao');
const { body, validationResult } = require('express-validator');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');
const { rateLimitLogin } = require('../middleware/rateLimitLogin');
const { senhaEFraca } = require('../utils/senhaPadrao');
const { createSemaphore } = require('../utils/semaphore');
const {
  emitirAccessToken,
  anexarRefreshToken,
  revogarRefreshToken,
  incrementarTokenVersion,
  hashOpaco,
  limparRefreshExpirados
} = require('../utils/tokensAuth');
const {
  assinaturaPermiteAcesso,
  mensagemBloqueioAssinatura
} = require('../constants/planos');

/** Limita bcrypt+DB concorrentes no login (evita waitQueue Mongo no dia do boletim). */
const loginGate = createSemaphore(Number(process.env.LOGIN_CONCURRENCY || 40));
const LOGIN_GATE_TIMEOUT_MS = Math.max(2000, Number(process.env.LOGIN_GATE_TIMEOUT_MS || 8000));

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function payloadUsuario(usuario) {
  return {
    id: usuario._id,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo,
    escola_id: usuario.escola_id,
    disciplina: usuario.disciplina || disciplinasDoProfessor(usuario)[0] || null,
    disciplinas: disciplinasDoProfessor(usuario)
  };
}

async function emitirSessao(usuario) {
  const token = emitirAccessToken(usuario);
  const refreshToken = await anexarRefreshToken(usuario);
  return { token, refreshToken };
}

// ==================== LOGIN ====================
router.post('/login', rateLimitLogin, [
  body('email').isEmail(),
  body('senha').isLength({ min: 6 })
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const email = normalizarEmail(req.body.email);
    const { senha } = req.body;

    let resultado;
    try {
      resultado = await loginGate.run(async () => {
        const usuario = await Usuario.findOne({ email });

        if (!usuario) {
          return { status: 401, body: { sucesso: false, mensagem: 'Email ou senha inválidos' } };
        }

        const senhaValida = await usuario.compararSenha(senha);
        if (!senhaValida) {
          return { status: 401, body: { sucesso: false, mensagem: 'Email ou senha inválidos' } };
        }

        if (usuario.ativo === false) {
          return {
            status: 403,
            body: {
              sucesso: false,
              mensagem: 'Usuário desativado. Entre em contato com a secretaria.'
            }
          };
        }

        let avisoAssinatura = null;
        if (usuario.tipo !== 'admin' && usuario.escola_id) {
          const escola = await Escola.findById(usuario.escola_id)
            .select('nome ativo assinatura')
            .lean();
          if (!assinaturaPermiteAcesso(escola)) {
            return {
              status: 403,
              body: {
                sucesso: false,
                mensagem: mensagemBloqueioAssinatura(escola),
                codigo: 'ASSINATURA_BLOQUEADA'
              }
            };
          }
          if (escola?.assinatura?.status === 'past_due') {
            avisoAssinatura = 'Assinatura em atraso. Regularize o pagamento para evitar bloqueio.';
          }
        }

        const sessao = await emitirSessao(usuario);

        // Log assíncrono — não segura conexão do pool no caminho crítico
        Log.create({
          usuario_id: usuario._id,
          acao: 'LOGIN',
          modulo: 'autenticacao',
          descricao: `${usuario.tipo} ${usuario.nome} fez login`,
          ipAddress: req.ip
        }).catch((err) => console.error('Log LOGIN:', err.message));

        return {
          status: 200,
          body: {
            sucesso: true,
            mensagem: 'Login realizado com sucesso',
            token: sessao.token,
            refreshToken: sessao.refreshToken,
            avisoAssinatura,
            usuario: payloadUsuario(usuario)
          }
        };
      }, LOGIN_GATE_TIMEOUT_MS);
    } catch (gateErr) {
      if (gateErr && gateErr.code === 'CONCURRENCY_LIMIT') {
        res.set('Retry-After', '2');
        return res.status(503).json({
          sucesso: false,
          mensagem: gateErr.message,
          codigo: 'LOGIN_BUSY'
        });
      }
      throw gateErr;
    }

    return res.status(resultado.status).json(resultado.body);
  } catch (error) {
    // Fila do pool Mongo esgotada / timeout — resposta clara
    const msg = String(error.message || '');
    if (/wait queue|Timed out while checking out|MongoWaitQueueTimeoutError/i.test(msg)) {
      res.set('Retry-After', '3');
      return res.status(503).json({
        sucesso: false,
        mensagem: 'Banco sob carga — tente novamente em instantes',
        codigo: 'DB_POOL_BUSY'
      });
    }
    console.error('Erro no login:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao fazer login'
    });
  }
});

// ==================== REFRESH ====================
router.post('/refresh', [
  body('refreshToken').isString().isLength({ min: 20 })
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const raw = String(req.body.refreshToken);
    const h = hashOpaco(raw);
    const usuario = await Usuario.findOne({ 'refreshTokens.hash': h });

    if (!usuario || usuario.ativo === false) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Refresh token inválido ou expirado'
      });
    }

    limparRefreshExpirados(usuario);
    const entry = (usuario.refreshTokens || []).find((t) => t.hash === h);
    if (!entry || entry.expira <= new Date()) {
      usuario.refreshTokens = (usuario.refreshTokens || []).filter((t) => t.hash !== h);
      await usuario.save();
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Refresh token inválido ou expirado'
      });
    }

    // Rotação: remove o usado e emite novo par
    usuario.refreshTokens = usuario.refreshTokens.filter((t) => t.hash !== h);
    await usuario.save();

    const { token, refreshToken } = await emitirSessao(usuario);

    res.json({
      sucesso: true,
      token,
      refreshToken,
      usuario: payloadUsuario(usuario)
    });
  } catch (error) {
    console.error('Erro no refresh:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao renovar sessão' });
  }
});

// ==================== REGISTRO PÚBLICO DESLIGADO ====================
router.post('/registrar', (req, res) => {
  res.status(410).json({
    sucesso: false,
    mensagem: 'Registro público desativado. Matrículas e cadastros são feitos pela secretaria escolar.'
  });
});

// ==================== VERIFICAR TOKEN ====================
router.get('/verificar', autenticacao, (req, res) => {
  res.json({
    sucesso: true,
    usuario: payloadUsuario(req.usuario)
  });
});

// ==================== LOGOUT (invalida access + refresh) ====================
router.post('/logout', autenticacao, async (req, res) => {
  try {
    if (req.body?.refreshToken) {
      await revogarRefreshToken(req.usuario, req.body.refreshToken);
    }
    await incrementarTokenVersion(req.usuario);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'LOGOUT',
      modulo: 'autenticacao',
      descricao: `${req.usuario.tipo} fez logout`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Logout realizado'
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao fazer logout'
    });
  }
});

// ==================== ALTERAR SENHA ====================
router.post('/alterar-senha', autenticacao, [
  body('senhaAtual').isLength({ min: 6 }),
  body('senhaNova').isLength({ min: 8 })
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const { senhaAtual, senhaNova } = req.body;
    const ok = await req.usuario.compararSenha(senhaAtual);
    if (!ok) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Senha atual incorreta'
      });
    }

    if (senhaEFraca(senhaNova)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nova senha fraca demais. Use no mínimo 8 caracteres e evite padrões comuns.'
      });
    }

    if (senhaAtual === senhaNova) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'A nova senha deve ser diferente da atual'
      });
    }

    req.usuario.senha = senhaNova;
    await req.usuario.save();
    await incrementarTokenVersion(req.usuario);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ALTEROU_SENHA',
      modulo: 'autenticacao',
      descricao: 'Senha alterada pelo próprio usuário',
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Senha alterada. Faça login novamente.'
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao alterar senha' });
  }
});

// ==================== RECUPERAÇÃO DE SENHA ====================
const MSG_RECUPERACAO =
  'Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha.';

router.post('/recuperar-senha', rateLimitLogin, [
  body('email').isEmail()
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const email = normalizarEmail(req.body.email);
    const usuario = await Usuario.findOne({ email, ativo: { $ne: false } });

    const resposta = {
      sucesso: true,
      mensagem: MSG_RECUPERACAO
    };

    if (usuario) {
      const token = crypto.randomBytes(32).toString('base64url');
      usuario.resetSenhaHash = hashOpaco(token);
      usuario.resetSenhaExpira = new Date(Date.now() + 60 * 60 * 1000);
      await usuario.save();

      // Nunca expor em produção; em test/dev permite validação automatizada
      if (process.env.NODE_ENV !== 'production') {
        resposta.resetToken = token;
      }
    }

    res.json(resposta);
  } catch (error) {
    console.error('Erro na recuperação de senha:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao solicitar recuperação' });
  }
});

router.post('/redefinir-senha', [
  body('token').isString().isLength({ min: 20 }),
  body('senhaNova').isLength({ min: 8 })
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const { token, senhaNova } = req.body;
    if (senhaEFraca(senhaNova)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nova senha fraca demais. Use no mínimo 8 caracteres e evite padrões comuns.'
      });
    }

    const h = hashOpaco(token);
    const usuario = await Usuario.findOne({
      resetSenhaHash: h,
      resetSenhaExpira: { $gt: new Date() }
    });

    if (!usuario) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Token de recuperação inválido ou expirado'
      });
    }

    usuario.senha = senhaNova;
    usuario.resetSenhaHash = undefined;
    usuario.resetSenhaExpira = undefined;
    await usuario.save();
    await incrementarTokenVersion(usuario);

    await Log.create({
      usuario_id: usuario._id,
      acao: 'REDEFINIU_SENHA',
      modulo: 'autenticacao',
      descricao: 'Senha redefinida via recuperação',
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Senha redefinida. Faça login com a nova senha.'
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao redefinir senha' });
  }
});

module.exports = router;
