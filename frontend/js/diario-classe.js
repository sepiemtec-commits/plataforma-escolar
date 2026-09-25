/* Diário de Classe — lançamento (presença + conteúdo + observações) */

let diarioOpcoes = null;
let diarioDiaAtual = null;
let diarioPresencaRascunho = {};
let diarioUsuario = {};

window.__diarioSetOpcoes = (opcoes) => {
    diarioOpcoes = opcoes;
    preencherSelectsDiarioLancar();
};

window.__diarioCarregarConsulta = async () => {
    await carregarConsultaDiario();
};

function diarioEscapar(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function diarioPodeEditar() {
    return diarioUsuario.tipo === 'professor';
}

function diarioEhGestao() {
    return ['admin', 'diretor', 'coordenador', 'secretaria'].includes(diarioUsuario.tipo);
}

function atualizarModoUsoDiario() {
    const modo = document.getElementById('filtroModoUsoDiario')?.value || 'lancar';
    const painelLancar = document.getElementById('painelLancarDiario');
    const painelConsultar = document.getElementById('painelConsultarDiario');
    const aviso = document.getElementById('avisoInicialDiario');
    const formDia = document.getElementById('formularioDiarioDia');

    if (modo === 'lancar') {
        if (painelLancar) painelLancar.hidden = false;
        if (painelConsultar) painelConsultar.hidden = true;
        if (aviso && !formDia?.hidden) aviso.hidden = true;
        else if (aviso) {
            aviso.hidden = false;
            aviso.innerHTML = 'Selecione data, turma e disciplina e clique em <strong>Abrir diário do dia</strong>.';
        }
        const conteudo = document.getElementById('conteudo');
        if (conteudo && formDia && !formDia.hidden) {
            // mantém formulário; limpa só relatório
        } else if (conteudo && aviso) {
            conteudo.innerHTML = '';
            conteudo.appendChild(aviso);
        }
    } else {
        if (painelLancar) painelLancar.hidden = true;
        if (painelConsultar) painelConsultar.hidden = false;
        if (formDia) formDia.hidden = true;
        if (aviso) {
            aviso.hidden = false;
            aviso.innerHTML = 'Selecione turma, disciplina e período (ou dia) e clique em <strong>Gerar diário</strong>.';
            const conteudo = document.getElementById('conteudo');
            if (conteudo) {
                conteudo.innerHTML = '';
                conteudo.appendChild(aviso);
            }
        }
    }
}

function preencherSelectsDiarioLancar() {
    const turmaEl = document.getElementById('filtroTurmaLancar');
    const discEl = document.getElementById('filtroDisciplinaLancar');
    if (!turmaEl || !discEl || !diarioOpcoes) return;

    preencherSelect(
        turmaEl,
        (diarioOpcoes.turmas || []).map(t => ({ value: String(t._id), label: t.nome })),
        'Selecione a turma'
    );
    preencherSelect(
        discEl,
        (diarioOpcoes.disciplinas || []).map(d => ({ value: d, label: d })),
        'Selecione a disciplina'
    );
}

function calcularTaxasDiario(qtdAlunos, qtdTempos) {
    const statuses = Object.values(diarioPresencaRascunho || {});
    const presentes = statuses.filter(s => s === 'presente').length;
    const faltas = statuses.filter(s => s === 'falta').length;
    const totalEsperado = (qtdAlunos || 0) * (qtdTempos || 1);
    const lancados = presentes + faltas;
    return {
        presentes,
        faltas,
        lancados,
        totalEsperado,
        taxaPresenca: lancados > 0 ? (presentes / lancados) * 100 : 0,
        taxaFalta: lancados > 0 ? (faltas / lancados) * 100 : 0
    };
}

function atualizarResumoDiario() {
    const box = document.getElementById('resumoTaxasDiario');
    if (!box || !diarioDiaAtual) return;
    const taxas = calcularTaxasDiario(
        diarioDiaAtual.alunos?.length || 0,
        diarioDiaAtual.quantidadeTempos || 1
    );
    box.style.display = 'grid';
    document.getElementById('diarioTaxaPresenca').textContent = `${taxas.taxaPresenca.toFixed(1)}%`;
    document.getElementById('diarioTaxaFalta').textContent = `${taxas.taxaFalta.toFixed(1)}%`;
    document.getElementById('diarioTaxaLancados').textContent = `${taxas.lancados}/${taxas.totalEsperado}`;
}

function renderizarPresencaDiario() {
    const lista = document.getElementById('listaPresencaDiario');
    if (!lista || !diarioDiaAtual) return;

    const alunos = diarioDiaAtual.alunos || [];
    const qtdTempos = diarioDiaAtual.quantidadeTempos || 1;
    const editavel = diarioDiaAtual.podeEditar;

    if (!alunos.length) {
        lista.innerHTML = '<p class="presenca-vazio">Nenhum aluno matriculado nesta turma.</p>';
        return;
    }

    const botoesTempo = (alunoId, tempo) => {
        const status = diarioPresencaRascunho[`${alunoId}_${tempo}`];
        const disabled = editavel ? '' : 'disabled';
        return `
        <div class="presenca-tempo-coluna">
            <div class="botoes-presenca botoes-presenca-xs" data-aluno-id="${alunoId}" data-tempo="${tempo}">
                <button type="button" class="btn-presenca btn-p btn-presenca-xs ${status === 'presente' ? 'ativo' : ''}"
                    data-aluno-id="${alunoId}" data-tempo="${tempo}" data-status="presente" title="Presente" ${disabled}>P</button>
                <button type="button" class="btn-presenca btn-f btn-presenca-xs ${status === 'falta' ? 'ativo' : ''}"
                    data-aluno-id="${alunoId}" data-tempo="${tempo}" data-status="falta" title="Falta" ${disabled}>F</button>
            </div>
        </div>`;
    };

    const linhas = alunos.map(aluno => {
        const id = String(aluno._id);
        if (qtdTempos === 1) {
            return `
                <div class="linha-presenca-aluno">
                    <span class="nome-aluno">${diarioEscapar(aluno.nome)}</span>
                    ${botoesTempo(id, 1)}
                </div>`;
        }
        const temposHtml = Array.from({ length: qtdTempos }, (_, i) => botoesTempo(id, i + 1)).join('');
        return `
            <div class="linha-presenca-aluno linha-presenca-multi">
                <span class="nome-aluno">${diarioEscapar(aluno.nome)}</span>
                <div class="presenca-tempos-linha">${temposHtml}</div>
            </div>`;
    }).join('');

    const cabecalho = qtdTempos === 1
        ? `<div class="presenca-cabecalho"><span>Aluno</span><span>Presença</span></div>`
        : `<div class="presenca-cabecalho presenca-cabecalho-multi">
                <span>Aluno</span>
                <div class="presenca-tempos-linha presenca-tempos-cabecalho">
                    ${Array.from({ length: qtdTempos }, (_, i) =>
                        `<div class="presenca-tempo-coluna presenca-tempo-coluna-rotulo"><span class="presenca-tempo-rotulo">${i + 1}º tempo</span></div>`
                    ).join('')}
                </div>
           </div>`;

    lista.innerHTML = cabecalho + linhas;

    if (editavel) {
        lista.querySelectorAll('.btn-presenca').forEach(btn => {
            btn.addEventListener('click', () => {
                const alunoId = btn.dataset.alunoId;
                const tempo = parseInt(btn.dataset.tempo, 10);
                const status = btn.dataset.status;
                diarioPresencaRascunho[`${alunoId}_${tempo}`] = status;
                const grupo = lista.querySelector(
                    `.botoes-presenca[data-aluno-id="${alunoId}"][data-tempo="${tempo}"]`
                );
                grupo?.querySelectorAll('.btn-presenca').forEach(b => {
                    b.classList.toggle('ativo', b.dataset.status === status);
                });
                atualizarResumoDiario();
            });
        });
    }

    atualizarResumoDiario();
}

function preencherFormularioConteudoDiario() {
    const c = diarioDiaAtual?.conteudo;
    document.getElementById('diarioTitulo').value = c?.titulo || '';
    document.getElementById('diarioDescricao').value = c?.descricao || '';
    document.getElementById('diarioTopicos').value = (c?.topicos || []).join(', ');
    document.getElementById('diarioObservacoes').value = c?.observacoes || '';

    const editavel = diarioDiaAtual?.podeEditar;
    ['diarioTitulo', 'diarioDescricao', 'diarioTopicos', 'diarioObservacoes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = !editavel;
    });
    document.getElementById('btnSalvarPresencaDiario').hidden = !editavel;
    document.getElementById('btnSalvarConteudoDiario').hidden = !editavel;
    document.getElementById('btnSalvarTudoDiario').hidden = !editavel;
}

