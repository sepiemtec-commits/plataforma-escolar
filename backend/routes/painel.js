// backend/routes/painel.js - Rotas dos Painéis (Diretor, Coordenador, Professor, Aluno)
const express = require('express');
const router = express.Router();
const { Usuario, Presenca, Avaliacao, Desempenho, Turma, Escola, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const { TIPOS_FUNCIONARIO_ESCOLA } = require('../constants/funcionarios');
const { inferirNivel } = require('../constants/ensino');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');

// ==================== PAINEL DO DIRETOR ====================
router.get('/diretor', autenticacao, verificarRole('diretor'), async (req, res) => {
  try {
    const escola = await Escola.findById(req.usuario.escola_id);
    
    // Estatísticas gerais
    const totalAlunos = await Usuario.countDocuments({
      escola_id: req.usuario.escola_id,
      tipo: 'aluno'
    });

    const totalProfessores = await Usuario.countDocuments({
      escola_id: req.usuario.escola_id,
      tipo: 'professor'
    });

    const totalTurmas = await Turma.countDocuments({
      escola_id: req.usuario.escola_id
    });

    // Alunos em recuperação
    const alunosRecuperacao = await Desempenho.find({
      situacao: { $in: ['recuperacao', 'reprovado'] }
    }).limit(10);

    // Taxa de frequência geral
    const presencas = await Presenca.find();
    const taxa = presencas.length > 0 
      ? ((presencas.filter(p => p.status === 'presente').length / presencas.length) * 100).toFixed(2)
      : 0;

    res.json({
      sucesso: true,
      painel: {
        escola: escola.nome,
        estatisticas: {
          totalAlunos,
          totalProfessores,
          totalTurmas,
          frequenciaMedia: taxa
        },
        alertas: {
          alunosRecuperacao: alunosRecuperacao.length,
          detalhes: alunosRecuperacao
        },
        configuracao: escola?.configuracao || {}
      }
    });

  } catch (error) {
    console.error('Erro no painel do diretor:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar painel'
    });
  }
});

// ==================== PAINEL DA SECRETARIA ====================
router.get('/secretaria', autenticacao, verificarRole('secretaria'), async (req, res) => {
  try {
    const turmasRaw = await Turma.find({ escola_id: req.usuario.escola_id })
      .populate('professor_id', 'nome email')
      .populate('alunos', 'nome email cpf whatsapp matriculaNumero')
      .sort({ dataCriacao: 1 });

    const turmas = turmasRaw.map(t => {
      const obj = t.toObject();
      obj.nivel = inferirNivel(obj);
      return obj;
    });

    const totalAlunos = await Usuario.countDocuments({
      escola_id: req.usuario.escola_id,
      tipo: 'aluno',
      ativo: true
    });

    const professores = await Usuario.find({
      escola_id: req.usuario.escola_id,
      tipo: 'professor',
      ativo: true
    }).select('nome email cpf whatsapp');

    const funcionarios = await Usuario.find({
      escola_id: req.usuario.escola_id,
      tipo: { $in: TIPOS_FUNCIONARIO_ESCOLA },
      ativo: true
    }).select('nome email cpf whatsapp telefone tipo disciplina disciplinas pis ctps').sort({ tipo: 1, nome: 1 });

    res.json({
      sucesso: true,
      painel: {
        totalTurmas: turmas.length,
        totalAlunos,
        totalFuncionarios: funcionarios.length,
        turmas,
        professores,
        funcionarios
      }
    });
  } catch (error) {
    console.error('Erro no painel da secretaria:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar painel' });
  }
});

