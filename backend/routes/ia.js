// backend/routes/ia.js — IA pedagógica (pareceres para o professor)
const express = require('express');
const router = express.Router();
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  assertTurmaEscola,
  assertAlunoNaTurma,
  assertAlunoEscola,
  responderErroTenant,
  TenantError
} = require('../utils/tenant');
const { ParecerIA, HorarioAula } = require('../database/schema');
const { gerarParecerPedagogico, conversarNiceIA } = require('../services/iaPedagogica');

const rolesIA = ['professor', 'coordenador', 'diretor', 'admin'];

async function assertProfessorNaTurma(req, turmaId) {
  if (['coordenador', 'diretor', 'admin'].includes(req.usuario.tipo)) {
    return assertTurmaEscola(req, turmaId);
  }
  const turma = await assertTurmaEscola(req, turmaId);
  if (String(turma.professor_id || '') === String(req.usuario._id)) {
    return turma;
  }
  const vinculo = await HorarioAula.findOne({
    turma_id: turmaId,
    professor_id: req.usuario._id,
    escola_id: req.usuario.escola_id
  }).select('_id');

  if (!vinculo) {
    throw new TenantError(403, 'Você não está vinculado a esta turma');
  }
  return turma;
}

// ==================== GERAR PARECER ====================
router.post(
  '/parecer/gerar',
  autenticacao,
  verificarRole(...rolesIA),
  requerEscola,
  async (req, res) => {
    try {
      const { aluno_id, turma_id, disciplina } = req.body || {};
      if (!aluno_id || !turma_id) {
        return res.status(400).json({ sucesso: false, mensagem: 'aluno_id e turma_id são obrigatórios' });
      }

      await assertProfessorNaTurma(req, turma_id);
      await assertAlunoNaTurma(req, turma_id, aluno_id);

      const resultado = await gerarParecerPedagogico({
        alunoId: aluno_id,
        turmaId: turma_id,
        disciplina: disciplina ? String(disciplina).trim() : '',
        escolaId: req.usuario.escola_id
      });

      res.json({
        sucesso: true,
        ...resultado,
        aviso:
          resultado.fonte === 'local'
            ? 'Gerado pelo motor local da VEHO com referências pedagógicas curadas. Revise antes de salvar. (OpenAI opcional via OPENAI_API_KEY)'
            : 'Gerado com modelo externo + base pedagógica curada. Revise antes de salvar.'
      });
    } catch (error) {
      if (responderErroTenant(res, error)) return;
      console.error('Erro ao gerar parecer IA:', error);
      res.status(error.status || 500).json({
        sucesso: false,
        mensagem: error.mensagem || error.message || 'Erro ao gerar parecer'
      });
    }
  }
);

// ==================== SALVAR PARECER ====================
router.post(
  '/parecer/salvar',
  autenticacao,
  verificarRole(...rolesIA),
  requerEscola,
  async (req, res) => {
    try {
      const {
        aluno_id,
        turma_id,
        disciplina,
        textoParecer,
        textoOrientacoes,
        fonte,
        editado,
        snapshot
      } = req.body || {};

      if (!aluno_id || !turma_id || !textoParecer || !textoOrientacoes) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'aluno_id, turma_id, textoParecer e textoOrientacoes são obrigatórios'
        });
      }

      await assertProfessorNaTurma(req, turma_id);
      await assertAlunoNaTurma(req, turma_id, aluno_id);

      const doc = await ParecerIA.create({
        escola_id: req.usuario.escola_id,
        aluno_id,
        turma_id,
        disciplina: disciplina ? String(disciplina).trim() : '',
        textoParecer: String(textoParecer).trim(),
        textoOrientacoes: String(textoOrientacoes).trim(),
        geradoPor: req.usuario._id,
        editado: Boolean(editado),
        fonte: fonte === 'openai' ? 'openai' : 'local',
        snapshot: {
          media: snapshot?.media ?? null,
          frequenciaPercentual: snapshot?.frequenciaPercentual ?? null,
          totalFaltas: snapshot?.totalFaltas ?? null,
          situacao: snapshot?.nivel || snapshot?.situacao || null
        }
      });

      res.status(201).json({
        sucesso: true,
        mensagem: 'Parecer salvo com sucesso',
        parecer: doc
      });
    } catch (error) {
      if (responderErroTenant(res, error)) return;
      console.error('Erro ao salvar parecer IA:', error);
      res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar parecer' });
    }
  }
);

// ==================== CHAT NICE IA ====================
router.post(
  '/chat',
  autenticacao,
  verificarRole(...rolesIA),
  requerEscola,
  async (req, res) => {
    try {
      const { mensagem, historico, aluno_id, turma_id, disciplina } = req.body || {};
      if (!mensagem || !String(mensagem).trim()) {
        return res.status(400).json({ sucesso: false, mensagem: 'mensagem é obrigatória' });
      }

      if (turma_id) {
        await assertProfessorNaTurma(req, turma_id);
      }
      if (aluno_id && turma_id) {
        await assertAlunoNaTurma(req, turma_id, aluno_id);
      } else if (aluno_id) {
        await assertAlunoEscola(req, aluno_id);
      }

      const resultado = await conversarNiceIA({
        mensagem,
        historico: Array.isArray(historico) ? historico : [],
        alunoId: aluno_id || null,
        turmaId: turma_id || null,
        disciplina: disciplina ? String(disciplina).trim() : '',
        escolaId: req.usuario.escola_id
      });

      const avisoLocal =
        resultado.openaiMotivo === 'sem_creditos'
          ? 'NICE IA (motor local): a conta OpenAI está sem créditos. Respostas pedagógicas locais ativas.'
          : resultado.openaiMotivo === 'sem_chave'
            ? 'NICE IA (motor local). Configure OPENAI_API_KEY para respostas mais ricas.'
            : resultado.openaiMotivo
              ? `NICE IA (motor local; OpenAI indisponível: ${resultado.openaiMotivo}).`
              : 'NICE IA (motor local).';

      res.json({
        sucesso: true,
        ...resultado,
        aviso:
          resultado.fonte === 'openai'
            ? 'NICE IA (modelo externo). Revise antes de usar com a família.'
            : avisoLocal
      });
    } catch (error) {
      if (responderErroTenant(res, error)) return;
      console.error('Erro no chat NICE IA:', error);
      res.status(error.status || 500).json({
        sucesso: false,
        mensagem: error.mensagem || error.message || 'Erro no chat'
      });
    }
  }
);

// ==================== LISTAR PARECERES DO ALUNO ====================
router.get(
  '/parecer/aluno/:alunoId',
  autenticacao,
  verificarRole(...rolesIA),
  requerEscola,
  async (req, res) => {
    try {
      await assertAlunoEscola(req, req.params.alunoId);

      const lista = await ParecerIA.find({
        escola_id: req.usuario.escola_id,
        aluno_id: req.params.alunoId
      })
        .sort({ dataCriacao: -1 })
        .limit(30)
        .populate('geradoPor', 'nome')
        .populate('turma_id', 'nome')
        .lean();

      res.json({ sucesso: true, pareceres: lista });
    } catch (error) {
      if (responderErroTenant(res, error)) return;
      console.error('Erro ao listar pareceres IA:', error);
      res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar pareceres' });
    }
  }
);

module.exports = router;
