const express = require('express');
const router = express.Router();
const { HorarioAula, Turma, Usuario, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const { DIAS_SEMANA, SLOTS_POR_TURNO, slotsDoTurno } = require('../constants/horarios');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');
const { disciplinaPermitidaParaTurma } = require('../constants/disciplinas');
const { formatarNomeDisciplina } = require('../utils/formatarDisciplina');

router.get('/slots', autenticacao, (req, res) => {
  res.json({
    sucesso: true,
    diasSemana: DIAS_SEMANA,
    slotsPorTurno: SLOTS_POR_TURNO
  });
});

router.get('/turma/:turmaId', autenticacao, verificarRole('secretaria', 'diretor', 'coordenador'), async (req, res) => {
  try {
    const turma = await Turma.findOne({
      _id: req.params.turmaId,
      escola_id: req.usuario.escola_id
    });

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    const turno = req.query.turno || turma.turno || 'Manhã';
    const horarios = await HorarioAula.find({
      turma_id: turma._id,
      turno
    })
      .populate('professor_id', 'nome disciplina disciplinas')
      .sort({ horaInicio: 1, diaSemana: 1 });

    res.json({
      sucesso: true,
      turma: {
        _id: turma._id,
        nome: turma.nome,
        turno: turma.turno,
        nivel: turma.nivel,
        ano: turma.ano,
        serie: turma.serie
      },
      turno,
      slots: slotsDoTurno(turno),
      diasSemana: DIAS_SEMANA,
      horarios
    });
  } catch (error) {
    console.error('Erro ao listar horários da turma:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar horários' });
  }
});

router.get('/professor', autenticacao, verificarRole('professor'), async (req, res) => {
  try {
    const turno = req.query.turno || 'Manhã';
    const horarios = await HorarioAula.find({
      escola_id: req.usuario.escola_id,
      professor_id: req.usuario._id,
      turno
    })
      .populate('turma_id', 'nome serie ano nivel turno')
      .sort({ horaInicio: 1, diaSemana: 1 });

    res.json({
      sucesso: true,
      turno,
      slots: slotsDoTurno(turno),
      diasSemana: DIAS_SEMANA,
      horarios
    });
  } catch (error) {
    console.error('Erro ao listar horários do professor:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar horários' });
  }
});

router.put('/turma/:turmaId', autenticacao, verificarRole('secretaria', 'diretor'), async (req, res) => {
  try {
    const turma = await Turma.findOne({
      _id: req.params.turmaId,
      escola_id: req.usuario.escola_id
    });

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    const { turno, horarios } = req.body;
    const turnoFinal = turno || turma.turno || 'Manhã';
    const slotsValidos = new Set(slotsDoTurno(turnoFinal));
    const lista = Array.isArray(horarios) ? horarios : [];

    for (const item of lista) {
      if (item.diaSemana < 0 || item.diaSemana > 5) {
        return res.status(400).json({ sucesso: false, mensagem: 'Dia da semana inválido' });
      }
      if (!slotsValidos.has(item.horaInicio)) {
        return res.status(400).json({ sucesso: false, mensagem: `Horário inválido: ${item.horaInicio}` });
      }
      if (!item.professor_id || !item.disciplina) {
        return res.status(400).json({ sucesso: false, mensagem: 'Professor e disciplina são obrigatórios' });
      }

      const professor = await Usuario.findOne({
        _id: item.professor_id,
        escola_id: req.usuario.escola_id,
        tipo: 'professor',
        ativo: true
      });

      if (!professor) {
        return res.status(400).json({ sucesso: false, mensagem: 'Professor inválido' });
      }

      const disciplinasProf = disciplinasDoProfessor(professor);
      if (disciplinasProf.length && !disciplinasProf.includes(item.disciplina)) {
        return res.status(400).json({
          sucesso: false,
          mensagem: `${professor.nome} não leciona ${item.disciplina}`
        });
      }

      if (!disciplinaPermitidaParaTurma(item.disciplina, turma)) {
        return res.status(400).json({
          sucesso: false,
          mensagem: `${item.disciplina} não é ofertada para a turma ${turma.nome}`
        });
      }
    }

    await HorarioAula.deleteMany({ turma_id: turma._id, turno: turnoFinal });

    if (lista.length) {
      await HorarioAula.insertMany(lista.map(item => ({
        escola_id: req.usuario.escola_id,
        turma_id: turma._id,
        professor_id: item.professor_id,
        disciplina: formatarNomeDisciplina(item.disciplina),
        diaSemana: item.diaSemana,
        horaInicio: item.horaInicio,
        turno: turnoFinal
      })));
    }

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'ATUALIZAR_HORARIOS',
      modulo: 'horarios',
      descricao: `Horários da turma ${turma.nome} (${turnoFinal}) atualizados`,
      ipAddress: req.ip
    });

    const salvos = await HorarioAula.find({ turma_id: turma._id, turno: turnoFinal })
      .populate('professor_id', 'nome disciplina disciplinas');

    res.json({ sucesso: true, mensagem: 'Horários salvos', horarios: salvos });
  } catch (error) {
    console.error('Erro ao salvar horários:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar horários' });
  }
});

module.exports = router;
