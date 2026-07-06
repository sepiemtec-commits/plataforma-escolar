document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('filtroData').valueAsDate = new Date();
    document.getElementById('btnFiltrar').addEventListener('click', carregarQuadro);
    document.getElementById('filtroDisciplina').addEventListener('change', carregarQuadro);
    document.getElementById('btnVoltar').addEventListener('click', voltarAoPainel);
    document.getElementById('btnLogout').addEventListener('click', async () => {
        try { await api.logout(); } catch {}
        window.location.href = 'index.html';
    });

    try {
        const resposta = await api.verificarToken();
        const usuario = resposta.usuario || JSON.parse(localStorage.getItem('usuario') || '{}');

        if (usuario.tipo === 'professor') {
            window.location.href = 'painel-professor.html';
            return;
        }
    } catch {
        window.location.href = 'index.html';
        return;
    }

    await preencherFiltros();
    await carregarQuadro();
});

function voltarAoPainel() {
    const paineis = {
        diretor: 'painel-diretor.html',
        coordenador: 'painel-coordenador.html',
        secretaria: 'painel-secretaria.html',
        aluno: 'painel-aluno.html'
    };

    try {
        const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
        window.location.href = paineis[usuario.tipo] || 'index.html';
    } catch {
        window.location.href = 'index.html';
    }
}

async function preencherFiltros() {
    const [turmasRes, discRes] = await Promise.all([
        api.listarTurmas(),
        api.listarDisciplinas()
    ]);

    const selectTurma = document.getElementById('filtroTurma');
    (turmasRes.turmas || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        const nivel = t.nivel || 'Fundamental I';
        opt.textContent = `${nivel} · ${t.nome} · ${t.turno || 'Manhã'}`;
        selectTurma.appendChild(opt);
    });

    const selectDisc = document.getElementById('filtroDisciplina');
    (discRes.disciplinas || []).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.nome;
        opt.textContent = `${d.nome} (${d.quantidadeTempos} tempos)`;
        opt.dataset.tempos = d.quantidadeTempos;
        selectDisc.appendChild(opt);
    });
}

function obterTemposDisciplinaSelecionada(disciplinasApi, nomeDisciplina) {
    if (!nomeDisciplina) return 0;
    const disc = disciplinasApi.find(d => d.nome === nomeDisciplina);
    return disc?.quantidadeTempos || 0;
}

async function carregarQuadro() {
    const data = document.getElementById('filtroData').value;
    const turmaId = document.getElementById('filtroTurma').value;
    const disciplina = document.getElementById('filtroDisciplina').value;
    const container = document.getElementById('quadroPresenca');

    try {
        const resposta = await api.obterVisaoGeralPresenca(data, turmaId, disciplina || undefined);
        const quadro = resposta.quadro || [];
        const disciplinas = resposta.disciplinas || [];

        if (!quadro.length) {
            container.innerHTML = '<p style="color:#7f8c8d;">Nenhuma turma cadastrada.</p>';
            return;
        }

        if (disciplina) {
            const qtdTempos = obterTemposDisciplinaSelecionada(disciplinas, disciplina);
            container.innerHTML = renderQuadroPorDisciplina(quadro, disciplina, qtdTempos);
            return;
        }

        container.innerHTML = quadro.map(bloco => renderTurmaTodasDisciplinas(bloco, disciplinas)).join('');
    } catch (erro) {
        container.innerHTML = `<p class="alerta alerta-erro">${erro.message}</p>`;
    }
}

function renderQuadroPorDisciplina(quadro, disciplina, qtdTempos) {
    const colunas = Array.from({ length: qtdTempos }, (_, i) =>
        `<th style="text-align:center;">${i + 1}º</th>`
    ).join('');

    return quadro.map(bloco => {
        if (!(bloco.alunos || []).length) {
            return `
                <div class="card" style="margin-bottom:24px;">
                    <h2 style="margin-bottom:12px;">${bloco.turma.nome} — ${disciplina}</h2>
                    <p style="color:#7f8c8d;">Nenhum aluno matriculado nesta turma.</p>
                </div>`;
        }

        return `
        <div class="card" style="margin-bottom:24px;">
            <h2 style="margin-bottom:12px;">${bloco.turma.nome} — ${disciplina}</h2>
            <table class="tabela">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Matrícula</th>
                        ${colunas}
                    </tr>
                </thead>
                <tbody>
                    ${bloco.alunos.map(aluno => {
                        const temposDisc = (aluno.tempos || []).filter(t => t.disciplina === disciplina);
                        const celulas = Array.from({ length: qtdTempos }, (_, i) => {
                            const reg = temposDisc.find(t => t.tempo === i + 1);
                            return `<td style="text-align:center;">${renderizarStatus(reg?.status)}</td>`;
                        }).join('');
                        return `
                            <tr>
                                <td>${aluno.nome}</td>
                                <td>${aluno.cpf || '—'}</td>
                                ${celulas}
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }).join('');
}

function renderTurmaTodasDisciplinas(bloco, disciplinas) {
    if (!(bloco.alunos || []).length) {
        return `
            <div class="card" style="margin-bottom:24px;">
                <h2 style="margin-bottom:12px;">${bloco.turma.nome}</h2>
                <p style="color:#7f8c8d;">Nenhum aluno matriculado nesta turma.</p>
            </div>`;
    }

    return `
        <div class="card" style="margin-bottom:24px;">
            <h2 style="margin-bottom:12px;">${bloco.turma.nome}</h2>
            ${disciplinas.map(disc => {
                const colunas = Array.from({ length: disc.quantidadeTempos }, (_, i) =>
                    `<th style="text-align:center;">${i + 1}º</th>`
                ).join('');
                return `
                    <h3 style="margin:16px 0 8px;font-size:15px;color:#2c3e50;">${disc.nome}</h3>
                    <table class="tabela" style="margin-bottom:16px;">
                        <thead>
                            <tr>
                                <th>Aluno</th>
                                ${colunas}
                            </tr>
                        </thead>
                        <tbody>
                            ${bloco.alunos.map(aluno => {
                                const temposDisc = (aluno.tempos || []).filter(t => t.disciplina === disc.nome);
                                const celulas = Array.from({ length: disc.quantidadeTempos }, (_, i) => {
                                    const reg = temposDisc.find(t => t.tempo === i + 1);
                                    return `<td style="text-align:center;">${renderizarStatus(reg?.status)}</td>`;
                                }).join('');
                                return `<tr><td>${aluno.nome}</td>${celulas}</tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;
            }).join('')}
        </div>`;
}

function renderizarStatus(status) {
    if (status === 'presente') {
        return '<span class="badge-presenca badge-p">P</span>';
    }
    if (status === 'falta') {
        return '<span class="badge-presenca badge-f">F</span>';
    }
    return '<span style="color:#95a5a6;">—</span>';
}
