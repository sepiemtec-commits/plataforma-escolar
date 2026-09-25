// backend/middleware/autenticacao.js - Middleware de Autenticação
const { Usuario } = require('../database/schema');
const { verificarAccessToken } = require('../utils/tokensAuth');

const autenticacao = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const parts = header.split(' ');
    const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

    if (!token) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token não fornecido'
      });
    }

    let decoded;
    try {
      decoded = verificarAccessToken(token);
    } catch {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token inválido ou expirado'
      });
    }

    if (!decoded?.id) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token inválido ou expirado'
      });
    }

    const usuario = await Usuario.findById(decoded.id);

    if (!usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuário não encontrado'
      });
    }

    if (usuario.ativo === false) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Usuário desativado. Entre em contato com a secretaria.'
      });
    }

    const versaoToken = Number(decoded.v || 0);
    const versaoAtual = Number(usuario.tokenVersion || 0);
    if (versaoToken !== versaoAtual) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Sessão invalidada. Faça login novamente.',
        codigo: 'TOKEN_REVOGADO'
      });
    }

    // Ignora claims de papel no JWT — autoridade é o banco
    req.usuario = usuario;
    req.userId = decoded.id;
    req.tokenVersion = versaoAtual;
    next();
  } catch (error) {
    res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido ou expirado'
    });
  }
};

const verificarRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Não autenticado'
      });
    }

    if (!rolesPermitidos.includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso negado. Permissão insuficiente.'
      });
    }

    next();
  };
};

const requerEscola = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Não autenticado'
    });
  }

  if (req.usuario.tipo === 'admin') {
    return next();
  }

  if (!req.usuario.escola_id) {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Usuário sem escola vinculada'
    });
  }

  next();
};

module.exports = {
  autenticacao,
  verificarRole,
  requerEscola
};
