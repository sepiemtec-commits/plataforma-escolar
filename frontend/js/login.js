// frontend/js/login.js - Lógica da página de login

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    // Submeter formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        const divErro = document.getElementById('mensagemErro');
        const divSucesso = document.getElementById('mensagemSucesso');

        divErro.style.display = 'none';
        divSucesso.style.display = 'none';

        try {
            const resposta = await api.login(email, senha);

            if (resposta.sucesso) {
                // Salvar token e dados do usuário
                localStorage.setItem('token', resposta.token);
                localStorage.setItem('usuario', JSON.stringify(resposta.usuario));
                api.token = resposta.token;

                divSucesso.textContent = 'Login realizado! Redirecionando...';
                divSucesso.style.display = 'block';

                // Redirecionar para dashboard apropriado
                setTimeout(() => {
                    const usuario = resposta.usuario;
                    const destinos = {
                        diretor: 'painel-diretor.html',
                        coordenador: 'painel-coordenador.html',
                        professor: 'painel-professor.html',
                        secretaria: 'painel-secretaria.html',
                        aluno: 'painel-aluno.html',
                        responsavel: 'painel-responsavel.html'
                    };
                    window.location.href = destinos[usuario.tipo] || 'index.html';
                }, 800);
            }
        } catch (erro) {
            divErro.textContent = erro.message;
            divErro.style.display = 'block';
        }
    });
});
