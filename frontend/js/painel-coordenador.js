// frontend/js/painel-coordenador.js

let usuario = null;

document.addEventListener('DOMContentLoaded', async () => {
    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    await carregarDashboard();

    document.getElementById('formularioNotificacao').addEventListener('submit', enviarNotificacao);
});

async function verificarAutenticacao() {
    usuario = await exigirPerfil('coordenador');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome}`;
    return true;
}

async function carregarDashboard() {
    try {
        const painel = await api.carregarPainelCoordenador();

        // Atualizar cards
        document.getElementById('totalTurmas').textContent = painel.painel.turmas;
        document.getElementById('alunosRecuperacao').textContent = painel.painel.desempenho.length;

        // Tabela de disciplinas
        const tabelaDisciplinas = document.getElementById('tabelaDisciplinas');
        tabelaDisciplinas.innerHTML = '';

        if (painel.painel.desempenho.length === 0) {
            tabelaDisciplinas.innerHTML = '<tr><td colspan="4" style="text-align: center;">Sem dados</td></tr>';
        } else {
            painel.painel.desempenho.forEach(disciplina => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${disciplina._id}</td>
                    <td><strong>${disciplina.mediaGeral.toFixed(2)}</strong></td>
                    <td>${disciplina.alunosRecuperacao}</td>
                    <td>
                        <button class="btn btn-pequeno btn-sucesso" onclick="enviarAlertaDisciplina('${disciplina._id}')">
                            Alertar
                        </button>
                    </td>
                `;
                tabelaDisciplinas.appendChild(tr);
            });
        }

    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);
    }
}

function carregarSecao(secao) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(secao).style.display = 'block';
    document.querySelectorAll('.menu a').forEach(a => a.classList.remove('ativo'));
    event.target.classList.add('ativo');
}

async function gerarDiagnostico() {
    const periodo = document.getElementById('periodoDiagnostico').value;
    
    try {
        const diagnostico = await api.diagnosticarAlunos(null, periodo);
        
        const conteudo = document.getElementById('conteudoDiagnostico');
        conteudo.innerHTML = '';

        if (diagnostico.diagnosticos.length === 0) {
            conteudo.innerHTML = '<div class="alerta alerta-sucesso">✓ Nenhum aluno em recuperação neste período</div>';
        } else {
            const tabela = document.createElement('table');
            tabela.className = 'tabela';
            
            let html = '<thead><tr><th>Aluno</th><th>Disciplina</th><th>Média</th><th>Recomendação</th></tr></thead><tbody>';
            
            diagnostico.diagnosticos.forEach(diag => {
                html += `
                    <tr>
                        <td>${diag.aluno?.nome || 'N/A'}</td>
                        <td>${diag.disciplina}</td>
                        <td>${diag.media}</td>
                        <td>${diag.recomendacao}</td>
                    </tr>
                `;
            });
            
            html += '</tbody>';
            tabela.innerHTML = html;
            conteudo.appendChild(tabela);
        }

    } catch (erro) {
        console.error('Erro ao gerar diagnóstico:', erro);
        mostrarErro(erro.message);
    }
}

async function carregarDesempenho() {
    const periodo = document.getElementById('periodoDesempenho').value;
    // Implementar carregamento de desempenho
}

async function enviarNotificacao(e) {
    e.preventDefault();

    try {
        const titulo = document.getElementById('notificacaoTitulo').value;
        const mensagem = document.getElementById('notificacaoMensagem').value;

        await api.requisicao('/notificacoes/geral', {
            method: 'POST',
            body: JSON.stringify({
                titulo,
                mensagem,
                destinatarios: 'todos'
            })
        });

        mostrarSucesso('Notificação enviada com sucesso!');
        document.getElementById('formularioNotificacao').reset();

    } catch (erro) {
        mostrarErro(erro.message);
    }
}

async function enviarAlertaDisciplina(disciplina) {
    mostrarSucesso('Alertas sendo enviados para alunos da disciplina ' + disciplina);
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (erro) {
        window.location.href = 'index.html';
    }
}

function mostrarSucesso(mensagem) {
    const alerta = document.createElement('div');
    alerta.className = 'alerta alerta-sucesso';
    alerta.textContent = '✓ ' + mensagem;
    alerta.style.position = 'fixed';
    alerta.style.top = '20px';
    alerta.style.right = '20px';
    alerta.style.zIndex = '9999';
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 3000);
}

function mostrarErro(mensagem) {
    const alerta = document.createElement('div');
    alerta.className = 'alerta alerta-erro';
    alerta.textContent = '❌ ' + mensagem;
    alerta.style.position = 'fixed';
    alerta.style.top = '20px';
    alerta.style.right = '20px';
    alerta.style.zIndex = '9999';
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 4000);
}
