let turmas = [];
let ordenacaoTurmas = localStorage.getItem('secretariaOrdemTurmas') || 'cadastro';
let horariosTurmaAtual = null;
let horariosGridCache = {};

const ORDEM_NIVEL_ENSINO = {
    'Fundamental I': 1,
    'Fundamental II': 2,
    'Ensino Médio': 3
};
let professores = [];
let funcionarios = [];
let disciplinas = [];

const ANOS_POR_NIVEL = {
    'Fundamental I': [1, 2, 3, 4, 5],
    'Fundamental II': [6, 7, 8, 9],
    'Ensino Médio': [1, 2, 3]
};

const LABEL_TIPO = {
    professor: 'Professor',
    coordenador: 'Coordenador',
    secretaria: 'Secretaria',
    servente: 'Servente',
    porteiro: 'Porteiro',
    estagiario: 'Estagiário(a)',
    orientador_pedagogico: 'Orientador Pedagógico',
    agente_inclusao: 'Agente de Inclusão',
    bibliotecaria: 'Bibliotecária',
    copeira: 'Copeira',
    auxiliar_coordenacao: 'Auxiliar de Coordenação',
    aluno: 'Aluno'
};

function formatarDisciplinasFuncionario(funcionario) {
    if (Array.isArray(funcionario.disciplinas) && funcionario.disciplinas.length) {
        return [...funcionario.disciplinas]
            .map(formatarNomeDisciplina)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .join(' · ');
    }
    return funcionario.disciplina ? formatarNomeDisciplina(funcionario.disciplina) : '—';
}

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();
    configurarPortalSecretaria();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    carregarSecao('portal');

    document.getElementById('btnLogoutMenu').addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader').addEventListener('click', fazerLogout);
    document.getElementById('formTurma').addEventListener('submit', criarTurma);
    document.getElementById('formEditarTurma').addEventListener('submit', salvarEdicaoTurma);
    document.getElementById('btnFecharModalTurma').addEventListener('click', fecharModalEditarTurma);
    document.getElementById('btnCancelarEditTurma').addEventListener('click', fecharModalEditarTurma);
    document.getElementById('modalEditarTurma').addEventListener('click', (e) => {
        if (e.target.id === 'modalEditarTurma') fecharModalEditarTurma();
    });
    document.getElementById('formTransferirAluno').addEventListener('submit', confirmarTransferenciaAluno);
    document.getElementById('btnFecharModalTransferir').addEventListener('click', fecharModalTransferirAluno);
    document.getElementById('btnCancelarTransferir').addEventListener('click', fecharModalTransferirAluno);
    document.getElementById('modalTransferirAluno').addEventListener('click', (e) => {
        if (e.target.id === 'modalTransferirAluno') fecharModalTransferirAluno();
    });
    configurarFormTurma();
    configurarFormEditarTurma();
    document.getElementById('formAluno').addEventListener('submit', cadastrarAluno);
    document.getElementById('formFuncionario').addEventListener('submit', cadastrarFuncionario);
    document.getElementById('funcTipo').addEventListener('change', atualizarCampoDisciplinaFuncionario);
    document.getElementById('btnAccordionDisciplinas')?.addEventListener('click', alternarAccordionDisciplinasFuncionario);
    document.getElementById('formDisciplina').addEventListener('submit', cadastrarDisciplina);
    document.getElementById('filtroTipoFunc').addEventListener('change', renderizarFuncionarios);
    document.getElementById('btnExportarFuncionariosXls').addEventListener('click', exportarFuncionariosXls);
    document.getElementById('btnListarAlunos').addEventListener('click', listarAlunosTurmas);
    document.getElementById('btnImprimirAlunos').addEventListener('click', () => window.print());
    document.getElementById('btnVoltarTurmas').addEventListener('click', fecharDetalheTurma);
    document.querySelectorAll('[data-voltar-portal]').forEach(btn => {
        btn.addEventListener('click', voltarAoPortal);
    });
    document.getElementById('toggleOrdemTurmasPorNivel').addEventListener('change', alternarOrdemTurmas);

    document.getElementById('horarioTurmaSelect')?.addEventListener('change', carregarQuadroHorariosSecretaria);
    document.getElementById('horarioTurnoSelect')?.addEventListener('change', carregarQuadroHorariosSecretaria);
    document.getElementById('btnSalvarHorarios')?.addEventListener('click', salvarQuadroHorariosSecretaria);

    document.getElementById('formEditarProfessor')?.addEventListener('submit', salvarEdicaoProfessor);
    document.getElementById('btnFecharModalEditProf')?.addEventListener('click', fecharModalEditarProfessor);
    document.getElementById('btnCancelarEditProf')?.addEventListener('click', fecharModalEditarProfessor);
    document.getElementById('btnEditProfIrHorarios')?.addEventListener('click', () => {
        fecharModalEditarProfessor();
        const menuLink = document.querySelector('.menu a[data-secao="horarios"]');
        carregarSecao('horarios', menuLink);
    });
    document.getElementById('modalEditarProfessor')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalEditarProfessor') fecharModalEditarProfessor();
    });

    const toggleOrdem = document.getElementById('toggleOrdemTurmasPorNivel');
    toggleOrdem.checked = ordenacaoTurmas === 'nivel';
    atualizarDicaOrdemTurmas();

    montarGridUpload(document.getElementById('docsAlunoCadastro'), 'aluno', 'aluno');
    montarGridUpload(document.getElementById('docsFuncionarioCadastro'), 'funcionario', 'func');
    await carregarDados();
});

function configurarNavegacao() {
    document.querySelector('.menu').addEventListener('click', (e) => {
        const link = e.target.closest('a[data-secao]');
        if (!link) return;
        e.preventDefault();
        carregarSecao(link.dataset.secao, link);
    });
}