async function abrirDiarioDoDia() {
    const data = document.getElementById('filtroDataLancar')?.value;
    const turmaId = document.getElementById('filtroTurmaLancar')?.value;
    const disciplina = document.getElementById('filtroDisciplinaLancar')?.value;

    if (!data || !turmaId || !disciplina) {
        alert('Selecione data, turma e disciplina');
        return;
    }

    const form = document.getElementById('formularioDiarioDia');
    const status = document.getElementById('statusDiarioDia');
    const rotulo = document.getElementById('rotuloDiarioDia');
    const aviso = document.getElementById('avisoInicialDiario');
    if (status) status.textContent = 'Carregando...';
    if (form) form.hidden = false;
    if (aviso) aviso.hidden = true;

    try {
        const res = await api.obterDiarioAulaDia({ turmaId, disciplina, data });
        diarioDiaAtual = res.dia;
        diarioPresencaRascunho = { ...(res.dia.presencas || {}) };

        const dataBr = data.split('-').reverse().join('/');
        if (rotulo) {
            rotulo.textContent = `${res.dia.turma?.nome || 'Turma'} · ${res.dia.disciplina} · ${dataBr}`;
        }
        if (status) {
            status.textContent = res.dia.podeEditar
                ? 'Modo lançamento'
                : 'Somente leitura';
        }

        renderizarPresencaDiario();
        preencherFormularioConteudoDiario();

        const conteudo = document.getElementById('conteudo');
        if (conteudo) conteudo.innerHTML = '';
    } catch (erro) {
        if (form) form.hidden = true;
        if (aviso) {
            aviso.hidden = false;
            aviso.textContent = erro.message;
        }
        alert(erro.message);
    }
}

