/* Aumentar ou diminuir as letras. A escolha fica salva neste navegador. */
(function () {
  var CHAVE = 'veho-tamanho-letra';
  var NIVEIS = [0.85, 1, 1.15, 1.3, 1.5];

  function indiceDe(valor) {
    var n = parseFloat(valor);
    if (!isFinite(n)) return 1;
    var melhor = 1;
    var dist = 99;
    for (var i = 0; i < NIVEIS.length; i++) {
      var d = Math.abs(NIVEIS[i] - n);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    }
    return dist < 0.02 ? melhor : 1;
  }

  function lerIndice() {
    try {
      return indiceDe(localStorage.getItem(CHAVE));
    } catch (_) {
      return 1;
    }
  }

  function aplicar(indice) {
    var i = Math.max(0, Math.min(NIVEIS.length - 1, indice));
    var escala = NIVEIS[i];
    document.documentElement.style.setProperty('--escala-texto', String(escala));
    try {
      localStorage.setItem(CHAVE, String(escala));
    } catch (_) { /* navegador sem armazenamento */ }
    var valor = document.getElementById('controleLetrasValor');
    var menos = document.getElementById('btnLetraMenos');
    var mais = document.getElementById('btnLetraMais');
    var pct = Math.round(escala * 100) + '%';
    if (valor) valor.textContent = pct;
    if (menos) menos.disabled = i === 0;
    if (mais) mais.disabled = i === NIVEIS.length - 1;
    var aviso = document.getElementById('controleLetrasAviso');
    if (aviso) aviso.textContent = 'Tamanho das letras: ' + pct;
    return i;
  }

  var indice = lerIndice();
  aplicar(indice);

  function visivel(el) {
    if (!el) return false;
    if (el.closest('[hidden]')) return false;
    var secao = el.closest('section');
    if (secao && secao.style.display === 'none') return false;
    return el.getClientRects().length > 0;
  }

  function linhaDoUsuario(info) {
    var linha = info.querySelector('.user-info-acoes');
    if (linha) return linha;
    linha = document.createElement('div');
    linha.className = 'user-info-acoes';
    var btn = info.querySelector('.btn-logout, button');
    if (btn) {
      info.insertBefore(linha, btn);
      linha.appendChild(btn);
    } else {
      info.appendChild(linha);
    }
    return linha;
  }

  function acharDestino() {
    var rel = document.querySelector('.rel-topbar');
    if (rel && visivel(rel)) {
      var nav = rel.querySelector('.rel-topbar-nav') || rel;
      return {
        pai: nav,
        antes: nav.querySelector('.rel-btn-voltar'),
        modo: 'azul'
      };
    }

    var header = document.querySelector('.main-content > .header, .header');
    if (header && visivel(header) && !document.body.classList.contains('secao-interna')) {
      var info = header.querySelector('.user-info') || header;
      var linha = linhaDoUsuario(info);
      return {
        pai: linha,
        antes: linha.querySelector('.btn-logout, button'),
        modo: 'header'
      };
    }

    var barras = document.querySelectorAll('.barra-voltar-azul');
    for (var i = 0; i < barras.length; i++) {
      if (!visivel(barras[i])) continue;
      return {
        pai: barras[i],
        antes: barras[i].querySelector('.btn-voltar-azul'),
        modo: 'azul'
      };
    }

    return { pai: null, antes: null, modo: 'topo' };
  }

  function garantirBarraTopo() {
    var barra = document.getElementById('barraLetrasTopo');
    if (barra) return barra;
    barra = document.createElement('div');
    barra.id = 'barraLetrasTopo';
    barra.className = 'barra-letras-topo no-print';
    document.body.appendChild(barra);
    return barra;
  }

  function removerBarraTopo() {
    var barra = document.getElementById('barraLetrasTopo');
    if (barra && !barra.querySelector('#controleLetras')) barra.remove();
  }

  function encaixar() {
    var grupo = document.getElementById('controleLetras');
    if (!grupo) return;
    var dest = acharDestino();
    if (dest.pai) {
      var noLugar = grupo.parentElement === dest.pai &&
        (!dest.antes || grupo.nextElementSibling === dest.antes);
      if (!noLugar) {
        if (dest.antes && dest.antes.parentElement === dest.pai) {
          dest.pai.insertBefore(grupo, dest.antes);
        } else {
          dest.pai.appendChild(grupo);
        }
      }
      var topo = document.getElementById('barraLetrasTopo');
      if (topo) topo.remove();
    } else {
      var barra = garantirBarraTopo();
      if (grupo.parentElement !== barra) barra.appendChild(grupo);
    }
    grupo.dataset.lugar = dest.modo;
  }

  var agendado = false;
  function agendarEncaixe() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () {
      agendado = false;
      encaixar();
    });
  }

  function definirAberto(aberto) {
    var opcoes = document.getElementById('controleLetrasOpcoes');
    var abrir = document.getElementById('btnLetraAbrir');
    if (opcoes) opcoes.hidden = !aberto;
    if (abrir) {
      abrir.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      abrir.hidden = aberto;
    }
  }

  function montar() {
    if (document.getElementById('controleLetras')) {
      encaixar();
      return;
    }
    var grupo = document.createElement('div');
    grupo.id = 'controleLetras';
    grupo.className = 'controle-letras no-print';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', 'Tamanho das letras');
    grupo.innerHTML =
      '<button type="button" id="btnLetraAbrir" aria-expanded="false" aria-controls="controleLetrasOpcoes" aria-label="Ajustar tamanho das letras">Aa</button>' +
      '<span id="controleLetrasOpcoes" class="controle-letras-opcoes" hidden>' +
        '<button type="button" id="btnLetraMenos" aria-label="Diminuir tamanho das letras">A−</button>' +
        '<button type="button" id="btnLetraPadrao" aria-label="Voltar ao tamanho padrão das letras">A</button>' +
        '<span id="controleLetrasValor" class="controle-letras-valor" aria-hidden="true">100%</span>' +
        '<button type="button" id="btnLetraMais" aria-label="Aumentar tamanho das letras">A+</button>' +
        '<button type="button" id="btnLetraFechar" aria-label="Fechar ajuste das letras">×</button>' +
      '</span>' +
      '<span id="controleLetrasAviso" class="visually-hidden" aria-live="polite"></span>';
    document.body.appendChild(grupo);

    document.getElementById('btnLetraAbrir').addEventListener('click', function () {
      definirAberto(true);
    });
    document.getElementById('btnLetraFechar').addEventListener('click', function () {
      definirAberto(false);
    });
    document.getElementById('btnLetraMenos').addEventListener('click', function () {
      indice = aplicar(indice - 1);
    });
    document.getElementById('btnLetraMais').addEventListener('click', function () {
      indice = aplicar(indice + 1);
    });
    document.getElementById('btnLetraPadrao').addEventListener('click', function () {
      indice = aplicar(1);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') definirAberto(false);
    });
    aplicar(indice);
    encaixar();

    var alvo = document.querySelector('main') || document.body;
    var obs = new MutationObserver(agendarEncaixe);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    obs.observe(alvo, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
