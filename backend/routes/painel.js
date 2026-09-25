// backend/routes/painel.js - Rotas dos Painéis (Diretor, Coordenador, Professor, Aluno)
const express = require('express');
const router = express.Router();
const { Usuario, Presenca, Avaliacao, Desempenho, Turma, Escola, Log, Responsavel } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { TIPOS_FUNCIONARIO_ESCOLA } = require('../constants/funcionarios');
const { inferirNivel } = require('../constants/ensino');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');
const { idsTurmasDaEscola } = require('../utils/tenant');

// ==================== PAINEL DO DIRETOR ====================
router.get('/diretor', autenticacao, verificarRole('diretor'), requerEscola, async (req, res) => {
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

    const turmaIds = await idsTurmasDaEscola(req);

    // Alunos em recuperação (somente turmas da escola)
    const alunosRecuperacao = await Desempenho.find({
      turma_id: { $in: turmaIds },
      situacao: { $in: ['recuperacao', 'reprovado'] }
    })
      .populate('aluno_id', 'nome')
      .limit(10);

    // Taxa de frequência geral da escola
    const presencas = await Presenca.find({ turma_id: { $in: turmaIds } });
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

// ==================== RELATÓRIO DO DIRETOR ====================
function intervaloBimestre(anoLetivo, periodo) {
  const ano = Number(anoLetivo) || new Date().getFullYear();
  const ranges = {
    '1º Bimestre': { inicio: new Date(ano, 1, 1), fim: new Date(ano, 4, 1) },
    '2º Bimestre': { inicio: new Date(ano, 4, 1), fim: new Date(ano, 7, 1) },
    '3º Bimestre': { inicio: new Date(ano, 7, 1), fim: new Date(ano, 9, 1) },
    '4º Bimestre': { inicio: new Date(ano, 9, 1), fim: new Date(ano + 1, 0, 1) },
    Anual: { inicio: new Date(ano, 1, 1), fim: new Date(ano + 1, 0, 1) }
  };
  return ranges[periodo] || ranges.Anual;
}

router.get('/diretor/relatorio', autenticacao, verificarRole('diretor'), requerEscola, async (req, res) => {
  try {
    const periodosValidos = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre', 'Anual'];
    const periodo = periodosValidos.includes(req.query.periodo) ? req.query.periodo : '1º Bimestre';

    const escola = await Escola.findById(req.usuario.escola_id);
    const anoLetivo = escola?.configuracao?.anoLetivo || new Date().getFullYear();
    const turmaIds = await idsTurmasDaEscola(req);

    const [totalAlunos, totalProfessores, turmas] = await Promise.all([
      Usuario.countDocuments({ escola_id: req.usuario.escola_id, tipo: 'aluno', ativo: true }),
      Usuario.countDocuments({ escola_id: req.usuario.escola_id, tipo: 'professor', ativo: true }),
      Turma.find({ _id: { $in: turmaIds } }).select('nome serie ano alunos').sort({ nome: 1 })
    ]);

    const filtroDesempenho = { turma_id: { $in: turmaIds } };
    if (periodo !== 'Anual') {
      filtroDesempenho.periodo = periodo;
    }

    const desempenhos = await Desempenho.find(filtroDesempenho)
      .populate('aluno_id', 'nome')
      .populate('turma_id', 'nome serie ano');

    const resumoSituacao = {
      excelente: 0,
      aprovado: 0,
      recuperacao: 0,
      reprovado: 0,
      semSituacao: 0
    };

    let somaMedias = 0;
    let qtdMedias = 0;
    const alertas = [];

    desempenhos.forEach(d => {
      const sit = d.situacao || 'semSituacao';
      if (resumoSituacao[sit] != null) resumoSituacao[sit] += 1;
      else resumoSituacao.semSituacao += 1;

      if (d.mediaGeral != null && !Number.isNaN(Number(d.mediaGeral))) {
        somaMedias += Number(d.mediaGeral);
        qtdMedias += 1;
      }

      if (['recuperacao', 'reprovado'].includes(d.situacao)) {
        alertas.push({
          aluno: d.aluno_id?.nome || 'N/A',
          turma: d.turma_id?.nome || '—',
          disciplina: d.disciplina,
          periodo: d.periodo,
          media: d.mediaGeral != null ? Number(d.mediaGeral) : null,
          situacao: d.situacao
        });
      }
    });

    alertas.sort((a, b) => (a.media ?? 99) - (b.media ?? 99));

    const { inicio, fim } = intervaloBimestre(anoLetivo, periodo);
    const presencas = await Presenca.find({
      turma_id: { $in: turmaIds },
      data: { $gte: inicio, $lt: fim }
    });

    const totalPresencas = presencas.length;
    const presentes = presencas.filter(p => p.status === 'presente').length;
    const faltas = presencas.filter(p => p.status === 'falta').length;
    const justificadas = presencas.filter(p => p.status === 'justificada').length;
    const atrasos = presencas.filter(p => p.status === 'atraso').length;
    const frequenciaMedia = totalPresencas > 0
      ? Number(((presentes / totalPresencas) * 100).toFixed(1))
      : null;

    const porTurma = turmas.map(t => {
      const idsAlunos = (t.alunos || []).map(a => String(a));
      const desTurma = desempenhos.filter(d => String(d.turma_id?._id || d.turma_id) === String(t._id));
      const medias = desTurma.map(d => Number(d.mediaGeral)).filter(n => !Number.isNaN(n));
      const mediaTurma = medias.length
        ? Number((medias.reduce((a, b) => a + b, 0) / medias.length).toFixed(2))
        : null;
      const emRisco = desTurma.filter(d => ['recuperacao', 'reprovado'].includes(d.situacao)).length;

      return {
        turma: t.nome,
        serie: t.serie || t.ano || '—',
        totalAlunos: idsAlunos.length,
        registrosDesempenho: desTurma.length,
        mediaTurma,
        emRisco
      };
    });

    res.json({
      sucesso: true,
      relatorio: {
        escola: escola?.nome || 'Escola',
        periodo,
        anoLetivo,
        geradoEm: new Date().toISOString(),
        estatisticas: {
          totalAlunos,
          totalProfessores,
          totalTurmas: turmas.length,
          mediaGeralEscola: qtdMedias ? Number((somaMedias / qtdMedias).toFixed(2)) : null,
          registrosDesempenho: desempenhos.length
        },
        frequencia: {
          totalLancamentos: totalPresencas,
          presentes,
          faltas,
          justificadas,
          atrasos,
          frequenciaMedia
        },
        resumoSituacao,
        porTurma,
        alertas: alertas.slice(0, 100)
      }
    });
  } catch (error) {
    console.error('Erro no relatório do diretor:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao gerar relatório'
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

    const turmas = await Turma.find({ escola_id: req.usuario.escola_id })
      .populate('professor_id', 'nome')
      .populate('alunos', 'nome');

    const turmaIds = turmas.map(t => t._id);

    const presencas = turmaIds.length
      ? await Presenca.find({ turma_id: { $in: turmaIds } })
      : [];

    const frequenciaMedia = presencas.length > 0
      ? Number(((presencas.filter(p => p.status === 'presente').length / presencas.length) * 100).toFixed(1))
      : 0;

    const alunosRecuperacao = turmaIds.length
      ? await Desempenho.countDocuments({
        turma_id: { $in: turmaIds },
        situacao: { $in: ['recuperacao', 'reprovado'] }
      })
      : 0;

    const desempenho = turmaIds.length
      ? await Desempenho.aggregate([
        { $match: { turma_id: { $in: turmaIds } } },
        {
          $group: {
            _id: '$disciplina',
            mediaGeral: { $avg: '$mediaGeral' },
            alunosRecuperacao: {
              $sum: { $cond: [{ $in: ['$situacao', ['recuperacao', 'reprovado']] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ])
      : [];

    const turmasResumo = turmas.map(turma => {
      const presTurma = presencas.filter(p => String(p.turma_id) === String(turma._id));
      const frequencia = presTurma.length > 0
        ? Number(((presTurma.filter(p => p.status === 'presente').length / presTurma.length) * 100).toFixed(1))
        : null;

      return {
        _id: turma._id,
        nome: turma.nome,
        nivel: turma.nivel,
        turno: turma.turno,
        professor: turma.professor_id?.nome || '—',
        totalAlunos: (turma.alunos || []).length,
        frequencia
      };
    });

    res.json({
      sucesso: true,
      painel: {
        escola: escola?.nome || 'Escola',
        turmas: turmas.length,
        turmasDetalhes: turmas,
        turmasResumo,
        frequenciaMedia,
        alunosRecuperacao,
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
router.get('/responsavel', autenticacao, verificarRole('responsavel'), requerEscola, async (req, res) => {
  try {
    const vinculos = await Responsavel.find({ usuario_id: req.usuario._id }).select('aluno_id grau_parentesco');
    const alunoIds = vinculos.map(v => v.aluno_id).filter(Boolean);

    const alunos = alunoIds.length
      ? await Usuario.find({
        _id: { $in: alunoIds },
        tipo: 'aluno',
        escola_id: req.usuario.escola_id
      }).select('nome email matriculaNumero ativo')
      : [];

    const desempenho = alunoIds.length
      ? await Desempenho.find({ aluno_id: { $in: alunoIds } })
        .select('aluno_id disciplina periodo mediaGeral frequenciaPercentual situacao')
        .sort({ periodo: 1, disciplina: 1 })
      : [];

    const presencas = alunoIds.length
      ? await Presenca.find({ aluno_id: { $in: alunoIds } }).select('aluno_id status')
      : [];

    const grauPorAluno = {};
    vinculos.forEach(v => {
      grauPorAluno[String(v.aluno_id)] = v.grau_parentesco || 'outro';
    });

    const alunosDetalhes = alunos.map(aluno => {
      const id = String(aluno._id);
      const desAluno = desempenho.filter(d => String(d.aluno_id) === id);
      const presAluno = presencas.filter(p => String(p.aluno_id) === id);
      const frequencia = presAluno.length
        ? Number(((presAluno.filter(p => p.status === 'presente').length / presAluno.length) * 100).toFixed(1))
        : null;
      const faltas = presAluno.filter(p => p.status === 'falta').length;
      const medias = desAluno.map(d => Number(d.mediaGeral)).filter(n => !Number.isNaN(n));
      const mediaGeral = medias.length
        ? Number((medias.reduce((a, b) => a + b, 0) / medias.length).toFixed(2))
        : null;
      const emRisco = desAluno.some(d => ['recuperacao', 'reprovado'].includes(d.situacao));

      return {
        _id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matriculaNumero: aluno.matriculaNumero,
        grauParentesco: grauPorAluno[id] || 'outro',
        frequencia,
        faltas,
        mediaGeral,
        emRisco,
        desempenho: desAluno
      };
    });

    res.json({
      sucesso: true,
      painel: {
        responsavel: req.usuario.nome,
        alunos: alunosDetalhes.length,
        alunosDetalhes
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
    const { tipoAvaliacao, alertasWhatsapp, alertasSms, alertasPush, avaliacaoComportamental } = req.body;

    const atualizacao = {};
    if (tipoAvaliacao) atualizacao['configuracao.tipoAvaliacao'] = tipoAvaliacao;
    if (typeof alertasWhatsapp === 'boolean') atualizacao['configuracao.alertasWhatsapp'] = alertasWhatsapp;
    if (typeof alertasSms === 'boolean') atualizacao['configuracao.alertasSms'] = alertasSms;
    if (typeof alertasPush === 'boolean') atualizacao['configuracao.alertasPush'] = alertasPush;
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
