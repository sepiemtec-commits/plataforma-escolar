// backend/routes/pei.js — Plano Educacional Individualizado
const express = require('express');
const router = express.Router();
const { Pei, Turma, Log } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  assertAlunoEscola,
  assertTurmaEscola,
  responderErroTenant
} = require('../utils/tenant');

const rolesGestao = ['coordenador', 'diretor', 'admin'];
const rolesAcesso = ['coordenador', 'diretor', 'admin', 'professor'];

async function professorTemAcessoAluno(req, alunoId, turmaId) {
  if (rolesGestao.includes(req.usuario.tipo)) return true;
  if (turmaId) {
    const turma = await Turma.findOne({
      _id: turmaId,
      escola_id: req.usuario.escola_id,
      $or: [
        { professor_id: req.usuario._id },
        { alunos: alunoId }
      ]
    });
    if (turma && (String(turma.professor_id) === String(req.usuario._id) ||
      (turma.alunos || []).some((a) => String(a) === String(alunoId)))) {
      // professor só se for titular ou se o aluno está em turma dele
      const minhas = await Turma.find({
        escola_id: req.usuario.escola_id,
        $or: [{ professor_id: req.usuario._id }]
      }).select('alunos professor_id');
      // Also check HorarioAula? Keep simple: turmas where professor_id matches OR aluno in turmas of professor
    }
  }
  const turmas = await Turma.find({
    escola_id: req.usuario.escola_id,
    $or: [
      { professor_id: req.usuario._id },
      { alunos: alunoId }
    ]
  }).select('alunos professor_id');

  return turmas.some((t) => {
    const souTitular = String(t.professor_id) === String(req.usuario._id);
    const alunoNaTurma = (t.alunos || []).some((a) => String(a) === String(alunoId));
    return souTitular && alunoNaTurma;
  }) || turmas.some((t) => {
    const souTitular = String(t.professor_id) === String(req.usuario._id);
    return souTitular;
  });
}

router.get('/', autenticacao, verificarRole(...rolesAcesso), requerEscola, async (req, res) => {
  try {
    const filtro = { escola_id: req.usuario.escola_id };
    if (req.query.aluno_id) filtro.aluno_id = req.query.aluno_id;
    if (req.query.status) filtro.status = req.query.status;

    let lista = await Pei.find(filtro)
      .sort({ dataAtualizacao: -1 })
      .limit(100)
      .populate('aluno_id', 'nome email')
      .populate('turma_id', 'nome serie')
      .populate('responsavelPedagogico', 'nome')
      .lean();

    if (req.usuario.tipo === 'professor') {
      const turmas = await Turma.find({
        escola_id: req.usuario.escola_id,
        professor_id: req.usuario._id
      }).select('alunos');
      const alunoIds = new Set();
      turmas.forEach((t) => (t.alunos || []).forEach((a) => alunoIds.add(String(a))));
      lista = lista.filter((p) => alunoIds.has(String(p.aluno_id?._id || p.aluno_id)));
    }

    res.json({ sucesso: true, peis: lista });
  } catch (error) {
    console.error('Erro ao listar PEI:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar PEIs' });
  }
});

router.get('/:id', autenticacao, verificarRole(...rolesAcesso), requerEscola, async (req, res) => {
  try {
    const pei = await Pei.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    })
      .populate('aluno_id', 'nome email')
      .populate('turma_id', 'nome serie')
      .populate('responsavelPedagogico', 'nome')
      .populate('acompanhamentos.autor_id', 'nome')
      .lean();

    if (!pei) {
      return res.status(404).json({ sucesso: false, mensagem: 'PEI não encontrado' });
    }

    if (req.usuario.tipo === 'professor') {
      const ok = await professorTemAcessoAluno(req, pei.aluno_id?._id || pei.aluno_id, pei.turma_id?._id);
      if (!ok) {
        return res.status(403).json({ sucesso: false, mensagem: 'Sem acesso a este PEI' });
      }
    }

    res.json({ sucesso: true, pei });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar PEI' });
  }
});

