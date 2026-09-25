/**
 * Seed de massa: 25 alunos/turma, notas completas (~2% reprovação),
 * 2 professores/disciplina, quadro de horários completo e quadro de funcionários.
 *
 * Uso: node database/seed-massa.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const {
  Usuario,
  Escola,
  Turma,
  Avaliacao,
  Desempenho,
  Responsavel,
  DisciplinaConfig,
  HorarioAula
} = require('../backend/database/schema');
const { DISCIPLINAS_PADRAO, disciplinasPadraoPorTurma } = require('../backend/constants/disciplinas');
const { slotsDoTurno } = require('../backend/constants/horarios');
const { obterSenhaSeed } = require('../backend/utils/senhaPadrao');

let SENHA_PADRAO = null;
const ALUNOS_POR_TURMA = 25;
const PROFESSORES_POR_DISCIPLINA = 2;
const TAXA_REPROVACAO = 0.02;
const PERIODOS = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
const TIPOS_NOTA = ['teste_bimestral', 'prova_bimestral', 'comportamental'];
const DIAS_UTEIS = [0, 1, 2, 3, 4]; // Segunda a Sexta

const NOMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karina', 'Lucas', 'Marina', 'Nicolas', 'Olivia', 'Pedro', 'Queila', 'Rafael', 'Sofia', 'Tiago',
  'Ursula', 'Vitor', 'Waleska', 'Xavier', 'Yasmin', 'Zeca', 'Alice', 'Bernardo', 'Camila', 'Daniel',
  'Eduarda', 'Fernando', 'Giovana', 'Heitor', 'Ingrid', 'Jonas', 'Larissa', 'Mateus', 'Natália', 'Otávio'
];
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes',
  'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Rocha', 'Almeida', 'Nascimento', 'Araújo', 'Melo', 'Barbosa'
];

const TEMPOS_DISC = {
  Matemática: 5,
  Português: 4,
  Ciências: 3,
  História: 2,
  Geografia: 2,
  'Educação Física': 3,
  Inglês: 2,
  Artes: 2,
  Espanhol: 2,
  Biologia: 3,
  Física: 3,
  Química: 3,
  Filosofia: 2,
  Sociologia: 2
};

function slug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function nomeAleatorio(i) {
  const n = NOMES[i % NOMES.length];
  const s1 = SOBRENOMES[i % SOBRENOMES.length];
  const s2 = SOBRENOMES[(i * 3 + 7) % SOBRENOMES.length];
  return `${n} ${s1} ${s2}`;
}

function cpfDeSequencia(n) {
  const base = String(10000000000 + n).slice(-11);
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${base.slice(9)}`;
}

function whatsappDeSequencia(n) {
  const digitos = String(900000000 + (n % 100000000)).padStart(9, '0');
  return `+5511${digitos}`;
}

function notaAleatoria(reprovado) {
  if (reprovado) return Number((Math.random() * 4.5 + 0.5).toFixed(1)); // 0.5 a 5.0
  return Number((Math.random() * 4 + 6).toFixed(1)); // 6.0 a 10.0
}

async function inserirEmLotes(Model, docs, tamanho = 500) {
  let total = 0;
  for (let i = 0; i < docs.length; i += tamanho) {
    const lote = docs.slice(i, i + tamanho);
    if (!lote.length) continue;
    await Model.insertMany(lote, { ordered: false }).catch(async (err) => {
      if (err.code !== 11000 && err.writeErrors) {
        // ignora duplicatas em reexecução
        const naoDup = err.writeErrors.filter(e => e.code !== 11000);
        if (naoDup.length) throw err;
      } else if (err.code && err.code !== 11000) {
        throw err;
      }
    });
    total += lote.length;
  }
  return total;
}

async function garantirUsuario(filtro, dados, senhaHash) {
  let user = await Usuario.findOne(filtro);
  if (user) {
    const { senha, ...resto } = dados;
    await Usuario.updateOne({ _id: user._id }, {
      $set: {
        ...resto,
        senha: senhaHash,
        ativo: true,
        dataAtualizacao: new Date()
      }
    });
    return Usuario.findById(user._id);
  }
  // senha em texto: o hook pre('save') faz o hash
  return Usuario.create({ ...dados, senha: SENHA_PADRAO, ativo: true });
}

async function popularMassa() {
  SENHA_PADRAO = obterSenhaSeed();

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar');
  console.log('📌 Conectado ao MongoDB');

  const escola = await Escola.findOne({ cnpj: '12.345.678/0001-00' });
  if (!escola) {
    throw new Error('Escola não encontrada. Rode npm run seed primeiro.');
  }

  const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
  let seqCpf = 700000;

  // ---- Disciplinas ----
  for (const nome of DISCIPLINAS_PADRAO) {
    await DisciplinaConfig.updateOne(
      { escola_id: escola._id, nome },
      {
        $set: {
          quantidadeTempos: TEMPOS_DISC[nome] || 2,
          ativo: true
        }
      },
      { upsert: true }
    );
  }
  console.log(`✓ ${DISCIPLINAS_PADRAO.length} disciplinas configuradas`);

  // ---- 2 professores por disciplina ----
  const professoresPorDisc = {};
  for (const disciplina of DISCIPLINAS_PADRAO) {
    professoresPorDisc[disciplina] = [];

    if (disciplina === 'Matemática' || disciplina === 'Física') {
      const principal = await Usuario.findOne({ email: 'professor@escola.com', escola_id: escola._id });
      if (principal) professoresPorDisc[disciplina].push(principal);
    }
    if (disciplina === 'Português') {
      const principal = await Usuario.findOne({ email: 'prof2@escola.com', escola_id: escola._id });
      if (principal) professoresPorDisc[disciplina].push(principal);
    }

    for (let i = 1; i <= PROFESSORES_POR_DISCIPLINA; i++) {
      const email = `prof.${slug(disciplina)}.${i}@escola.com`;
      seqCpf += 1;
      const prof = await garantirUsuario(
        { email },
        {
          nome: `Prof. ${disciplina} ${i}`,
          email,
          cpf: cpfDeSequencia(seqCpf),
          whatsapp: whatsappDeSequencia(seqCpf),
          tipo: 'professor',
          escola_id: escola._id,
          disciplina,
          disciplinas: [disciplina],
          cargaHorariaSemanal: 20
        },
        senhaHash
      );
      if (!professoresPorDisc[disciplina].some(p => String(p._id) === String(prof._id))) {
        professoresPorDisc[disciplina].push(prof);
      }
    }
  }
  console.log(`✓ Professores por disciplina configurados (inclui logins de teste)`);

  // Mantém logins de teste conhecidos
  await Usuario.updateOne(
    { email: 'professor@escola.com' },
    { $set: { disciplina: 'Matemática', disciplinas: ['Matemática', 'Física'], cargaHorariaSemanal: 20 } }
  );
  await Usuario.updateOne(
    { email: 'prof2@escola.com' },
    { $set: { disciplina: 'Português', disciplinas: ['Português'], cargaHorariaSemanal: 20 } }
  );

  // ---- Staff solicitado ----
  const staffPlan = [
    ...Array.from({ length: 5 }, (_, i) => ({
      tipo: 'servente',
      email: `servente${i + 1}@escola.com`,
      nome: `Servente ${nomeAleatorio(i + 10)}`
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      tipo: 'secretaria',
      email: i === 0 ? 'secretaria@escola.com' : `secretaria${i + 1}@escola.com`,
      nome: i === 0 ? 'Sra. Paula Mendes' : `Secretária ${nomeAleatorio(i + 20)}`
    })),
    {
      tipo: 'bibliotecaria',
      email: 'bibliotecaria@escola.com',
      nome: `Bibliotecária ${nomeAleatorio(30)}`
    },
    {
      tipo: 'copeira',
      email: 'copeira@escola.com',
      nome: `Copeira ${nomeAleatorio(31)}`
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      tipo: 'auxiliar_coordenacao',
      email: `aux.coordenacao${i + 1}@escola.com`,
      nome: `Aux. Coordenação ${nomeAleatorio(i + 40)}`
    }))
  ];

  for (const item of staffPlan) {
    seqCpf += 1;
    await garantirUsuario(
      { email: item.email },
      {
        nome: item.nome,
        email: item.email,
        cpf: item.email === 'secretaria@escola.com' ? '666.666.666-66' : cpfDeSequencia(seqCpf),
        whatsapp: whatsappDeSequencia(seqCpf),
        tipo: item.tipo,
        escola_id: escola._id
      },
      senhaHash
    );
  }
  console.log('✓ Funcionários: 5 serventes, 4 secretárias, 1 bibliotecária, 1 copeira, 3 auxiliares de coordenação');

  // ---- Turmas: completar 25 alunos cada ----
  const turmas = await Turma.find({ escola_id: escola._id }).sort({ nivel: 1, ano: 1, nome: 1 });
  if (!turmas.length) {
    throw new Error('Nenhuma turma encontrada. Rode npm run seed primeiro.');
  }

  let matriculaBase = (await Usuario.find({ tipo: 'aluno' }).countDocuments()) + 1000;
  const avaliacoesDocs = [];
  const desempenhosDocs = [];
  const responsaveisDocs = [];
  let novosAlunos = 0;
  let totalAlunosSeed = 0;

  for (let tIdx = 0; tIdx < turmas.length; tIdx++) {
    const turma = turmas[tIdx];
    const atuais = (turma.alunos || []).map(id => String(id));
    const faltam = Math.max(0, ALUNOS_POR_TURMA - atuais.length);
    const alunosTurmaIds = [...atuais];

    if (faltam > 0) {
      const novos = [];
      for (let i = 0; i < faltam; i++) {
        seqCpf += 1;
        matriculaBase += 1;
        const idx = tIdx * ALUNOS_POR_TURMA + i + 1;
        const email = `aluno.t${tIdx + 1}.a${i + 1}@escola.com`;
        novos.push({
          nome: nomeAleatorio(idx),
          email,
          senha: senhaHash,
          cpf: cpfDeSequencia(seqCpf),
          whatsapp: whatsappDeSequencia(seqCpf),
          whatsapp_responsavel: whatsappDeSequencia(seqCpf + 500000),
          nome_responsavel: `Resp. ${nomeAleatorio(idx + 99)}`,
          tipo: 'aluno',
          escola_id: escola._id,
          matriculaNumero: matriculaBase,
          dataNascimento: new Date(2010 - (turma.ano || 5), (i % 12), (i % 27) + 1),
          sexo: i % 2 === 0 ? 'masculino' : 'feminino',
          endereco: 'Rua das Flores, 100',
          bairro: 'Centro',
          cidade: 'Recife',
          uf: 'PE',
          cep: '50000-000',
          turno: turma.turno || 'Manhã',
          filiacao_pai: `Pai ${nomeAleatorio(idx + 200)}`,
          filiacao_mae: `Mãe ${nomeAleatorio(idx + 300)}`,
          ativo: true
        });
      }

      const inseridos = await Usuario.insertMany(novos, { ordered: false }).catch(err => {
        if (err.insertedDocs) return err.insertedDocs;
        throw err;
      });
      const listaInseridos = Array.isArray(inseridos) ? inseridos : [];
      novosAlunos += listaInseridos.length;
      listaInseridos.forEach(a => alunosTurmaIds.push(String(a._id)));

      await Turma.updateOne(
        { _id: turma._id },
        { $set: { alunos: alunosTurmaIds } }
      );
    }

    // Recarrega IDs finais (pode já ter 25+)
    const turmaAtualizada = await Turma.findById(turma._id).select('alunos nome nivel ano turno');
    const idsFinais = (turmaAtualizada.alunos || []).slice(0, ALUNOS_POR_TURMA);
    if ((turmaAtualizada.alunos || []).length !== ALUNOS_POR_TURMA) {
      // Se tiver mais de 25, mantém todos; se menos, já completamos acima
    }
    const alunosIds = turmaAtualizada.alunos || [];
    totalAlunosSeed += alunosIds.length;

    const disciplinasTurma = disciplinasPadraoPorTurma(turmaAtualizada);
    const alunosDocs = await Usuario.find({ _id: { $in: alunosIds } })
      .select('_id nome whatsapp_responsavel');

    for (const aluno of alunosDocs) {
      responsaveisDocs.push({
        usuario_id: aluno._id,
        aluno_id: aluno._id,
        grau_parentesco: 'pai',
        whatsapp: aluno.whatsapp_responsavel || whatsappDeSequencia(seqCpf++),
        recebeNotificacoes: true
      });

      for (const disciplina of disciplinasTurma) {
        const reprovado = Math.random() < TAXA_REPROVACAO;
        let somaAnual = 0;

        for (const periodo of PERIODOS) {
          let somaPeriodo = 0;
          for (const tipo of TIPOS_NOTA) {
            const nota = notaAleatoria(reprovado);
            somaPeriodo += nota;
            avaliacoesDocs.push({
              aluno_id: aluno._id,
              professor_id: professoresPorDisc[disciplina][0]._id,
              turma_id: turma._id,
              disciplina,
              tipo,
              periodo,
              nota,
              peso: 1,
              dataAplicacao: new Date(2026, PERIODOS.indexOf(periodo) * 2 + 1, 15),
              observacoes: reprovado ? 'Abaixo da média' : ''
            });
          }
          const mediaPeriodo = somaPeriodo / TIPOS_NOTA.length;
          somaAnual += mediaPeriodo;

          desempenhosDocs.push({
            aluno_id: aluno._id,
            disciplina,
            turma_id: turma._id,
            periodo,
            mediaGeral: Number(mediaPeriodo.toFixed(2)),
            frequenciaPercentual: reprovado ? 70 : 90 + Math.floor(Math.random() * 10),
            totalFaltas: reprovado ? 8 : 2,
            totalAulas: 40,
            situacao: mediaPeriodo < 5 ? 'reprovado' : mediaPeriodo < 6 ? 'recuperacao' : mediaPeriodo >= 9 ? 'excelente' : 'aprovado',
            dataAtualizacao: new Date()
          });
        }

        const mediaAnual = somaAnual / PERIODOS.length;
        desempenhosDocs.push({
          aluno_id: aluno._id,
          disciplina,
          turma_id: turma._id,
          periodo: 'Anual',
          mediaGeral: Number(mediaAnual.toFixed(2)),
          frequenciaPercentual: reprovado ? 72 : 92,
          totalFaltas: reprovado ? 20 : 6,
          totalAulas: 160,
          situacao: mediaAnual < 5 ? 'reprovado' : mediaAnual < 6 ? 'recuperacao' : mediaAnual >= 9 ? 'excelente' : 'aprovado',
          dataAtualizacao: new Date()
        });
      }
    }

    console.log(`  · Turma ${turma.nome}: ${alunosIds.length} alunos, ${disciplinasTurma.length} disciplinas`);
  }

  console.log(`✓ Alunos: ${totalAlunosSeed} no total (${novosAlunos} novos para completar 25/turma)`);

  // Responsáveis (evita duplicar)
  let respCriados = 0;
  for (const r of responsaveisDocs) {
    const existe = await Responsavel.findOne({ aluno_id: r.aluno_id });
    if (!existe) {
      await Responsavel.create(r);
      respCriados++;
    }
  }
  console.log(`✓ Responsáveis criados/atualizados: ${respCriados}`);

  // Limpa avaliações/desempenho gerados por este seed (reexecução segura por professor seed)
  const profIdsSeed = DISCIPLINAS_PADRAO.flatMap(d => professoresPorDisc[d].map(p => p._id));
  await Avaliacao.deleteMany({ professor_id: { $in: profIdsSeed } });
  await Desempenho.deleteMany({
    turma_id: { $in: turmas.map(t => t._id) },
    disciplina: { $in: DISCIPLINAS_PADRAO }
  });

  console.log(`⏳ Inserindo ${avaliacoesDocs.length} avaliações...`);
  await inserirEmLotes(Avaliacao, avaliacoesDocs, 800);
  console.log(`✓ Avaliações inseridas`);

  console.log(`⏳ Inserindo ${desempenhosDocs.length} desempenhos...`);
  await inserirEmLotes(Desempenho, desempenhosDocs, 800);
  console.log(`✓ Desempenhos inseridos (~${(TAXA_REPROVACAO * 100).toFixed(0)}% reprovação)`);

  // ---- Quadro de horários completo ----
  console.log('⏳ Montando quadros de horários...');
  await HorarioAula.deleteMany({ escola_id: escola._id });

  const ocupacaoProfessor = new Set(); // `${profId}|${dia}|${hora}|${turno}`
  const horariosDocs = [];

  for (const turma of turmas) {
    const turno = turma.turno === 'Integral' ? 'Manhã' : (turma.turno || 'Manhã');
    const slots = slotsDoTurno(turno);
    const disciplinasTurma = disciplinasPadraoPorTurma(turma);
    if (!disciplinasTurma.length) continue;

    let discIdx = 0;
    for (const dia of DIAS_UTEIS) {
      for (const horaInicio of slots) {
        let alocado = false;
        for (let tentativa = 0; tentativa < disciplinasTurma.length && !alocado; tentativa++) {
          const disciplina = disciplinasTurma[(discIdx + tentativa) % disciplinasTurma.length];
          const candidatos = professoresPorDisc[disciplina] || [];
          for (const prof of candidatos) {
            const chave = `${prof._id}|${dia}|${horaInicio}|${turno}`;
            if (ocupacaoProfessor.has(chave)) continue;
            ocupacaoProfessor.add(chave);
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
        discIdx += 1;
        // Sem fallback com conflito: slot fica vazio se não houver professor livre
      }
    }
  }

  await inserirEmLotes(HorarioAula, horariosDocs, 500);
  console.log(`✓ Quadro de horários completo: ${horariosDocs.length} aulas alocadas`);

  console.log('\n✅ Seed de massa concluído!');
  console.log(`   Senha padrão dos novos usuários: ${SENHA_PADRAO}`);
  console.log(`   Login coordenador: coord@escola.com / ${SENHA_PADRAO}`);
  console.log(`   Login secretaria: secretaria@escola.com / ${SENHA_PADRAO}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  PRODUÇÃO: troque as senhas padrão após o seed.');
  }
}

popularMassa()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('❌ Erro no seed de massa:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
