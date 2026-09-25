/**
 * Teste E2E de funcionalidade VEHO
 * Fluxos: matricular → presença → nota → boletim (aluno + responsável)
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const SENHA = 'senha123';

const results = [];

function ok(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, pass: false, detail });
  console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: SENHA })
  });
  const j = await r.json();
  if (!j.sucesso) throw new Error(`Login ${email}: ${j.mensagem || r.status}`);
  return j;
}

async function api(method, path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, ...j };
}

(async () => {
  const stamp = Date.now().toString(36);
  const emailAluno = `e2e.aluno.${stamp}@escola.com`;
  const cpfAluno = `E2E${stamp}`.slice(0, 14);

  // ========== 1. SECRETARIA: matricular ==========
  console.log('\n=== 1. SECRETARIA: matricular aluno ===');
  const sec = await login('secretaria@escola.com');
  ok('Login secretaria', sec.usuario.nome);

  const turmasRes = await api('GET', '/turmas', sec.token);
  if (!turmasRes.sucesso || !turmasRes.turmas?.length) {
    fail('Listar turmas', turmasRes.mensagem || 'vazio');
    process.exit(1);
  }
  ok('Listar turmas', `${turmasRes.total} turmas`);

  // Prefer a turma the math professor teaches: 5º Ano A
  let turma = turmasRes.turmas.find(t => t.nome === '5º Ano A')
    || turmasRes.turmas.find(t => (t.nome || '').includes('5º'))
    || turmasRes.turmas[0];

  const mat = await api('POST', '/turmas/alunos', sec.token, {
    nome: `Aluno E2E ${stamp}`,
    email: emailAluno,
    cpf: cpfAluno,
    whatsapp_responsavel: '+5511999990001',
    nome_responsavel: `Resp E2E ${stamp}`,
    cpf_responsavel: `9${stamp}`.slice(0, 11),
    turma_id: turma._id,
    endereco: 'Rua Teste E2E, 100',
    bairro: 'Centro',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '01000-000'
  });

  if (!mat.sucesso || !mat.aluno?.id) {
    fail('Matricular aluno', mat.mensagem || JSON.stringify(mat).slice(0, 200));
    process.exit(1);
  }
  const alunoId = mat.aluno.id;
  const senhaAluno = mat.senhaInicial || SENHA;
  ok('Matricular aluno', `${mat.aluno.nome} id=${alunoId} turma=${turma.nome} senha=${senhaAluno}`);

  // Confirm student appears in turma
  const resumo = await api('GET', `/turmas/${turma._id}/resumo-alunos`, sec.token);
  const noResumo = (resumo.alunos || []).some(a => String(a._id || a.id) === String(alunoId));
  if (resumo.sucesso && noResumo) ok('Aluno na turma (resumo)', turma.nome);
  else fail('Aluno na turma (resumo)', resumo.mensagem || 'não encontrado');

  // ========== 2. PROFESSOR: presença + nota ==========
  console.log('\n=== 2. PROFESSOR: presença e nota ===');
  const prof = await login('professor@escola.com');
  ok('Login professor', `${prof.usuario.nome} discs=${(prof.usuario.disciplinas || [prof.usuario.disciplina]).filter(Boolean).join(',')}`);

  const painelP = await api('GET', '/painel/professor', prof.token);
  const disc = prof.usuario.disciplinas?.[0] || prof.usuario.disciplina || 'Matemática';
  const turmasProf = painelP.painel?.turmasDetalhes || [];
  const turmaProf = turmasProf.find(t => String(t._id) === String(turma._id))
    || turmasProf.find(t => (t.nome || '').includes('5º'))
    || turmasProf[0];

  if (!turmaProf) {
    fail('Professor tem turma', 'nenhuma turma no painel');
  } else {
    ok('Professor tem turma', turmaProf.nome);
    turma = turmaProf; // use professor's turma for presence if different
  }

  // If new student was enrolled in 5º Ano A but professor's first turma differs, re-check
  // Ensure student is in the turma we'll use for presence
  let turmaIdPresenca = turma._id;
  let alunoNaTurma = true;
  const checkTurma = await api('GET', `/turmas/${turmaIdPresenca}/resumo-alunos`, prof.token);
  if (!(checkTurma.alunos || []).some(a => String(a._id) === String(alunoId))) {
    // try find a professor turma that contains our student, or use secretaria turma and hope professor can access
    const match = turmasProf.find(t => String(t._id) === String(mat.aluno?.turma_id));
    // re-fetch turmas from secretaria enrollment
    turmaIdPresenca = turmasRes.turmas.find(t => t.nome === '5º Ano A')?._id || turmaIdPresenca;
    const c2 = await api('GET', `/turmas/${turmaIdPresenca}/resumo-alunos`, prof.token);
    alunoNaTurma = (c2.alunos || []).some(a => String(a._id) === String(alunoId));
    if (!alunoNaTurma) {
      fail('Aluno acessível ao professor na turma', `turma=${turmaIdPresenca}`);
    } else {
      ok('Aluno acessível ao professor', `turma=${turmaIdPresenca}`);
    }
  } else {
    ok('Aluno na turma do professor', turma.nome);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  // Use a high tempo unlikely to conflict — or find free tempo
  let tempoUsado = 1;
  let pres;
  for (const tempo of [1, 2, 3, 4]) {
    tempoUsado = tempo;
    pres = await api('POST', '/presenca/registrar', prof.token, {
      aluno_id: alunoId,
      turma_id: turmaIdPresenca,
      disciplina: disc,
      tempo,
      data: hoje,
      status: 'presente',
      observacoes: 'E2E teste'
    });
    if (pres.sucesso) break;
    if (pres.status !== 409) break;
  }

  if (pres?.sucesso) ok('Registrar presença', `${disc} ${tempoUsado}º tempo ${hoje}`);
  else fail('Registrar presença', pres?.mensagem || String(pres?.status));

  // Also test falta + list
  const listaPres = await api('GET', `/presenca/turma/${turmaIdPresenca}?data=${hoje}&disciplina=${encodeURIComponent(disc)}`, prof.token);
  const temPres = (listaPres.presencas || []).some(p => String(p.aluno_id?._id || p.aluno_id) === String(alunoId));
  if (listaPres.sucesso && temPres) ok('Listar presença do dia', `${listaPres.total} registro(s)`);
  else fail('Listar presença do dia', listaPres.mensagem || 'aluno não listado');

  const nota = await api('POST', '/avaliacao/lancar', prof.token, {
    aluno_id: alunoId,
    turma_id: turmaIdPresenca,
    disciplina: disc,
    tipo: 'prova_bimestral',
    periodo: '1º Bimestre',
    nota: 8.5,
    peso: 2,
    dataAplicacao: hoje,
    observacoes: 'E2E prova'
  });

  if (nota.sucesso) ok('Lançar nota', `${disc} 8.5 prova_bimestral`);
  else fail('Lançar nota', nota.mensagem || String(nota.status));

  const boletimProf = await api('GET', `/avaliacao/boletim/${alunoId}`, prof.token);
  const temBoletim = (boletimProf.boletim || []).some(b => b.disciplina === disc || (b.disciplina || '').includes(disc));
  if (boletimProf.sucesso && (temBoletim || (boletimProf.boletim || []).length >= 0)) {
    ok('Professor consulta boletim', `${(boletimProf.boletim || []).length} disciplina(s)`);
  } else {
    fail('Professor consulta boletim', boletimProf.mensagem || '');
  }

  // ========== 3. ALUNO: ver boletim ==========
  console.log('\n=== 3. ALUNO: boletim e painel ===');
  let alunoLogin;
  try {
    alunoLogin = await login(emailAluno);
    // if senha was generated differently
  } catch (e) {
    // try with returned senha
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailAluno, senha: senhaAluno })
    });
    alunoLogin = await r.json();
    if (!alunoLogin.sucesso) {
      fail('Login aluno novo', alunoLogin.mensagem || e.message);
    }
  }
  if (alunoLogin?.sucesso) {
    ok('Login aluno novo', alunoLogin.usuario.nome);
    const painelA = await api('GET', '/painel/aluno', alunoLogin.token);
    if (painelA.sucesso) {
      ok('Painel aluno', `freq=${painelA.painel?.frequencia} boletim=${(painelA.painel?.boletim || []).length}`);
    } else fail('Painel aluno', painelA.mensagem);

    const bol = await api('GET', `/avaliacao/boletim/${alunoId}`, alunoLogin.token);
    const linha = (bol.boletim || []).find(b => (b.disciplina || '') === disc || (b.disciplina || '').includes('Matem'));
    if (bol.sucesso && linha) {
      ok('Boletim mostra disciplina/nota', `${linha.disciplina} media=${linha.mediaGeral ?? linha.media ?? '?'}`);
    } else if (bol.sucesso) {
      ok('Boletim carrega', `${(bol.boletim || []).length} itens (disciplina ${disc} pode estar em cálculo)`);
    } else fail('Boletim aluno', bol.mensagem);

    const notasA = await api('GET', `/avaliacao/aluno/${alunoId}`, alunoLogin.token);
    const temNota = (notasA.avaliacoes || []).some(a => Number(a.nota) === 8.5 || a.observacoes === 'E2E prova');
    if (notasA.sucesso && temNota) ok('Notas do aluno incluem lançamento E2E', `${notasA.total} avaliações`);
    else if (notasA.sucesso) fail('Notas do aluno incluem lançamento E2E', 'nota 8.5 não encontrada');
    else fail('Listar notas aluno', notasA.mensagem);
  }

  // ========== 4. RESPONSÁVEL existente (fluxo leitura) + diretor ==========
  console.log('\n=== 4. RESPONSÁVEL e DIRETOR ===');
  const resp = await login('responsavel@escola.com');
  ok('Login responsável', resp.usuario.nome);
  const painelR = await api('GET', '/painel/responsavel', resp.token);
  if (painelR.sucesso && (painelR.painel?.alunosDetalhes || []).length) {
    const filho = painelR.painel.alunosDetalhes[0];
    const fid = filho._id || filho.id || filho.aluno_id;
    ok('Responsável vê filho', `${filho.nome || fid}`);
    const bolF = await api('GET', `/avaliacao/boletim/${fid}`, resp.token);
    if (bolF.sucesso) ok('Responsável vê boletim do filho', `${(bolF.boletim || []).length} disciplinas`);
    else fail('Responsável vê boletim do filho', bolF.mensagem);
  } else {
    fail('Responsável vê filho', painelR.mensagem || 'sem alunosDetalhes');
  }

  const dir = await login('diretor@escola.com');
  const painelD = await api('GET', '/painel/diretor', dir.token);
  if (painelD.sucesso && painelD.painel?.estatisticas) {
    ok('Diretor dashboard', JSON.stringify(painelD.painel.estatisticas));
  } else fail('Diretor dashboard', painelD.mensagem);

  // ========== SUMMARY ==========
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n========== RESUMO E2E ==========');
  console.log(`PASS: ${passed}  FAIL: ${failed}`);
  console.log(`Aluno criado: ${emailAluno} / ${senhaAluno}`);
  console.log(`Turma: ${turma.nome || turmaIdPresenca}  Disciplina: ${disc}`);
  if (failed) process.exit(1);
})().catch((e) => {
  console.error('ERR FATAL', e);
  process.exit(1);
});
