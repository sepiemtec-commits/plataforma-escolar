// backend/routes/conteudo.js - Rotas de Conteúdo Programático
const express = require('express');
const router = express.Router();
const { Conteudo, Log } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  assertTurmaEscola,
  responderErroTenant
} = require('../utils/tenant');

// ==================== REGISTRAR / ATUALIZAR CONTEÚDO DO DIA ====================
router.post('/registrar', autenticacao, verificarRole('professor'), requerEscola, async (req, res) => {
  try {
    const { turma_id, disciplina, titulo, descricao, observacoes, topicos, recursos, data, codigosBncc } = req.body;

    if (!turma_id || !disciplina?.trim() || !titulo?.trim() || !data) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Turma, disciplina, título e data são obrigatórios'
      });
    }

    await assertTurmaEscola(req, turma_id);

    const dataAula = new Date(data);
    dataAula.setHours(0, 0, 0, 0);
    const fim = new Date(dataAula);
    fim.setDate(fim.getDate() + 1);

    const codigos = Array.isArray(codigosBncc)
      ? codigosBncc.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : [];

    const payload = {
      turma_id,
      professor_id: req.usuario._id,
      disciplina: disciplina.trim(),
      data: dataAula,
      titulo: titulo.trim(),
      descricao: descricao || '',
      observacoes: observacoes || '',
      topicos: Array.isArray(topicos) ? topicos : [],
      recursos: Array.isArray(recursos) ? recursos : [],
      codigosBncc: codigos
    };

    let conteudo = await Conteudo.findOne({
      turma_id,
      professor_id: req.usuario._id,
      disciplina: disciplina.trim(),
      data: { $gte: dataAula, $lt: fim }
    });

    if (conteudo) {
      Object.assign(conteudo, payload);
      await conteudo.save();
    } else {
      conteudo = await Conteudo.create(payload);
    }

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'REGISTROU_CONTEÚDO',
      modulo: 'conteudo',
      descricao: `Conteúdo registrado: ${titulo}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Conteúdo e observações salvos com sucesso',
      conteudo
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
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
    await assertTurmaEscola(req, turmaId);

    const conteudos = await Conteudo.find({ turma_id: turmaId })
      .populate('professor_id', 'nome')
      .sort({ data: -1 });

    res.json({
      sucesso: true,
      total: conteudos.length,
      conteudos
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
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
    await assertTurmaEscola(req, turmaId);

    const conteudos = await Conteudo.find({
      turma_id: turmaId,
      disciplina
    }).sort({ data: -1 });

    res.json({
      sucesso: true,
      conteudos
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao listar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar conteúdo'
    });
  }
});

async function carregarConteudoDaEscola(req, conteudoId) {
  const conteudo = await Conteudo.findById(conteudoId);
  if (!conteudo) {
    const { TenantError } = require('../utils/tenant');
    throw new TenantError(404, 'Conteúdo não encontrado');
  }
  await assertTurmaEscola(req, conteudo.turma_id);
  return conteudo;
}

// ==================== OBTER DETALHES DO CONTEÚDO ====================
router.get('/:conteudoId', autenticacao, async (req, res) => {
  try {
    const conteudo = await carregarConteudoDaEscola(req, req.params.conteudoId);
    await conteudo.populate('professor_id', 'nome email');

    res.json({
      sucesso: true,
      conteudo
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao obter conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao obter conteúdo'
    });
  }
});

// ==================== ATUALIZAR CONTEÚDO ====================
router.put('/:conteudoId', autenticacao, verificarRole('professor'), requerEscola, async (req, res) => {
  try {
    const { conteudoId } = req.params;
    const { titulo, descricao, observacoes, topicos, recursos, codigosBncc } = req.body;

    const existente = await carregarConteudoDaEscola(req, conteudoId);
    if (String(existente.professor_id) !== String(req.usuario._id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Você só pode editar o próprio conteúdo' });
    }

    const atualizacao = { titulo, descricao, topicos, recursos };
    if (observacoes !== undefined) atualizacao.observacoes = observacoes;
    if (Array.isArray(codigosBncc)) {
      atualizacao.codigosBncc = codigosBncc.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    }

    const conteudo = await Conteudo.findByIdAndUpdate(
      conteudoId,
      atualizacao,
      { new: true }
    );

    res.json({
      sucesso: true,
      mensagem: 'Conteúdo atualizado',
      conteudo
    });

  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao atualizar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar conteúdo'
    });
  }
});

// ==================== DELETAR CONTEÚDO ====================
router.delete('/:conteudoId', autenticacao, verificarRole('professor'), requerEscola, async (req, res) => {
  try {
    const { conteudoId } = req.params;

    const existente = await carregarConteudoDaEscola(req, conteudoId);
    if (String(existente.professor_id) !== String(req.usuario._id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Você só pode excluir o próprio conteúdo' });
    }

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
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao deletar conteúdo:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao deletar conteúdo'
    });
  }
});

module.exports = router;
