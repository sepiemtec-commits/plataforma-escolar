/* Utilitários compartilhados - Relatórios Acadêmicos */

const BIMESTRES = ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre'];
const NIVEIS_ENSINO = ['Fundamental I', 'Fundamental II', 'Ensino Médio'];

function labelAnoEnsino(nivel, ano) {
    if (nivel === 'Ensino Médio') return `${ano}º Ano EM`;
    return `${ano}º Ano`;
}

let turmasFiltroCache = [];

function formatarNotaBR(valor) {
    if (valor == null || valor === '') return '—';
    return Number(valor).toFixed(2).replace('.', ',');
}

function parseNotaBR(valor) {
    if (valor == null || valor === '') return null;
    const n = parseFloat(String(valor).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function obterAlunoIdUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('alunoId');
}

function voltarAcademico() {
    window.location.href = 'academico.html';
}

function configurarBotaoImprimir() {
    document.querySelectorAll('#btnImprimir, .btn-imprimir-rel').forEach(btn => {
        btn.addEventListener('click', () => window.print());
    });
}

function preencherSelect(select, opcoes, placeholder) {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    opcoes.forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
    });
}

function turmasPorNivel(nivel) {
    return turmasFiltroCache.filter(t => t.nivel === nivel);
}

function anosDisponiveis(nivel) {
    const anos = [...new Set(turmasPorNivel(nivel).map(t => t.ano))];
    return anos.sort((a, b) => a - b);
}

function turmasPorAno(nivel, ano) {
    return turmasPorNivel(nivel).filter(t => String(t.ano) === String(ano));
}

async function carregarTurmasFiltro() {
    const resposta = await api.listarTurmasFiltroRelatorio();
    turmasFiltroCache = resposta.turmas || [];
    return turmasFiltroCache;
}

function configurarFiltrosAcademicos(opcoes = {}) {
    const selEnsino = document.getElementById('filtroEnsino');
    const selAno = document.getElementById('filtroAno');
    const selTurma = document.getElementById('filtroTurma');
    const selAluno = document.getElementById('selectAluno');

    if (!selEnsino || !selAno || !selTurma || !selAluno) return null;

    preencherSelect(selEnsino, NIVEIS_ENSINO.map(n => ({ value: n, label: n })), 'Selecione o nível');

    const resetAno = () => preencherSelect(selAno, [], 'Selecione o nível');
    const resetTurma = () => preencherSelect(selTurma, [], 'Selecione o ano');
    const resetAluno = () => preencherSelect(selAluno, [], 'Selecione a turma');

    resetAno();
    resetTurma();
    resetAluno();

    selEnsino.addEventListener('change', () => {
        const nivel = selEnsino.value;
        resetTurma();
        resetAluno();
        if (!nivel) {
            resetAno();
            return;
        }
        preencherSelect(
            selAno,
            anosDisponiveis(nivel).map(a => ({
                value: String(a),
                label: labelAnoEnsino(nivel, a)
            })),
            'Selecione o ano'
        );
    });

    selAno.addEventListener('change', () => {
        const nivel = selEnsino.value;
        const ano = selAno.value;
        resetAluno();
        if (!nivel || !ano) {
            resetTurma();
            return;
        }
        preencherSelect(
            selTurma,
            turmasPorAno(nivel, ano).map(t => ({ value: String(t._id), label: t.nome })),
            'Selecione a turma'
        );
    });

    selTurma.addEventListener('change', () => {
        const turma = turmasFiltroCache.find(t => String(t._id) === selTurma.value);
        if (!turma) {
            resetAluno();
            return;
        }
        preencherSelect(
            selAluno,
            (turma.alunos || []).map(a => ({
                value: String(a._id),
                label: a.nome + (a.matriculaNumero ? ` (${a.matriculaNumero})` : '')
            })),
            turma.alunos?.length ? 'Selecione o aluno' : 'Nenhum aluno nesta turma'
        );
    });

    if (!turmasFiltroCache.length && typeof exibirErroRelatorio === 'function') {
        exibirErroRelatorio('Nenhuma turma cadastrada. Cadastre turmas e alunos na secretaria.');
    }

    return { selEnsino, selAno, selTurma, selAluno, ...opcoes };
}