router.post('/', autenticacao, verificarRole(...rolesAcesso), requerEscola, async (req, res) => {
  try {
    const {
      aluno_id,
      turma_id,
      diagnostico,
      necessidades,
      metas,
      estrategias,
      recursos,
      status,
      responsavelPedagogico
    } = req.body || {};

    if (!aluno_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'aluno_id é obrigatório' });
    }

    await assertAlunoEscola(req, aluno_id);
    if (turma_id) await assertTurmaEscola(req, turma_id);

    if (req.usuario.tipo === 'professor') {
      const ok = await professorTemAcessoAluno(req, aluno_id, turma_id);
      if (!ok) {
        return res.status(403).json({ sucesso: false, mensagem: 'Você não está vinculado a este aluno' });
      }
    }

    const pei = await Pei.create({
      escola_id: req.usuario.escola_id,
      aluno_id,
      turma_id: turma_id || undefined,
      responsavelPedagogico: responsavelPedagogico || req.usuario._id,
      diagnostico: diagnostico || '',
      necessidades: necessidades || '',
      metas: Array.isArray(metas) ? metas : [],
      estrategias: estrategias || '',
      recursos: recursos || '',
      status: status || 'rascunho',
      criadoPor: req.usuario._id
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_PEI',
      modulo: 'pei',
      descricao: `PEI criado para aluno ${aluno_id}`,
      ipAddress: req.ip
    });

    res.status(201).json({ sucesso: true, pei });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao criar PEI:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar PEI' });
  }
});

router.put('/:id', autenticacao, verificarRole(...rolesAcesso), requerEscola, async (req, res) => {
  try {
    const pei = await Pei.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!pei) {
      return res.status(404).json({ sucesso: false, mensagem: 'PEI não encontrado' });
    }

    if (req.usuario.tipo === 'professor') {
      const ok = await professorTemAcessoAluno(req, pei.aluno_id, pei.turma_id);
      if (!ok) {
        return res.status(403).json({ sucesso: false, mensagem: 'Sem acesso a este PEI' });
      }
    }

    const campos = [
      'diagnostico',
      'necessidades',
      'estrategias',
      'recursos',
      'status',
      'turma_id',
      'responsavelPedagogico'
    ];
    campos.forEach((c) => {
      if (req.body[c] != null) pei[c] = req.body[c];
    });
    if (Array.isArray(req.body.metas)) pei.metas = req.body.metas;
    pei.dataAtualizacao = new Date();
    await pei.save();

    res.json({ sucesso: true, pei });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro ao atualizar PEI:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar PEI' });
  }
});

router.post('/:id/acompanhamento', autenticacao, verificarRole(...rolesAcesso), requerEscola, async (req, res) => {
  try {
    const { texto } = req.body || {};
    if (!texto?.trim()) {
      return res.status(400).json({ sucesso: false, mensagem: 'texto é obrigatório' });
    }

    const pei = await Pei.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!pei) {
      return res.status(404).json({ sucesso: false, mensagem: 'PEI não encontrado' });
    }

    if (req.usuario.tipo === 'professor') {
      const ok = await professorTemAcessoAluno(req, pei.aluno_id, pei.turma_id);
      if (!ok) {
        return res.status(403).json({ sucesso: false, mensagem: 'Sem acesso a este PEI' });
      }
    }

    pei.acompanhamentos.push({
      data: new Date(),
      texto: texto.trim(),
      autor_id: req.usuario._id
    });
    pei.dataAtualizacao = new Date();
    await pei.save();

    const atualizado = await Pei.findById(pei._id)
      .populate('acompanhamentos.autor_id', 'nome')
      .populate('aluno_id', 'nome')
      .lean();

    res.json({ sucesso: true, pei: atualizado });
  } catch (error) {
    console.error('Erro acompanhamento PEI:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao registrar acompanhamento' });
  }
});

module.exports = router;
