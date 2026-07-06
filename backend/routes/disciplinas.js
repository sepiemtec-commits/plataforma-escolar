const express = require('express');
const router = express.Router();
const { DisciplinaConfig, Log, Turma } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');
const { disciplinaPermitidaParaTurma, filtrarDisciplinasParaTurma } = require('../constants/disciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');

function serializarDisciplina(doc) {
  const obj = doc?.toObject ? doc.toObject() : { ...doc };
  return { ...obj, nome: formatarNomeDisciplina(obj.nome) };
}

router.get('/', autenticacao, async (req, res) => {
  try {
    const filtro = { ativo: true };
    if (req.usuario.escola_id) {
      filtro.escola_id = req.usuario.escola_id;
    }

    const disciplinas = (await DisciplinaConfig.find(filtro).sort({ nome: 1 })).map(serializarDisciplina);

    if (req.query.turmaId) {
      const turma = await Turma.findOne({
        _id: req.query.turmaId,
        escola_id: req.usuario.escola_id
      });
      if (turma) {
        const permitidas = filtrarDisciplinasParaTurma(disciplinas, turma);
        return res.json({ sucesso: true, disciplinas: permitidas, turma: { _id: turma._id, nome: turma.nome } });
      }
    }

    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.json({ sucesso: true, disciplinas: [] });
      }
      const minhasDisc = disciplinas.filter(d => minhas.includes(d.nome));
      return res.json({ sucesso: true, disciplinas: minhasDisc });
    }

    res.json({ sucesso: true, disciplinas });
  } catch (error) {
    console.error('Erro ao listar disciplinas:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar disciplinas' });
  }
});

router.post('/', autenticacao, verificarRole('secretaria', 'diretor'), async (req, res) => {
  try {
    const { nome, quantidadeTempos } = req.body;

    if (!nome?.trim()) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe o nome da disciplina' });
    }

    const qtd = parseInt(quantidadeTempos, 10);
    if (!qtd || qtd < 1 || qtd > 12) {
      return res.status(400).json({ sucesso: false, mensagem: 'Quantidade de tempos deve ser entre 1 e 12' });
    }

    const nomeFormatado = formatarNomeDisciplina(nome.trim());

    const disciplina = await DisciplinaConfig.create({
      escola_id: req.usuario.escola_id,
      nome: nomeFormatado,
      quantidadeTempos: qtd
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_DISCIPLINA',
      modulo: 'disciplinas',
      descricao: `${disciplina.nome} (${qtd} tempos)`,
      ipAddress: req.ip
    });

    res.status(201).json({ sucesso: true, mensagem: 'Disciplina cadastrada', disciplina: serializarDisciplina(disciplina) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ sucesso: false, mensagem: 'Disciplina já cadastrada' });
    }
    console.error('Erro ao criar disciplina:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar disciplina' });
  }
});

router.put('/:id', autenticacao, verificarRole('secretaria', 'diretor'), async (req, res) => {
  try {
    const { nome, quantidadeTempos } = req.body;
    const atualizacao = {};

    if (nome?.trim()) atualizacao.nome = formatarNomeDisciplina(nome.trim());
    if (quantidadeTempos != null) {
      const qtd = parseInt(quantidadeTempos, 10);
      if (!qtd || qtd < 1 || qtd > 12) {
        return res.status(400).json({ sucesso: false, mensagem: 'Quantidade de tempos deve ser entre 1 e 12' });
      }
      atualizacao.quantidadeTempos = qtd;
    }

    const disciplina = await DisciplinaConfig.findOneAndUpdate(
      { _id: req.params.id, escola_id: req.usuario.escola_id },
      atualizacao,
      { new: true }
    );

    if (!disciplina) {
      return res.status(404).json({ sucesso: false, mensagem: 'Disciplina não encontrada' });
    }

    res.json({ sucesso: true, mensagem: 'Disciplina atualizada', disciplina: serializarDisciplina(disciplina) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ sucesso: false, mensagem: 'Já existe disciplina com este nome' });
    }
    console.error('Erro ao atualizar disciplina:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar disciplina' });
  }
});

router.delete('/:id', autenticacao, verificarRole('secretaria', 'diretor'), async (req, res) => {
  try {
    const disciplina = await DisciplinaConfig.findOneAndUpdate(
      { _id: req.params.id, escola_id: req.usuario.escola_id },
      { ativo: false },
      { new: true }
    );

    if (!disciplina) {
      return res.status(404).json({ sucesso: false, mensagem: 'Disciplina não encontrada' });
    }

    res.json({ sucesso: true, mensagem: 'Disciplina removida' });
  } catch (error) {
    console.error('Erro ao remover disciplina:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover disciplina' });
  }
});

module.exports = router;