function configurarFiltrosGestao(onFiltrar) {
    const selEnsino = document.getElementById('filtroEnsino');
    const selAno = document.getElementById('filtroAno');
    const selTurma = document.getElementById('filtroTurma');
    if (!selEnsino || !selAno || !selTurma) return;

    preencherSelect(selEnsino, NIVEIS_ENSINO.map(n => ({ value: n, label: n })), 'Todos os níveis');
    preencherSelect(selAno, [], 'Todos os anos');
    preencherSelect(selTurma, [], 'Todas as turmas');

    const atualizarAnos = () => {
        const nivel = selEnsino.value;
        const turmas = nivel ? turmasPorNivel(nivel) : turmasFiltroCache;
        const anos = [...new Set(turmas.map(t => t.ano))].sort((a, b) => a - b);
        preencherSelect(
            selAno,
            anos.map(a => ({ value: String(a), label: labelAnoEnsino(nivel || selEnsino.value, a) })),
            'Todos os anos'
        );
        selAno.value = '';
        atualizarTurmas();
    };

    const atualizarTurmas = () => {
        const nivel = selEnsino.value;
        const ano = selAno.value;
        let turmas = turmasFiltroCache;
        if (nivel) turmas = turmas.filter(t => t.nivel === nivel);
        if (ano) turmas = turmas.filter(t => String(t.ano) === ano);
        preencherSelect(
            selTurma,
            turmas.map(t => ({ value: String(t._id), label: t.nome })),
            'Todas as turmas'
        );
        selTurma.value = '';
        onFiltrar?.();
    };

    selEnsino.addEventListener('change', atualizarAnos);
    selAno.addEventListener('change', atualizarTurmas);
    selTurma.addEventListener('change', () => onFiltrar?.());

    atualizarAnos();
}

function aoPronto(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

aoPronto(configurarBotaoImprimir);

async function initRelatorioPage(callback) {
    try {
        await api.verificarToken();
    } catch {
        window.location.href = 'index.html';
        return;
    }

    definirNomeUsuario?.();

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const btnCarregar = document.getElementById('btnCarregar');
    const alunoIdUrl = obterAlunoIdUrl();

    if (usuario.tipo === 'aluno') {
        document.querySelector('.rel-filtros')?.remove();
        const alunoId = usuario.id || usuario._id;
        if (alunoId) {
            try {
                await callback(String(alunoId));
            } catch (erro) {
                exibirErroRelatorio?.(erro.message);
            }
        }
        return;
    }

    const temFiltros = document.getElementById('filtroEnsino');

    try {
        await carregarTurmasFiltro();
    } catch (erro) {
        exibirErroRelatorio?.(erro.message);
        return;
    }

    if (temFiltros) {
        configurarFiltrosAcademicos();
    } else {
        const select = document.getElementById('selectAluno');
        if (select) {
            const resposta = await api.listarAlunosRelatorio();
            preencherSelect(
                select,
                (resposta.alunos || []).map(a => ({ value: String(a._id || a.id), label: a.nome })),
                'Selecione o aluno'
            );
        }
    }

    const select = document.getElementById('selectAluno');

    if (btnCarregar) {
        btnCarregar.type = 'button';
        btnCarregar.addEventListener('click', async () => {
            const id = select?.value;
            if (!id) {
                alert('Selecione nível, ano, turma e aluno');
                return;
            }
            try {
                await callback(id);
            } catch (erro) {
                exibirErroRelatorio?.(erro.message) || alert(erro.message);
            }
        });
    }

    if (alunoIdUrl && select) {
        select.value = String(alunoIdUrl);
        try {
            await callback(String(alunoIdUrl));
        } catch (erro) {
            exibirErroRelatorio?.(erro.message);
        }
    }
}

function renderBoletimTabela(boletim, container) {
    const colsBim = BIMESTRES.map(bim => `
        <th colspan="3" class="rel-boletim-grupo">${bim}</th>
    `).join('');

    const subCols = BIMESTRES.map(() =>
        '<th>AV1</th><th>AV2</th><th>Média</th>'
    ).join('');

    const linhas = boletim.disciplinas.map(d => {
        const bimCells = BIMESTRES.map(bim => {
            const b = d.bimestres[bim] || {};
            return `<td>${formatarNotaBR(b.av1)}</td><td>${formatarNotaBR(b.av2)}</td><td><strong>${formatarNotaBR(b.media)}</strong></td>`;
        }).join('');

        return `<tr>
            <td>${d.disciplina}</td>
            <td>${d.cargaHoraria} Hrs</td>
            <td>${d.professor}</td>
            ${bimCells}
            <td><strong>${formatarNotaBR(d.mediaFinal)}</strong></td>
            <td>${d.faltas}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <p class="rel-escola-nome">${boletim.escola?.nome || 'Escola'} — Boletim Acadêmico</p>
        <p style="text-align:center;margin-bottom:16px;">
            <strong>${boletim.aluno.nome}</strong> · ${boletim.turma?.nome || ''} · ${boletim.anoLetivo}
        </p>
        <div style="overflow-x:auto">
        <table class="rel-tabela">
            <thead>
                <tr><th rowspan="2">Disciplina</th><th rowspan="2">CH</th><th rowspan="2">Professor</th>${colsBim}<th rowspan="2">Média Final</th><th rowspan="2">Faltas</th></tr>
                <tr>${subCols}</tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table></div>`;
}
