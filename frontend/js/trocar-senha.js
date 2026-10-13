/* Troca de senha de quem já está logado. A sessão antiga deixa de valer. */
(function () {
  function limparSessao() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      localStorage.removeItem('refreshToken');
    } catch (_) { /* segue */ }
  }

  function garantirDialog() {
    var dlg = document.getElementById('dialogSenha');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'dialogSenha';
    dlg.className = 'dialog-senha';
    dlg.innerHTML =
      '<form id="formTrocarSenha" method="dialog">' +
        '<h2>Trocar senha</h2>' +
        '<p class="dialog-senha-dica">Use no mínimo 8 caracteres. Evite senhas óbvias e sequências só de números. Ao salvar, é preciso entrar de novo.</p>' +
        '<label for="senhaAtualTroca">Senha atual</label>' +
        '<input type="password" id="senhaAtualTroca" autocomplete="current-password" required>' +
        '<label for="senhaNovaTroca">Nova senha</label>' +
        '<input type="password" id="senhaNovaTroca" autocomplete="new-password" required minlength="8">' +
        '<label for="senhaConfirmaTroca">Confirmar nova senha</label>' +
        '<input type="password" id="senhaConfirmaTroca" autocomplete="new-password" required minlength="8">' +
        '<p id="trocaSenhaAviso" class="dialog-senha-aviso" hidden></p>' +
        '<div class="dialog-senha-acoes">' +
          '<button type="button" id="btnCancelarSenha" class="btn-senha-secundario">Cancelar</button>' +
          '<button type="submit" class="btn-senha-primario">Salvar nova senha</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(dlg);

    document.getElementById('btnCancelarSenha').addEventListener('click', function () {
      dlg.close();
    });
    dlg.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var aviso = document.getElementById('trocaSenhaAviso');
      var atual = document.getElementById('senhaAtualTroca').value;
      var nova = document.getElementById('senhaNovaTroca').value;
      var conf = document.getElementById('senhaConfirmaTroca').value;
      aviso.hidden = true;
      if (nova !== conf) {
        aviso.textContent = 'A confirmação não confere com a nova senha.';
        aviso.hidden = false;
        return;
      }
      var btn = dlg.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        var token = localStorage.getItem('token');
        var res = await fetch('/api/auth/alterar-senha', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (token || '')
          },
          body: JSON.stringify({
            senhaAtual: atual,
            senhaNova: nova,
            senhaConfirmacao: conf
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.sucesso) {
          aviso.textContent = data.mensagem || 'Não foi possível trocar a senha.';
          aviso.hidden = false;
          return;
        }
        limparSessao();
        window.location.href = '/?senha=ok';
      } catch (_) {
        aviso.textContent = 'Sem conexão para trocar a senha. Tente de novo.';
        aviso.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    return dlg;
  }

  function abrir() {
    var dlg = garantirDialog();
    var aviso = document.getElementById('trocaSenhaAviso');
    if (aviso) aviso.hidden = true;
    dlg.querySelector('form').reset();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.hidden = false;
  }

  function encaixar() {
    var sair = document.getElementById('btnLogoutMenu');
    if (!sair || !sair.parentElement || document.getElementById('btnTrocarSenha')) return;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#';
    a.id = 'btnTrocarSenha';
    a.textContent = 'Trocar senha';
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      abrir();
    });
    li.appendChild(a);
    sair.parentElement.parentElement.insertBefore(li, sair.parentElement);
  }

  function iniciar() {
    encaixar();
    var alvo = document.body;
    if (!alvo || alvo.dataset.trocaSenhaObs) return;
    alvo.dataset.trocaSenhaObs = '1';
    var obs = new MutationObserver(encaixar);
    obs.observe(alvo, { childList: true, subtree: true });
  }

  if (document.body) iniciar();
  else document.addEventListener('DOMContentLoaded', iniciar);
})();
