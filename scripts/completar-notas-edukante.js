#!/usr/bin/env node
/**
 * Completa disciplinas e notas do Aluno Teste Edukante (aluno1@escola.com).
 * Uso:
 *   node scripts/completar-notas-edukante.js
 *   MONGODB_URI="mongodb+srv://..." node scripts/completar-notas-edukante.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const {
  Usuario,
  Turma,
  Avaliacao,
  DisciplinaConfig,
  Escola
} = require('../backend/database/schema');
const { connectMongo } = require('../backend/utils/mongoConnect');

const EMAIL_ALUNO = 'aluno1@escola.com';
const BIMESTRES = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];

/** Disciplinas adequadas ao 5º ano (Fundamental) + as já usadas no seed */
const DISCIPLINAS = [
  'Português',
  'Matemática',
  'Ciências',
  'História',
  'Geografia',
  'Educação Física',
  'Artes',
  'Inglês',
  'Biologia' // mantém o que já existia no demo
];

/** Notas base por bimestre [AV1/prova, AV2/teste] — estáveis (sem random) */
const NOTAS_BIM = [
  [8.5, 7.0],
  [6.0, 6.5],
  [7.0, 7.5],
  [7.5, 8.0]
];

/** Pequeno deslocamento por disciplina para variar o dashboard */
const OFFSET = {
  Português: 0.2,
  Matemática: 0.1,
  Ciências: -0.2,
  História: 0.3,
  Geografia: -0.1,
  'Educação Física': 0.5,
  Artes: 0.4,
  Inglês: -0.3,
  Biologia: 0
};

function clampNota(n) {
  return Math.round(Math.min(10, Math.max(0, n)) * 100) / 100;
}

async function upsertAvaliacao(doc) {
  const filtro = {
    aluno_id: doc.aluno_id,
    disciplina: doc.disciplina,
    periodo: doc.periodo,
    tipo: doc.tipo
  };
  const existing = await Avaliacao.findOne(filtro);
  if (existing) {
    existing.nota = doc.nota;
    existing.peso = doc.peso;
    existing.professor_id = doc.professor_id;
    existing.turma_id = doc.turma_id;
    existing.dataAplicacao = doc.dataAplicacao;
    await existing.save();
    return 'updated';
  }
  await Avaliacao.create(doc);
  return 'created';
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar';
  await connectMongo(mongoose, uri);
  console.log('DB:', mongoose.connection.name);

  const aluno = await Usuario.findOne({ email: EMAIL_ALUNO, tipo: 'aluno' });
  if (!aluno) {
    throw new Error(`Aluno ${EMAIL_ALUNO} não encontrado. Rode o seed antes.`);
  }

  const turma =
    (await Turma.findOne({ alunos: aluno._id })) ||
    (await Turma.findOne({ nome: '5º Ano A', escola_id: aluno.escola_id }));
  if (!turma) throw new Error('Turma do aluno não encontrada');

  const professor =
    (turma.professor_id && (await Usuario.findById(turma.professor_id))) ||
    (await Usuario.findOne({ email: 'professor@escola.com', tipo: 'professor' }));

  if (!professor) throw new Error('Professor não encontrado');

  const escola = await Escola.findById(aluno.escola_id);
  if (escola) {
    for (const nome of DISCIPLINAS) {
      const existe = await DisciplinaConfig.findOne({ escola_id: escola._id, nome });
      if (!existe) {
        await DisciplinaConfig.create({
          escola_id: escola._id,
          nome,
          quantidadeTempos: 2
        });
        console.log('  + DisciplinaConfig:', nome);
      }
    }
  }

  let created = 0;
  let updated = 0;

  for (const disciplina of DISCIPLINAS) {
    const off = OFFSET[disciplina] || 0;
    for (let b = 0; b < BIMESTRES.length; b++) {
      const periodo = BIMESTRES[b];
      const [provaBase, testeBase] = NOTAS_BIM[b];
      const prova = clampNota(provaBase + off);
      const teste = clampNota(testeBase + off);

      const r1 = await upsertAvaliacao({
        aluno_id: aluno._id,
        professor_id: professor._id,
        turma_id: turma._id,
        disciplina,
        tipo: 'prova_bimestral',
        periodo,
        nota: prova,
        peso: 2,
        dataAplicacao: new Date()
      });
      const r2 = await upsertAvaliacao({
        aluno_id: aluno._id,
        professor_id: professor._id,
        turma_id: turma._id,
        disciplina,
        tipo: 'teste_bimestral',
        periodo,
        nota: teste,
        peso: 1,
        dataAplicacao: new Date()
      });
      if (r1 === 'created') created += 1;
      else updated += 1;
      if (r2 === 'created') created += 1;
      else updated += 1;
    }
    console.log(`✓ ${disciplina} — 4 bimestres (AV1/AV2)`);
  }

  const total = await Avaliacao.countDocuments({ aluno_id: aluno._id });
  console.log(`\nAluno: ${aluno.nome}`);
  console.log(`Avaliações totais: ${total} (criadas ${created}, atualizadas ${updated})`);
  console.log('Disciplinas:', DISCIPLINAS.join(', '));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
