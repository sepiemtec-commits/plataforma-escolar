/**
 * Teste de isolamento multi-escola (escola_id).
 * Cria 2 escolas temporárias, tenta acesso cruzado e limpa os dados.
 *
 * Uso: node scripts/test-isolamento-escola.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const { Escola, Usuario, Turma, HistoricoEscolar, Avaliacao, Presenca, Conteudo } = require('../backend/database/schema');

const BASE = process.env.TEST_API_URL || 'http://localhost:3000/api';
const SENHA = 'senhaTeste123';

const api = axios.create({
  baseURL: BASE,
  validateStatus: () => true
});

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email) {
  const res = await api.post('/auth/login', { email, senha: SENHA });
  assert(res.status === 200 && res.data.token, `Login falhou para ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.token;
}

async function criarEscola(sufixo) {
  const stamp = Date.now().toString(36);
  const escola = await Escola.create({
    nome: `Escola Teste Isolamento ${sufixo}`,
    cnpj: `${stamp}${sufixo}`.slice(0, 14).padEnd(14, '0')
  });

  const diretor = await Usuario.create({
    nome: `Diretor ${sufixo}`,
    email: `dir.iso.${sufixo}.${stamp}@teste.local`,
    senha: SENHA,
    cpf: `9${stamp}${sufixo}`.replace(/\D/g, '').slice(0, 11).padEnd(11, '1'),
    whatsapp: '11999990001',
    tipo: 'diretor',
    escola_id: escola._id,
    ativo: true
  });

  const aluno = await Usuario.create({
    nome: `Aluno ${sufixo}`,
    email: `aluno.iso.${sufixo}.${stamp}@teste.local`,
    senha: SENHA,
    cpf: `8${stamp}${sufixo}`.replace(/\D/g, '').slice(0, 11).padEnd(11, '2'),
    whatsapp: '11999990002',
    tipo: 'aluno',
    escola_id: escola._id,
    ativo: true
  });

  const professor = await Usuario.create({
    nome: `Professor ${sufixo}`,
    email: `prof.iso.${sufixo}.${stamp}@teste.local`,
    senha: SENHA,
    cpf: `7${stamp}${sufixo}`.replace(/\D/g, '').slice(0, 11).padEnd(11, '3'),
    whatsapp: '11999990003',
    tipo: 'professor',
    escola_id: escola._id,
    disciplina: 'Matemática',
    disciplinas: ['Matemática'],
    ativo: true
  });

  const turma = await Turma.create({
    nome: `Turma Iso ${sufixo}`,
    serie: '5º Ano',
    ano: 5,
    turno: 'Manhã',
    escola_id: escola._id,
    professor_id: professor._id,
    alunos: [aluno._id]
  });

  const historico = await HistoricoEscolar.create({
    aluno_id: aluno._id,
    escola_id: escola._id,
    anoLetivo: 2025,
    serie: '4º Ano',
    turma: 'A',
    turno: 'Manhã',
    resultado: 'Progressão Plena',
    instituicao: escola.nome,
    notas: [{ disciplina: 'Matemática', cargaHoraria: 40, nota: 8, faltas: 0 }]
  });

  return { escola, diretor, aluno, professor, turma, historico };
}

async function limpar(ctx) {
  const ids = [ctx.A, ctx.B].flatMap(c => [
    c.escola._id, c.diretor._id, c.aluno._id, c.professor._id, c.turma._id, c.historico._id
  ]);
  await Promise.all([
    HistoricoEscolar.deleteMany({ _id: { $in: [ctx.A.historico._id, ctx.B.historico._id] } }),
    Avaliacao.deleteMany({ turma_id: { $in: [ctx.A.turma._id, ctx.B.turma._id] } }),
    Presenca.deleteMany({ turma_id: { $in: [ctx.A.turma._id, ctx.B.turma._id] } }),
    Conteudo.deleteMany({ turma_id: { $in: [ctx.A.turma._id, ctx.B.turma._id] } }),
    Turma.deleteMany({ _id: { $in: [ctx.A.turma._id, ctx.B.turma._id] } }),
    Usuario.deleteMany({
      _id: {
        $in: [
          ctx.A.diretor._id, ctx.A.aluno._id, ctx.A.professor._id,
          ctx.B.diretor._id, ctx.B.aluno._id, ctx.B.professor._id
        ]
      }
    }),
    Escola.deleteMany({ _id: { $in: [ctx.A.escola._id, ctx.B.escola._id] } })
  ]);
  return ids.length;
}

async function run() {
  const resultados = [];
  const ok = (nome) => { resultados.push({ nome, ok: true }); console.log(`  ✓ ${nome}`); };
  const fail = (nome, detalhe) => { resultados.push({ nome, ok: false, detalhe }); console.log(`  ✗ ${nome} — ${detalhe}`); };

  console.log('Conectando MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Criando escolas A e B...');
  const A = await criarEscola('A');
  const B = await criarEscola('B');
  const ctx = { A, B };

  try {
    console.log('\nLogin...');
    const tokenDirA = await login(A.diretor.email);
    const tokenDirB = await login(B.diretor.email);
    const tokenProfA = await login(A.professor.email);

    console.log('\nTestes de isolamento (A tenta acessar dados de B):\n');

    // 1. GET usuário de outra escola
    {
      const res = await api.get(`/usuarios/${B.aluno._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /usuarios/:id outra escola bloqueado');
      else fail('GET /usuarios/:id outra escola bloqueado', `status=${res.status}`);
    }

    // 2. GET usuário da própria escola
    {
      const res = await api.get(`/usuarios/${A.aluno._id}`, auth(tokenDirA));
      if (res.status === 200 && res.data.sucesso) ok('GET /usuarios/:id mesma escola liberado');
      else fail('GET /usuarios/:id mesma escola liberado', `status=${res.status}`);
    }

    // 3. Listar usuários só da própria escola
    {
      const res = await api.get('/usuarios', auth(tokenDirA));
      const ids = (res.data.usuarios || []).map(u => String(u._id));
      const vazouB = ids.includes(String(B.aluno._id)) || ids.includes(String(B.diretor._id));
      if (res.status === 200 && !vazouB && ids.includes(String(A.aluno._id))) {
        ok('GET /usuarios não lista outra escola');
      } else {
        fail('GET /usuarios não lista outra escola', `status=${res.status} vazouB=${vazouB}`);
      }
    }

    // 4. Histórico de aluno de outra escola
    {
      const res = await api.get(`/historico/aluno/${B.aluno._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /historico/aluno/:id outra escola bloqueado');
      else fail('GET /historico/aluno/:id outra escola bloqueado', `status=${res.status} body=${JSON.stringify(res.data)}`);
    }

    // 5. Histórico por ID de outra escola
    {
      const res = await api.get(`/historico/${B.historico._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /historico/:id outra escola bloqueado');
      else fail('GET /historico/:id outra escola bloqueado', `status=${res.status}`);
    }

    // 6. Atualizar notas de histórico de outra escola
    {
      const res = await api.put(
        `/historico/${B.historico._id}/notas`,
        { notas: [{ disciplina: 'Matemática', cargaHoraria: 40, nota: 1, faltas: 0 }] },
        auth(tokenDirA)
      );
      if ([403, 404].includes(res.status)) ok('PUT /historico/:id/notas outra escola bloqueado');
      else fail('PUT /historico/:id/notas outra escola bloqueado', `status=${res.status}`);
    }

    // 7. Turma de outra escola (conteúdo)
    {
      const res = await api.get(`/conteudo/turma/${B.turma._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /conteudo/turma/:id outra escola bloqueado');
      else fail('GET /conteudo/turma/:id outra escola bloqueado', `status=${res.status}`);
    }

    // 8. Presença turma outra escola
    {
      const res = await api.get(`/presenca/turma/${B.turma._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /presenca/turma/:id outra escola bloqueado');
      else fail('GET /presenca/turma/:id outra escola bloqueado', `status=${res.status}`);
    }

    // 9. Relatório boletim outra escola
    {
      const res = await api.get(`/relatorios/boletim/${B.aluno._id}`, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('GET /relatorios/boletim/:id outra escola bloqueado');
      else fail('GET /relatorios/boletim/:id outra escola bloqueado', `status=${res.status}`);
    }

    // 10. Grade notas outra escola (professor A)
    {
      const res = await api.get(
        `/avaliacao/grade/${B.turma._id}?disciplina=Matemática`,
        auth(tokenProfA)
      );
      if ([403, 404].includes(res.status)) ok('GET /avaliacao/grade/:turmaId outra escola bloqueado');
      else fail('GET /avaliacao/grade/:turmaId outra escola bloqueado', `status=${res.status}`);
    }

    // 11. Matricular aluno B na turma A (deve falhar)
    {
      const res = await api.post(
        `/turmas/${A.turma._id}/alunos/${B.aluno._id}`,
        {},
        auth(tokenDirA)
      );
      if ([403, 404].includes(res.status)) ok('POST matricular aluno de outra escola bloqueado');
      else fail('POST matricular aluno de outra escola bloqueado', `status=${res.status}`);
    }

    // 12. Desativar usuário de outra escola
    {
      const res = await api.put(`/usuarios/${B.aluno._id}/desativar`, {}, auth(tokenDirA));
      if ([403, 404].includes(res.status)) ok('PUT desativar usuário outra escola bloqueado');
      else fail('PUT desativar usuário outra escola bloqueado', `status=${res.status}`);
    }

    // 13. Diretor B acessa próprio aluno (controle positivo cruzado)
    {
      const res = await api.get(`/usuarios/${B.aluno._id}`, auth(tokenDirB));
      if (res.status === 200 && res.data.sucesso) ok('Diretor B acessa aluno da própria escola');
      else fail('Diretor B acessa aluno da própria escola', `status=${res.status}`);
    }

    // 14. Registro público sem token
    {
      const res = await api.post('/auth/registrar', {
        nome: 'Hack',
        email: `hack.${Date.now()}@teste.local`,
        senha: 'senha12345',
        cpf: '12345678901',
        whatsapp: '11999999999',
        tipo: 'aluno',
        escola_id: String(A.escola._id)
      });
      if ([401, 403, 410].includes(res.status)) ok('POST /auth/registrar público bloqueado');
      else fail('POST /auth/registrar público bloqueado', `status=${res.status}`);
    }

  } finally {
    console.log('\nLimpando dados de teste...');
    await limpar(ctx);
    await mongoose.disconnect();
  }

  const passed = resultados.filter(r => r.ok).length;
  const failed = resultados.filter(r => !r.ok);
  console.log(`\nResultado: ${passed}/${resultados.length} passaram`);
  if (failed.length) {
    console.log('Falhas:');
    failed.forEach(f => console.log(`  - ${f.nome}: ${f.detalhe}`));
    process.exit(1);
  }
  console.log('Isolamento por escola_id OK.');
}

run().catch(err => {
  console.error('\nErro no teste:', err.message);
  process.exit(1);
});
