document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('filtroData').valueAsDate = new Date();
    document.getElementById('btnFiltrar').addEventListener('click', carregarQuadro);
    document.getElementById('filtroDisciplina').addEventListener('change', carregarQuadro);
    document.getElementById('filtroTurma').addEventListener('change', carregarQuadro);
    document.getElementById('filtroModo').addEventListener('change', onModoChange);
    document.getElementById('filtroPeriodo').addEventListener('change', carregarQuadro);
    document.getElementById('filtroData').addEventListener('change', carregarQuadro);

    try {
        const resposta = await api.verificarToken();
        const usuario = resposta.usuario || JSON.parse(localStorage.getItem('usuario') || '{}');
        localStorage.setItem('usuario', JSON.stringify({
            ...JSON.parse(localStorage.getItem('usuario') || '{}'),
            ...usuario
        }));

        if (usuario.tipo === 'professor') {
            window.location.href = 'painel-professor.html';
            return;
        }

        if (typeof definirNomeUsuario === 'function') definirNomeUsuario();
        if (typeof configurarBotaoVoltar === 'function') {
            configurarBotaoVoltar('linkVoltar');
        }
    } catch {
        window.location.href = 'index.html';
        return;
    }

    await preencherFiltros();
    aplicarTurmaDaUrl();
    sugerirPeriodoAtual();
    onModoChange(false);
    await carregarQuadro();
});

function aplicarTurmaDaUrl() {
    const params = new URLSearchParams(window.location.search);
    const turmaId = params.get('turma_id');
    const select = document.getElementById('filtroTurma');
    if (turmaId && select) {
        select.value = turmaId;
    }
}

function sugerirPeriodoAtual() {
    const mes = new Date().getMonth(); // 0-11
    const select = document.getElementById('filtroPeriodo');
    if (!select) return;

    let periodo = 'Anual';
    if (mes >= 1 && mes <= 3) periodo = '1º Bimestre';
    else if (mes >= 4 && mes <= 6) periodo = '2º Bimestre';
    else if (mes >= 7 && mes <= 8) periodo = '3º Bimestre';
    else if (mes >= 9) periodo = '4º Bimestre';

    select.value = periodo;
}

function onModoChange(recarregar = true) {
    const modo = document.getElementById('filtroModo').value;
    const grupoData = document.getElementById('grupoFiltroData');
    const grupoPeriodo = document.getElementById('grupoFiltroPeriodo');
    const dica = document.getElementById('dicaModoPresenca');
    const inputData = document.getElementById('filtroData');

    const porDia = modo === 'dia';
    if (grupoData) grupoData.style.display = porDia ? '' : 'none';
    if (grupoPeriodo) grupoPeriodo.style.display = porDia ? 'none' : '';
    if (inputData) inputData.required = porDia;

    if (dica) {
        dica.textContent = porDia
            ? 'Visão por dia: percentuais calculados apenas com a chamada da data selecionada.'
            : 'Visão por período: percentuais acumulados do bimestre ou do ano letivo inteiro.';
    }

    if (recarregar) carregarQuadro();
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
        selectDisc.appendChild(opt);
    });
}

function atualizarResumoTaxasQuadro(quadro) {
    const box = document.getElementById('resumoTaxasQuadro');
    if (!box) return;

    let presentes = 0;
    let faltas = 0;
    let lancados = 0;

    (quadro || []).forEach(bloco => {
        (bloco.alunos || []).forEach(a => {
            presentes += a.presentes || 0;
            faltas += a.faltas || 0;
            lancados += a.lancados || 0;
        });
    });

    if (!lancados) {
        box.style.display = 'none';
        return;
    }

    const taxaP = (presentes / lancados) * 100;
    const taxaF = (faltas / lancados) * 100;

    box.style.display = 'grid';
    document.getElementById('quadroTaxaPresenca').textContent = `${taxaP.toFixed(1)}%`;
    document.getElementById('quadroQtdPresenca').textContent = `${presentes} registro(s)`;
    document.getElementById('quadroTaxaFalta').textContent = `${taxaF.toFixed(1)}%`;
    document.getElementById('quadroQtdFalta').textContent = `${faltas} registro(s)`;
    document.getElementById('quadroTaxaLancados').textContent = String(lancados);
    document.getElementById('quadroQtdLancados').textContent = 'total lançado';
}