async function salvarPresencaDiario() {
    if (!diarioDiaAtual?.podeEditar) return;

    const registros = Object.entries(diarioPresencaRascunho)
        .filter(([, status]) => status === 'presente' || status === 'falta')
        .map(([chave, status]) => {
            const sep = chave.lastIndexOf('_');
            return {
                aluno_id: chave.slice(0, sep),
                tempo: parseInt(chave.slice(sep + 1), 10),
                status
            };
        });

    if (!registros.length) {
        alert('Marque pelo menos um aluno (P ou F) antes de salvar');
        return;
    }

    const btn = document.getElementById('btnSalvarPresencaDiario');
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
        }
        await api.registrarPresencaLote({
            turma_id: diarioDiaAtual.turma._id,
            data: document.getElementById('filtroDataLancar').value,
            disciplina: diarioDiaAtual.disciplina,
            registros
        });
        alert('Presenças e faltas salvas!');
    } catch (erro) {
        alert(erro.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Salvar presenças/faltas';
        }
    }
}

async function salvarConteudoObservacoesDiario() {
    if (!diarioDiaAtual?.podeEditar) return;

    const titulo = document.getElementById('diarioTitulo')?.value?.trim();
    if (!titulo) {
        alert('Informe o título do conteúdo programático');
        return;
    }

    const topicos = (document.getElementById('diarioTopicos')?.value || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

    const btn = document.getElementById('btnSalvarConteudoDiario');
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
        }
        const res = await api.registrarConteudo({
            turma_id: diarioDiaAtual.turma._id,
            disciplina: diarioDiaAtual.disciplina,
            data: document.getElementById('filtroDataLancar').value,
            titulo,
            descricao: document.getElementById('diarioDescricao')?.value || '',
            observacoes: document.getElementById('diarioObservacoes')?.value || '',
            topicos
        });
        diarioDiaAtual.conteudo = {
            _id: res.conteudo?._id,
            titulo,
            descricao: document.getElementById('diarioDescricao')?.value || '',
            observacoes: document.getElementById('diarioObservacoes')?.value || '',
            topicos
        };
        alert('Conteúdo e observações salvos!');
    } catch (erro) {
        alert(erro.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Salvar conteúdo e observações';
        }
    }
}

