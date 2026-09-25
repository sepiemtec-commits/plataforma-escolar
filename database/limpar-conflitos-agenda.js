/**
 * Remove conflitos existentes: aluno em várias turmas, professor em 2 aulas no mesmo horário,
 * presença com mesmo tempo/dia em disciplinas diferentes. Recria índices.
 * Uso: node database/limpar-conflitos-agenda.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const {
  Escola,
  Turma,
  Presenca,
  HorarioAula
} = require('../backend/database/schema');

async function limpar() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar');
  console.log('📌 Conectado');

  const escola = await Escola.findOne({ cnpj: '12.345.678/0001-00' });
  if (!escola) throw new Error('Escola não encontrada');

  // 1) Aluno em uma única turma (mantém a primeira encontrada)
  const turmas = await Turma.find({ escola_id: escola._id }).select('_id nome alunos');
  const visto = new Map();
  let removidosTurma = 0;
  for (const turma of turmas) {
    const manter = [];
    for (const id of turma.alunos || []) {
      const key = String(id);
      if (visto.has(key)) {
        removidosTurma += 1;
        continue;
      }
      visto.set(key, turma._id);
      manter.push(id);
    }
    if (manter.length !== (turma.alunos || []).length) {
      turma.alunos = manter;
      await turma.save();
    }
  }
  console.log(`✓ Alunos removidos de turmas duplicadas: ${removidosTurma}`);

  // 2) Conflitos de professor no quadro — mantém o primeiro, apaga os demais
  const horarios = await HorarioAula.find({ escola_id: escola._id })
    .sort({ dataCriacao: 1 })
    .lean();
  const slotProf = new Set();
  const apagarHorarios = [];
  for (const h of horarios) {
    const chave = `${h.professor_id}|${h.diaSemana}|${h.horaInicio}|${h.turno}`;
    if (slotProf.has(chave)) {
      apagarHorarios.push(h._id);
    } else {
      slotProf.add(chave);
    }
  }
  if (apagarHorarios.length) {
    await HorarioAula.deleteMany({ _id: { $in: apagarHorarios } });
  }
  console.log(`✓ Aulas removidas por conflito de professor: ${apagarHorarios.length}`);

  // 3) Presenças conflitantes (mesmo aluno + dia + tempo, disciplinas diferentes)
  const conflitos = await Presenca.aggregate([
    {
      $group: {
        _id: {
          aluno_id: '$aluno_id',
          tempo: '$tempo',
          dia: { $dateToString: { format: '%Y-%m-%d', date: '$data' } }
        },
        ids: { $push: '$_id' },
        n: { $sum: 1 }
      }
    },
    { $match: { n: { $gt: 1 } } }
  ]);

  let apagarPresenca = 0;
  for (const c of conflitos) {
    const manter = c.ids[0];
    const resto = c.ids.slice(1);
    if (resto.length) {
      const r = await Presenca.deleteMany({ _id: { $in: resto } });
      apagarPresenca += r.deletedCount || 0;
    }
    // unused keep var silence
    void manter;
  }
  console.log(`✓ Presenças duplicadas/conflitantes removidas: ${apagarPresenca}`);

  // 4) Recriar índices (troca o antigo aluno+turma+disc+tempo pelo novo aluno+data+tempo)
  console.log('⏳ Sincronizando índices...');
  await Presenca.syncIndexes();
  await HorarioAula.syncIndexes();
  console.log('✓ Índices sincronizados');

  const multiTurma = await Turma.aggregate([
    { $match: { escola_id: escola._id } },
    { $unwind: '$alunos' },
    { $group: { _id: '$alunos', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);
  console.log(`✓ Alunos ainda em >1 turma: ${multiTurma.length}`);

  await mongoose.disconnect();
  console.log('✅ Limpeza concluída');
}

limpar().catch(async (err) => {
  console.error('❌', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
