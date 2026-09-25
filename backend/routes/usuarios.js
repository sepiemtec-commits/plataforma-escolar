// backend/routes/usuarios.js - Rotas de Gerenciamento de Usuários
const express = require('express');
const router = express.Router();
const { Usuario, Escola, Log, Responsavel, Turma } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { obterSenhaCadastro } = require('../utils/senhaPadrao');
const { TIPOS_FUNCIONARIO_ESCOLA } = require('../constants/funcionarios');
const { normalizarDisciplinasProfessor } = require('../utils/professorDisciplinas');
const {
  filtroEscola,
  assertUsuarioEscola,
  responderErroTenant,
  idsIguais
} = require('../utils/tenant');
const { asScalarString } = require('../utils/sanitizeQuery');

// ==================== LISTAR USUÁRIOS ====================
router.get('/', autenticacao, verificarRole('admin', 'diretor', 'coordenador', 'secretaria'), requerEscola, async (req, res) => {
  try {
    const tipo = asScalarString(req.query.tipo);

    let filtro = { ativo: true, ...filtroEscola(req) };
    if (tipo) filtro.tipo = tipo;

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
router.post('/', autenticacao, verificarRole('secretaria', 'diretor', 'admin'), requerEscola, async (req, res) => {
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

    if (!req.usuario.escola_id && req.usuario.tipo !== 'admin') {
      return res.status(403).json({ sucesso: false, mensagem: 'Usuário sem escola vinculada' });
    }

    if (req.usuario.tipo === 'admin' && !req.usuario.escola_id && !req.body.escola_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe escola_id para cadastrar usuário'
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

    let senhaFinal;
    let senhaGerada = false;
    try {
      ({ senha: senhaFinal, gerada: senhaGerada } = obterSenhaCadastro(senha));
    } catch (erroSenha) {
      return res.status(erroSenha.status || 400).json({
        sucesso: false,
        mensagem: erroSenha.message
      });
    }

    const novoUsuario = await Usuario.create({
      nome,
      email: String(email).trim().toLowerCase(),
      senha: senhaFinal,
      cpf,
      whatsapp,
      telefone,
      tipo,
      // Tenant sempre do usuário autenticado (exceto admin plataforma sem escola).
      escola_id: req.usuario.tipo === 'admin' && !req.usuario.escola_id
        ? req.body.escola_id
        : req.usuario.escola_id,
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

    if (!novoUsuario.escola_id) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe escola_id para cadastrar usuário'
      });
    }

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CADASTROU_USUARIO',
      modulo: 'usuarios',
      descricao: `${tipo} ${nome} cadastrado`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: senhaGerada
        ? 'Usuário cadastrado com sucesso. Guarde a senha temporária gerada.'
        : 'Usuário cadastrado com sucesso',
      usuario: {
        id: novoUsuario._id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        cpf: novoUsuario.cpf,
        tipo: novoUsuario.tipo,
        disciplina: novoUsuario.disciplina,
        disciplinas: novoUsuario.disciplinas || []
      },
      senhaInicial: senhaFinal,
      senhaGerada
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

    const usuario = await assertUsuarioEscola(req, usuarioId, {
      select: '-senha',
      populate: { path: 'escola_id', select: 'nome' }
    });

    res.json({
      sucesso: true,
      usuario
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao obter usuário'
    });
  }
});

// ==================== ATUALIZAR PROFESSOR (SECRETARIA) ====================
router.put('/:usuarioId/professor', autenticacao, verificarRole('secretaria', 'diretor', 'admin'), requerEscola, async (req, res) => {
  try {
    const { disciplinas, cargaHorariaSemanal } = req.body;

    const professor = await Usuario.findOne({
      _id: req.params.usuarioId,
      ...filtroEscola(req),
      tipo: 'professor',
      ativo: true
    });

    if (!professor) {
      return res.status(404).json({ sucesso: false, mensagem: 'Professor não encontrado' });
    }

    const disciplinasProfessor = normalizarDisciplinasProfessor({ disciplinas });
    if (!disciplinasProfessor.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe ao menos uma disciplina do professor'
      });
    }

    if (cargaHorariaSemanal != null && cargaHorariaSemanal !== '') {
      const carga = Number(cargaHorariaSemanal);
      if (Number.isNaN(carga) || carga < 0) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'Carga horária semanal inválida'
        });
      }
      professor.cargaHorariaSemanal = carga;
    }

    professor.disciplinas = disciplinasProfessor;
    professor.disciplina = disciplinasProfessor[0];
    professor.dataAtualizacao = new Date();
    await professor.save();

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ATUALIZOU_PROFESSOR',
      modulo: 'usuarios',
      descricao: `Professor ${professor.nome}: disciplinas e carga horária atualizadas`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Dados do professor atualizados',
      usuario: {
        id: professor._id,
        nome: professor.nome,
        disciplina: professor.disciplina,
        disciplinas: professor.disciplinas,
        cargaHorariaSemanal: professor.cargaHorariaSemanal
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar professor:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar professor' });
  }
});

