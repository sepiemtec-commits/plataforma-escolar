const { test, expect } = require('@playwright/test');
const { loadUsers, loginViaUi, logoutViaUi } = require('../helpers/auth');

test.describe.configure({ mode: 'serial' });

test.describe('TOKEN 13 — fluxos E2E', () => {
  const stamp = Date.now().toString(36);
  let users;
  let novaSenhaRecuperacao;

  test.beforeAll(() => {
    users = loadUsers();
  });

  test('01 cadastro (assinatura escola modo DEV)', async ({ page }) => {
    const adminEmail = `admin.cadastro.${stamp}@e2e.test`;
    const adminSenha = 'CadastroForte99';
    const cnpj = String(10000000000000 + (Date.now() % 8999999999999)).slice(0, 14);

    await page.goto('/assinar.html');
    await expect(page.getByRole('heading', { name: /Elimine o caos/i })).toBeVisible();
    await page.locator('[data-escolher="essencial"]').click();
    await expect(page.locator('#secaoForm')).toBeVisible();

    await page.fill('#nomeEscola', `Escola Cadastro ${stamp}`);
    await page.fill('#cnpj', cnpj);
    await page.fill('#emailEscola', `escola.${stamp}@e2e.test`);
    await page.fill('#adminNome', 'Admin Cadastro E2E');
    await page.fill('#adminEmail', adminEmail);
    await page.fill('#adminSenha', adminSenha);
    await page.check('#aceiteTermos');

    await Promise.all([
      page.waitForURL(/assinatura-sucesso/, { timeout: 30000 }),
      page.click('#btnAssinar')
    ]);

    await page.goto('/index.html');
    await page.fill('#email', adminEmail);
    await page.fill('#senha', adminSenha);
    await Promise.all([
      page.waitForURL(/painel-diretor\.html/, { timeout: 20000 }),
      page.click('button.btn-login')
    ]);
    await expect(page.locator('#nomeUsuario')).toContainText(/Admin|Cadastro/i);
  });

  test('02 login perfis (admin/diretor, coordenador, professor, aluno, responsável)', async ({ page }) => {
    const perfis = [
      users.diretor,
      users.coordenador,
      users.professor,
      users.aluno,
      users.responsavel
    ];
    for (const p of perfis) {
      await loginViaUi(page, p.email, p.senha);
      await expect(page).toHaveURL(new RegExp(p.painel.replace('.', '\\.')));
      await logoutViaUi(page);
    }
  });

  test('03 recuperação de senha', async ({ page }) => {
    novaSenhaRecuperacao = 'NovaSenhaForte88';
    await page.goto('/recuperar-senha.html');
    await page.fill('#email', users.secretaria.email);
    await page.click('#btnRecuperar');
    await expect(page.locator('#mensagemSucesso')).toBeVisible();
    await expect(page.locator('#formRedefinir')).toBeVisible();
    const token = await page.locator('#token').inputValue();
    expect(token.length).toBeGreaterThan(20);
    await page.fill('#novaSenha', novaSenhaRecuperacao);
    await Promise.all([
      page.waitForURL(/index\.html/, { timeout: 20000 }),
      page.click('#btnRedefinir')
    ]);
    // login com senha nova
    await page.fill('#email', users.secretaria.email);
    await page.fill('#senha', novaSenhaRecuperacao);
    await Promise.all([
      page.waitForURL(/painel-secretaria\.html/, { timeout: 20000 }),
      page.click('button.btn-login')
    ]);
    users.secretaria.senha = novaSenhaRecuperacao;
  });

  test('04–07 turma, professor, aluno/matrícula (secretaria UI)', async ({ page }) => {
    await loginViaUi(page, users.secretaria.email, users.secretaria.senha);

    // Professor
    await page.click('a[data-secao="funcionarios"]');
    await expect(page.locator('#formFuncionario')).toBeVisible();
    await page.selectOption('#funcTipo', 'professor');
    await page.fill('#funcNome', `Prof UI ${stamp}`);
    await page.fill('#funcEmail', `prof.ui.${stamp}@escola.com`);
    await page.fill('#funcCpf', String(50000000000 + (Date.now() % 100000000)).slice(0, 11));
    await page.fill('#funcWhatsapp', '11977776666');
    await page.fill('#funcSenha', 'ProfSenhaForte99');
    // abre accordion disciplinas se existir
    const acc = page.locator('#btnAccordionDisciplinas');
    if (await acc.isVisible()) {
      await acc.click();
      const math = page.locator('#funcDisciplinasLista input[type="checkbox"]').first();
      if (await math.count()) await math.check({ force: true });
    }
    await page.click('#btnSalvarFuncionario');
    await expect(page.getByText(/Funcionário salvo/i).last()).toBeVisible({ timeout: 20000 });

    // Turma
    await page.click('a[data-secao="turmas"]');
    await expect(page.locator('#formTurma')).toBeVisible();
    await page.selectOption('#turmaNivel', 'Fundamental I');
    await page.waitForTimeout(500);
    // habilita e escolhe ano
    await page.locator('#turmaAno').waitFor({ state: 'visible' });
    const anoEnabled = await page.locator('#turmaAno').isEnabled();
    if (!anoEnabled) {
      // força mudança de nível novamente
      await page.selectOption('#turmaNivel', 'Fundamental II');
      await page.selectOption('#turmaNivel', 'Fundamental I');
      await page.waitForTimeout(400);
    }
    const anoOptions = await page.locator('#turmaAno option').count();
    if (anoOptions > 1) await page.selectOption('#turmaAno', { index: 1 });
    await page.fill('#turmaSerie', 'Z');
    await page.selectOption('#turmaTurno', 'Manhã');
    await page.fill('#turmaNome', `Turma E2E ${stamp}`);
    const profSelect = page.locator('#turmaProfessor');
    if (await profSelect.isEnabled()) {
      const opts = await profSelect.locator('option').allTextContents();
      // Preferir professor seed (já com alunos e disciplinas) para fluxos 08–09
      let hit = opts.findIndex((t) => /Professor E2E/i.test(t));
      if (hit < 1) hit = opts.findIndex((t) => /Prof UI/i.test(t));
      if (hit > 0) await profSelect.selectOption({ index: hit });
    }
    await page.locator('#formTurma button[type="submit"]').click();
    await expect(page.getByText(/Turma criada com sucesso/i).last()).toBeVisible({ timeout: 20000 });

    // Aluno + matrícula (turma no form)
    await page.click('a[data-secao="alunos"]');
    await expect(page.locator('#formAluno')).toBeVisible();
    await page.fill('#alunoNome', `Aluno UI ${stamp}`);
    await page.fill('#alunoEmail', `aluno.ui.${stamp}@escola.com`);
    await page.fill('#alunoCpf', String(60000000000 + (Date.now() % 100000000)).slice(0, 11));
    await page.fill('#alunoWhatsappResponsavel', '11966665555');
    await page.fill('#alunoNomeResponsavel', `Resp UI ${stamp}`);
    await page.waitForTimeout(600);
    const turmaOpts = await page.locator('#alunoTurma option').allTextContents();
    let idx = turmaOpts.findIndex((t) => t.includes(stamp));
    if (idx < 1) idx = turmaOpts.findIndex((t) => /5º Ano E2E/i.test(t));
    expect(idx).toBeGreaterThan(0);
    await page.selectOption('#alunoTurma', { index: idx });
    await page.click('#btnSalvarAluno');
    await expect(page.getByText(/Aluno salvo com sucesso/i).last()).toBeVisible({ timeout: 20000 });
  });

  test('08–09 lançamento notas e frequência (professor)', async ({ page }) => {
    await loginViaUi(page, users.professor.email, users.professor.senha);

    // Presença — turma seed com aluno matriculado
    await page.click('a[data-secao="presenca"]');
    await expect(page.locator('#turmaId')).toBeVisible();
    await page.selectOption('#turmaId', users.turmaId);
    const hoje = new Date().toISOString().slice(0, 10);
    await page.locator('#dataPresenca').fill(hoje);
    await page.locator('#dataPresenca').dispatchEvent('change');
    const discOpts = await page.locator('#disciplinaPresenca option').allTextContents();
    if (discOpts.some((t) => /Matemática/i.test(t))) {
      await page.selectOption('#disciplinaPresenca', { value: 'Matemática' });
    } else if (discOpts.length > 1) {
      await page.selectOption('#disciplinaPresenca', { index: 1 });
    }
    await page.locator('#disciplinaPresenca').dispatchEvent('change');
    await expect(page.locator('#listaAlunos .btn-presenca.btn-p').first()).toBeVisible({ timeout: 15000 });
    await page.locator('#listaAlunos .btn-presenca.btn-p').first().click();
    await expect(page.locator('#btnSalvarPresenca')).toBeVisible({ timeout: 5000 });
    await page.click('#btnSalvarPresenca');
    await page.waitForTimeout(1200);

    // Avaliações / notas
    await page.click('a[data-secao="avaliacoes"]');
    await expect(page.locator('#avaliacaoTurma')).toBeVisible();
    if (await page.locator('#filtroEnsino option').count() > 1) {
      await page.selectOption('#filtroEnsino', { value: 'Fundamental I' }).catch(() => {});
    }
    await page.selectOption('#avaliacaoTurma', users.turmaId).catch(async () => {
      const opts = await page.locator('#avaliacaoTurma option').allTextContents();
      const i = opts.findIndex((t) => /5º Ano E2E/i.test(t));
      if (i > 0) await page.selectOption('#avaliacaoTurma', { index: i });
    });
    const discNota = await page.locator('#avaliacaoDisciplina option').allTextContents();
    if (discNota.some((t) => /Matemática/i.test(t))) {
      await page.selectOption('#avaliacaoDisciplina', { value: 'Matemática' });
    } else if (discNota.length > 1) {
      await page.selectOption('#avaliacaoDisciplina', { index: 1 });
    }
    await page.click('#btnListarNotas');
    const notaInput = page.locator('#gradeAvaliacoes .input-nota-academica:not(.input-media)').first();
    await expect(notaInput).toBeVisible({ timeout: 15000 });
    await notaInput.fill('7,5');
    await page.click('#btnSalvarNotas');
    await expect(page.locator('#nomeUsuario')).toBeVisible();
  });

  test('10 consulta boletim (aluno e responsável)', async ({ page }) => {
    await loginViaUi(page, users.aluno.email, users.aluno.senha);
    await page.click('a[data-secao="boletim"]');
    await expect(page.locator('#boletim')).toBeVisible();
    await expect(page.locator('#boletim')).toContainText(/nota|média|frequência|Matemática|Boletim|Aluno/i);
    await logoutViaUi(page);

    await loginViaUi(page, users.responsavel.email, users.responsavel.senha);
    await expect(page).toHaveURL(/painel-responsavel/);
    await expect(page.locator('body')).toContainText(/desempenho|Aluno E2E|frequência|nota|boletim/i);
  });

  test('11 comunicação (coordenador → notificação geral API autenticada + UI)', async ({ page, request }) => {
    await loginViaUi(page, users.coordenador.email, users.coordenador.senha);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await request.post('/api/notificacoes/geral', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        titulo: `Aviso E2E ${stamp}`,
        mensagem: 'Comunicado de teste Playwright',
        destino: 'todos',
        canais: { push: true }
      }
    });
    const body = await res.json().catch(() => ({}));
    // Sem push/whatsapp/sms configurados pode retornar 400 — ainda valida auth+contrato
    expect([200, 201, 400]).toContain(res.status());
    if (res.ok()) expect(body.sucesso).toBeTruthy();
    else expect(String(body.mensagem || '')).toMatch(/canal|WhatsApp|SMS|Push|obrigat/i);
    await expect(page.locator('#nomeUsuario')).toBeVisible();
  });

  test('12–13 upload e download de documento', async ({ page, request }) => {
    await loginViaUi(page, users.secretaria.email, users.secretaria.senha);
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // cria PDF mínimo
    const pdfContent = Buffer.from(
      '%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
      'utf8'
    );

    const res = await request.post(`/api/documentos/usuario/${users.alunoId}`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        tipo: 'certidao_nascimento',
        arquivo: {
          name: 'certidao-e2e.pdf',
          mimeType: 'application/pdf',
          buffer: pdfContent
        }
      }
    });
    const json = await res.json();
    expect(res.ok(), JSON.stringify(json)).toBeTruthy();
    expect(json.sucesso).toBeTruthy();
    const docId = json.documento?._id;
    expect(docId).toBeTruthy();

    const dl = await request.get(`/api/documentos/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(dl.ok()).toBeTruthy();
    const buf = await dl.body();
    expect(buf.byteLength).toBeGreaterThan(10);
  });

  test('14 relatório', async ({ page }) => {
    await loginViaUi(page, users.secretaria.email, users.secretaria.senha);
    await page.goto('/gestao-boletins.html');
    await expect(page.locator('body')).toContainText(/boletim|relatório|turma|aluno|Gestão/i);
    // tenta gerar via API boletim do aluno seed
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await page.request.get(`/api/relatorios/boletim/${users.alunoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    expect(res.ok()).toBeTruthy();
    expect(json.sucesso).toBeTruthy();
  });

  test('15 logout', async ({ page }) => {
    await loginViaUi(page, users.diretor.email, users.diretor.senha);
    await logoutViaUi(page);
    await expect(page).toHaveURL(/index\.html/);
    // token limpo
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeFalsy();
  });
});
