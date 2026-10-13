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
  const tokenUrl = params.get('token');
  if (tokenUrl) {
    formRec.hidden = true;
    formRed.hidden = false;
    document.getElementById('token').value = tokenUrl;
    document.getElementById('subtituloSenha').textContent = 'Nova senha';
  }

  formRec.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRecuperar');
    btn.disabled = true;
    try {
      const email = document.getElementById('email').value.trim();
      const res = await fetch(`${apiBase}/auth/recuperar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) throw new Error(data.mensagem || 'Falha na solicitação');
      showOk(data.mensagem || 'Se o e-mail estiver cadastrado, enviaremos o link para redefinir a senha.');
    } catch (err) {
      showErr(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  formRed.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRedefinir');
    const novaSenha = document.getElementById('novaSenha').value;
    const confirma = document.getElementById('confirmaSenha').value;
    if (novaSenha !== confirma) {
      showErr('A confirmação não confere com a nova senha.');
      return;
    }
    btn.disabled = true;
    try {
      const token = document.getElementById('token').value.trim();
      const res = await fetch(`${apiBase}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senhaNova: novaSenha, senhaConfirmacao: confirma })
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) throw new Error(data.mensagem || 'Falha ao redefinir');
      showOk(data.mensagem || 'Senha atualizada. Faça login.');
      setTimeout(() => { window.location.href = '/?senha=ok'; }, 1200);
    } catch (err) {
      showErr(err.message);
    } finally {
      btn.disabled = false;
    }
  });
});
