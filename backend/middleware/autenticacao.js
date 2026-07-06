// backend/middleware/autenticacao.js - Middleware de Autenticação
const jwt = require('jsonwebtoken');
const { Usuario } = require('../database/schema');

const autenticacao = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Token não fornecido'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findById(decoded.id);

    if (!usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuário não encontrado'
      });
    }

    req.usuario = usuario;
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({
      sucesso: false,
      mensagem: 'Token inválido ou expirado'
    });
  }
};

// Verificar role/tipo de usuário
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

module.exports = {
  autenticacao,
  verificarRole
};
