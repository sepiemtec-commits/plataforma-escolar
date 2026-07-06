// frontend/js/painel-diretor.js

let usuario = null;

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    carregarSecao('dashboard');

    document.getElementById('btnLogoutMenu').addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader').addEventListener('click', fazerLogout);
    document.getElementById('btnGerarRelatorio').addEventListener('click', gerarRelatorio);
    document.getElementById('btnSalvarConfig').addEventListener('click', salvarConfiguracao);

    await carregarPainel();
});

function configurarNavegacao() {
    const menu = document.querySelector('.menu');
    if (!menu) return;

    menu.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-secao]');
        if (!link) return;

        e.preventDefault();
        carregarSecao(link.dataset.secao, link);
    });
}

async function verificarAutenticacao() {
    usuario = await exigirPerfil('diretor');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome} (${usuario.tipo})`;
    return true;
}

async function carregarPainel() {
    try {
        const painel = await api.carregarPainelDiretor();

        document.getElementById('totalAlunos').textContent = painel.painel.estatisticas.totalAlunos;
        document.getElementById('totalProfessores').textContent = painel.painel.estatisticas.totalProfessores;
        document.getElementById('totalTurmas').textContent = painel.painel.estatisticas.totalTurmas;
        document.getElementById('frequenciaMedia').textContent = painel.painel.estatisticas.frequenciaMedia + '%';

        if (painel.painel.configuracao) {
            preencherConfiguracao(painel.painel.configuracao);
        }

        const tabelaRecuperacao = document.getElementById('tabelaRecuperacao');
        tabelaRecuperacao.innerHTML = '';

        if (painel.painel.alertas.detalhes.length === 0) {
            tabelaRecuperacao.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #27ae60;">✓ Nenhum aluno em recuperação</td></tr>';
        } else {
            painel.painel.alertas.detalhes.forEach(aluno => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${aluno.aluno_id?.nome || 'N/A'}</td>
                    <td>-</td>
                    <td>${aluno.disciplina}</td>
                    <td>${aluno.mediaGeral || 'N/A'}</td>
                    <td><span class="status status-recuperacao">${aluno.situacao}</span></td>
                `;
                tabelaRecuperacao.appendChild(tr);
            });
        }

    } catch (erro) {
        console.error('Erro ao carregar painel:', erro);
    }
}

function preencherConfiguracao(config) {
    const tipoAvaliacao = document.getElementById('tipoAvaliacao');
    const alertasWhatsapp = document.getElementById('alertasWhatsapp');

    if (tipoAvaliacao && config.tipoAvaliacao) {
        tipoAvaliacao.value = config.tipoAvaliacao;
    }
    if (alertasWhatsapp) {
        alertasWhatsapp.checked = config.alertasWhatsapp !== false;
    }
}

function carregarSecao(secao, linkAtivo) {
    document.querySelectorAll('main section').forEach(s => {
        s.style.display = 'none';
    });

    const secaoEl = document.getElementById(secao);
    if (secaoEl) {
        secaoEl.style.display = 'block';
    }

    document.querySelectorAll('.menu a').forEach(a => a.classList.remove('ativo'));
    if (linkAtivo) {
        linkAtivo.classList.add('ativo');
    }

    if (secao === 'usuarios') {
        carregarListaUsuarios();
    }
}

async function carregarListaUsuarios() {
    const container = document.getElementById('listaUsuarios');
    try {
        const resposta = await api.listarUsuarios();
        const usuarios = resposta.usuarios || [];

        if (!usuarios.length) {
            container.innerHTML = '<p>Nenhum usuário encontrado.</p>';
            return;
        }

        container.innerHTML = `
            <table class="tabela">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Tipo</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${usuarios.map(u => `
                        <tr>
                            <td>${u.nome}</td>
                            <td>${u.email}</td>
                            <td>${u.tipo}</td>
                            <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (erro) {
        container.innerHTML = `<p class="alerta alerta-erro">${erro.message}</p>`;
    }
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (erro) {
        window.location.href = 'index.html';
    }
}

function gerarRelatorio() {
    const periodo = document.getElementById('periodoRelatorio').value;
    alert(`Relatório do ${periodo} será gerado. (Funcionalidade em desenvolvimento)`);
}

async function salvarConfiguracao() {
    try {
        await api.salvarConfiguracaoEscola({
            tipoAvaliacao: document.getElementById('tipoAvaliacao').value,
            alertasWhatsapp: document.getElementById('alertasWhatsapp').checked
        });
        alert('Configurações salvas com sucesso!');
    } catch (erro) {
        alert('Erro ao salvar: ' + erro.message);
    }
}

window.carregarSecao = carregarSecao;
window.fazerLogout = fazerLogout;
