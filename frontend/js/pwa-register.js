// frontend/js/pwa-register.js — registra service worker e força atualização
(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(function (err) {
        console.warn('VEHO PWA: falha ao registrar SW', err);
      });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // nova versão do SW assumiu controle — recarrega uma vez
      if (sessionStorage.getItem('veho-sw-reloaded')) return;
      sessionStorage.setItem('veho-sw-reloaded', '1');
      window.location.reload();
    });
  });
})();
