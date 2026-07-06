// backend/routes/autenticacao.js - Rotas de Autenticação
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Usuario, Escola, Log } = require('../database/schema');
const { autenticacao } = require('../middleware/autenticacao');
const { body, validationResult } = require('express-validator');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');

// ==================== LOGIN ====================
router.post('/login', [
  body('email').isEmail(),
  body('senha').isLength({ min: 6 })
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const { email, senha } = req.body;
    
    // Procurar usuário por email
    const usuario = await Usuario.findOne({ email });
    
    if (!usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Email ou senha inválidos'
      });
    }

    // Verificar senha
    const senhaValida = await usuario.compararSenha(senha);
    if (!senhaValida) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Email ou senha inválidos'
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { id: usuario._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Registrar login no log
    await Log.create({
      usuario_id: usuario._id,
      acao: 'LOGIN',
      modulo: 'autenticacao',
      descricao: `${usuario.tipo} ${usuario.nome} fez login`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
        escola_id: usuario.escola_id,
        disciplina: usuario.disciplina || disciplinasDoProfessor(usuario)[0] || null,
        disciplinas: disciplinasDoProfessor(usuario)
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao fazer login'
    });
  }
});

// ==================== REGISTRAR NOVO USUÁRIO ====================
router.post('/registrar', [
  body('nome').notEmpty(),
  body('email').isEmail(),
  body('senha').isLength({ min: 8 }),
  body('cpf').notEmpty(),
  body('whatsapp').notEmpty(),
  body('tipo').isIn(['aluno'])
], async (req, res) => {
  try {
    const erros = validationResult(req);
    if (!erros.isEmpty()) {
      return res.status(400).json({ sucesso: false, erros: erros.array() });
    }

    const { nome, email, senha, cpf, whatsapp, tipo, escola_id } = req.body;

    // Verificar se email já existe
    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Email já cadastrado'
      });
    }

    // Criar novo usuário
    const novoUsuario = await Usuario.create({
      nome,
      email,
      senha,
      cpf,
      whatsapp,
      tipo,
      escola_id,
      ativo: true
    });

    // Registrar no log
    await Log.create({
      usuario_id: novoUsuario._id,
      acao: 'REGISTRO',
      modulo: 'autenticacao',
      descricao: `Novo usuário ${tipo} registrado: ${nome}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Usuário registrado com sucesso',
      usuario: {
        id: novoUsuario._id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo
      }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao registrar usuário'
    });
  }
});

// ==================== VERIFICAR TOKEN ====================
router.get('/verificar', autenticacao, (req, res) => {
  res.json({
    sucesso: true,
    usuario: {
      id: req.usuario._id,
      nome: req.usuario.nome,
      email: req.usuario.email,
      tipo: req.usuario.tipo,
      disciplina: req.usuario.disciplina || disciplinasDoProfessor(req.usuario)[0] || null,
      disciplinas: disciplinasDoProfessor(req.usuario)
    }
  });
});

// ==================== LOGOUT ====================
router.post('/logout', autenticacao, async (req, res) => {
  try {
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

module.exports = router;
