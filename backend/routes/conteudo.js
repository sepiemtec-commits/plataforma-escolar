// backend/routes/conteudo.js - Rotas de Conteúdo Programático
const express = require('express');
const router = express.Router();
const { Conteudo, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');

// ==================== REGISTRAR CONTEÚDO ====================
router.post('/registrar', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { turma_id, disciplina, titulo, descricao, topicos, recursos, data } = req.body;

    const conteudo = await Conteudo.create({
      turma_id,
      professor_id: req.usuario._id,
      disciplina,
      data: new Date(data),
      titulo,
      descricao,
      topicos,
      recursos
    });

    // Registrar no log
    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'REGISTROU_CONTEÚDO',
      modulo: 'conteudo',
      descricao: `Conteúdo registrado: ${titulo}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Conteúdo registrado com sucesso',
      conteudo
    });

  } catch (error) {
    console.error('Erro ao registrar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao registrar conteúdo'
    });
  }
});

// ==================== LISTAR CONTEÚDO POR TURMA ====================
router.get('/turma/:turmaId', autenticacao, async (req, res) => {
  try {
    const { turmaId } = req.params;

    const conteudos = await Conteudo.find({ turma_id: turmaId })
      .populate('professor_id', 'nome')
      .sort({ data: -1 });

    res.json({
      sucesso: true,
      total: conteudos.length,
      conteudos
    });

  } catch (error) {
    console.error('Erro ao listar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar conteúdo'
    });
  }
});

// ==================== LISTAR CONTEÚDO POR DISCIPLINA ====================
router.get('/disciplina/:disciplina/turma/:turmaId', autenticacao, async (req, res) => {
  try {
    const { disciplina, turmaId } = req.params;

    const conteudos = await Conteudo.find({
      turma_id: turmaId,
      disciplina
    }).sort({ data: -1 });

    res.json({
      sucesso: true,
      conteudos
    });

  } catch (error) {
    console.error('Erro ao listar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar conteúdo'
    });
  }
});

// ==================== OBTER DETALHES DO CONTEÚDO ====================
router.get('/:conteudoId', autenticacao, async (req, res) => {
  try {
    const { conteudoId } = req.params;

    const conteudo = await Conteudo.findById(conteudoId)
      .populate('professor_id', 'nome email');

    if (!conteudo) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Conteúdo não encontrado'
      });
    }

    res.json({
      sucesso: true,
      conteudo
    });

  } catch (error) {
    console.error('Erro ao obter conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao obter conteúdo'
    });
  }
});

// ==================== ATUALIZAR CONTEÚDO ====================
router.put('/:conteudoId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { conteudoId } = req.params;
    const { titulo, descricao, topicos, recursos } = req.body;

    const conteudo = await Conteudo.findByIdAndUpdate(
      conteudoId,
      { titulo, descricao, topicos, recursos },
      { new: true }
    );

    res.json({
      sucesso: true,
      mensagem: 'Conteúdo atualizado',
      conteudo
    });

  } catch (error) {
    console.error('Erro ao atualizar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar conteúdo'
    });
  }
});

// ==================== DELETAR CONTEÚDO ====================
router.delete('/:conteudoId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { conteudoId } = req.params;

    await Conteudo.findByIdAndDelete(conteudoId);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'DELETOU_CONTEÚDO',
      modulo: 'conteudo',
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Conteúdo deletado'
    });

  } catch (error) {
    console.error('Erro ao deletar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao deletar conteúdo'
    });
  }
});

module.exports = router;
