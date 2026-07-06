// frontend/js/login.js - Lógica da página de login

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const inputSenha = document.getElementById('senha');

    // Toggle mostrar/ocultar senha
    togglePassword.addEventListener('click', () => {
        if (inputSenha.type === 'password') {
            inputSenha.type = 'text';
            togglePassword.textContent = '🙈';
        } else {
            inputSenha.type = 'password';
            togglePassword.textContent = '👁️';
        }
    });

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
                    switch (usuario.tipo) {
                        case 'diretor':
                            window.location.href = 'painel-diretor.html';
                            break;
                        case 'coordenador':
                            window.location.href = 'painel-coordenador.html';
                            break;
                        case 'professor':
                            window.location.href = 'painel-professor.html';
                            break;
                        case 'secretaria':
                            window.location.href = 'painel-secretaria.html';
                            break;
                        case 'aluno':
                            window.location.href = 'painel-aluno.html';
                            break;
                        default:
                            window.location.href = 'index.html';
                    }
                }, 1500);
            }
        } catch (erro) {
            divErro.textContent = '❌ ' + erro.message;
            divErro.style.display = 'block';
        }
    });
});
