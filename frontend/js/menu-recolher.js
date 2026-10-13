/* Recolhe o menu da esquerda para o canto. Clique ou arraste o botão da borda. */
(function () {
  var CHAVE = 'veho-menu-recolhido';
  var ABERTO = 250;

  function salvoRecolhido() {
    try {
      return localStorage.getItem(CHAVE) === '1';
    } catch (_) {
      return false;
    }
  }

  if (salvoRecolhido()) {
    document.documentElement.classList.add('menu-recolhido');
  }

  function larguraAtual() {
    var bruto = getComputedStyle(document.documentElement).getPropertyValue('--menu-largura');
    var n = parseFloat(bruto);
    return isFinite(n) ? n : (document.documentElement.classList.contains('menu-recolhido') ? 0 : ABERTO);
  }

  function definir(recolhido) {
    document.documentElement.classList.toggle('menu-recolhido', recolhido);
    document.documentElement.style.setProperty('--menu-largura', (recolhido ? 0 : ABERTO) + 'px');
    try {
      localStorage.setItem(CHAVE, recolhido ? '1' : '0');
    } catch (_) { /* navegador sem armazenamento */ }
    var btn = document.getElementById('btnRecolherMenu');
    if (!btn) return;
    btn.textContent = recolhido ? '›' : '‹';
    btn.setAttribute('aria-expanded', recolhido ? 'false' : 'true');
    btn.setAttribute('aria-label', recolhido ? 'Abrir o menu' : 'Levar o menu para o canto');
  }

  function montar() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar || document.getElementById('btnRecolherMenu')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnRecolherMenu';
    btn.className = 'btn-recolher-menu no-print';
    document.body.appendChild(btn);
    definir(salvoRecolhido());

    var arrastou = false;
    var inicioX = 0;
    var larguraInicial = ABERTO;

    btn.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      arrastou = false;
      inicioX = ev.clientX;
      larguraInicial = larguraAtual();
      try { btn.setPointerCapture(ev.pointerId); } catch (_) { /* o ponteiro segue pela janela */ }
      document.documentElement.classList.add('menu-arrastando');

      function mover(e) {
        var dx = e.clientX - inicioX;
        if (Math.abs(dx) > 5) arrastou = true;
        var w = Math.max(0, Math.min(ABERTO, larguraInicial + dx));
        document.documentElement.classList.remove('menu-recolhido');
        document.documentElement.style.setProperty('--menu-largura', w + 'px');
      }

      function soltar() {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
        document.documentElement.classList.remove('menu-arrastando');
        if (!arrastou) {
          definir(!document.documentElement.classList.contains('menu-recolhido'));
          return;
        }
        definir(larguraAtual() < ABERTO / 2);
      }

      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
      window.addEventListener('pointercancel', soltar);
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
