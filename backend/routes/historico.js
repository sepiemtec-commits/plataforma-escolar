const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { HistoricoEscolar, Escola, Usuario, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');

const rolesGestao = ['admin', 'diretor', 'coordenador', 'secretaria'];

const DISCIPLINAS_PADRAO = [
  'Artes', 'Biologia', 'Ciências', 'Educação Física', 'Espanhol',
  'Filosofia', 'Física', 'Geografia', 'História', 'Inglês',
  'Matemática', 'Português', 'Química', 'Sociologia'
];

router.get('/aluno/:alunoId', autenticacao, async (req, res) => {
  try {
    const historicos = await HistoricoEscolar.find({ aluno_id: req.params.alunoId })
      .sort({ anoLetivo: -1 });
    const aluno = await Usuario.findById(req.params.alunoId).select('nome cpf');
    res.json({ sucesso: true, aluno, historicos });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar histórico' });
  }
});

router.post('/', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { aluno_id, anoLetivo, serie, turma, turno, resultado, instituicao } = req.body;
    const escola = await Escola.findById(req.usuario.escola_id);

    const historico = await HistoricoEscolar.create({
      aluno_id,
      escola_id: req.usuario.escola_id,
      anoLetivo,
      serie,
      turma,
      turno: turno || 'Manhã',
      resultado: resultado || 'Progressão Plena',
      instituicao: instituicao || escola?.nome || 'Escola',
      notas: DISCIPLINAS_PADRAO.map(d => ({ disciplina: d, cargaHoraria: 40, nota: null, faltas: 0 }))
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_HISTORICO',
      modulo: 'historico',
      descricao: `Histórico ${anoLetivo} criado`,
      ipAddress: req.ip
    });

    res.json({ sucesso: true, historico });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar histórico' });
  }
});

router.put('/:historicoId/notas', autenticacao, verificarRole(...rolesGestao, 'professor'), async (req, res) => {
  try {
    const { notas } = req.body;
    const historico = await HistoricoEscolar.findByIdAndUpdate(
      req.params.historicoId,
      { notas },
      { new: true }
    );
    if (!historico) return res.status(404).json({ sucesso: false, mensagem: 'Histórico não encontrado' });
    res.json({ sucesso: true, historico });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar notas' });
  }
});

router.delete('/:historicoId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    await HistoricoEscolar.findByIdAndDelete(req.params.historicoId);
    res.json({ sucesso: true, mensagem: 'Histórico removido' });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover histórico' });
  }
});

router.get('/:historicoId', autenticacao, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.historicoId)) {
      return res.status(404).json({ sucesso: false, mensagem: 'Histórico não encontrado' });
    }
    const historico = await HistoricoEscolar.findById(req.params.historicoId)
      .populate('aluno_id', 'nome cpf');
    if (!historico) return res.status(404).json({ sucesso: false, mensagem: 'Não encontrado' });
    res.json({ sucesso: true, historico });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar histórico' });
  }
});

module.exports = router;
