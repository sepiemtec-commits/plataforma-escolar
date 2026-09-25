// frontend/js/recuperar-senha.js
document.addEventListener('DOMContentLoaded', () => {
  const apiBase = `${window.location.origin}/api`;
  const erroEl = document.getElementById('mensagemErro');
  const okEl = document.getElementById('mensagemSucesso');
  const formRec = document.getElementById('formRecuperar');
  const formRed = document.getElementById('formRedefinir');

  function showErr(msg) {
    erroEl.textContent = msg;
    erroEl.style.display = 'block';
    okEl.style.display = 'none';
  }
  function showOk(msg) {
    okEl.textContent = msg;
    okEl.style.display = 'block';
    erroEl.style.display = 'none';
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('token')) {
    formRed.style.display = 'block';
    document.getElementById('token').value = params.get('token');
  }

  formRec.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('email').value.trim();
      const res = await fetch(`${apiBase}/auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) throw new Error(data.mensagem || 'Falha na solicitação');
      showOk(data.mensagem || 'Se o email existir, enviaremos instruções.');
      formRed.style.display = 'block';
      if (data.resetToken) {
        document.getElementById('token').value = data.resetToken;
      }
    } catch (err) {
      showErr(err.message);
    }
  });

  formRed.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const token = document.getElementById('token').value.trim();
      const novaSenha = document.getElementById('novaSenha').value;
      const res = await fetch(`${apiBase}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senhaNova: novaSenha })
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) throw new Error(data.mensagem || 'Falha ao redefinir');
      showOk(data.mensagem || 'Senha atualizada. Faça login.');
      setTimeout(() => { window.location.href = 'index.html'; }, 1200);
    } catch (err) {
      showErr(err.message);
    }
  });
});
