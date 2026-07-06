// frontend/js/painel-aluno.js

let usuario = null;

document.addEventListener('DOMContentLoaded', async () => {
    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    await carregarBoletim();
    await carregarNotas();
    await carregarPresenca();
});

async function verificarAutenticacao() {
    usuario = await exigirPerfil('aluno');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome}`;
    return true;
}

async function carregarBoletim() {
    try {
        const painel = await api.carregarPainelAluno();
        
        document.getElementById('frequencia').textContent = painel.painel.frequencia + '%';
        document.getElementById('faltas').textContent = painel.painel.faltas;

        const tabelaBoletim = document.getElementById('tabelaBoletim');
        tabelaBoletim.innerHTML = '';

        painel.painel.boletim.forEach(item => {
            const tr = document.createElement('tr');
            const statusClass = item.situacao === 'aprovado' ? 'status-presente' : 'status-falta';
            tr.innerHTML = `
                <td>${item.disciplina}</td>
                <td>${item.periodo}</td>
                <td><strong>${item.mediaGeral}</strong></td>
                <td>${item.frequenciaPercentual || 0}%</td>
                <td><span class="status ${statusClass}">${item.situacao}</span></td>
            `;
            tabelaBoletim.appendChild(tr);
        });

    } catch (erro) {
        console.error('Erro ao carregar boletim:', erro);
    }
}

async function carregarNotas() {
    try {
        const painel = await api.carregarPainelAluno();
        const periodo = document.getElementById('periodoFiltro').value;

        const tabelaNotas = document.getElementById('tabelaNotas');
        tabelaNotas.innerHTML = '';

        let notas = painel.painel.avaliacoes;
        if (periodo) {
            notas = notas.filter(n => n.periodo === periodo);
        }

        if (notas.length === 0) {
            tabelaNotas.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma nota registrada</td></tr>';
        } else {
            notas.forEach(nota => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${nota.disciplina}</td>
                    <td>${nota.tipo}</td>
                    <td>${nota.periodo}</td>
                    <td><strong>${nota.nota}</strong></td>
                    <td>${new Date(nota.dataAplicacao).toLocaleDateString('pt-BR')}</td>
                `;
                tabelaNotas.appendChild(tr);
            });
        }

    } catch (erro) {
        console.error('Erro ao carregar notas:', erro);
    }
}

async function carregarPresenca() {
    try {
        const resultado = await api.listarPresencaAluno(usuario.id);

        const tabelaPresenca = document.getElementById('tabelaPresenca');
        tabelaPresenca.innerHTML = '';

        if (resultado.presencas.length === 0) {
            tabelaPresenca.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum registro de presença</td></tr>';
        } else {
            resultado.presencas.forEach(presenca => {
                const tr = document.createElement('tr');
                const statusClass = presenca.status === 'presente' ? 'status-presente' : 'status-falta';
                tr.innerHTML = `
                    <td>${new Date(presenca.data).toLocaleDateString('pt-BR')}</td>
                    <td>${presenca.turma_id?.nome || 'N/A'}</td>
                    <td><span class="status ${statusClass}">${presenca.status}</span></td>
                    <td>${presenca.professor_id?.nome || 'N/A'}</td>
                `;
                tabelaPresenca.appendChild(tr);
            });
        }

    } catch (erro) {
        console.error('Erro ao carregar presença:', erro);
    }
}

function carregarSecao(secao) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(secao).style.display = 'block';
    document.querySelectorAll('.menu a').forEach(a => a.classList.remove('ativo'));
    event.target.classList.add('ativo');
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (erro) {
        window.location.href = 'index.html';
    }
}
