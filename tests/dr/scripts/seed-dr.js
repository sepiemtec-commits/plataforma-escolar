#!/usr/bin/env node
/**
 * Seed sintético TOKEN 12 — banco DR isolado (porta 27018).
 * Gera fingerprint JSON para validação pós-restauração.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const URI = process.env.DR_MONGODB_URI || 'mongodb://127.0.0.1:27018/veho_dr';
const OUT = path.join(__dirname, '../results');
const DOCS_DIR = path.join(__dirname, '../fixtures/documentos');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  await mongoose.connect(URI);
  const {
    Escola,
    Usuario,
    Turma,
    Avaliacao,
    Presenca,
    Responsavel,
    DocumentoArquivo,
    Desempenho
  } = require('../../../backend/database/schema');

  await mongoose.connection.dropDatabase();

  const escola = await Escola.create({
    nome: 'Escola DR Token12',
    cnpj: '12345678000199',
    ativo: true,
    configuracao: { anoLetivo: 2026 }
  });

  const senha = 'DrSenhaForte99';

  const diretor = await Usuario.create({
    nome: 'Diretor DR',
    email: 'diretor.dr@veho.test',
    senha,
    tipo: 'diretor',
    ativo: true,
    escola_id: escola._id,
    cpf: '11122233344'
  });

  const professor = await Usuario.create({
    nome: 'Professor DR',
    email: 'prof.dr@veho.test',
    senha,
    tipo: 'professor',
    ativo: true,
    escola_id: escola._id,
    cpf: '22233344455',
    disciplina: 'Matemática',
    disciplinas: ['Matemática']
  });

  const alunos = [];
  for (let i = 1; i <= 5; i++) {
    alunos.push(
      await Usuario.create({
        nome: `Aluno DR ${i}`,
        email: `aluno.dr.${i}@veho.test`,
        senha,
        tipo: 'aluno',
        ativo: true,
        escola_id: escola._id,
        cpf: String(30000000000 + i).slice(0, 11),
        matriculaNumero: 12000 + i
      })
    );
  }

  const responsavel = await Usuario.create({
    nome: 'Responsavel DR',
    email: 'resp.dr@veho.test',
    senha,
    tipo: 'responsavel',
    ativo: true,
    escola_id: escola._id,
    cpf: '44455566677',
    whatsapp: '11977776666'
  });

  await Responsavel.create({
    usuario_id: responsavel._id,
    aluno_id: alunos[0]._id,
    grau_parentesco: 'mae',
    whatsapp: '11977776666'
  });

  const turma = await Turma.create({
    nome: '5º Ano DR',
    serie: 'A',
    ano: 5,
    nivel: 'Fundamental I',
    turno: 'Manhã',
    escola_id: escola._id,
    professor_id: professor._id,
    alunos: alunos.map((a) => a._id)
  });

  const notas = [];
  const freqs = [];
  const boletins = [];

  for (const aluno of alunos) {
    const av = await Avaliacao.create({
      aluno_id: aluno._id,
      professor_id: professor._id,
      turma_id: turma._id,
      disciplina: 'Matemática',
      tipo: 'prova_bimestral',
      periodo: '1º Bimestre',
      nota: 7 + (aluno.matriculaNumero % 3),
      dataAplicacao: new Date('2026-03-20')
    });
    notas.push(av);

    const pr = await Presenca.create({
      aluno_id: aluno._id,
      turma_id: turma._id,
      professor_id: professor._id,
      disciplina: 'Matemática',
      tempo: 1,
      data: new Date('2026-03-20'),
      status: aluno.matriculaNumero % 2 === 0 ? 'falta' : 'presente'
    });
    freqs.push(pr);

    const des = await Desempenho.create({
      aluno_id: aluno._id,
      turma_id: turma._id,
      disciplina: 'Matemática',
      periodo: '1º Bimestre',
      mediaGeral: av.nota,
      frequenciaPercentual: pr.status === 'presente' ? 100 : 0,
      totalFaltas: pr.status === 'falta' ? 1 : 0,
      totalAulas: 1,
      situacao: av.nota >= 6 ? 'aprovado' : 'recuperacao'
    });
    boletins.push(des);
  }

  // documento em disco + metadado
  const docPath = path.join(DOCS_DIR, `${escola._id}_${alunos[0]._id}_rg.txt`);
  const docContent = `TOKEN12_DOC_MARKER:${alunos[0].email}:${Date.now()}`;
  fs.writeFileSync(docPath, docContent);
  const docSha = crypto.createHash('sha256').update(docContent).digest('hex');

  const documento = await DocumentoArquivo.create({
    usuario_id: alunos[0]._id,
    escola_id: escola._id,
    categoria: 'aluno',
    tipo: 'rg',
    nomeOriginal: 'rg-aluno-dr.txt',
    nomeArquivo: path.basename(docPath),
    mimeType: 'text/plain',
    tamanho: Buffer.byteLength(docContent),
    caminho: docPath,
    enviadoPor: diretor._id
  });

  const fingerprint = {
    createdAt: new Date().toISOString(),
    uri: URI,
    marker: 'TOKEN12_DR_MARKER_v1',
    counts: {
      escolas: 1,
      usuarios: 2 + alunos.length + 1, // dir+prof+5alunos+resp
      alunos: alunos.length,
      turmas: 1,
      avaliacoes: notas.length,
      presencas: freqs.length,
      desempenhos: boletins.length,
      responsaveis: 1,
      documentos: 1
    },
    ids: {
      escolaId: String(escola._id),
      diretorId: String(diretor._id),
      professorId: String(professor._id),
      alunoIds: alunos.map((a) => String(a._id)),
      turmaId: String(turma._id),
      responsavelId: String(responsavel._id),
      documentoId: String(documento._id),
      avaliacaoIds: notas.map((n) => String(n._id)),
      presencaIds: freqs.map((p) => String(p._id))
    },
    samples: {
      alunoEmail: alunos[0].email,
      notaAluno1: notas[0].nota,
      freqAluno1: freqs[0].status,
      docSha256: docSha,
      docPath,
      turmaAlunos: alunos.length,
      vinculoRespAluno: String(alunos[0]._id)
    }
  };

  fs.writeFileSync(path.join(OUT, 'fingerprint.json'), JSON.stringify(fingerprint, null, 2));
  console.log('✓ Seed DR', fingerprint.counts);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