// ==================== ATUALIZAR USUÁRIO ====================
router.put('/:usuarioId', autenticacao, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { nome, email, whatsapp, telefone } = req.body;

    const ehProprio = idsIguais(req.usuario._id, usuarioId);
    if (!ehProprio && !['admin', 'diretor', 'coordenador', 'secretaria'].includes(req.usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso negado'
      });
    }

    await assertUsuarioEscola(req, usuarioId);

    const usuario = await Usuario.findByIdAndUpdate(
      usuarioId,
      { nome, email, whatsapp, telefone, dataAtualizacao: new Date() },
      { new: true }
    ).select('-senha');

    if (!usuario) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

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
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar usuário'
    });
  }
});

// ==================== DESATIVAR USUÁRIO ====================
router.put('/:usuarioId/desativar', autenticacao, verificarRole('admin', 'diretor', 'secretaria'), requerEscola, async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const alvo = await Usuario.findOne({ _id: usuarioId, ...filtroEscola(req) });
    if (!alvo) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    // Secretaria só desativa alunos
    if (req.usuario.tipo === 'secretaria' && alvo.tipo !== 'aluno') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Secretaria só pode desativar alunos'
      });
    }

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
router.put('/:usuarioId/ativar', autenticacao, verificarRole('admin', 'diretor', 'secretaria'), requerEscola, async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const alvo = await Usuario.findOne({ _id: usuarioId, ...filtroEscola(req) });
    if (!alvo) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    if (req.usuario.tipo === 'secretaria' && alvo.tipo !== 'aluno') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Secretaria só pode ativar alunos'
      });
    }

    await Usuario.findByIdAndUpdate(usuarioId, { ativo: true });

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

// ==================== EXCLUIR ALUNO (SECRETARIA / DIRETOR) ====================
router.delete('/:usuarioId', autenticacao, verificarRole('admin', 'diretor', 'secretaria'), requerEscola, async (req, res) => {
  try {
    const { usuarioId } = req.params;

    const alvo = await Usuario.findOne({ _id: usuarioId, ...filtroEscola(req) });
    if (!alvo) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    // Admin pode excluir qualquer usuário da escola; secretaria/diretor só aluno
    if (req.usuario.tipo !== 'admin' && alvo.tipo !== 'aluno') {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Somente alunos podem ser excluídos por secretaria/diretor'
      });
    }

    const { Turma } = require('../database/schema');
    await Turma.updateMany(
      { escola_id: alvo.escola_id, alunos: alvo._id },
      { $pull: { alunos: alvo._id } }
    );

    await Usuario.findByIdAndDelete(usuarioId);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'DELETOU_USUÁRIO',
      modulo: 'usuarios',
      descricao: `${alvo.tipo} ${alvo.nome} excluído`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: alvo.tipo === 'aluno' ? 'Aluno excluído' : 'Usuário deletado'
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
