// backend/routes/avaliacao.js - Rotas de Avaliação e Notas
const express = require('express');
const router = express.Router();
const { Avaliacao, Desempenho, Usuario, Escola, Turma, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const notificadorWhatsApp = require('../services/whatsapp');
const { disciplinasDoProfessor, professorTemDisciplina } = require('../utils/professorDisciplinas');
const { disciplinaPermitidaParaTurma } = require('../constants/disciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');

const BIMESTRES = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
const TIPOS_NOTA = ['prova_bimestral', 'teste_bimestral', 'comportamental'];

function pesoTipo(tipo) {
  return tipo === 'comportamental' ? 0.5 : 1;
}

function chaveNota(alunoId, tipo, periodo) {
  return `${alunoId}_${tipo}_${periodo}`;
}

// ==================== GRADE DE NOTAS (lista de alunos) ====================
router.get('/grade/:turmaId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { turmaId } = req.params;
    const { disciplina } = req.query;

    if (!disciplina) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe a disciplina' });
    }

    const disciplinaFmt = formatarNomeDisciplina(disciplina);

    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Disciplina não vinculada ao professor' });
      }
      if (!professorTemDisciplina(req.usuario, disciplinaFmt)) {
        return res.status(403).json({
          sucesso: false,
          mensagem: `Você só pode lançar notas em: ${minhas.join(', ')}`
        });
      }
    }

    const turma = await Turma.findById(turmaId).populate('alunos', 'nome cpf');
    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    if (!disciplinaPermitidaParaTurma(disciplinaFmt, turma)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `${disciplinaFmt} não é ofertada para esta turma/série`
      });
    }

    const escola = await Escola.findById(req.usuario.escola_id);
    const avaliacaoComportamentalEscola = escola?.configuracao?.avaliacaoComportamental || false;

    const avaliacoes = await Avaliacao.find({
      turma_id: turmaId,
      disciplina: disciplinaFmt,
      tipo: { $in: TIPOS_NOTA }
    });

    const mapaNotas = {};
    avaliacoes.forEach(av => {
      mapaNotas[chaveNota(av.aluno_id, av.tipo, av.periodo)] = {
        nota: av.nota,
        id: av._id
      };
    });

    const alunos = (turma.alunos || []).map(aluno => {
      const notas = {};
      const mediasBimestre = {};

      BIMESTRES.forEach(bimestre => {
        let soma = 0;
        let peso = 0;
        TIPOS_NOTA.forEach(tipo => {
          const celula = mapaNotas[chaveNota(aluno._id, tipo, bimestre)];
          if (celula) {
            notas[`${bimestre}_${tipo}`] = celula.nota;
            soma += celula.nota * pesoTipo(tipo);
            peso += pesoTipo(tipo);
          }
        });
        mediasBimestre[bimestre] = peso > 0 ? (soma / peso).toFixed(1) : null;
      });

      const mediasValidas = Object.values(mediasBimestre).filter(m => m !== null).map(Number);
      const mediaAnual = mediasValidas.length
        ? (mediasValidas.reduce((a, b) => a + b, 0) / mediasValidas.length).toFixed(1)
        : null;

      return {
        _id: aluno._id,
        nome: aluno.nome,
        cpf: aluno.cpf,
        notas,
        mediasBimestre,
        mediaAnual
      };
    });

    res.json({
      sucesso: true,
      disciplina,
      turma: { _id: turma._id, nome: turma.nome },
      bimestres: BIMESTRES,
      avaliacaoComportamentalEscola,
      alunos
    });
  } catch (error) {
    console.error('Erro ao carregar grade:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar notas' });
  }
});

