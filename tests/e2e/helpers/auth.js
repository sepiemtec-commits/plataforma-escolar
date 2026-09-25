const fs = require('fs');
const path = require('path');

function loadUsers() {
  const p = path.join(__dirname, '../.auth/users.json');
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(p)) {
      const users = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (users?.diretor?.email && users?.senha) return users;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('users.json ausente — o webServer E2E deve ter subido primeiro');
}

async function loginViaUi(page, email, senha) {
  if (!email || !senha) throw new Error(`credenciais inválidas: email=${email}`);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#loginForm #email').waitFor({ state: 'visible' });

  await page.evaluate(({ email: e, senha: s }) => {
    const emailEl = document.querySelector('#loginForm #email');
    const senhaEl = document.querySelector('#loginForm #senha');
    emailEl.value = e;
    senhaEl.value = s;
    emailEl.dispatchEvent(new Event('input', { bubbles: true }));
    senhaEl.dispatchEvent(new Event('input', { bubbles: true }));
  }, { email: String(email), senha: String(senha) });

  const emailValue = await page.locator('#loginForm #email').inputValue();
  if (emailValue !== String(email)) {
    throw new Error(`email não preenchido (got="${emailValue}")`);
  }

  await Promise.all([
    page.waitForURL(/painel-.*\.html/, { timeout: 25000 }),
    page.locator('#loginForm button.btn-login').click()
  ]);
}

async function logoutViaUi(page) {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  });
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/ERR_ABORTED|interrupted|Timeout/i.test(msg)) throw err;
  }
  // garante estado de login
  if (!/index\.html|\/$/.test(page.url())) {
    await page.goto('/index.html', { waitUntil: 'load', timeout: 15000 });
  }
  await page.locator('#loginForm').waitFor({ state: 'visible', timeout: 15000 });
}

module.exports = { loadUsers, loginViaUi, logoutViaUi };