async function salvarTudoDiario() {
    await salvarPresencaDiario();
    await salvarConteudoObservacoesDiario();
}

async function imprimirDiaDiario() {
    const data = document.getElementById('filtroDataLancar')?.value;
    const turmaId = document.getElementById('filtroTurmaLancar')?.value;
    const disciplina = document.getElementById('filtroDisciplinaLancar')?.value;
    if (!data || !turmaId || !disciplina) {
        alert('Abra o diário do dia antes de imprimir');
        return;
    }

    document.getElementById('filtroModoUsoDiario').value = 'consultar';
    atualizarModoUsoDiario();
    document.getElementById('filtroModoDiario').value = 'dia';
    document.getElementById('filtroModoDiario').dispatchEvent(new Event('change'));
    document.getElementById('filtroDataDiario').value = data;
    document.getElementById('filtroTurmaDiario').value = turmaId;
    document.getElementById('filtroDisciplinaDiario').value = disciplina;
    await carregarConsultaDiario();
    window.print();
}

async function carregarConsultaDiario() {
    const turmaEl = document.getElementById('filtroTurmaDiario');
    const discEl = document.getElementById('filtroDisciplinaDiario');
    const modoEl = document.getElementById('filtroModoDiario');
    const dataEl = document.getElementById('filtroDataDiario');
    const periodoEl = document.getElementById('filtroPeriodoDiario');
    const profEl = document.getElementById('filtroProfessorDiario');

    if (!turmaEl?.value || !discEl?.value) {
        alert('Selecione turma e disciplina');
        return;
    }

    const container = document.getElementById('conteudo');
    if (container) container.innerHTML = '<p class="rel-carregando">Gerando diário...</p>';

    try {
        const res = await api.obterDiarioAula({
            turmaId: turmaEl.value,
            disciplina: discEl.value,
            modo: modoEl?.value || 'periodo',
            data: dataEl?.value,
            periodo: periodoEl?.value,
            ano: diarioOpcoes?.anoLetivo,
            professorId: diarioEhGestao() ? (profEl?.value || undefined) : undefined
        });
        renderDiarioAula(res.diario);
    } catch (erro) {
        exibirErroRelatorio(erro.message);
    }
}

async function initDiarioClasseLancamento() {
    diarioUsuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    const dataLancar = document.getElementById('filtroDataLancar');
    if (dataLancar && !dataLancar.value) dataLancar.valueAsDate = new Date();

    const dataConsulta = document.getElementById('filtroDataDiario');
    if (dataConsulta && !dataConsulta.value) dataConsulta.valueAsDate = new Date();

    const modoUso = document.getElementById('filtroModoUsoDiario');
    if (!diarioPodeEditar() && modoUso) {
        modoUso.value = 'consultar';
        // gestão começa em consulta; professor em lançamento
        const optLancar = modoUso.querySelector('option[value="lancar"]');
        if (optLancar && !diarioPodeEditar()) optLancar.disabled = true;
    }

    modoUso?.addEventListener('change', atualizarModoUsoDiario);
    atualizarModoUsoDiario();

    document.getElementById('btnAbrirDiaDiario')?.addEventListener('click', abrirDiarioDoDia);
    document.getElementById('btnSalvarPresencaDiario')?.addEventListener('click', salvarPresencaDiario);
    document.getElementById('btnSalvarConteudoDiario')?.addEventListener('click', salvarConteudoObservacoesDiario);
    document.getElementById('btnSalvarTudoDiario')?.addEventListener('click', salvarTudoDiario);
    document.getElementById('btnImprimirDiaDiario')?.addEventListener('click', imprimirDiaDiario);

    if (diarioOpcoes) preencherSelectsDiarioLancar();
}

aoPronto(() => {
    if (document.body.dataset.pagina === 'diario-aula') {
        initDiarioClasseLancamento();
    }
});
