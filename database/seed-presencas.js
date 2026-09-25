/**
 * Simula presenças e faltas com base no quadro de horários (sem conflito de tempos).
 * Uso: node database/seed-presencas.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const {
  Escola,
  Turma,
  Presenca,
  HorarioAula
} = require('../backend/database/schema');
const { tempoDoSlot } = require('../backend/utils/conflitosAgenda');

const DIAS_POR_BIMESTRE = 3;
const TAXA_PRESENCA = 0.88; // ~12% faltas

function intervalosBimestres(ano) {
  return [
    { num: 1, inicio: new Date(ano, 1, 1), fim: new Date(ano, 4, 1) },
    { num: 2, inicio: new Date(ano, 4, 1), fim: new Date(ano, 7, 1) },
    { num: 3, inicio: new Date(ano, 7, 1), fim: new Date(ano, 9, 1) },
    { num: 4, inicio: new Date(ano, 9, 1), fim: new Date(ano + 1, 0, 1) }
  ];
}

function listarDiasUteisNoIntervalo(inicio, fim, qtd) {
  const dias = [];
  const cursor = new Date(inicio);
  cursor.setHours(12, 0, 0, 0);
  const limite = new Date(fim);
  limite.setHours(0, 0, 0, 0);

  while (cursor < limite && dias.length < qtd) {
    const diaSemana = cursor.getDay();
    if (diaSemana >= 1 && diaSemana <= 5) {
      dias.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function listarDiasUteisPorBimestre(ano, qtdPorBimestre = DIAS_POR_BIMESTRE) {
  const dias = [];
  for (const bim of intervalosBimestres(ano)) {
    dias.push(...listarDiasUteisNoIntervalo(bim.inicio, bim.fim, qtdPorBimestre));
  }
  dias.sort((a, b) => a - b);
  return dias;
}

async function inserirEmLotes(docs, tamanho = 1000) {
  let total = 0;
  for (let i = 0; i < docs.length; i += tamanho) {
    const lote = docs.slice(i, i + tamanho);
    await Presenca.insertMany(lote, { ordered: false }).catch((err) => {
      if (err.code !== 11000 && !(err.writeErrors || []).every(e => e.code === 11000)) {
        throw err;
      }
    });
    total += lote.length;
    if (total % 20000 === 0 || total >= docs.length) {
      console.log(`  … ${Math.min(total, docs.length)}/${docs.length}`);
    }
  }
  return total;
}

async function simularPresencas() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar');
  console.log('📌 Conectado ao MongoDB');

  const escola = await Escola.findOne({ cnpj: '12.345.678/0001-00' });
  if (!escola) throw new Error('Escola não encontrada. Rode npm run seed e npm run seed:massa antes.');

  const turmas = await Turma.find({ escola_id: escola._id }).populate('alunos', '_id');

  // Grade real: um slot (tempo) = uma disciplina — sem sobreposição
  const horarios = await HorarioAula.find({ escola_id: escola._id })
    .select('turma_id disciplina diaSemana professor_id horaInicio turno');

  const aulasPorTurmaDia = {};
  horarios.forEach(h => {
    const tempo = tempoDoSlot(h.turno, h.horaInicio);
    if (!tempo) return;
    const key = `${h.turma_id}|${h.diaSemana}`;
    if (!aulasPorTurmaDia[key]) aulasPorTurmaDia[key] = [];
    // protege contra grade inconsistente
    if (aulasPorTurmaDia[key].some(a => a.tempo === tempo)) return;
    aulasPorTurmaDia[key].push({
      disciplina: h.disciplina,
      professor_id: h.professor_id,
      tempo
    });
  });

  const anoLetivo = new Date().getFullYear();
  const dias = listarDiasUteisPorBimestre(anoLetivo, DIAS_POR_BIMESTRE);
  console.log(`⏳ Simulando presença em ${dias.length} dias úteis nos 4 bimestres de ${anoLetivo}...`);
  if (dias.length) {
    console.log(`   (${dias[0].toLocaleDateString('pt-BR')} a ${dias[dias.length - 1].toLocaleDateString('pt-BR')})`);
  }

  const turmaIds = turmas.map(t => t._id);
  const inicioAno = new Date(anoLetivo, 1, 1);
  inicioAno.setHours(0, 0, 0, 0);
  const fimAno = new Date(anoLetivo + 1, 0, 1);
  fimAno.setHours(0, 0, 0, 0);
  await Presenca.deleteMany({
    turma_id: { $in: turmaIds },
    data: { $gte: inicioAno, $lt: fimAno }
  });
  console.log('🧹 Presenças do ano letivo removidas antes da nova simulação.');

  const docs = [];
  const chaveUnica = new Set();
  let faltas = 0;
  let presentes = 0;
  let semGrade = 0;

  for (const turma of turmas) {
    const alunos = turma.alunos || [];
    if (!alunos.length) continue;

    for (const data of dias) {
      const diaSemanaHorario = data.getDay() - 1; // 0=segunda
      if (diaSemanaHorario < 0 || diaSemanaHorario > 4) continue;

      const aulas = aulasPorTurmaDia[`${turma._id}|${diaSemanaHorario}`] || [];
      if (!aulas.length) {
        semGrade += 1;
        continue;
      }

      const dataDia = new Date(data);
      dataDia.setHours(0, 0, 0, 0);

      for (const aula of aulas) {
        if (!aula.professor_id) continue;

        for (const aluno of alunos) {
          const chave = `${aluno._id}|${dataDia.toISOString()}|${aula.tempo}`;
          if (chaveUnica.has(chave)) continue;
          chaveUnica.add(chave);

          const status = Math.random() < TAXA_PRESENCA ? 'presente' : 'falta';
          if (status === 'presente') presentes++;
          else faltas++;

          docs.push({
            aluno_id: aluno._id,
            turma_id: turma._id,
            professor_id: aula.professor_id,
            disciplina: aula.disciplina,
            tempo: aula.tempo,
            data: dataDia,
            status,
            observacoes: status === 'falta' ? 'Falta simulada' : '',
            notificadoWhatsapp: false
          });
        }
      }
    }
  }

  console.log(`⏳ Inserindo ${docs.length} registros de presença (sem conflito de tempo)...`);
  if (semGrade) console.log(`ℹ ${semGrade} dia(s)/turma sem grade — ignorados`);
  await inserirEmLotes(docs, 1000);

  const taxa = docs.length ? ((presentes / docs.length) * 100).toFixed(1) : '0';
  console.log(`✓ Presenças: ${presentes} | Faltas: ${faltas} | Taxa presença: ${taxa}%`);
  console.log('✅ Simulação de chamada concluída!');
}

simularPresencas()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('❌ Erro ao simular presenças:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
