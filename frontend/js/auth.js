const PAINEL_POR_TIPO = {
    diretor: 'painel-diretor.html',
    coordenador: 'painel-coordenador.html',
    secretaria: 'painel-secretaria.html',
    professor: 'painel-professor.html',
    aluno: 'painel-aluno.html',
    responsavel: 'painel-responsavel.html'
};

async function exigirPerfil(tipoEsperado) {
    try {
        const resposta = await api.verificarToken();
        const usuario = resposta.usuario;

        if (Array.isArray(usuario.disciplinas) && usuario.disciplinas.length) {
            usuario.disciplinas = usuario.disciplinas;
        }

        localStorage.setItem('usuario', JSON.stringify(usuario));
        api.token = localStorage.getItem('token');

        if (tipoEsperado && usuario.tipo !== tipoEsperado) {
            window.location.replace(PAINEL_POR_TIPO[usuario.tipo] || 'index.html');
            return null;
        }

        return usuario;
    } catch {
        window.location.replace('index.html');
        return null;
    }
}

function secaoPedidaNaUrl() {
    const secao = new URLSearchParams(window.location.search).get('secao');
    if (!secao || !document.getElementById(secao)) return null;
    return secao;
}

function abrirSecaoPedida(carregar) {
    const secao = secaoPedidaNaUrl();
    if (!secao || typeof carregar !== 'function') return false;
    const link = document.querySelector(`.menu a[data-secao="${secao}"]`);
    carregar(secao, link);
    return true;
}
