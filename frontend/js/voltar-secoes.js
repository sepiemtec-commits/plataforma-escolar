// Injeta barra "← Voltar" em seções dos painéis que ainda não têm.
(function () {
  const HOME_IDS = new Set(['portal', 'dashboard', 'boletim', 'filhos']);

  function secaoHomeId() {
    const ativo = document.querySelector('.menu a[data-secao].ativo');
    if (ativo?.dataset?.secao && HOME_IDS.has(ativo.dataset.secao)) {
      return ativo.dataset.secao;
    }
    const primeiro = document.querySelector('.menu a[data-secao]');
    if (primeiro?.dataset?.secao) return primeiro.dataset.secao;
    for (const id of HOME_IDS) {
      if (document.getElementById(id)) return id;
    }
    return null;
  }

  function irParaHome() {
    const home = secaoHomeId();
    if (!home) {
      if (window.history.length > 1) window.history.back();
      return;
    }
    const link = document.querySelector(`.menu a[data-secao="${home}"]`);
    if (typeof window.carregarSecao === 'function') {
      window.carregarSecao(home, link);
      sincronizarEndereco(home);
      return;
    }
    if (typeof window.carregarSecaoResp === 'function') {
      window.carregarSecaoResp(home, link);
      return;
    }
    if (typeof window.voltarAoPortal === 'function' && home === 'portal') {
      window.voltarAoPortal();
      return;
    }
    document.querySelectorAll('main section').forEach((s) => {
      s.style.display = 'none';
    });
    const el = document.getElementById(home);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.menu a[data-secao]').forEach((a) => a.classList.remove('ativo'));
    link?.classList.add('ativo');
    sincronizarEndereco(home);
  }

  function sincronizarEndereco(secaoId) {
    if (typeof secaoId !== 'string' || !secaoId || !window.history.replaceState) return;
    var url;
    try {
      url = new URL(window.location.href);
    } catch (e) {
      return;
    }
    var home = secaoHomeId();
    if (home && secaoId === home) url.searchParams.delete('secao');
    else url.searchParams.set('secao', secaoId);
    var next = url.pathname + url.search + url.hash;
    var atual = window.location.pathname + window.location.search + window.location.hash;
    if (next !== atual) window.history.replaceState({ secao: secaoId }, '', next);
  }

  function secaoJaTemBarraTopo(secao) {
    const primeiro = secao.firstElementChild;
    if (!primeiro) return false;
    if (primeiro.classList?.contains('barra-voltar-azul')) return true;
    if (primeiro.querySelector?.('.barra-voltar-azul, [data-voltar-portal], [data-voltar-home]')) {
      return true;
    }
    return Boolean(secao.querySelector(':scope > .barra-voltar-azul'));
  }

  function tituloAzulImediato(raiz) {
    if (!raiz?.matches) return null;
    if (raiz.matches('.notas-academicas-titulo, .portal-bloco-header, .titulo-secao-barra')) return raiz;
    const filho = raiz.firstElementChild;
    if (!filho) return null;
    if (filho.matches('.notas-academicas-titulo, .portal-bloco-header, .titulo-secao-barra')) return filho;
    if (filho.matches('.portal-bloco, .notas-academicas, .portal-professor, .formulario')) {
      return tituloAzulImediato(filho);
    }
    return null;
  }

  function textoChave(valor) {
    return (valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '')
      .toLowerCase();
  }

  function barraJaTemTitulo(barra) {
    return Boolean(barra.querySelector(
      'h1, h2, .titulo-secao-barra, .notas-academicas-titulo, .portal-bloco-header, [id*="Titulo"], [id*="titulo"]'
    ));
  }

  function tituloDoMenu(secao) {
    if (!secao?.id) return '';
    const link = document.querySelector(`.menu a[data-secao="${secao.id}"]`);
    return link ? link.textContent.trim() : '';
  }

  function primeiroTituloDaSecao(secao, barra) {
    const titulos = secao.querySelectorAll('h1, h2');
    for (const titulo of titulos) {
      if (barra.contains(titulo)) continue;
      if (titulo.closest('.modal, .detalhe-turma-panel, [role="dialog"]')) continue;
      return titulo;
    }
    return null;
  }

  function colocarNaBarra(barra, titulo) {
    titulo.classList.add('barra-voltar-titulo', 'titulo-secao-barra');
    titulo.style.margin = '0';
    barra.insertBefore(titulo, barra.firstChild);
    barra.dataset.tituloFundido = '1';
  }

  function fundirBarraDupla(barra) {
    if (barra.dataset.tituloFundido === '1' || barraJaTemTitulo(barra)) {
      barra.dataset.tituloFundido = '1';
      return;
    }
    const secao = barra.closest('section') || barra.parentElement;
    const azul = tituloAzulImediato(barra.nextElementSibling);
    if (azul && !azul.closest('.barra-voltar-azul')) {
      colocarNaBarra(barra, azul);
      return;
    }
    const menu = tituloDoMenu(secao);
    const heading = primeiroTituloDaSecao(secao, barra);
    const menuChave = textoChave(menu);
    const headingChave = heading ? textoChave(heading.textContent) : '';
    const mesmoAssunto = menuChave && headingChave
      && (headingChave.includes(menuChave) || menuChave.includes(headingChave));
    if (heading && (mesmoAssunto || !menu)) {
      colocarNaBarra(barra, heading);
      return;
    }
    if (!menu) return;
    const titulo = document.createElement('h2');
    titulo.className = 'titulo-secao-barra barra-voltar-titulo';
    titulo.textContent = menu;
    barra.insertBefore(titulo, barra.firstChild);
    barra.dataset.tituloFundido = '1';
  }

  function fundirBarrasDuplas() {
    document.querySelectorAll('.barra-voltar-azul').forEach(fundirBarraDupla);
  }

  function criarBarra() {
    const barra = document.createElement('div');
    barra.className = 'barra-voltar-azul no-print';
    barra.setAttribute('data-voltar-auto', '1');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-voltar-azul';
    btn.setAttribute('data-voltar-home', '1');
    btn.textContent = '← Voltar';
    barra.appendChild(btn);
    return barra;
  }

  function injetarBarras() {
    const home = secaoHomeId();
    document.querySelectorAll('main > section').forEach((secao) => {
      if (!secao.id || secao.id === home) return;
      if (HOME_IDS.has(secao.id) && secao.id === home) return;
      if (secaoJaTemBarraTopo(secao)) return;
      secao.insertBefore(criarBarra(), secao.firstChild);
    });
  }

  function ligarBotoes() {
    document.querySelectorAll('[data-voltar-home]').forEach((btn) => {
      if (btn.dataset.voltarLigado === '1') return;
      btn.dataset.voltarLigado = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        irParaHome();
      });
    });
  }

  function secaoVisivel() {
    return [...document.querySelectorAll('main > section')].find((secao) => {
      if (!secao.id) return false;
      return getComputedStyle(secao).display !== 'none';
    });
  }

  function marcarPaginaInterna(secaoId) {
    const home = secaoHomeId();
    const id = secaoId || secaoVisivel()?.id;
    document.body.classList.toggle('secao-interna', Boolean(id && id !== home));
  }

  function observarTrocaDeSecao() {
    ['carregarSecao', 'carregarSecaoResp', 'voltarAoPortal'].forEach((nome) => {
      const original = window[nome];
      if (typeof original !== 'function' || original._paginaInterna) return;
      const envolvida = function envolvida(...args) {
        const resultado = original.apply(this, args);
        const secaoId = typeof args[0] === 'string' ? args[0] : null;
        marcarPaginaInterna(secaoId);
        if (secaoId) sincronizarEndereco(secaoId);
        return resultado;
      };
      envolvida._paginaInterna = true;
      window[nome] = envolvida;
    });
  }

  function iniciar() {
    injetarBarras();
    fundirBarrasDuplas();
    ligarBotoes();
    observarTrocaDeSecao();
    marcarPaginaInterna();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // Reaplica se seções forem montadas dinamicamente
  window.garantirBotoesVoltarSecoes = iniciar;
})();
