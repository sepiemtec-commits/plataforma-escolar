const PAINEL_POR_TIPO = {
    diretor: 'painel-diretor.html',
    coordenador: 'painel-coordenador.html',
    secretaria: 'painel-secretaria.html',
    professor: 'painel-professor.html',
    aluno: 'painel-aluno.html'
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