// ==================== SALVAR CÉLULA DA GRADE (upsert) ====================
router.put('/grade/celula', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { aluno_id, turma_id, disciplina, tipo, periodo, nota } = req.body;

    if (!disciplina?.trim()) {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe a disciplina' });
    }

    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length || !professorTemDisciplina(req.usuario, disciplina.trim())) {
        return res.status(403).json({
          sucesso: false,
          mensagem: `Você só pode lançar notas em: ${minhas.join(', ') || 'suas disciplinas'}`
        });
      }
    }

    const turmaCelula = await Turma.findById(turma_id);
    if (!turmaCelula) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }
    if (!disciplinaPermitidaParaTurma(disciplina.trim(), turmaCelula)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `${disciplina.trim()} não é ofertada para esta turma/série`
      });
    }

    if (!TIPOS_NOTA.includes(tipo)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Tipo de avaliação inválido' });
    }

    if (nota === null || nota === '' || nota === undefined) {
      await Avaliacao.deleteOne({ aluno_id, turma_id, disciplina, tipo, periodo });
      await atualizarDesempenho(aluno_id, turma_id, disciplina, periodo);
      return res.json({ sucesso: true, mensagem: 'Nota removida' });
    }

    const notaNum = parseFloat(nota);
    if (isNaN(notaNum) || notaNum < 0 || notaNum > 10) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nota deve estar entre 0 e 10' });
    }

    let avaliacao = await Avaliacao.findOne({ aluno_id, turma_id, disciplina, tipo, periodo });

    if (avaliacao) {
      avaliacao.nota = notaNum;
      avaliacao.professor_id = req.usuario._id;
      await avaliacao.save();
    } else {
      avaliacao = await Avaliacao.create({
        aluno_id,
        turma_id,
        disciplina,
        tipo,
        periodo,
        nota: notaNum,
        peso: pesoTipo(tipo),
        professor_id: req.usuario._id,
        dataAplicacao: new Date()
      });
    }

    await atualizarDesempenho(aluno_id, turma_id, disciplina, periodo);

    res.json({ sucesso: true, mensagem: 'Nota salva', avaliacao });
  } catch (error) {
    console.error('Erro ao salvar nota:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar nota' });
  }
});

