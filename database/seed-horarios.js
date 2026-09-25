/**
 * Remonta o quadro de horários completo, priorizando os logins de teste.
 * Uso: node database/seed-horarios.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const {
  Usuario,
  Escola,
  Turma,
  HorarioAula
} = require('../backend/database/schema');
const { DISCIPLINAS_PADRAO, disciplinasPadraoPorTurma } = require('../backend/constants/disciplinas');
const { slotsDoTurno } = require('../backend/constants/horarios');

const DIAS_UTEIS = [0, 1, 2, 3, 4];

function slug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function montarProfessoresPorDisc(escolaId) {
  const professoresPorDisc = {};

  for (const disciplina of DISCIPLINAS_PADRAO) {
    const lista = [];

    // Prioriza logins de teste conhecidos
    if (disciplina === 'Matemática' || disciplina === 'Física') {
      const principal = await Usuario.findOne({ email: 'professor@escola.com', escola_id: escolaId });
      if (principal) lista.push(principal);
    }
    if (disciplina === 'Português') {
      const principal = await Usuario.findOne({ email: 'prof2@escola.com', escola_id: escolaId });
      if (principal) lista.push(principal);
    }

    for (let i = 1; i <= 2; i++) {
      const email = `prof.${slug(disciplina)}.${i}@escola.com`;
      const prof = await Usuario.findOne({ email, escola_id: escolaId, tipo: 'professor' });
      if (prof && !lista.some(p => String(p._id) === String(prof._id))) {
        lista.push(prof);
      }
    }

    // fallback: qualquer professor da disciplina
    if (lista.length < 2) {
      const extras = await Usuario.find({
        escola_id: escolaId,
        tipo: 'professor',
        ativo: true,
        $or: [{ disciplina }, { disciplinas: disciplina }]
      });
      for (const prof of extras) {
        if (!lista.some(p => String(p._id) === String(prof._id))) lista.push(prof);
        if (lista.length >= 2) break;
      }
    }

    professoresPorDisc[disciplina] = lista;
  }

  return professoresPorDisc;
}

async function popularHorarios() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar');
  console.log('📌 Conectado ao MongoDB');

  const escola = await Escola.findOne({ cnpj: '12.345.678/0001-00' });
  if (!escola) throw new Error('Escola não encontrada');

  // Garante disciplinas dos logins de teste
  await Usuario.updateOne(
    { email: 'professor@escola.com' },
    { $set: { disciplina: 'Matemática', disciplinas: ['Matemática', 'Física'], cargaHorariaSemanal: 20, ativo: true } }
  );
  await Usuario.updateOne(
    { email: 'prof2@escola.com' },
    { $set: { disciplina: 'Português', disciplinas: ['Português'], cargaHorariaSemanal: 20, ativo: true } }
  );

  const professoresPorDisc = await montarProfessoresPorDisc(escola._id);
  const turmas = await Turma.find({ escola_id: escola._id }).sort({ nivel: 1, ano: 1, nome: 1 });

  await HorarioAula.deleteMany({ escola_id: escola._id });

  const ocupacaoProfessor = new Set();
  const horariosDocs = [];
  const contagemProf = {};

  for (const turma of turmas) {
    const turnoBase = turma.turno || 'Manhã';
    const turnos = turnoBase === 'Integral' ? ['Manhã', 'Tarde'] : [turnoBase];
    const disciplinasTurma = disciplinasPadraoPorTurma(turma);
    if (!disciplinasTurma.length) continue;

    for (const turno of turnos) {
      const slots = slotsDoTurno(turno);
      let discIdx = 0;

      for (const dia of DIAS_UTEIS) {
        for (const horaInicio of slots) {
          let alocado = false;

          for (let tentativa = 0; tentativa < disciplinasTurma.length && !alocado; tentativa++) {
            const disciplina = disciplinasTurma[(discIdx + tentativa) % disciplinasTurma.length];
            const candidatos = professoresPorDisc[disciplina] || [];

            // Round-robin: escolhe o menos carregado disponível no horário
            const ordenados = [...candidatos].sort((a, b) =>
              (contagemProf[String(a._id)] || 0) - (contagemProf[String(b._id)] || 0)
            );

            for (const prof of ordenados) {
              const chave = `${prof._id}|${dia}|${horaInicio}|${turno}`;
              if (ocupacaoProfessor.has(chave)) continue;

              ocupacaoProfessor.add(chave);
              contagemProf[String(prof._id)] = (contagemProf[String(prof._id)] || 0) + 1;
              horariosDocs.push({
                escola_id: escola._id,
                turma_id: turma._id,
                professor_id: prof._id,
                disciplina,
                diaSemana: dia,
                horaInicio,
                turno
              });
              alocado = true;
              break;
            }
          }

          // Sem fallback com conflito: deixa o slot vazio se não houver professor livre
          if (!alocado) {
            // slot sem professor disponível — não gera conflito
          }

          discIdx += 1;
        }
      }
    }
  }

  for (let i = 0; i < horariosDocs.length; i += 500) {
    await HorarioAula.insertMany(horariosDocs.slice(i, i + 500), { ordered: false });
  }

  const profTeste = await Usuario.findOne({ email: 'professor@escola.com' });
  const prof2 = await Usuario.findOne({ email: 'prof2@escola.com' });
  const n1 = profTeste ? await HorarioAula.countDocuments({ professor_id: profTeste._id }) : 0;
  const n2 = prof2 ? await HorarioAula.countDocuments({ professor_id: prof2._id }) : 0;

  console.log(`✓ Quadro remontado: ${horariosDocs.length} aulas`);
  console.log(`✓ professor@escola.com: ${n1} tempos`);
  console.log(`✓ prof2@escola.com: ${n2} tempos`);
  console.log('✅ Horários completos gerados');
}

popularHorarios()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('❌ Erro:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
