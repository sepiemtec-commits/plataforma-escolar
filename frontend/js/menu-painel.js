/* Menu lateral nas páginas fora do painel (diário, relatórios). */
(function () {
  const MENUS = {
    professor: {
      painel: 'painel-professor.html',
      itens: [
        { secao: 'dashboard', label: 'Portal' },
        { secao: 'presenca', label: 'Presença' },
        { secao: 'avaliacoes', label: 'Avaliações' },
        { secao: 'conteudo', label: 'Conteúdo Programático' },
        { href: 'diario-aula.html', label: 'Diário de Classe' },
        { secao: 'alunos', label: 'Alunos' },
        { secao: 'ia-pedagogica', label: 'NICE IA' },
        { secao: 'htpc', label: 'Reuniões pedagógicas' },
        { secao: 'pei', label: 'PEI' },
        { secao: 'bncc', label: 'BNCC' },
        { secao: 'simulados', label: 'Simulados SAEB/SARESP' },
        { href: 'academico.html', label: 'Acadêmico' }
      ]
    },
    coordenador: {
      painel: 'painel-coordenador.html',
      itens: [
        { secao: 'dashboard', label: 'Dashboard' },
        { secao: 'turmas', label: 'Turmas' },
        { secao: 'desempenho', label: 'Desempenho' },
        { secao: 'diagnostico', label: 'Diagnóstico' },
        { href: 'presenca-geral.html', label: 'Quadro de Presença' },
        { href: 'diario-aula.html', label: 'Diário de Classe' },
        { href: 'declaracao-curso.html?modo=verificar', label: 'Verificar Declaração' },
        { href: 'academico.html', label: 'Acadêmico' },
        { secao: 'notificacoes', label: 'Notificações' },
        { secao: 'htpc', label: 'Agendamento de reunião pedagógica' },
        { secao: 'pei', label: 'PEI' },
        { secao: 'simulados-hist', label: 'Simulados — série histórica' }
      ]
    },
    secretaria: {
      painel: 'painel-secretaria.html',
      itens: [
        { secao: 'portal', label: 'Portal' },
        { secao: 'turmas', label: 'Turmas' },
        { secao: 'alunos', label: 'Alunos' },
        { secao: 'funcionarios', label: 'Funcionários' },
        { secao: 'disciplinas', label: 'Disciplinas' },
        { secao: 'horarios', label: 'Horários' },
        { href: 'presenca-geral.html', label: 'Quadro de Presença' },
        { href: 'declaracao-curso.html?modo=verificar', label: 'Verificar Declaração' },
        { href: 'academico.html', label: 'Acadêmico' },
        { secao: 'backup', label: 'Backup' }
      ]
    },
    diretor: {
      painel: 'painel-diretor.html',
      itens: [
        { secao: 'dashboard', label: 'Dashboard' },
        { secao: 'relatorios', label: 'Relatórios' },
        { href: 'declaracao-curso.html?modo=verificar', label: 'Verificar Declaração' },
        { href: 'academico.html', label: 'Acadêmico' },
        { secao: 'usuarios', label: 'Usuários' },
        { secao: 'configuracoes', label: 'Configurações' }
      ]
    },
    aluno: {
      painel: 'painel-aluno.html',
      itens: [
        { secao: 'boletim', label: 'Boletim' },
        { secao: 'notas', label: 'Minhas Notas' },
        { secao: 'provas', label: 'Provas online' },
        { href: 'diario-aluno.html', label: 'Diário / Frequência' },
        { href: 'academico.html', label: 'Acadêmico' }
      ]
    },
    responsavel: {
      painel: 'painel-responsavel.html',
      itens: [
        { secao: 'filhos', label: 'Meus Alunos' },
        { secao: 'reunioes', label: 'Reuniões pedagógicas' },
        { href: 'academico.html', label: 'Acadêmico' }
      ]
    }
  };

  function paginaAtual() {
    const path = window.location.pathname.split('/').pop() || '';
    return path || 'index.html';
  }

  function hrefItem(menu, item) {
    if (item.href) return item.href;
    return `${menu.painel}?secao=${encodeURIComponent(item.secao)}`;
  }

  function itemAtivo(item) {
    const atual = paginaAtual();
    const alvo = (item.href || '').split('?')[0];
    return Boolean(alvo) && alvo === atual;
  }

  function montarMenu() {
    const aside = document.getElementById('sidebarPainel');
    if (!aside) return;
    let tipo = 'professor';
    try {
      tipo = JSON.parse(localStorage.getItem('usuario') || '{}').tipo || 'professor';
    } catch (_) {
      tipo = 'professor';
    }
    const menu = MENUS[tipo] || MENUS.professor;
    const itens = menu.itens.map((item) => {
      const ativo = itemAtivo(item) ? ' class="ativo"' : '';
      return `<li><a href="${hrefItem(menu, item)}"${ativo}>${item.label}</a></li>`;
    }).join('');
    aside.innerHTML = `
      <div class="logo">VEHO</div>
      <ul class="menu">
        ${itens}
        <li><a href="#" id="btnLogoutMenu">Sair</a></li>
      </ul>`;
    document.getElementById('btnLogoutMenu')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.logout(); } catch (_) { /* segue para o login */ }
      window.location.href = 'index.html';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarMenu);
  } else {
    montarMenu();
  }
})();
