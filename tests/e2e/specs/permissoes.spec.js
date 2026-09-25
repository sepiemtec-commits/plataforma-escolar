const { test, expect } = require('@playwright/test');
const { loadUsers, loginViaUi } = require('../helpers/auth');

test.describe('TOKEN 13 — permissões por perfil', () => {
  let users;
  test.beforeAll(() => {
    users = loadUsers();
  });

  test('aluno não acessa painel da secretaria', async ({ page }) => {
    await loginViaUi(page, users.aluno.email, users.aluno.senha);
    await page.goto('/painel-secretaria.html');
    // auth.js deve redirecionar ou bloquear
    await page.waitForTimeout(1500);
    const url = page.url();
    const blocked =
      /painel-aluno|index\.html/.test(url) ||
      (await page.locator('text=/acesso|negado|não autoriz|permiss/i').count()) > 0;
    // se permanecer na secretaria, formulários críticos não devem funcionar via API
    if (/painel-secretaria/.test(url) && !blocked) {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const res = await page.request.post('/api/turmas', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { nome: 'X', nivel: 'Fundamental I', ano: 5, turno: 'Manhã' }
      });
      expect(res.status()).toBeGreaterThanOrEqual(403);
    } else {
      expect(blocked || /painel-aluno|index/.test(url)).toBeTruthy();
    }
  });

  test('responsável não acessa avaliações de professor', async ({ page }) => {
    await loginViaUi(page, users.responsavel.email, users.responsavel.senha);
    await page.goto('/painel-professor.html');
    await page.waitForTimeout(1500);
    const url = page.url();
    if (/painel-professor/.test(url)) {
      const token = await page.evaluate(() => localStorage.getItem('token'));
      const res = await page.request.get(`/api/avaliacao/grade/${users.turmaId}?disciplina=Matemática`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect([401, 403]).toContain(res.status());
    } else {
      expect(url).toMatch(/painel-responsavel|index\.html/);
    }
  });

  test('professor não cadastra turma (API)', async ({ page }) => {
    await loginViaUi(page, users.professor.email, users.professor.senha);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const res = await page.request.post('/api/turmas', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        nome: 'Turma Proibida',
        nivel: 'Fundamental I',
        ano: 5,
        serie: 'X',
        turno: 'Manhã'
      }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('coordenador acessa painel próprio', async ({ page }) => {
    await loginViaUi(page, users.coordenador.email, users.coordenador.senha);
    await expect(page).toHaveURL(/painel-coordenador/);
    await expect(page.locator('#nomeUsuario')).toBeVisible();
  });

  test('diretor (admin escolar) acessa painel diretor', async ({ page }) => {
    await loginViaUi(page, users.diretor.email, users.diretor.senha);
    await expect(page).toHaveURL(/painel-diretor/);
  });
});
