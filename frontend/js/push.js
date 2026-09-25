// frontend/js/push.js — inscrição Web Push no aparelho
(function () {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSuportado() {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function ambienteSeguro() {
    return (
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'
    );
  }

  async function ativarPush() {
    if (!pushSuportado()) {
      throw new Error('Este navegador não suporta notificações push');
    }
    if (!ambienteSeguro()) {
      throw new Error('Push exige HTTPS (ou localhost). No celular use HTTPS ou o mesmo Wi‑Fi com tunnel seguro.');
    }
    if (!window.api || typeof api.vapidPublicKey !== 'function') {
      throw new Error('API não carregada');
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      throw new Error('Permissão de notificação negada');
    }

    const { publicKey } = await api.vapidPublicKey();
    if (!publicKey) throw new Error('Chave VAPID indisponível no servidor');

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    await api.subscribePush(sub.toJSON());
    return sub;
  }

  async function desativarPush() {
    if (!pushSuportado()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await api.unsubscribePush(endpoint);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function montarBotaoPush(container, opcoes) {
    const opts = opcoes || {};
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'veho-push-box';
    wrap.style.cssText = 'margin:16px 0;padding:12px 14px;border:1px solid #d0d7de;border-radius:8px;background:#f8fafb;';

    const titulo = document.createElement('p');
    titulo.style.cssText = 'margin:0 0 8px;font-size:14px;color:#3d4a57;';
    titulo.textContent = opts.titulo || 'Receber alertas neste aparelho (Web Push)';

    const status = document.createElement('p');
    status.id = opts.statusId || 'vehoPushStatus';
    status.style.cssText = 'margin:0 0 10px;font-size:13px;color:#7a8794;';
    status.textContent = ambienteSeguro()
      ? 'Opcional: ative para receber avisos mesmo com o app fechado.'
      : 'Push disponível apenas em HTTPS ou localhost.';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secundario';
    btn.textContent = 'Ativar notificações no aparelho';
    btn.disabled = !ambienteSeguro() || !pushSuportado();

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = 'Ativando...';
      try {
        await ativarPush();
        status.textContent = 'Notificações ativadas neste aparelho.';
        btn.textContent = 'Notificações ativas';
      } catch (e) {
        status.textContent = e.message || 'Falha ao ativar';
        btn.disabled = false;
      }
    });

    wrap.appendChild(titulo);
    wrap.appendChild(status);
    wrap.appendChild(btn);
    container.appendChild(wrap);
  }

  window.VehoPush = {
    ativarPush,
    desativarPush,
    pushSuportado,
    ambienteSeguro,
    montarBotaoPush
  };
})();
