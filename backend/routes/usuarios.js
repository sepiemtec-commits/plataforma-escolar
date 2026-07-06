// backend/routes/usuarios.js - Rotas de Gerenciamento de Usuários
const express = require('express');
const router = express.Router();
const { Usuario, Escola, Log, Responsavel } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const { TIPOS_FUNCIONARIO_ESCOLA } = require('../constants/funcionarios');
const { normalizarDisciplinasProfessor } = require('../utils/professorDisciplinas');

// ==================== LISTAR USUÁRIOS ====================
router.get('/', autenticacao, verificarRole('admin', 'diretor', 'coordenador', 'secretaria'), async (req, res) => {
  try {
    const { tipo } = req.query;

    let filtro = { ativo: true };
    if (tipo) filtro.tipo = tipo;

    if (['secretaria', 'diretor', 'coordenador'].includes(req.usuario.tipo) && req.usuario.escola_id) {
      filtro.escola_id = req.usuario.escola_id;
    }

    const usuarios = await Usuario.find(filtro)
      .select('-senha')
      .populate('escola_id', 'nome')
      .sort({ nome: 1 });

    res.json({
      sucesso: true,
      total: usuarios.length,
      usuarios
    });

  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar usuários'
    });
  }
});

// ==================== CADASTRAR USUÁRIO (SECRETARIA) ====================
router.post('/', autenticacao, verificarRole('secretaria', 'diretor', 'admin'), async (req, res) => {
  try {
    const {
      nome, email, cpf, whatsapp, telefone, tipo, senha,
      pis, ctps, cnpj, endereco, bairro, cidade, uf, cep, rg, disciplina, disciplinas
    } = req.body;

    const tiposSecretaria = [...TIPOS_FUNCIONARIO_ESCOLA, 'aluno'];
    const tiposDiretor = [...tiposSecretaria, 'diretor'];
    const tiposPermitidos = req.usuario.tipo === 'admin'
      ? [...tiposDiretor, 'admin']
      : tiposDiretor;

    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Tipo de usuário não permitido para cadastro'
      });
    }

    if (!nome || !email || !cpf || !whatsapp) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome, email, CPF e WhatsApp são obrigatórios'
      });
    }

    let disciplinasProfessor = [];
    if (tipo === 'professor') {
      disciplinasProfessor = normalizarDisciplinasProfessor({ disciplina, disciplinas });
      if (!disciplinasProfessor.length) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Informe ao menos uma disciplina do professor'
        });
      }
    }

    const emailExistente = await Usuario.findOne({ email });
    if (emailExistente) {
      return res.status(400).json({ sucesso: false, mensagem: 'Email já cadastrado' });
    }

    const cpfExistente = await Usuario.findOne({ cpf });
    if (cpfExistente) {
      return res.status(400).json({ sucesso: false, mensagem: 'CPF já cadastrado' });
    }

    const novoUsuario = await Usuario.create({
      nome,
      email,
      senha: senha || 'senha123',
      cpf,
      whatsapp,
      telefone,
      tipo,
      escola_id: req.usuario.escola_id,
      pis,
      ctps,
      cnpj,
      rg,
      endereco,
      bairro,
      cidade,
      uf,
      cep,
      disciplina: tipo === 'professor' ? disciplinasProfessor[0] : undefined,
      disciplinas: tipo === 'professor' ? disciplinasProfessor : undefined,
      ativo: true
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CADASTROU_USUARIO',
      modulo: 'usuarios',
      descricao: `${tipo} ${nome} cadastrado`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Usuário cadastrado com sucesso',
      usuario: {
        id: novoUsuario._id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        cpf: novoUsuario.cpf,
        tipo: novoUsuario.tipo,
        disciplina: novoUsuario.disciplina,
        disciplinas: novoUsuario.disciplinas || []
      }
    });
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar usuário' });
  }
});

// ==================== OBTER USUÁRIO ====================
router.get('/:usuarioId', autenticacao, async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const usuario = await Usuario.findById(usuarioId)
      .select('-senha')
      .populate('escola_id', 'nome');

    if (!usuario) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Usuário não encontrado'
      });
    }

    res.json({
      sucesso: true,
      usuario
    });

  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao obter usuário'
    });
  }
});

// ==================== ATUALIZAR USUÁRIO ====================
router.put('/:usuarioId', autenticacao, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { nome, email, whatsapp, telefone } = req.body;

    // Verificar permissão
    if (req.usuario._id.toString() !== usuarioId && req.usuario.tipo !== 'admin') {
      if (req.usuario.tipo !== 'diretor' && req.usuario.tipo !== 'coordenador') {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Acesso negado'
        });
      }
    }

    const usuario = await Usuario.findByIdAndUpdate(
      usuarioId,
      { nome, email, whatsapp, telefone, dataAtualizacao: new Date() },
      { new: true }
    ).select('-senha');

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ATUALIZOU_USUÁRIO',
      modulo: 'usuarios',
      descricao: `Usuário ${usuario.nome} atualizado`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Usuário atualizado com sucesso',
      usuario
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar usuário'
    });
  }
});

// ==================== DESATIVAR USUÁRIO ====================
router.put('/:usuarioId/desativar', autenticacao, verificarRole('admin', 'diretor'), async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const usuario = await Usuario.findByIdAndUpdate(
      usuarioId,
      { ativo: false },
      { new: true }
    );

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'DESATIVOU_USUÁRIO',
      modulo: 'usuarios',
      descricao: `Usuário ${usuario.nome} desativado`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Usuário desativado'
    });

  } catch (error) {
    console.error('Erro ao desativar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao desativar usuário'
    });
  }
});

// ==================== ATIVAR USUÁRIO ====================
router.put('/:usuarioId/ativar', autenticacao, verificarRole('admin', 'diretor'), async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const usuario = await Usuario.findByIdAndUpdate(
      usuarioId,
      { ativo: true },
      { new: true }
    );

    res.json({
      sucesso: true,
      mensagem: 'Usuário ativado'
    });

  } catch (error) {
    console.error('Erro ao ativar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao ativar usuário'
    });
  }
});

// ==================== DELETAR USUÁRIO ====================
router.delete('/:usuarioId', autenticacao, verificarRole('admin'), async (req, res) => {
  try {
    const { usuarioId } = req.params;

    await Usuario.findByIdAndDelete(usuarioId);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'DELETOU_USUÁRIO',
      modulo: 'usuarios',
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Usuário deletado'
    });

  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao deletar usuário'
    });
  }
});

module.exports = router;