function formatarPct(valor) {
    if (valor == null) return '—';
    return `${Number(valor).toFixed(1).replace('.', ',')}%`;
}

async function carregarQuadro() {
    const modo = document.getElementById('filtroModo')?.value || 'dia';
    const data = document.getElementById('filtroData').value;
    const periodo = document.getElementById('filtroPeriodo')?.value;
    const turmaId = document.getElementById('filtroTurma').value;
    const disciplina = document.getElementById('filtroDisciplina').value;
    const container = document.getElementById('quadroPresenca');

    if (modo === 'dia' && !data) {
        container.innerHTML = '<p class="rel-aviso">Selecione a data.</p>';
        return;
    }

    container.innerHTML = '<p class="rel-carregando">Carregando...</p>';

    try {
        const resposta = await api.obterVisaoGeralPresenca({
            modo,
            data,
            periodo,
            turmaId: turmaId || undefined,
            disciplina: disciplina || undefined
        });

        const quadro = resposta.quadro || [];
        atualizarResumoTaxasQuadro(quadro);

        if (!quadro.length) {
            container.innerHTML = '<p class="rel-aviso">Nenhuma turma cadastrada.</p>';
            return;
        }

        const rotulo = resposta.modo === 'periodo'
            ? `${resposta.periodo} · ${resposta.anoLetivo}${disciplina ? ` · ${disciplina}` : ''}`
            : `${formatarDataExibicao(resposta.periodo)}${disciplina ? ` · ${disciplina}` : ''}`;

        container.innerHTML = `
            <p class="rel-verificacao-dica" style="margin-top:0;">Filtro: <strong>${escaparHtml(rotulo)}</strong></p>
            ${quadro.map(renderBlocoTurma).join('')}`;
    } catch (erro) {
        container.innerHTML = `<p class="rel-erro">${escaparHtml(erro.message)}</p>`;
        const box = document.getElementById('resumoTaxasQuadro');
        if (box) box.style.display = 'none';
    }
}

function formatarDataExibicao(valor) {
    const texto = String(valor || '');
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return texto || '—';
}

function renderBlocoTurma(bloco) {
    const alunos = bloco.alunos || [];
    if (!alunos.length) {
        return `
            <div class="rel-bloco-card">
                <h2 class="rel-subtitulo">${escaparHtml(bloco.turma?.nome || 'Turma')}</h2>
                <p class="rel-aviso">Nenhum aluno matriculado nesta turma.</p>
            </div>`;
    }

    return `
        <div class="rel-bloco-card">
            <h2 class="rel-subtitulo">${escaparHtml(bloco.turma?.nome || 'Turma')}</h2>
            <div style="overflow-x:auto;">
            <table class="rel-tabela">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Aluno</th>
                        <th>Presenças</th>
                        <th>Faltas</th>
                        <th>Just.</th>
                        <th>Atrasos</th>
                        <th>% Presença</th>
                        <th>% Falta</th>
                    </tr>
                </thead>
                <tbody>
                    ${alunos.map((aluno, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td style="text-align:left;">${escaparHtml(aluno.nome)}</td>
                            <td>${aluno.presentes || 0}</td>
                            <td>${aluno.faltas || 0}</td>
                            <td>${aluno.justificadas || 0}</td>
                            <td>${aluno.atrasos || 0}</td>
                            <td>${escaparHtml(formatarPct(aluno.taxaPresenca))}</td>
                            <td>${escaparHtml(formatarPct(aluno.taxaFalta))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        </div>`;
}