// ==================== LANÇAR AVALIAÇÃO ====================
router.post('/lancar', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { aluno_id, turma_id, disciplina, tipo, periodo, nota, peso, dataAplicacao, observacoes } = req.body;

    if (!professorTemDisciplina(req.usuario, disciplina)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: `Você só pode lançar notas em: ${disciplinasDoProfessor(req.usuario).join(', ')}`
      });
    }

    // Validar nota
    if (nota < 0 || nota > 10) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nota deve estar entre 0 e 10'
      });
    }

    const avaliacao = await Avaliacao.create({
      aluno_id,
      professor_id: req.usuario._id,
      turma_id,
      disciplina,
      tipo,
      periodo,
      nota,
      peso,
      dataAplicacao: new Date(dataAplicacao),
      observacoes
    });

    // Atualizar desempenho do aluno
    await atualizarDesempenho(aluno_id, turma_id, disciplina, periodo);

    // Registrar no log
    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'LANÇOU_AVALIAÇÃO',
      modulo: 'avaliacao',
      descricao: `${tipo} lançada - ${disciplina} - nota ${nota}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Avaliação lançada com sucesso',
      avaliacao
    });

  } catch (error) {
    console.error('Erro ao lançar avaliação:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao lançar avaliação'
    });
  }
});

// ==================== LISTAR NOTAS DO ALUNO ====================
router.get('/aluno/:alunoId', autenticacao, async (req, res) => {
  try {
    const { alunoId } = req.params;

    const filtro = { aluno_id: alunoId };
    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Disciplina não vinculada ao professor' });
      }
      filtro.disciplina = { $in: minhas };
    }

    const avaliacoes = await Avaliacao.find(filtro)
      .populate('professor_id', 'nome')
      .populate('turma_id', 'nome')
      .sort({ dataAplicacao: -1 });

    res.json({
      sucesso: true,
      total: avaliacoes.length,
      avaliacoes
    });

  } catch (error) {
    console.error('Erro ao listar avaliacões:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao listar avaliações'
    });
  }
});

// ==================== BOLETIM DO ALUNO ====================
router.get('/boletim/:alunoId', autenticacao, async (req, res) => {
  try {
    const { alunoId } = req.params;

    const filtro = { aluno_id: alunoId };
    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Disciplina não vinculada ao professor' });
      }
      filtro.disciplina = { $in: minhas };
    }

    const boletim = await Desempenho.find(filtro)
      .select('disciplina periodo mediaGeral frequenciaPercentual situacao diagnostico');

    res.json({
      sucesso: true,
      boletim
    });

  } catch (error) {
    console.error('Erro ao gerar boletim:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar boletim'
    });
  }
});

// ==================== ATUALIZAR AVALIAÇÃO ====================
router.put('/:avaliacaoId', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const { avaliacaoId } = req.params;
    const { nota, observacoes } = req.body;

    if (nota < 0 || nota > 10) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nota deve estar entre 0 e 10'
      });
    }

    const avaliacao = await Avaliacao.findById(avaliacaoId);
    if (!avaliacao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Avaliação não encontrada' });
    }

    if (req.usuario.tipo === 'professor' && !professorTemDisciplina(req.usuario, avaliacao.disciplina)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: `Você só pode alterar notas de: ${disciplinasDoProfessor(req.usuario).join(', ')}`
      });
    }

    const atualizada = await Avaliacao.findByIdAndUpdate(
      avaliacaoId,
      { nota, observacoes },
      { new: true }
    );

    // Atualizar desempenho
    await atualizarDesempenho(
      atualizada.aluno_id,
      atualizada.turma_id,
      atualizada.disciplina,
      atualizada.periodo
    );

    res.json({
      sucesso: true,
      mensagem: 'Avaliação atualizada',
      avaliacao: atualizada
    });

  } catch (error) {
    console.error('Erro ao atualizar avaliação:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao atualizar avaliação'
    });
  }
});

// ==================== FUNÇÃO AUXILIAR: ATUALIZAR DESEMPENHO ====================
async function atualizarDesempenho(alunoId, turmaId, disciplina, periodo) {
  try {
    const avaliacoes = await Avaliacao.find({
      aluno_id: alunoId,
      disciplina,
      periodo
    });

    if (avaliacoes.length === 0) return;

    // Calcular média ponderada
    let somaNotasPonderadas = 0;
    let somaPesos = 0;

    avaliacoes.forEach(av => {
      somaNotasPonderadas += av.nota * (av.peso || pesoTipo(av.tipo));
      somaPesos += (av.peso || pesoTipo(av.tipo));
    });

    const mediaGeral = somaNotasPonderadas / somaPesos;

    // Determinar situação
    let situacao = 'aprovado';
    if (mediaGeral < 5) {
      situacao = 'recuperacao';
    } else if (mediaGeral < 6) {
      situacao = 'recuperacao';
    } else if (mediaGeral >= 9) {
      situacao = 'excelente';
    }

    // Atualizar ou criar desempenho
    await Desempenho.updateOne(
      { aluno_id: alunoId, disciplina, periodo },
      {
        turma_id: turmaId,
        mediaGeral: mediaGeral.toFixed(2),
        situacao,
        dataAtualizacao: new Date()
      },
      { upsert: true }
    );

  } catch (error) {
    console.error('Erro ao atualizar desempenho:', error);
  }
}

// ==================== DIAGNOSTICAR ALUNOS ====================
router.post('/diagnosticar', autenticacao, verificarRole('professor', 'coordenador'), async (req, res) => {
  try {
    const { turmaId, periodo } = req.body;

    const desempenhos = await Desempenho.find({
      periodo,
      $or: [
        { situacao: 'recuperacao' },
        { situacao: 'reprovado' }
      ]
    }).populate('aluno_id', 'nome email');

    // Gerar diagnóstico
    const diagnosticos = desempenhos.map(d => ({
      aluno: d.aluno_id,
      disciplina: d.disciplina,
      media: d.mediaGeral,
      situacao: d.situacao,
      recomendacao: d.mediaGeral < 5 ? 'Necesita reforço urgente' : 'Acompanhamento necessário'
    }));

    res.json({
      sucesso: true,
      total: diagnosticos.length,
      diagnosticos
    });

  } catch (error) {
    console.error('Erro ao diagnosticar:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar diagnóstico'
    });
  }
});

module.exports = router;