async function verificarAutenticacao() {
    const usuario = await exigirPerfil('secretaria');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome} (secretaria)`;
    return true;
}

async function carregarDados() {
    try {
        const painel = await api.carregarPainelSecretaria();
        turmas = painel.painel.turmas || [];
        professores = painel.painel.professores || [];
        funcionarios = painel.painel.funcionarios || [];

        document.getElementById('totalTurmas').textContent = painel.painel.totalTurmas;
        document.getElementById('totalAlunos').textContent = painel.painel.totalAlunos;
        document.getElementById('totalFuncionarios').textContent = painel.painel.totalFuncionarios || funcionarios.length;

        preencherSelectProfessores();
        preencherSelectTurmasAluno();
        preencherFiltroTurmasAlunos();
        renderizarTurmas();
        renderizarAlunosPorTurma();
        renderizarFuncionarios();
        preencherSelectTurmaPortal();
        renderizarTurmasResumoPortal();
        preencherSelectHorarioTurma();
        await carregarDisciplinas();
        atualizarCampoDisciplinaFuncionario();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function preencherSelectHorarioTurma() {
    const select = document.getElementById('horarioTurmaSelect');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione a turma</option>';
    getTurmasOrdenadas().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = `${t.nome} · ${t.turno || 'Manhã'}`;
        opt.dataset.turno = t.turno || 'Manhã';
        select.appendChild(opt);
    });
    if (valorAtual) select.value = valorAtual;
}

function opcoesProfessoresHtml(selecionado) {
    const opts = ['<option value="">—</option>'];
    professores.forEach(p => {
        const sel = String(p._id) === String(selecionado) ? ' selected' : '';
        opts.push(`<option value="${escaparHtml(p._id)}"${sel}>${escaparHtml(p.nome)}</option>`);
    });
    return opts.join('');
}

function opcoesDisciplinasHtml(selecionada, turma) {
    const lista = turma
        ? disciplinas.filter(d => disciplinaPermitidaParaTurma(d.nome || d, turma))
        : disciplinas;
    const opts = ['<option value="">—</option>'];
    lista.forEach(d => {
        const nome = d.nome || d;
        const sel = nome === selecionada ? ' selected' : '';
        opts.push(`<option value="${escaparHtml(nome)}"${sel}>${escaparHtml(nome)}</option>`);
    });
    return opts.join('');
}

async function carregarQuadroHorariosSecretaria() {
    const turmaId = document.getElementById('horarioTurmaSelect')?.value;
    const tabela = document.getElementById('tabelaHorariosSecretaria');
    const placeholder = document.getElementById('horariosPlaceholder');
    const turnoSelect = document.getElementById('horarioTurnoSelect');

    if (!turmaId) {
        horariosTurmaAtual = null;
        horariosGridCache = {};
        if (tabela) tabela.style.display = 'none';
        if (placeholder) {
            placeholder.style.display = '';
            placeholder.textContent = 'Selecione uma turma para montar o quadro de horários.';
        }
        return;
    }

    const turmaOpt = document.getElementById('horarioTurmaSelect').selectedOptions[0];
    if (turnoSelect && turmaOpt?.dataset.turno && turmaOpt.dataset.turno !== 'Integral') {
        turnoSelect.value = turmaOpt.dataset.turno;
    }

    const turno = turnoSelect?.value || 'Manhã';

    try {
        const resposta = await api.listarHorariosTurma(turmaId, turno);
        horariosTurmaAtual = resposta.turma;
        horariosGridCache = {};

        (resposta.horarios || []).forEach(h => {
            horariosGridCache[`${h.horaInicio}|${h.diaSemana}`] = h;
        });

        renderizarQuadroHorariosSecretaria(resposta.slots || [], resposta.diasSemana || []);
        if (placeholder) placeholder.style.display = 'none';
        if (tabela) tabela.style.display = '';
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function renderizarQuadroHorariosSecretaria(slots, dias) {
    const cabecalho = document.getElementById('cabecalhoHorariosSecretaria');
    const corpo = document.getElementById('corpoHorariosSecretaria');
    if (!cabecalho || !corpo) return;

    cabecalho.innerHTML = `<tr><th>Horário</th>${dias.map(d => `<th>${escaparHtml(d)}</th>`).join('')}</tr>`;

    corpo.innerHTML = slots.map(hora => {
        const celulas = dias.map((_, dia) => {
            const chave = `${hora}|${dia}`;
            const atual = horariosGridCache[chave] || {};
            const profId = atual.professor_id?._id || atual.professor_id || '';
            const disc = atual.disciplina || '';
            return `<td class="celula-horario-edit">
                <select class="horario-prof-select" data-hora="${escaparHtml(hora)}" data-dia="${dia}" aria-label="Professor">
                    ${opcoesProfessoresHtml(profId)}
                </select>
                <select class="horario-disc-select" data-hora="${escaparHtml(hora)}" data-dia="${dia}" aria-label="Disciplina">
                    ${opcoesDisciplinasHtml(disc, horariosTurmaAtual)}
                </select>
            </td>`;
        }).join('');
        return `<tr><td>${escaparHtml(hora)}</td>${celulas}</tr>`;
    }).join('');
}

async function salvarQuadroHorariosSecretaria() {
    const turmaId = document.getElementById('horarioTurmaSelect')?.value;
    if (!turmaId) {
        mostrarErro('Selecione a turma');
        return;
    }

    const turno = document.getElementById('horarioTurnoSelect')?.value || 'Manhã';
    const horarios = [];
    let erroValidacao = null;

    document.querySelectorAll('#corpoHorariosSecretaria .celula-horario-edit').forEach(celula => {
        if (erroValidacao) return;
        const profSelect = celula.querySelector('.horario-prof-select');
        const discSelect = celula.querySelector('.horario-disc-select');
        const professor_id = profSelect?.value;
        const disciplina = discSelect?.value;

        if (!professor_id && !disciplina) return;
        if (!professor_id || !disciplina) {
            erroValidacao = 'Preencha professor e disciplina em todas as células parcialmente preenchidas';
            return;
        }

        horarios.push({
            diaSemana: parseInt(profSelect.dataset.dia, 10),
            horaInicio: profSelect.dataset.hora,
            professor_id,
            disciplina
        });
    });

    if (erroValidacao) {
        mostrarErro(erroValidacao);
        return;
    }

    try {
        await api.salvarHorariosTurma(turmaId, { turno, horarios });
        mostrarSucesso('Horários salvos com sucesso!');
        await carregarQuadroHorariosSecretaria();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function abrirHorariosTurma(turmaId) {
    const menuLink = document.querySelector('.menu a[data-secao="horarios"]');
    carregarSecao('horarios', menuLink);
    const select = document.getElementById('horarioTurmaSelect');
    if (select) {
        select.value = turmaId;
        carregarQuadroHorariosSecretaria();
    }
}

async function carregarDisciplinas() {
    try {
        const resposta = await api.listarDisciplinas();
        disciplinas = (resposta.disciplinas || []).map(d => ({
            ...d,
            nome: formatarNomeDisciplina(d.nome)
        }));
        const totalDisc = document.getElementById('totalDisciplinas');
        if (totalDisc) totalDisc.textContent = disciplinas.length;
        renderizarDisciplinas();
        preencherChecklistDisciplinaFuncionario();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function preencherSelectTurmaPortal() {
    const select = document.getElementById('selectTurmaPortal');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>';
    getTurmasOrdenadas().forEach(turma => {
        const opt = document.createElement('option');
        opt.value = turma._id;
        opt.textContent = turma.nome;
        select.appendChild(opt);
    });
    if (valorAtual) select.value = valorAtual;
}

function renderizarTurmasResumoPortal() {
    const corpo = document.getElementById('corpoTurmasResumo');
    if (!corpo) return;

    const filtroId = document.getElementById('selectTurmaPortal')?.value;
    let lista = getTurmasOrdenadas();
    if (filtroId) {
        lista = lista.filter(t => String(t._id) === filtroId);
    }

    if (!lista.length) {
        corpo.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:16px;">Nenhuma turma cadastrada</td></tr>';
        return;
    }

    corpo.innerHTML = lista.slice(0, 12).map(t => `
        <tr data-turma-id="${escaparHtml(t._id)}">
            <td><strong>${escaparHtml(t.nome)}</strong></td>
            <td>${escaparHtml(t.nivel || '—')}</td>
            <td>${escaparHtml(t.turno || '—')}</td>
            <td>${(t.alunos || []).length}</td>
        </tr>
    `).join('');

    if (lista.length > 12) {
        corpo.innerHTML += `<tr><td colspan="4" style="text-align:center;color:#78909c;font-size:13px;padding:10px;">+ ${lista.length - 12} turma(s) — veja em Turmas</td></tr>`;
    }
}

const CHAVE_EXIBIR_LISTA_TURMAS = 'secretariaExibirListaTurmas';

function listaTurmasVisivel() {
    return localStorage.getItem(CHAVE_EXIBIR_LISTA_TURMAS) === '1';
}

function aplicarVisibilidadeListaTurmas(mostrar) {
    localStorage.setItem(CHAVE_EXIBIR_LISTA_TURMAS, mostrar ? '1' : '0');

    const corpoPortal = document.getElementById('corpoListaTurmasPortal');
    const corpoSecao = document.getElementById('corpoListaTurmasSecao');
    const dicaPortal = document.getElementById('dicaListaTurmasPortal');
    const togglePortal = document.getElementById('toggleListaTurmasPortal');
    const toggleSecao = document.getElementById('toggleListaTurmasSecao');

    if (corpoPortal) corpoPortal.hidden = !mostrar;
    if (corpoSecao) corpoSecao.hidden = !mostrar;
    if (dicaPortal) dicaPortal.hidden = mostrar;
    if (togglePortal) togglePortal.checked = mostrar;
    if (toggleSecao) toggleSecao.checked = mostrar;
}

function configurarToggleListaTurmas() {
    aplicarVisibilidadeListaTurmas(listaTurmasVisivel());

    document.getElementById('toggleListaTurmasPortal')?.addEventListener('change', (e) => {
        aplicarVisibilidadeListaTurmas(e.target.checked);
    });

    document.getElementById('toggleListaTurmasSecao')?.addEventListener('change', (e) => {
        aplicarVisibilidadeListaTurmas(e.target.checked);
    });
}

function configurarPortalSecretaria() {
    configurarToggleListaTurmas();
    document.getElementById('selectTurmaPortal')?.addEventListener('change', () => {
        renderizarTurmasResumoPortal();
        const turmaId = document.getElementById('selectTurmaPortal').value;
        const filtro = document.getElementById('filtroTurmaAlunos');
        if (filtro && turmaId) filtro.value = turmaId;
        const alunoTurma = document.getElementById('alunoTurma');
        if (alunoTurma && turmaId) alunoTurma.value = turmaId;
    });

    document.querySelectorAll('.portal-acao').forEach(btn => {
        btn.addEventListener('click', () => {
            const link = btn.dataset.link;
            if (link) {
                window.location.href = link;
                return;
            }

            const secao = btn.dataset.acao;
            const scrollId = btn.dataset.scroll;
            const turmaId = document.getElementById('selectTurmaPortal')?.value;

            if (turmaId) {
                const filtro = document.getElementById('filtroTurmaAlunos');
                const alunoTurma = document.getElementById('alunoTurma');
                if (filtro) filtro.value = turmaId;
                if (alunoTurma) alunoTurma.value = turmaId;
            }

            const menuLink = document.querySelector(`.menu a[data-secao="${secao}"]`);
            carregarSecao(secao, menuLink || null);

            if (secao === 'horarios' && turmaId) {
                const horarioSelect = document.getElementById('horarioTurmaSelect');
                if (horarioSelect) {
                    horarioSelect.value = turmaId;
                    carregarQuadroHorariosSecretaria();
                }
            }

            if (scrollId) {
                setTimeout(() => {
                    document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            }
        });
    });
}

function preencherChecklistDisciplinaFuncionario() {
    const container = document.getElementById('funcDisciplinasLista');
    if (!container) return;

    if (!disciplinas.length) {
        container.innerHTML = '<p style="color:#7f8c8d;margin:0;">Nenhuma disciplina cadastrada. Cadastre em Disciplinas antes de vincular ao professor.</p>';
        atualizarResumoDisciplinasFuncionario();
        return;
    }

    const ordenadas = [...disciplinas].sort((a, b) =>
        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    );

    container.innerHTML = ordenadas.map(d => {
        const nome = formatarNomeDisciplina(d.nome || d);
        return `
        <label class="disciplina-sanfona-item">
            <input type="checkbox" name="funcDisciplinas" value="${escaparHtml(nome)}">
            <span class="disciplina-sanfona-nome">${escaparHtml(nome)}</span>
        </label>`;
    }).join('');

    container.querySelectorAll('input[name="funcDisciplinas"]').forEach(cb => {
        cb.addEventListener('change', atualizarResumoDisciplinasFuncionario);
    });

    atualizarResumoDisciplinasFuncionario();
}

function abrirAccordionDisciplinasFuncionario() {
    const btn = document.getElementById('btnAccordionDisciplinas');
    const corpo = document.getElementById('corpoAccordionDisciplinas');
    const seta = document.getElementById('setaAccordionDisciplinas');
    if (!btn || !corpo) return;
    btn.setAttribute('aria-expanded', 'true');
    corpo.hidden = false;
    if (seta) seta.textContent = '▼';
}

function fecharAccordionDisciplinasFuncionario() {
    const btn = document.getElementById('btnAccordionDisciplinas');
    const corpo = document.getElementById('corpoAccordionDisciplinas');
    const seta = document.getElementById('setaAccordionDisciplinas');
    if (!btn || !corpo) return;
    btn.setAttribute('aria-expanded', 'false');
    corpo.hidden = true;
    if (seta) seta.textContent = '▶';
}

function alternarAccordionDisciplinasFuncionario() {
    const btn = document.getElementById('btnAccordionDisciplinas');
    const corpo = document.getElementById('corpoAccordionDisciplinas');
    const seta = document.getElementById('setaAccordionDisciplinas');
    if (!btn || !corpo) return;

    const aberto = btn.getAttribute('aria-expanded') === 'true';
    const vaiAbrir = !aberto;

    btn.setAttribute('aria-expanded', vaiAbrir ? 'true' : 'false');
    corpo.hidden = !vaiAbrir;
    if (seta) seta.textContent = vaiAbrir ? '▼' : '▶';

    if (vaiAbrir) {
        if (!disciplinas.length) {
            carregarDisciplinas();
        } else {
            preencherChecklistDisciplinaFuncionario();
        }
    }
}

function atualizarResumoDisciplinasFuncionario() {
    const resumo = document.getElementById('resumoDisciplinasFunc');
    if (!resumo) return;

    const selecionadas = obterDisciplinasSelecionadasFuncionario();
    if (!selecionadas.length) {
        resumo.textContent = 'Nenhuma selecionada';
        return;
    }
    if (selecionadas.length <= 2) {
        resumo.textContent = selecionadas.map(formatarNomeDisciplina).join(', ');
        return;
    }
    resumo.textContent = `${selecionadas.length} disciplinas selecionadas`;
}

function obterDisciplinasSelecionadasFuncionario() {
    return [...document.querySelectorAll('#funcDisciplinasLista input[name="funcDisciplinas"]:checked')]
        .map(cb => formatarNomeDisciplina(cb.value));
}

function atualizarCampoDisciplinaFuncionario() {
    const grupo = document.getElementById('grupoFuncDisciplina');
    const ehProfessor = document.getElementById('funcTipo').value === 'professor';
    if (grupo) grupo.style.display = ehProfessor ? 'block' : 'none';

    if (ehProfessor) {
        fecharAccordionDisciplinasFuncionario();
        if (!disciplinas.length) {
            carregarDisciplinas();
        } else {
            preencherChecklistDisciplinaFuncionario();
        }
    } else {
        fecharAccordionDisciplinasFuncionario();
    }
}

async function cadastrarDisciplina(e) {
    e.preventDefault();

    try {
        await api.criarDisciplina({
            nome: formatarNomeDisciplina(document.getElementById('disciplinaNome').value.trim()),
            quantidadeTempos: parseInt(document.getElementById('disciplinaTempos').value, 10)
        });

        document.getElementById('formDisciplina').reset();
        document.getElementById('disciplinaTempos').value = '1';
        mostrarSucesso('Disciplina cadastrada!');
        await carregarDisciplinas();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function renderizarDisciplinas() {
    const container = document.getElementById('listaDisciplinas');
    if (!container) return;
    if (!disciplinas.length) {
        container.innerHTML = '<p style="color:#7f8c8d;">Nenhuma disciplina cadastrada.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela">
            <thead>
                <tr>
                    <th>Disciplina</th>
                    <th>Tempos por aula</th>
                    <th style="text-align:right;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${disciplinas.map(d => {
                    const nome = formatarNomeDisciplina(d.nome);
                    const restricao = labelRestricaoDisciplina(nome);
                    return `
                    <tr data-id="${escaparHtml(d._id)}">
                        <td>
                            <strong>${escaparHtml(nome)}</strong>
                            ${restricao ? `<br><small style="color:#7f8c8d;">${escaparHtml(restricao)}</small>` : ''}
                        </td>
                        <td>
                            <input type="number" class="input-tempos-disciplina" min="1" max="12"
                                value="${escaparHtml(d.quantidadeTempos)}" data-id="${escaparHtml(d._id)}" style="width:80px;">
                            tempo(s)
                        </td>
                        <td style="text-align:right;">
                            <button type="button" class="btn btn-pequeno btn-sucesso btn-salvar-disciplina" data-id="${escaparHtml(d._id)}">Salvar</button>
                            <button type="button" class="btn btn-pequeno btn-perigo btn-excluir-disciplina" data-id="${escaparHtml(d._id)}">Excluir</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;

    container.querySelectorAll('.btn-salvar-disciplina').forEach(btn => {
        btn.addEventListener('click', () => salvarDisciplina(btn.dataset.id));
    });
    container.querySelectorAll('.btn-excluir-disciplina').forEach(btn => {
        btn.addEventListener('click', () => excluirDisciplina(btn.dataset.id));
    });
}

