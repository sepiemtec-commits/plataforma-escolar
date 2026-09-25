// backend/utils/conflitosAgenda.js — Impede sobreposição de horários, turmas e tempos
const { HorarioAula, Turma, Presenca, Usuario } = require('../database/schema');
const { slotsDoTurno, DIAS_SEMANA } = require('../constants/horarios');

function chaveSlot(diaSemana, horaInicio, turno) {
  return `${diaSemana}|${horaInicio}|${turno}`;
}

function rotuloDia(diaSemana) {
  return DIAS_SEMANA[diaSemana] || `dia ${diaSemana}`;
}

/**
 * Valida grade da turma antes de salvar.
 * - Sem slots duplicados na própria turma
 * - Professor não pode estar em outra turma no mesmo dia/hora/turno
 */
async function validarGradeHorarios({ escolaId, turmaId, turno, horarios }) {
  const lista = Array.isArray(horarios) ? horarios : [];
  const slotsTurma = new Set();
  const slotsProfessorPayload = new Map(); // chave -> disciplina

  for (const item of lista) {
    const slotTurma = chaveSlot(item.diaSemana, item.horaInicio, turno);
    if (slotsTurma.has(slotTurma)) {
      return {
        ok: false,
        mensagem: `Conflito na turma: ${rotuloDia(item.diaSemana)} às ${item.horaInicio} já tem aula`
      };
    }
    slotsTurma.add(slotTurma);

    const profId = String(item.professor_id);
    const slotProf = `${profId}|${slotTurma}`;
    if (slotsProfessorPayload.has(slotProf)) {
      return {
        ok: false,
        mensagem: `Conflito de professor no mesmo horário (${rotuloDia(item.diaSemana)} ${item.horaInicio})`
      };
    }
    slotsProfessorPayload.set(slotProf, item.disciplina);
  }

  if (!lista.length) return { ok: true };

  const professorIds = [...new Set(lista.map(h => String(h.professor_id)))];
  const existentes = await HorarioAula.find({
    escola_id: escolaId,
    professor_id: { $in: professorIds },
    turma_id: { $ne: turmaId },
    turno
  })
    .populate('turma_id', 'nome')
    .populate('professor_id', 'nome')
    .lean();

  const ocupacao = new Map();
  existentes.forEach(h => {
    ocupacao.set(
      `${String(h.professor_id?._id || h.professor_id)}|${chaveSlot(h.diaSemana, h.horaInicio, h.turno)}`,
      h
    );
  });

  for (const item of lista) {
    const chave = `${String(item.professor_id)}|${chaveSlot(item.diaSemana, item.horaInicio, turno)}`;
    const choque = ocupacao.get(chave);
    if (choque) {
      const nomeProf = choque.professor_id?.nome || 'Professor';
      const nomeTurma = choque.turma_id?.nome || 'outra turma';
      return {
        ok: false,
        mensagem:
          `Conflito: ${nomeProf} já está em ${nomeTurma} ` +
          `(${rotuloDia(item.diaSemana)} às ${item.horaInicio}). ` +
          `Um professor não pode dar aula em duas turmas no mesmo horário.`
      };
    }
  }

  return { ok: true };
}

/**
 * Garante que o aluno fique em apenas uma turma da escola.
 * Remove de qualquer outra turma antes de matricular.
 */
async function matricularAlunoUmaTurma({ escolaId, alunoId, turmaId }) {
  if (!alunoId || !turmaId) return { ok: false, mensagem: 'Aluno e turma são obrigatórios' };

  const { withLock } = require('./concurrencyLock');

  return withLock(`matricula:${escolaId}:${alunoId}`, async () => {
    const aluno = await Usuario.findOne({ _id: alunoId, tipo: 'aluno', escola_id: escolaId }).select('_id nome');
    if (!aluno) return { ok: false, mensagem: 'Aluno não encontrado' };

    const turma = await Turma.findOne({ _id: turmaId, escola_id: escolaId }).select('_id nome turno');
    if (!turma) return { ok: false, mensagem: 'Turma não encontrada' };

    await Turma.updateMany(
      { escola_id: escolaId, alunos: alunoId, _id: { $ne: turmaId } },
      { $pull: { alunos: alunoId } }
    );

    await Turma.findByIdAndUpdate(turmaId, { $addToSet: { alunos: alunoId } });
    if (turma.turno) {
      await Usuario.findByIdAndUpdate(alunoId, { turno: turma.turno });
    }

    // Consistência: garantir que não restou em outra turma após corrida residual
    await Turma.updateMany(
      { escola_id: escolaId, alunos: alunoId, _id: { $ne: turmaId } },
      { $pull: { alunos: alunoId } }
    );

    return { ok: true, turma, aluno };
  });
}

/**
 * Impede o mesmo aluno (ou a mesma turma) ter duas disciplinas no mesmo tempo do dia.
 * tempo = período global da grade (1º, 2º, 3º...).
 */
async function validarConflitoPresencaTempo({
  alunoId,
  turmaId,
  dataInicio,
  dataFim,
  tempo,
  disciplinaNome
}) {
  const tempoNum = Number(tempo);
  if (!tempoNum || tempoNum < 1) {
    return { ok: false, mensagem: 'Informe o tempo da aula' };
  }

  const conflitoAluno = await Presenca.findOne({
    aluno_id: alunoId,
    tempo: tempoNum,
    data: { $gte: dataInicio, $lt: dataFim },
    disciplina: { $ne: disciplinaNome }
  })
    .select('disciplina tempo')
    .lean();

  if (conflitoAluno) {
    return {
      ok: false,
      mensagem:
        `Conflito de horário do aluno: no ${tempoNum}º tempo já há ` +
        `${conflitoAluno.disciplina}. Não é possível lançar ${disciplinaNome} no mesmo tempo.`
    };
  }

  const conflitoTurma = await Presenca.findOne({
    turma_id: turmaId,
    tempo: tempoNum,
    data: { $gte: dataInicio, $lt: dataFim },
    disciplina: { $ne: disciplinaNome }
  })
    .select('disciplina tempo')
    .lean();

  if (conflitoTurma) {
    return {
      ok: false,
      mensagem:
        `Conflito de horário da turma: o ${tempoNum}º tempo já está ocupado por ` +
        `${conflitoTurma.disciplina}. Não é possível lançar ${disciplinaNome} neste tempo.`
    };
  }

  return { ok: true };
}

/** Índice do slot no turno → número do tempo (1-based). */
function tempoDoSlot(turno, horaInicio) {
  const slots = slotsDoTurno(turno);
  const idx = slots.indexOf(horaInicio);
  return idx >= 0 ? idx + 1 : null;
}

module.exports = {
  validarGradeHorarios,
  matricularAlunoUmaTurma,
  validarConflitoPresencaTempo,
  tempoDoSlot,
  chaveSlot,
  rotuloDia
};