// ==================== PAINEL DO COORDENADOR ====================
router.get('/coordenador', autenticacao, verificarRole('coordenador'), async (req, res) => {
  try {
    const escola = await Escola.findById(req.usuario.escola_id);

    // Turmas
    const turmas = await Turma.find({ escola_id: req.usuario.escola_id })
      .populate('professor_id', 'nome');

    // Desempenho por disciplina
    const desempenho = await Desempenho.aggregate([
      {
        $group: {
          _id: '$disciplina',
          mediaGeral: { $avg: '$mediaGeral' },
          alunosRecuperacao: {
            $sum: { $cond: [{ $eq: ['$situacao', 'recuperacao'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      sucesso: true,
      painel: {
        escola: escola.nome,
        turmas: turmas.length,
        turmasDetalhes: turmas,
        desempenho
      }
    });

  } catch (error) {
    console.error('Erro no painel do coordenador:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar painel'
    });
  }
});

// ==================== PAINEL DO PROFESSOR ====================
router.get('/professor', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const escolaId = req.usuario.escola_id;
    const minhasDisciplinas = disciplinasDoProfessor(req.usuario);
    let turmas = [];

    if (minhasDisciplinas.length) {
      turmas = await Turma.find({ escola_id: escolaId })
        .populate('alunos', 'nome email cpf whatsapp')
        .sort({ nivel: 1, ano: 1, nome: 1 });
    } else {
      turmas = await Turma.find({ escola_id: escolaId, professor_id: req.usuario._id })
        .populate('alunos', 'nome email cpf whatsapp')
        .sort({ nome: 1 });
    }

    const alunosIds = [...new Set(turmas.flatMap(t => (t.alunos || []).map(a => a._id)))];

    const presencasRecentes = await Presenca.find({
      professor_id: req.usuario._id,
      ...(minhasDisciplinas.length ? { disciplina: { $in: minhasDisciplinas } } : {})
    }).sort({ data: -1 }).limit(10);

    const filtroAtencao = {
      situacao: { $in: ['recuperacao', 'reprovado'] },
      aluno_id: { $in: alunosIds }
    };
    if (minhasDisciplinas.length) {
      filtroAtencao.disciplina = { $in: minhasDisciplinas };
    }

    const alunosAtencao = await Desempenho.find(filtroAtencao)
      .populate('aluno_id', 'nome')
      .populate('turma_id', 'nome serie ano nivel turno');

    const escola = await Escola.findById(escolaId);

    res.json({
      sucesso: true,
      painel: {
        turmas: turmas.length,
        turmasDetalhes: turmas,
        disciplina: minhasDisciplinas[0] || req.usuario.disciplina || null,
        disciplinas: minhasDisciplinas,
        presencasRecentes,
        alunosAtencao,
        configuracao: escola?.configuracao || { avaliacaoComportamental: false }
      }
    });

  } catch (error) {
    console.error('Erro no painel do professor:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar painel'
    });
  }
});

// ==================== PAINEL DO ALUNO ====================
router.get('/aluno', autenticacao, verificarRole('aluno'), async (req, res) => {
  try {
    // Boletim do aluno
    const boletim = await Desempenho.find({ aluno_id: req.usuario._id });

    // Próximas avaliações
    const avaliacoes = await Avaliacao.find({
      aluno_id: req.usuario._id
    }).sort({ dataAplicacao: 1 }).limit(5);

    // Frequência
    const presencas = await Presenca.find({ aluno_id: req.usuario._id });
    const frequencia = presencas.length > 0
      ? ((presencas.filter(p => p.status === 'presente').length / presencas.length) * 100).toFixed(2)
      : 0;

    res.json({
      sucesso: true,
      painel: {
        aluno: req.usuario.nome,
        boletim,
        avaliacoes,
        frequencia: parseFloat(frequencia),
        faltas: presencas.filter(p => p.status === 'falta').length
      }
    });

  } catch (error) {
    console.error('Erro no painel do aluno:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar painel'
    });
  }
});

// ==================== PAINEL DO RESPONSÁVEL ====================
router.get('/responsavel', autenticacao, verificarRole('responsavel'), async (req, res) => {
  try {
    // Alunos associados ao responsável
    const alunos = await Usuario.find({
      _id: { $in: await Responsavel.find({ usuario_id: req.usuario._id }) }
    });

    // Desempenho dos alunos
    const desempenho = await Desempenho.find({
      aluno_id: { $in: alunos.map(a => a._id) }
    });

    res.json({
      sucesso: true,
      painel: {
        alunos: alunos.length,
        alunosDetalhes: alunos,
        desempenho
      }
    });

  } catch (error) {
    console.error('Erro no painel do responsável:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao carregar painel'
    });
  }
});

// ==================== CONFIGURAÇÕES DA ESCOLA ====================
router.put('/configuracao', autenticacao, verificarRole('diretor', 'coordenador'), async (req, res) => {
  try {
    const { tipoAvaliacao, alertasWhatsapp, avaliacaoComportamental } = req.body;

    const atualizacao = {};
    if (tipoAvaliacao) atualizacao['configuracao.tipoAvaliacao'] = tipoAvaliacao;
    if (typeof alertasWhatsapp === 'boolean') atualizacao['configuracao.alertasWhatsapp'] = alertasWhatsapp;
    if (typeof avaliacaoComportamental === 'boolean') {
      atualizacao['configuracao.avaliacaoComportamental'] = avaliacaoComportamental;
    }

    const escola = await Escola.findByIdAndUpdate(
      req.usuario.escola_id,
      { $set: atualizacao },
      { new: true }
    );

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ATUALIZOU_CONFIGURACAO',
      modulo: 'configuracao',
      descricao: 'Configurações da escola atualizadas',
      ipAddress: req.ip
    });

    res.json({ sucesso: true, configuracao: escola.configuracao });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar configurações' });
  }
});

module.exports = router;