async function salvarDisciplina(id) {
    const input = document.querySelector(`.input-tempos-disciplina[data-id="${id}"]`);
    const disc = disciplinas.find(d => String(d._id) === id);

    try {
        await api.atualizarDisciplina(id, {
            nome: disc?.nome,
            quantidadeTempos: parseInt(input.value, 10)
        });
        mostrarSucesso('Disciplina atualizada!');
        await carregarDisciplinas();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

async function excluirDisciplina(id) {
    const disc = disciplinas.find(d => String(d._id) === id);
    if (!confirm(`Remover a disciplina "${disc?.nome}"?`)) return;

    try {
        await api.excluirDisciplina(id);
        mostrarSucesso('Disciplina removida!');
        await carregarDisciplinas();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function labelAnoEnsino(nivel, ano) {
    if (nivel === 'Ensino Médio') return `${ano}º Ano EM`;
    return `${ano}º Ano`;
}

function maxCharsSerieTurma(nivel) {
    return nivel === 'Ensino Médio' ? 4 : 3;
}

function aplicarLimiteSerieTurma(input, nivel) {
    if (!input) return;
    const max = maxCharsSerieTurma(nivel);
    input.maxLength = max;
    input.placeholder = nivel === 'Ensino Médio' ? 'A, B, T1...' : 'A, B, C';
    if (input.value.length > max) {
        input.value = input.value.slice(0, max);
    }
}

function sugerirNomeTurma(nivel, ano, serie) {
    const letra = (serie || 'A').trim().toUpperCase();
    if (nivel === 'Ensino Médio') return `${ano}º Ano EM ${letra}`;
    return `${ano}º Ano ${letra}`;
}

function configurarFormTurma() {
    const selNivel = document.getElementById('turmaNivel');
    const selAno = document.getElementById('turmaAno');
    const inputSerie = document.getElementById('turmaSerie');
    const inputNome = document.getElementById('turmaNome');
    const grupoProfessor = document.getElementById('grupoProfessorTurma');

    function atualizarAnos() {
        const nivel = selNivel.value;
        selAno.innerHTML = '<option value="">Selecione o ano</option>';
        selAno.disabled = !nivel;

        if (!nivel) {
            grupoProfessor.style.display = 'none';
            return;
        }

        (ANOS_POR_NIVEL[nivel] || []).forEach(ano => {
            const opt = document.createElement('option');
            opt.value = ano;
            opt.textContent = labelAnoEnsino(nivel, ano);
            selAno.appendChild(opt);
        });

        alternarGrupoProfessor(nivel, grupoProfessor, document.getElementById('turmaProfessor'));
        aplicarLimiteSerieTurma(inputSerie, nivel);
        sugerirNome();
    }

    function sugerirNome() {
        const nivel = selNivel.value;
        const ano = selAno.value;
        const serie = inputSerie.value;
        if (nivel && ano) {
            inputNome.value = sugerirNomeTurma(nivel, parseInt(ano, 10), serie);
        }
    }

    selNivel.addEventListener('change', atualizarAnos);
    selAno.addEventListener('change', sugerirNome);
    inputSerie.addEventListener('input', sugerirNome);
}

function configurarFormEditarTurma() {
    const selNivel = document.getElementById('editTurmaNivel');
    const selAno = document.getElementById('editTurmaAno');
    const inputSerie = document.getElementById('editTurmaSerie');
    const inputNome = document.getElementById('editTurmaNome');
    const grupoProfessor = document.getElementById('grupoEditProfessorTurma');
    const selProfessor = document.getElementById('editTurmaProfessor');

    function atualizarFormEdit() {
        const nivel = selNivel.value;
        preencherAnosTurma(selAno, nivel, selAno.value || ANOS_POR_NIVEL[nivel]?.[0]);
        alternarGrupoProfessor(nivel, grupoProfessor, selProfessor, selProfessor.value);
        aplicarLimiteSerieTurma(inputSerie, nivel);
        if (selAno.value && nivel) {
            inputNome.value = sugerirNomeTurma(nivel, parseInt(selAno.value, 10), inputSerie.value);
        }
    }

    selNivel.addEventListener('change', atualizarFormEdit);
    selAno.addEventListener('change', () => {
        if (selNivel.value && selAno.value) {
            inputNome.value = sugerirNomeTurma(selNivel.value, parseInt(selAno.value, 10), inputSerie.value);
        }
    });
    inputSerie.addEventListener('input', () => {
        if (selNivel.value && selAno.value) {
            inputNome.value = sugerirNomeTurma(selNivel.value, parseInt(selAno.value, 10), inputSerie.value);
        }
    });
}

function abrirModalEditarTurma(turma) {
    const nivel = turma.nivel || 'Fundamental I';
    const professorId = turma.professor_id?._id || turma.professor_id || '';

    document.getElementById('editTurmaId').value = turma._id;
    document.getElementById('editTurmaNivel').value = nivel;
    preencherAnosTurma(document.getElementById('editTurmaAno'), nivel, turma.ano);
    document.getElementById('editTurmaSerie').value = turma.serie || '';
    aplicarLimiteSerieTurma(document.getElementById('editTurmaSerie'), nivel);
    document.getElementById('editTurmaTurno').value = turma.turno || 'Manhã';
    document.getElementById('editTurmaNome').value = turma.nome;
    preencherSelectProfessoresEm(document.getElementById('editTurmaProfessor'), professorId);
    alternarGrupoProfessor(
        nivel,
        document.getElementById('grupoEditProfessorTurma'),
        document.getElementById('editTurmaProfessor'),
        professorId
    );

    document.getElementById('modalEditarTurma').style.display = 'flex';
}

function fecharModalEditarTurma() {
    document.getElementById('modalEditarTurma').style.display = 'none';
    document.getElementById('formEditarTurma').reset();
}

async function salvarEdicaoTurma(e) {
    e.preventDefault();
    try {
        const turmaId = document.getElementById('editTurmaId').value;
        const nivel = document.getElementById('editTurmaNivel').value;
        await api.atualizarTurma(turmaId, {
            nome: document.getElementById('editTurmaNome').value,
            nivel,
            ano: parseInt(document.getElementById('editTurmaAno').value, 10),
            serie: document.getElementById('editTurmaSerie').value,
            turno: document.getElementById('editTurmaTurno').value,
            professor_id: nivel === 'Fundamental I'
                ? (document.getElementById('editTurmaProfessor').value || null)
                : null
        });
        fecharModalEditarTurma();
        mostrarSucesso('Turma atualizada com sucesso!');
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

async function excluirTurmaConfirm(turmaId, nome, qtdAlunos) {
    if (qtdAlunos > 0) {
        mostrarErro(`A turma "${nome}" possui ${qtdAlunos} aluno(s). Transfira ou remova os alunos antes de excluir.`);
        return;
    }
    if (!confirm(`Excluir a turma "${nome}"? Esta ação não pode ser desfeita.`)) return;

    try {
        await api.excluirTurma(turmaId);
        mostrarSucesso('Turma excluída com sucesso!');
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function preencherAnosTurma(select, nivel, anoSelecionado) {
    select.innerHTML = '';
    (ANOS_POR_NIVEL[nivel] || []).forEach(ano => {
        const opt = document.createElement('option');
        opt.value = ano;
        opt.textContent = labelAnoEnsino(nivel, ano);
        if (String(ano) === String(anoSelecionado)) opt.selected = true;
        select.appendChild(opt);
    });
}

function alternarGrupoProfessor(nivel, grupoEl, selectEl, professorId) {
    if (!grupoEl) return;
    const mostrar = nivel === 'Fundamental I';
    grupoEl.style.display = mostrar ? '' : 'none';
    if (selectEl && !mostrar) selectEl.value = '';
    if (selectEl && mostrar && professorId) {
        selectEl.value = String(professorId);
    }
}

function preencherSelectProfessoresEm(selectEl, selecionado) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Sem professor (definir depois)</option>';
    professores.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p._id;
        opt.textContent = p.nome;
        if (selecionado && String(p._id) === String(selecionado)) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

function preencherSelectProfessores() {
    preencherSelectProfessoresEm(document.getElementById('turmaProfessor'));
    preencherSelectProfessoresEm(document.getElementById('editTurmaProfessor'));
}

function getTurmasOrdenadas(lista = turmas) {
    const copia = [...lista];
    if (ordenacaoTurmas === 'nivel') {
        return copia.sort((a, b) => {
            const na = ORDEM_NIVEL_ENSINO[a.nivel || 'Fundamental I'] || 99;
            const nb = ORDEM_NIVEL_ENSINO[b.nivel || 'Fundamental I'] || 99;
            if (na !== nb) return na - nb;
            if ((a.ano || 0) !== (b.ano || 0)) return (a.ano || 0) - (b.ano || 0);
            const sa = (a.serie || '').toUpperCase();
            const sb = (b.serie || '').toUpperCase();
            if (sa !== sb) return sa.localeCompare(sb, 'pt-BR');
            return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
    }
    return copia.sort((a, b) => {
        const da = new Date(a.dataCriacao || 0).getTime();
        const db = new Date(b.dataCriacao || 0).getTime();
        if (da !== db) return da - db;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
}

function atualizarDicaOrdemTurmas() {
    const dica = document.getElementById('dicaOrdemTurmas');
    if (!dica) return;
    dica.textContent = ordenacaoTurmas === 'nivel'
        ? 'Fundamental I → Fundamental II → Ensino Médio (ano e turma)'
        : 'Ordem em que as turmas foram cadastradas';
}

function alternarOrdemTurmas(e) {
    ordenacaoTurmas = e.target.checked ? 'nivel' : 'cadastro';
    localStorage.setItem('secretariaOrdemTurmas', ordenacaoTurmas);
    atualizarDicaOrdemTurmas();
    renderizarTurmas();
    preencherSelectTurmasAluno();
    preencherFiltroTurmasAlunos();
    preencherSelectTurmaPortal();
    renderizarTurmasResumoPortal();
    if (document.getElementById('alunos')?.style.display !== 'none') {
        renderizarAlunosPorTurma();
    }
}

function preencherSelectTurmasAluno() {
    const select = document.getElementById('alunoTurma');
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione a turma</option>';
    getTurmasOrdenadas().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        const nivel = t.nivel || 'Fundamental I';
        opt.textContent = `${nivel} · ${t.nome} · ${t.turno || 'Manhã'}`;
        select.appendChild(opt);
    });
    if (valorAtual) select.value = valorAtual;
}

function renderizarTurmas() {
    const container = document.getElementById('listaTurmas');
    if (!turmas.length) {
        container.innerHTML = '<p style="color:#7f8c8d;">Nenhuma turma cadastrada.</p>';
        return;
    }

    container.innerHTML = getTurmasOrdenadas().map(t => {
        const nivel = t.nivel || 'Fundamental I';
        const professorInfo = nivel === 'Fundamental I'
            ? (t.professor_id?.nome || 'Não definido')
            : 'Não se aplica (sem professor da turma)';

        return `
        <div class="card card-turma card-turma-clicavel" style="margin-bottom: 15px;" data-turma-id="${escaparHtml(t._id)}" role="button" tabindex="0" title="Clique para ver alunos, presença e notas">
            <h3>${escaparHtml(t.nome)}</h3>
            <p><strong>${escaparHtml(nivel)}</strong> · ${escaparHtml(labelAnoEnsino(nivel, t.ano))} · Turma ${escaparHtml(t.serie || 'A')} · Turno ${escaparHtml(t.turno || 'Manhã')}</p>
            <p>Professor da turma: ${escaparHtml(professorInfo)}</p>
            <p><strong>${(t.alunos || []).length}</strong> aluno(s) matriculado(s)</p>
            <p class="card-turma-dica">Toque para ver lista completa →</p>
            <div class="card-acoes-turma">
                <button type="button" class="btn btn-pequeno btn-sucesso btn-horarios-turma" data-id="${escaparHtml(t._id)}">📅 Horários</button>
                <button type="button" class="btn btn-pequeno btn-info btn-editar-turma" data-id="${escaparHtml(t._id)}">✏️ Editar</button>
                <button type="button" class="btn btn-pequeno btn-erro btn-excluir-turma" data-id="${escaparHtml(t._id)}" data-nome="${escaparHtml(t.nome)}" data-alunos="${(t.alunos || []).length}">🗑️ Excluir</button>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.card-turma-clicavel').forEach(card => {
        const abrir = () => abrirDetalheTurma(card.dataset.turmaId);
        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-acoes-turma')) return;
            abrir();
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                abrir();
            }
        });
    });

    container.querySelectorAll('.btn-horarios-turma').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirHorariosTurma(btn.dataset.id);
        });
    });

    container.querySelectorAll('.btn-editar-turma').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const turma = turmas.find(x => String(x._id) === btn.dataset.id);
            if (turma) abrirModalEditarTurma(turma);
        });
    });

    container.querySelectorAll('.btn-excluir-turma').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            excluirTurmaConfirm(btn.dataset.id, btn.dataset.nome, parseInt(btn.dataset.alunos, 10));
        });
    });
}

function fecharDetalheTurma() {
    document.getElementById('detalheTurmaPanel').style.display = 'none';
    const conteudo = document.getElementById('detalheTurmaConteudo');
    if (conteudo) {
        conteudo.innerHTML = '<p style="color:#7f8c8d;">Selecione uma turma para ver os alunos.</p>';
    }
    document.querySelector('.turmas-lista-cabecalho')?.style.setProperty('display', '');
    document.querySelector('#turmas > .formulario')?.style.setProperty('display', '');
    document.querySelector('#turmas > .grid-paineis')?.style.setProperty('display', '');
    aplicarVisibilidadeListaTurmas(listaTurmasVisivel());
    document.querySelectorAll('.card-turma-clicavel').forEach(c => c.classList.remove('ativo'));
}

async function abrirDetalheTurma(turmaId) {
    const panel = document.getElementById('detalheTurmaPanel');
    const conteudo = document.getElementById('detalheTurmaConteudo');
    const turma = turmas.find(t => String(t._id) === String(turmaId));

    document.getElementById('corpoListaTurmasSecao').style.display = 'none';
    document.querySelector('.turmas-lista-cabecalho')?.style.setProperty('display', 'none');
    document.querySelector('#turmas > .formulario')?.style.setProperty('display', 'none');
    document.querySelector('#turmas > .grid-paineis')?.style.setProperty('display', 'none');

    document.querySelectorAll('.card-turma-clicavel').forEach(c => {
        c.classList.toggle('ativo', c.dataset.turmaId === String(turmaId));
    });

    document.getElementById('detalheTurmaTitulo').textContent = turma?.nome || 'Turma';
    const tituloBarra = document.getElementById('detalheTurmaTituloBarra');
    if (tituloBarra) tituloBarra.textContent = turma?.nome || 'Turma';
    document.getElementById('detalheTurmaSubtitulo').textContent = turma
        ? `${turma.nivel || 'Fundamental I'} · ${turma.turno || 'Manhã'} · ${(turma.alunos || []).length} aluno(s)`
        : '';

    panel.style.display = 'block';
    conteudo.innerHTML = '<p style="color:#7f8c8d;">Carregando alunos...</p>';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const resposta = await api.obterResumoAlunosTurma(turmaId);
        conteudo.innerHTML = renderizarTabelaResumoTurma(resposta.alunos || []);
    } catch (erro) {
        conteudo.innerHTML = `<p class="alerta alerta-erro">${escaparHtml(erro.message)}</p>`;
    }
}

function renderizarTabelaResumoTurma(alunos) {
    if (!alunos.length) {
        return '<p style="color:#7f8c8d;">Nenhum aluno matriculado nesta turma.</p>';
    }

    const disciplinasUnicas = [...new Set(
        alunos.flatMap(a => (a.notas || []).map(n => n.disciplina))
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const colunasNotas = disciplinasUnicas.map(d =>
        `<th style="text-align:center;">${escaparHtml(d)}</th>`
    ).join('');

    const linhas = alunos.map(aluno => {
        const pres = aluno.presenca || {};
        const freq = pres.frequenciaPercentual != null ? `${pres.frequenciaPercentual}%` : '—';
        const resumoPresenca = pres.total
            ? `<strong>${pres.presente || 0}P</strong> / ${pres.falta || 0}F · ${escaparHtml(freq)}`
            : '—';

        const media = aluno.mediaGeral != null
            ? `<strong>${escaparHtml(aluno.mediaGeral.toFixed(1).replace('.', ','))}</strong>`
            : '—';

        const celulasNotas = disciplinasUnicas.map(disc => {
            const nota = (aluno.notas || []).find(n => n.disciplina === disc);
            if (nota?.mediaFinal == null) return '<td style="text-align:center;color:#95a5a6;">—</td>';
            const valor = nota.mediaFinal.toFixed(1).replace('.', ',');
            const cor = nota.mediaFinal >= 6 ? '#27ae60' : '#e74c3c';
            return `<td style="text-align:center;color:${cor};font-weight:600;">${escaparHtml(valor)}</td>`;
        }).join('');

        return `
            <tr>
                <td><strong>${escaparHtml(aluno.nome)}</strong></td>
                <td>${escaparHtml(aluno.cpf || '—')}</td>
                <td>${resumoPresenca}</td>
                <td style="text-align:center;">${media}</td>
                ${celulasNotas}
            </tr>`;
    }).join('');

    return `
        <div class="tabela-responsiva">
            <table class="tabela tabela-resumo-turma">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Matrícula</th>
                        <th>Presença total</th>
                        <th style="text-align:center;">Média geral</th>
                        ${colunasNotas}
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
        <p style="color:#7f8c8d;font-size:13px;margin-top:12px;">
            Presença: total de tempos registrados (P = presentes, F = faltas). Notas: média final por disciplina.
        </p>`;
}

function abrirModalTransferirAluno(alunoId, alunoNome, turmaOrigemId, turmaOrigemNome) {
    document.getElementById('transferirAlunoId').value = alunoId;
    document.getElementById('transferirTurmaOrigemId').value = turmaOrigemId;
    document.getElementById('transferirAlunoTexto').textContent =
        `Transferir ${alunoNome} da turma ${turmaOrigemNome} para:`;

    const select = document.getElementById('transferirTurmaDestino');
    select.innerHTML = '<option value="">Selecione a turma de destino</option>';
    getTurmasOrdenadas()
        .filter(t => String(t._id) !== String(turmaOrigemId))
        .forEach(t => {
            const opt = document.createElement('option');
            opt.value = t._id;
            const nivel = t.nivel || 'Fundamental I';
            opt.textContent = `${nivel} · ${t.nome} · ${t.turno || 'Manhã'}`;
            select.appendChild(opt);
        });

    document.getElementById('modalTransferirAluno').style.display = 'flex';
}

function fecharModalTransferirAluno() {
    document.getElementById('modalTransferirAluno').style.display = 'none';
    document.getElementById('formTransferirAluno').reset();
}

async function confirmarTransferenciaAluno(e) {
    e.preventDefault();
    const alunoId = document.getElementById('transferirAlunoId').value;
    const turmaDestinoId = document.getElementById('transferirTurmaDestino').value;

    if (!turmaDestinoId) {
        mostrarErro('Selecione a turma de destino');
        return;
    }

    try {
        const res = await api.transferirAlunoTurma(alunoId, turmaDestinoId);
        fecharModalTransferirAluno();
        mostrarSucesso(res.mensagem || 'Aluno transferido com sucesso!');
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function preencherFiltroTurmasAlunos() {
    const select = document.getElementById('filtroTurmaAlunos');
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>';
    getTurmasOrdenadas().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = `${t.nome} · ${t.turno || 'Manhã'}`;
        select.appendChild(opt);
    });
    if (valorAtual) select.value = valorAtual;
}

async function listarAlunosTurmas() {
    try {
        await carregarDados();
        mostrarSucesso('Lista de alunos atualizada!');
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function renderizarAlunosPorTurma() {
    const container = document.getElementById('listaAlunosTurmas');
    const filtroTurmaId = document.getElementById('filtroTurmaAlunos')?.value || '';
    const turmasExibir = filtroTurmaId
        ? turmas.filter(t => String(t._id) === String(filtroTurmaId))
        : getTurmasOrdenadas();

    if (!turmasExibir.length) {
        container.innerHTML = '<p style="color:#7f8c8d;">Nenhuma turma encontrada. Cadastre turmas ou clique em Listar.</p>';
        return;
    }

    container.innerHTML = turmasExibir.map((t, idx) => {
        const qtd = (t.alunos || []).length;
        const aberto = idx === 0 ? ' aberto' : '';
        const linhas = qtd
            ? t.alunos.map(a => {
                const alunoId = a._id || a.id;
                return `<tr>
                    <td>${escaparHtml(a.nome)}</td>
                    <td>${escaparHtml(a.cpf)}</td>
                    <td>${escaparHtml(a.email)}</td>
                    <td>${escaparHtml(a.whatsapp || '—')}</td>
                    <td class="acoes-aluno-turma">
                        <button type="button" class="btn btn-pequeno btn-sucesso btn-transferir-aluno"
                            data-id="${escaparHtml(alunoId)}" data-nome="${escaparHtml(a.nome)}"
                            data-turma-id="${escaparHtml(t._id)}" data-turma-nome="${escaparHtml(t.nome)}">↔ Transferir</button>
                        <button type="button" class="btn btn-pequeno btn-info btn-docs-aluno"
                            data-id="${escaparHtml(alunoId)}" data-nome="${escaparHtml(a.nome)}">📎 Docs</button>
                    </td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="5" style="text-align:center;color:#7f8c8d;">Nenhum aluno matriculado</td></tr>';

        return `
        <div class="accordion-turma${aberto}" data-turma-id="${escaparHtml(t._id)}">
            <button type="button" class="accordion-turma-header" aria-expanded="${idx === 0}">
                <span class="accordion-seta">${idx === 0 ? '▼' : '▶'}</span>
                <span class="accordion-turma-nome">${escaparHtml(t.nome)}</span>
                <span class="accordion-turma-info">${qtd} aluno(s) · Ano ${escaparHtml(t.ano)} · Série ${escaparHtml(t.serie || '—')} · ${escaparHtml(t.turno || 'Manhã')}</span>
            </button>
            <div class="accordion-turma-corpo" style="${idx === 0 ? '' : 'display:none;'}">
                <table class="tabela">
                    <thead>
                        <tr><th>Nome</th><th>Matrícula</th><th>Email</th><th>WhatsApp</th><th>Ações</th></tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.accordion-turma-header').forEach(btn => {
        btn.addEventListener('click', () => {
            const pai = btn.closest('.accordion-turma');
            const corpo = pai.querySelector('.accordion-turma-corpo');
            const seta = btn.querySelector('.accordion-seta');
            const aberto = pai.classList.toggle('aberto');
            corpo.style.display = aberto ? 'block' : 'none';
            seta.textContent = aberto ? '▼' : '▶';
            btn.setAttribute('aria-expanded', aberto);
        });
    });

    container.querySelectorAll('.btn-transferir-aluno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirModalTransferirAluno(
                btn.dataset.id,
                btn.dataset.nome,
                btn.dataset.turmaId,
                btn.dataset.turmaNome
            );
        });
    });

    container.querySelectorAll('.btn-docs-aluno').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!btn.dataset.id || btn.dataset.id === 'undefined') {
                mostrarErro('Aluno sem identificador. Clique em Listar para atualizar.');
                return;
            }
            abrirModalDocumentos(btn.dataset.id, btn.dataset.nome, 'aluno');
        });
    });
}

function obterDisciplinasSelecionadasEditProf() {
    return [...document.querySelectorAll('#editProfDisciplinasLista input[name="editProfDisciplinas"]:checked')]
        .map(cb => formatarNomeDisciplina(cb.value));
}

function preencherChecklistDisciplinaEditProf(professor) {
    const container = document.getElementById('editProfDisciplinasLista');
    if (!container) return;

    const selecionadas = new Set(
        (Array.isArray(professor?.disciplinas) && professor.disciplinas.length
            ? professor.disciplinas
            : (professor?.disciplina ? [professor.disciplina] : []))
            .map(formatarNomeDisciplina)
    );

    if (!disciplinas.length) {
        container.innerHTML = '<p style="color:#7f8c8d;margin:0;">Nenhuma disciplina cadastrada.</p>';
        return;
    }

    const ordenadas = [...disciplinas].sort((a, b) =>
        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    );

    container.innerHTML = ordenadas.map(d => {
        const nome = formatarNomeDisciplina(d.nome || d);
        const checked = selecionadas.has(nome) ? 'checked' : '';
        return `
        <label class="disciplina-sanfona-item">
            <input type="checkbox" name="editProfDisciplinas" value="${escaparHtml(nome)}" ${checked}>
            <span class="disciplina-sanfona-nome">${escaparHtml(nome)}</span>
        </label>`;
    }).join('');
}

function renderResumoLotacaoProfessor(horarios, diasSemana, totalTempos) {
    const container = document.getElementById('editProfLotacaoResumo');
    if (!container) return;

    if (!horarios?.length) {
        container.innerHTML = '<p style="color:#7f8c8d;margin:0;">Nenhum tempo alocado no quadro de horários.</p>';
        return;
    }

    const dias = diasSemana || ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    container.innerHTML = `
        <p class="lotacao-professor-total"><strong>${escaparHtml(totalTempos)}</strong> tempo(s) de aula alocado(s)</p>
        <table class="tabela tabela-compacta">
            <thead>
                <tr>
                    <th>Turma</th>
                    <th>Disciplina</th>
                    <th>Dia</th>
                    <th>Horário</th>
                    <th>Turno</th>
                </tr>
            </thead>
            <tbody>
                ${horarios.map(h => `
                    <tr>
                        <td>${escaparHtml(h.turma_id?.nome || '—')}</td>
                        <td>${escaparHtml(h.disciplina || '—')}</td>
                        <td>${escaparHtml(dias[h.diaSemana] || '—')}</td>
                        <td>${escaparHtml(h.horaInicio || '—')}</td>
                        <td>${escaparHtml(h.turno || '—')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function fecharModalEditarProfessor() {
    const modal = document.getElementById('modalEditarProfessor');
    if (modal) modal.style.display = 'none';
}

async function abrirModalEditarProfessor(professorId, nome) {
    const modal = document.getElementById('modalEditarProfessor');
    if (!modal) return;

    document.getElementById('editProfId').value = professorId;
    document.getElementById('modalEditProfTitulo').textContent = `Editar Professor — ${nome}`;
    document.getElementById('editProfCargaHoraria').value = '';
    document.getElementById('editProfLotacaoResumo').innerHTML = '<p style="color:#7f8c8d;margin:0;">Carregando...</p>';
    modal.style.display = 'flex';

    if (!disciplinas.length) {
        await carregarDisciplinas();
    }

    try {
        const professorLocal = funcionarios.find(f => String(f._id) === String(professorId)) || {};

        await renderPainelDocumentos(
            document.getElementById('editProfDocumentos'),
            professorId,
            nome,
            'funcionario'
        ).catch((erro) => {
            const docsEl = document.getElementById('editProfDocumentos');
            if (docsEl) {
                docsEl.innerHTML = `<p class="doc-erro-texto">Erro ao carregar documentos: ${escaparHtml(erro.message)}</p>`;
            }
        });

        let lotacao = null;
        try {
            lotacao = await api.listarLotacaoProfessor(professorId);
        } catch (erro) {
            document.getElementById('editProfLotacaoResumo').innerHTML =
                `<p style="color:#c0392b;">Erro ao carregar lotação: ${escaparHtml(erro.message)}</p>`;
        }

        const professor = lotacao?.professor || professorLocal;
        preencherChecklistDisciplinaEditProf(professor);
        document.getElementById('editProfCargaHoraria').value =
            professor.cargaHorariaSemanal != null ? professor.cargaHorariaSemanal : '';

        if (lotacao) {
            renderResumoLotacaoProfessor(lotacao.horarios, lotacao.diasSemana, lotacao.totalTempos);
        }
    } catch (erro) {
        mostrarErro(erro.message);
        preencherChecklistDisciplinaEditProf(funcionarios.find(f => String(f._id) === String(professorId)));
    }
}

async function salvarEdicaoProfessor(e) {
    e.preventDefault();
    const professorId = document.getElementById('editProfId').value;
    const disciplinasSel = obterDisciplinasSelecionadasEditProf();

    if (!disciplinasSel.length) {
        mostrarErro('Selecione ao menos uma disciplina');
        return;
    }

    const cargaRaw = document.getElementById('editProfCargaHoraria').value.trim();
    const dados = { disciplinas: disciplinasSel };
    if (cargaRaw !== '') {
        dados.cargaHorariaSemanal = parseInt(cargaRaw, 10);
    }

    try {
        await api.atualizarProfessorLotacao(professorId, dados);
        fecharModalEditarProfessor();
        mostrarSucesso('Disciplinas e carga horária do professor atualizadas!');
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message || 'Erro ao salvar dados do professor');
    }
}

function renderizarFuncionarios() {
    const container = document.getElementById('listaFuncionarios');
    const filtro = document.getElementById('filtroTipoFunc')?.value || '';
    const lista = filtro
        ? funcionarios.filter(f => f.tipo === filtro)
        : funcionarios;

    if (!lista.length) {
        container.innerHTML = '<p style="color:#7f8c8d;">Nenhum funcionário cadastrado.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Disciplina</th>
                    <th>CPF</th>
                    <th>Email</th>
                    <th>WhatsApp</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(f => `
                    <tr>
                        <td>${escaparHtml(f.nome)}</td>
                        <td>${escaparHtml(LABEL_TIPO[f.tipo] || f.tipo)}</td>
                        <td>${escaparHtml(f.tipo === 'professor' ? formatarDisciplinasFuncionario(f) : '—')}</td>
                        <td>${escaparHtml(f.cpf)}</td>
                        <td>${escaparHtml(f.email)}</td>
                        <td>${escaparHtml(f.whatsapp || '—')}</td>
                        <td>
                            ${f.tipo === 'professor' ? `
                                <button type="button" class="btn btn-pequeno btn-sucesso btn-editar-prof"
                                    data-id="${escaparHtml(f._id)}" data-nome="${escaparHtml(f.nome)}">✏️ Editar</button>
                            ` : `
                                <button type="button" class="btn btn-pequeno btn-info btn-docs-func"
                                    data-id="${escaparHtml(f._id)}" data-nome="${escaparHtml(f.nome)}">📎 Docs</button>
                            `}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;

    container.querySelectorAll('.btn-editar-prof').forEach(btn => {
        btn.addEventListener('click', () => {
            abrirModalEditarProfessor(btn.dataset.id, btn.dataset.nome);
        });
    });

    container.querySelectorAll('.btn-docs-func').forEach(btn => {
        btn.addEventListener('click', () => {
            abrirModalDocumentos(btn.dataset.id, btn.dataset.nome, 'funcionario');
        });
    });
}

async function criarTurma(e) {
    e.preventDefault();
    try {
        const nivel = document.getElementById('turmaNivel').value;
        await api.criarTurma({
            nome: document.getElementById('turmaNome').value,
            nivel,
            ano: parseInt(document.getElementById('turmaAno').value, 10),
            serie: document.getElementById('turmaSerie').value,
            turno: document.getElementById('turmaTurno').value,
            professor_id: nivel === 'Fundamental I'
                ? (document.getElementById('turmaProfessor').value || null)
                : null
        });
        document.getElementById('formTurma').reset();
        document.getElementById('turmaAno').disabled = true;
        document.getElementById('turmaAno').innerHTML = '<option value="">Selecione o nível</option>';
        document.getElementById('grupoProfessorTurma').style.display = 'none';
        mostrarSucesso('Turma criada com sucesso!');
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

async function cadastrarAluno(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSalvarAluno');
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
        }

        const res = await api.cadastrarAluno({
            nome: document.getElementById('alunoNome').value,
            email: document.getElementById('alunoEmail').value,
            cpf: document.getElementById('alunoCpf').value.trim() || undefined,
            dataNascimento: document.getElementById('alunoNascimento').value || undefined,
            whatsapp: document.getElementById('alunoWhatsapp').value || undefined,
            whatsapp_responsavel: document.getElementById('alunoWhatsappResponsavel').value,
            turma_id: document.getElementById('alunoTurma').value,
            nome_responsavel: document.getElementById('alunoNomeResponsavel').value || undefined,
            cpf_responsavel: document.getElementById('alunoCpfResponsavel').value || undefined,
            rg_responsavel: document.getElementById('alunoRgResponsavel').value || undefined,
            endereco: document.getElementById('alunoEndereco').value || undefined,
            bairro: document.getElementById('alunoBairro').value || undefined,
            cidade: document.getElementById('alunoCidade').value || undefined,
            uf: document.getElementById('alunoUf').value || undefined,
            cep: document.getElementById('alunoCep').value || undefined
        });

        const alunoId = res.aluno?.id || res.aluno?._id;
        const docsContainer = document.getElementById('docsAlunoCadastro');
        let msgDocs = '';

        if (alunoId) {
            const { enviados, erros } = await enviarDocumentosDoGrid(docsContainer, alunoId);
            if (enviados.length) msgDocs = ` · ${enviados.length} doc(s) arquivado(s)`;
            if (erros.length) {
                mostrarErro(`Aluno salvo, mas falha ao arquivar documento(s): ${erros.map(e => e.mensagem).join('; ')}`);
                await carregarDados();
                return;
            }
        }

        document.getElementById('formAluno').reset();
        montarGridUpload(docsContainer, 'aluno', 'aluno');
        const senhaIni = res.senhaInicial || '—';
        const avisoGerada = res.senhaGerada ? ' (temporária gerada — anote agora)' : '';
        mostrarSucesso(`Aluno salvo com sucesso! Senha inicial: ${senhaIni}${avisoGerada}${msgDocs}`);
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Salvar';
        }
    }
}

async function cadastrarFuncionario(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSalvarFuncionario');
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
        }

        const senha = document.getElementById('funcSenha').value.trim();
        const dados = {
            tipo: document.getElementById('funcTipo').value,
            nome: document.getElementById('funcNome').value,
            email: document.getElementById('funcEmail').value,
            cpf: document.getElementById('funcCpf').value,
            rg: document.getElementById('funcRg').value || undefined,
            whatsapp: document.getElementById('funcWhatsapp').value,
            telefone: document.getElementById('funcTelefone').value || undefined,
            pis: document.getElementById('funcPis').value || undefined,
            ctps: document.getElementById('funcCtps').value || undefined,
            cnpj: document.getElementById('funcCnpj').value || undefined,
            endereco: document.getElementById('funcEndereco').value || undefined,
            cidade: document.getElementById('funcCidade').value || undefined,
            uf: document.getElementById('funcUf').value || undefined
        };
        if (senha) dados.senha = senha;
        if (dados.tipo === 'professor') {
            dados.disciplinas = obterDisciplinasSelecionadasFuncionario();
            if (!dados.disciplinas.length) {
                mostrarErro('Selecione ao menos uma disciplina do professor');
                return;
            }
        }

        const res = await api.cadastrarUsuario(dados);
        const funcId = res.usuario?.id || res.usuario?._id;
        const docsContainer = document.getElementById('docsFuncionarioCadastro');
        let msgDocs = '';
        if (funcId) {
            const { enviados, erros } = await enviarDocumentosDoGrid(docsContainer, funcId);
            if (enviados.length) msgDocs = ` · ${enviados.length} doc(s) arquivado(s)`;
            if (erros.length) {
                mostrarErro(`Funcionário salvo, mas falha ao arquivar documento(s): ${erros.map(e => e.mensagem).join('; ')}`);
                await carregarDados();
                return;
            }
        }

        document.getElementById('formFuncionario').reset();
        montarGridUpload(docsContainer, 'funcionario', 'func');
        preencherChecklistDisciplinaFuncionario();
        atualizarCampoDisciplinaFuncionario();
        const senhaIni = res.senhaInicial || senha || '—';
        const avisoGerada = res.senhaGerada ? ' (temporária gerada — anote agora)' : '';
        mostrarSucesso(`Funcionário salvo! Senha: ${senhaIni}${avisoGerada}${msgDocs}`);
        await carregarDados();
    } catch (erro) {
        mostrarErro(erro.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Salvar';
        }
    }
}

async function exportarFuncionariosXls() {
    try {
        await api.baixarFuncionariosXls();
        mostrarSucesso('Lista de funcionários exportada!');
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

function voltarAoPortal() {
    fecharDetalheTurma();
    const menuLink = document.querySelector('.menu a[data-secao="portal"]');
    carregarSecao('portal', menuLink);
}

function carregarSecao(secao, linkAtivo) {
    document.querySelectorAll('main section').forEach(s => { s.style.display = 'none'; });
    const el = document.getElementById(secao);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.menu a[data-secao]').forEach(a => a.classList.remove('ativo'));
    if (linkAtivo) linkAtivo.classList.add('ativo');
    if (secao === 'portal') {
        preencherSelectTurmaPortal();
        renderizarTurmasResumoPortal();
    }
    if (secao === 'alunos') {
        renderizarAlunosPorTurma();
    }
    if (secao === 'disciplinas') {
        carregarDisciplinas();
    }
    if (secao === 'funcionarios') {
        atualizarCampoDisciplinaFuncionario();
    }
    if (secao === 'horarios') {
        preencherSelectHorarioTurma();
        if (document.getElementById('horarioTurmaSelect')?.value) {
            carregarQuadroHorariosSecretaria();
        }
    }
}

async function fazerLogout() {
    try { await api.logout(); } catch {}
    window.location.href = 'index.html';
}

function mostrarSucesso(msg) {
    const a = document.createElement('div');
    a.className = 'alerta alerta-sucesso';
    a.textContent = '✓ ' + msg;
    a.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999';
    document.body.appendChild(a);
    setTimeout(() => a.remove(), 3000);
}

function mostrarErro(msg) {
    const a = document.createElement('div');
    a.className = 'alerta alerta-erro';
    a.textContent = '❌ ' + msg;
    a.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999';
    document.body.appendChild(a);
    setTimeout(() => a.remove(), 4000);
}
