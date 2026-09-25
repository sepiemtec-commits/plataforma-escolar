// frontend/js/painel-professor.js - Lógica do painel do professor

let usuario = null;
let turmasAtuais = [];
let disciplinasPresenca = [];
let presencaRascunho = {};
let presencaCarregarSeq = 0;
let configEscola = { avaliacaoComportamental: false };

let iaGeradoCache = null;

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();
    configurarPortalProfessor();
    configurarIAPedagogica();
    document.getElementById('btnBuscarBncc')?.addEventListener('click', buscarBnccProfessor);
    document.getElementById('formPeiProf')?.addEventListener('submit', salvarPeiProfessor);
    document.getElementById('peiProfTurma')?.addEventListener('change', onPeiProfTurmaChange);
    document.getElementById('formSimulado')?.addEventListener('submit', salvarSimuladoProf);
    document.getElementById('btnBuscarItens')?.addEventListener('click', buscarItensSimProf);
    document.getElementById('btnCorrigirSim')?.addEventListener('click', corrigirSimuladoAtivo);
    document.getElementById('formItemBanco')?.addEventListener('submit', salvarItemBancoProf);
    document.getElementById('itemImagem')?.addEventListener('change', onItemImagemChange);

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    carregarSecao('dashboard');
    await carregarDados();

    document.getElementById('dataPresenca').valueAsDate = new Date();

    document.getElementById('formularioConteudo').addEventListener('submit', registrarConteudo);
    document.getElementById('turmaId').addEventListener('change', () => {
        const turma = obterTurmaPorId(document.getElementById('turmaId').value);
        preencherSelectDisciplinasProfessor('disciplinaPresenca', null, turma);
        atualizarTextosPresenca();
        carregarAlunosTurma();
    });
    document.getElementById('dataPresenca').addEventListener('change', () => {
        atualizarTextosPresenca();
        carregarAlunosTurma();
    });
    document.getElementById('disciplinaPresenca').addEventListener('change', () => {
        atualizarTextosPresenca();
        carregarAlunosTurma();
    });
    document.getElementById('btnSalvarPresenca')?.addEventListener('click', salvarPresencaTurma);
    document.getElementById('conteudoTurma')?.addEventListener('change', () => {
        const turma = obterTurmaPorId(document.getElementById('conteudoTurma').value);
        preencherSelectDisciplinasProfessor('conteudoDisciplina', null, turma);
    });

    document.getElementById('btnListarNotas').addEventListener('click', listarNotasAcademicas);
    document.getElementById('btnSalvarNotas').addEventListener('click', salvarNotasAcademicas);
    document.getElementById('btnBaixarArquivoAnoAnterior').addEventListener('click', baixarArquivoAnoAnterior);
    document.getElementById('filtroEnsino')?.addEventListener('change', onMudancaEnsinoNotas);
    document.getElementById('filtroSerie')?.addEventListener('change', onMudancaSerieOuPeriodoNotas);
    document.getElementById('filtroPeriodo')?.addEventListener('change', onMudancaSerieOuPeriodoNotas);
    document.getElementById('avaliacaoTurma').addEventListener('change', atualizarFiltrosTurma);
    document.getElementById('filtroUnidade').addEventListener('change', () => {
        if (gradeNotasCache) {
            gradeNotasCache.unidade = document.getElementById('filtroUnidade').value;
            renderizarTabelaNotas(gradeNotasCache);
        }
    });
    document.getElementById('toggleComportamental').addEventListener('change', () => {
        if (gradeNotasCache) renderizarTabelaNotas(gradeNotasCache);
    });

    document.getElementById('btnLogoutMenu').addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader').addEventListener('click', fazerLogout);
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
    usuario = await exigirPerfil('professor');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome} (${usuario.tipo})`;
    return true;
}

async function carregarDados() {
    try {
        const painel = await api.carregarPainelProfessor();

        turmasAtuais = painel.painel.turmasDetalhes || [];
        configEscola = painel.painel.configuracao || configEscola;

        if (configEscola.avaliacaoComportamental) {
            document.getElementById('toggleComportamental').checked = true;
        }

        if (painel.painel.disciplinas?.length) {
            usuario.disciplinas = painel.painel.disciplinas;
        } else if (painel.painel.disciplina) {
            usuario.disciplinas = [painel.painel.disciplina];
        }

        preencherAnoLetivo();
        configurarDisciplinaNotas();
        preencherSelectDisciplinasProfessor('conteudoDisciplina');
        preencherSelectTurmas();
        inicializarFiltrosNotas();
        await carregarHorariosProfessor();
        await preencherSelectDisciplinasPresenca();
        alunosAtencaoCache = painel.painel.alunosAtencao || [];
        configurarCardAlunosAtencao();
        renderizarTurmasProfessor();
        preencherTabelaAlunos();

    } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
        mostrarErro(erro.message);
    }
}

function preencherSelectTurmas() {
    const selectTurma = document.getElementById('turmaId');
    const selectConteudo = document.getElementById('conteudoTurma');
    const selectIA = document.getElementById('iaTurma');

    selectTurma.innerHTML = '<option value="">Selecione uma turma</option>';
    selectConteudo.innerHTML = '<option value="">Selecione uma turma</option>';
    if (selectIA) selectIA.innerHTML = '<option value="">Selecione</option>';

    turmasAtuais.forEach(turma => {
        const option = document.createElement('option');
        option.value = turma._id;
        option.textContent = turma.nome;
        selectTurma.appendChild(option);

        const option2 = document.createElement('option');
        option2.value = turma._id;
        option2.textContent = turma.nome;
        selectConteudo.appendChild(option2);

        if (selectIA) {
            const option3 = document.createElement('option');
            option3.value = turma._id;
            option3.textContent = turma.nome;
            selectIA.appendChild(option3);
        }
    });
}

function obterDisciplinasUsuario() {
    let lista = [];
    if (Array.isArray(usuario?.disciplinas) && usuario.disciplinas.length) {
        lista = usuario.disciplinas;
    } else if (usuario?.disciplina) {
        lista = [usuario.disciplina];
    }
    return [...new Set(lista.map(formatarNomeDisciplina).filter(Boolean))];
}

function obterTurmaPorId(turmaId) {
    if (!turmaId) return null;
    return turmasAtuais.find(t => String(t._id) === String(turmaId)) || null;
}

function preencherSelectDisciplinasProfessor(selectId, selecionada, turma) {
    const select = document.getElementById(selectId);
    if (!select) return;

    let minhas = obterDisciplinasUsuario().slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (turma) {
        minhas = minhas.filter(d => disciplinaPermitidaParaTurma(d, turma));
    }

    const valorAtual = selecionada || select.value;
    select.innerHTML = '<option value="">Selecione a disciplina</option>';

    minhas.forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        select.appendChild(opt);
    });

    if (valorAtual && minhas.includes(valorAtual)) {
        select.value = valorAtual;
    } else if (minhas.length === 1) {
        select.value = minhas[0];
    } else {
        select.value = '';
    }
}

async function preencherSelectDisciplinasPresenca() {
    const select = document.getElementById('disciplinaPresenca');
    const dica = document.getElementById('dicaDisciplinaPresenca');
    if (!select) return;

    disciplinasPresenca = [];
    const minhas = obterDisciplinasUsuario().slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (!minhas.length) {
        select.innerHTML = '<option value="">Sem disciplina vinculada</option>';
        if (dica) {
            dica.textContent = 'Peça à secretaria para cadastrar suas disciplinas no perfil de professor.';
        }
        return;
    }

    try {
        const resposta = await api.listarDisciplinas();
        disciplinasPresenca = (resposta.disciplinas || []).filter(d => minhas.includes(d.nome));

        preencherSelectDisciplinasProfessor('disciplinaPresenca', null, obterTurmaPorId(document.getElementById('turmaId')?.value));

        if (!disciplinasPresenca.length && dica) {
            dica.textContent = `As disciplinas (${minhas.join(', ')}) ainda não foram configuradas pela secretaria (tempos de aula).`;
        }

        atualizarTextosPresenca();

        if (document.getElementById('turmaId')?.value && document.getElementById('dataPresenca')?.value && select.value) {
            await carregarAlunosTurma();
        }
    } catch (erro) {
        console.error(erro);
        select.innerHTML = '<option value="">Erro ao carregar disciplinas</option>';
    }
}

function obterNomeDisciplinaPresenca() {
    return document.getElementById('disciplinaPresenca')?.value || '';
}

function obterQuantidadeTemposDisciplinaPara(nome) {
    const d = disciplinasPresenca.find(item => item.nome === nome);
    return d?.quantidadeTempos || 0;
}

function obterQuantidadeTemposDisciplina() {
    return obterQuantidadeTemposDisciplinaPara(obterNomeDisciplinaPresenca());
}

function atualizarTextosPresenca() {
    const contador = document.getElementById('contadorAlunosPresenca');
    const dica = document.getElementById('dicaDisciplinaPresenca');
    const turmaId = document.getElementById('turmaId')?.value;
    const data = document.getElementById('dataPresenca')?.value;
    const disciplina = obterNomeDisciplinaPresenca();
    const minhas = obterDisciplinasUsuario();

    if (dica) {
        if (!disciplina) {
            dica.textContent = minhas.length > 1
                ? 'Selecione a disciplina da aula. Você só registra presença nas disciplinas habilitadas.'
                : (minhas[0]
                    ? 'Selecione a disciplina da aula.'
                    : 'Peça à secretaria para cadastrar suas disciplinas no perfil de professor.');
        } else if (!turmaId || !data) {
            dica.textContent = `Disciplina selecionada: ${disciplina}. Selecione turma e data para lançar a frequência.`;
        } else if (!obterQuantidadeTemposDisciplinaPara(disciplina)) {
            dica.textContent = `${disciplina} — ainda sem tempos de aula configurados pela secretaria.`;
        } else if (turmaId && !disciplinaPermitidaParaTurma(disciplina, obterTurmaPorId(turmaId))) {
            dica.textContent = `${disciplina} não é ofertada para esta turma/série.`;
        } else {
            dica.textContent = `Marque P (presente) ou F (falta) para cada aluno e clique em Salvar frequência ao final — ${disciplina}.`;
        }
    }

    if (contador) {
        if (!turmaId) {
            contador.textContent = '';
            atualizarResumoTaxasPresenca(0, 0);
            return;
        }
        const turma = turmasAtuais.find(t => String(t._id) === turmaId);
        if (!turma) {
            contador.textContent = '';
            atualizarResumoTaxasPresenca(0, 0);
            return;
        }
        const qtd = turma.alunos?.length || 0;
        contador.textContent = disciplina
            ? `${qtd} aluno(s) matriculado(s) — ${turma.nome} · ${disciplina}`
            : `${qtd} aluno(s) matriculado(s) — ${turma.nome}`;
        atualizarResumoTaxasPresenca(qtd, obterQuantidadeTemposDisciplinaPara(disciplina) || 1);
    }
}

function calcularTaxasPresenca(totalEsperado) {
    const statuses = Object.values(presencaRascunho || {});
    const presentes = statuses.filter(s => s === 'presente').length;
    const faltas = statuses.filter(s => s === 'falta').length;
    const lancados = presentes + faltas;
    const base = totalEsperado > 0 ? totalEsperado : lancados;

    return {
        presentes,
        faltas,
        lancados,
        totalEsperado: base,
        taxaPresenca: base > 0 ? ((presentes / base) * 100) : 0,
        taxaFalta: base > 0 ? ((faltas / base) * 100) : 0,
        taxaLancados: base > 0 ? ((lancados / base) * 100) : 0
    };
}

function atualizarResumoTaxasPresenca(qtdAlunos, quantidadeTempos) {
    const box = document.getElementById('resumoTaxasPresenca');
    if (!box) return;

    const turmaId = document.getElementById('turmaId')?.value;
    const data = document.getElementById('dataPresenca')?.value;
    const disciplina = obterNomeDisciplinaPresenca();

    if (!turmaId || !data || !disciplina || !qtdAlunos) {
        box.style.display = 'none';
        return;
    }

    const totalEsperado = qtdAlunos * (quantidadeTempos || 1);
    const taxas = calcularTaxasPresenca(totalEsperado);

    box.style.display = 'grid';
    document.getElementById('taxaPresencaValor').textContent = `${taxas.taxaPresenca.toFixed(1)}%`;
    document.getElementById('qtdPresencaValor').textContent = `${taxas.presentes} registro(s)`;
    document.getElementById('taxaFaltaValor').textContent = `${taxas.taxaFalta.toFixed(1)}%`;
    document.getElementById('qtdFaltaValor').textContent = `${taxas.faltas} registro(s)`;
    document.getElementById('taxaLancadosValor').textContent = `${taxas.taxaLancados.toFixed(1)}%`;
    document.getElementById('qtdLancadosValor').textContent = `${taxas.lancados}/${taxas.totalEsperado}`;
}

let gradeNotasCache = null;

function labelSerieNotas(nivel, ano) {
    if (nivel === 'Ensino Médio') return `${ano}º Ano EM`;
    return `${ano}º Ano`;
}

function obterAnoLetivoVigente() {
    const anoCivil = new Date().getFullYear();
    const configurado = Number(configEscola?.anoLetivo);

    // Usa o ano configurado na escola (não é número fixo no código).
    // Se estiver ausente ou no futuro além do ano civil, usa o ano civil atual.
    if (Number.isFinite(configurado) && configurado >= 2000 && configurado <= anoCivil) {
        return configurado;
    }
    return anoCivil;
}

function preencherAnoLetivo() {
    const vigente = obterAnoLetivoVigente();
    const campo = document.getElementById('filtroAnoLetivo');
    if (campo) {
        campo.value = String(vigente);
        campo.title = 'Ano letivo configurado na escola';
    }

    const anoAnterior = vigente - 1;
    const label = document.getElementById('labelAnoAnterior');
    const btn = document.getElementById('btnBaixarArquivoAnoAnterior');
    if (label) label.textContent = anoAnterior;
    if (btn) btn.dataset.ano = anoAnterior;
}

function configurarDisciplinaNotas() {
    preencherSelectDisciplinasProfessor('avaliacaoDisciplina');
}

async function baixarArquivoAnoAnterior() {
    const btn = document.getElementById('btnBaixarArquivoAnoAnterior');
    const ano = btn?.dataset.ano;

    if (!ano) {
        mostrarErro('Ano anterior não identificado');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = 'Gerando arquivo...';
        await api.baixarArquivoAnoLetivo(ano);
        mostrarSucesso(`Arquivo XLS do ano ${ano} baixado!`);
    } catch (erro) {
        mostrarErro(erro.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📥 Baixar arquivo XLS do ano anterior';
    }
}

function turmasParaNotas() {
    return [...turmasAtuais].sort((a, b) => {
        const na = String(a.nivel || '').localeCompare(String(b.nivel || ''), 'pt-BR');
        if (na) return na;
        const aa = Number(a.ano) - Number(b.ano);
        if (aa) return aa;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
}

function preencherFiltroEnsinoNotas() {
    const select = document.getElementById('filtroEnsino');
    if (!select) return;

    const niveis = [...new Set(turmasParaNotas().map(t => t.nivel).filter(Boolean))];
    const ordem = ['Fundamental I', 'Fundamental II', 'Ensino Médio'];
    niveis.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));

    const atual = select.value;
    select.innerHTML = '<option value="">Selecione</option>';
    niveis.forEach(nivel => {
        const opt = document.createElement('option');
        opt.value = nivel;
        opt.textContent = nivel;
        select.appendChild(opt);
    });

    if (atual && niveis.includes(atual)) select.value = atual;
    else if (niveis.length === 1) select.value = niveis[0];
}

function preencherFiltroSerieNotas() {
    const ensino = document.getElementById('filtroEnsino')?.value || '';
    const select = document.getElementById('filtroSerie');
    if (!select) return;

    const atual = select.value;
    select.innerHTML = '<option value="">Selecione a série</option>';

    if (!ensino) return;

    const anos = [...new Set(
        turmasParaNotas()
            .filter(t => t.nivel === ensino)
            .map(t => Number(t.ano))
            .filter(n => Number.isFinite(n))
    )].sort((a, b) => a - b);

    anos.forEach(ano => {
        const opt = document.createElement('option');
        opt.value = String(ano);
        opt.textContent = labelSerieNotas(ensino, ano);
        select.appendChild(opt);
    });

    if (atual && anos.map(String).includes(atual)) select.value = atual;
    else if (anos.length === 1) select.value = String(anos[0]);
}

function preencherSelectTurmasAvaliacao() {
    const select = document.getElementById('avaliacaoTurma');
    if (!select) return;

    const ensino = document.getElementById('filtroEnsino')?.value || '';
    const serie = document.getElementById('filtroSerie')?.value || '';
    const turno = document.getElementById('filtroPeriodo')?.value || '';
    const atual = select.value;

    let lista = turmasParaNotas();
    if (ensino) lista = lista.filter(t => t.nivel === ensino);
    if (serie) lista = lista.filter(t => String(t.ano) === String(serie));
    if (turno) lista = lista.filter(t => (t.turno || 'Manhã') === turno);

    select.innerHTML = '<option value="">Selecione</option>';
    lista.forEach(turma => {
        const option = document.createElement('option');
        option.value = turma._id;
        const letra = turma.serie ? ` — Turma ${turma.serie}` : '';
        option.textContent = `${turma.nome}${letra}`;
        option.dataset.nome = turma.nome;
        option.dataset.ano = turma.ano || '';
        option.dataset.serie = turma.serie || '';
        option.dataset.nivel = turma.nivel || '';
        option.dataset.turno = turma.turno || 'Manhã';
        select.appendChild(option);
    });

    if (atual && [...select.options].some(o => o.value === atual)) {
        select.value = atual;
    } else if (lista.length === 1) {
        select.value = lista[0]._id;
    }

    atualizarDisciplinaPorTurmaNotas();
}

function atualizarDisciplinaPorTurmaNotas() {
    const turmaId = document.getElementById('avaliacaoTurma')?.value;
    const turma = obterTurmaPorId(turmaId);
    preencherSelectDisciplinasProfessor('avaliacaoDisciplina', null, turma);
}

function atualizarFiltrosTurma() {
    atualizarDisciplinaPorTurmaNotas();
}

function onMudancaEnsinoNotas() {
    preencherFiltroSerieNotas();
    preencherSelectTurmasAvaliacao();
}

function onMudancaSerieOuPeriodoNotas() {
    preencherSelectTurmasAvaliacao();
}

function inicializarFiltrosNotas() {
    preencherFiltroEnsinoNotas();
    preencherFiltroSerieNotas();
    preencherSelectTurmasAvaliacao();
}

function formatarNota(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    return Number(valor).toFixed(2).replace('.', ',');
}

function parseNota(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = parseFloat(String(valor).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function calcularMediaBimestre(notas, incluirComportamental) {
    const tipos = ['prova_bimestral', 'teste_bimestral'];
    if (incluirComportamental) tipos.push('comportamental');
    const pesos = { prova_bimestral: 1, teste_bimestral: 1, comportamental: 0.5 };

    let soma = 0;
    let peso = 0;
    tipos.forEach(tipo => {
        const v = notas[tipo];
        if (v !== null && v !== undefined && v !== '') {
            soma += parseFloat(v) * pesos[tipo];
            peso += pesos[tipo];
        }
    });
    return peso > 0 ? (soma / peso) : null;
}

async function listarNotasAcademicas() {
    const turmaId = document.getElementById('avaliacaoTurma').value;
    const disciplina = document.getElementById('avaliacaoDisciplina').value.trim();
    const unidade = document.getElementById('filtroUnidade').value;
    const container = document.getElementById('gradeAvaliacoes');

    if (!turmaId) {
        mostrarErro('Selecione a turma');
        return;
    }

    if (!disciplina) {
        mostrarErro('Nenhuma disciplina vinculada ao seu cadastro');
        return;
    }

    container.innerHTML = '<p class="notas-vazio">Carregando...</p>';

    try {
        const resposta = await api.obterGradeAvaliacoes(turmaId, disciplina);
        gradeNotasCache = { ...resposta, turmaId, disciplina, unidade };
        renderizarTabelaNotas(gradeNotasCache);
    } catch (erro) {
        container.innerHTML = `<p class="alerta alerta-erro">${escaparHtml(erro.message)}</p>`;
    }
}

function renderizarTabelaNotas(dados) {
    const container = document.getElementById('gradeAvaliacoes');
    const unidade = dados.unidade || document.getElementById('filtroUnidade').value;
    const incluirComp = document.getElementById('toggleComportamental').checked;
    const alunos = dados.alunos || [];

    if (!alunos.length) {
        container.innerHTML = '<p class="notas-vazio">Nenhum aluno matriculado nesta turma.</p>';
        return;
    }

    const colComp = incluirComp
        ? '<th>AV3</th>'
        : '';

    const linhas = alunos.map((aluno, idx) => {
        const prova = aluno.notas[`${unidade}_prova_bimestral`] ?? '';
        const teste = aluno.notas[`${unidade}_teste_bimestral`] ?? '';
        const comp = aluno.notas[`${unidade}_comportamental`] ?? '';
        const media = calcularMediaBimestre({
            prova_bimestral: prova,
            teste_bimestral: teste,
            comportamental: comp
        }, incluirComp);
        const alunoId = escaparHtml(aluno._id);

        const celComp = incluirComp
            ? `<td><input type="text" class="input-nota-academica" data-tipo="comportamental" data-aluno-id="${alunoId}" value="${escaparHtml(formatarNota(comp))}"></td>`
            : '';

        return `
            <tr class="${idx % 2 === 0 ? 'linha-par' : 'linha-impar'}">
                <td class="col-aluno"><a href="#" class="link-aluno">${escaparHtml(aluno.nome)}</a></td>
                <td><input type="text" class="input-nota-academica" data-tipo="prova_bimestral" data-aluno-id="${alunoId}" value="${escaparHtml(formatarNota(prova))}" placeholder="0,00"></td>
                <td><input type="text" class="input-nota-academica" data-tipo="teste_bimestral" data-aluno-id="${alunoId}" value="${escaparHtml(formatarNota(teste))}" placeholder="0,00"></td>
                ${celComp}
                <td><input type="text" class="input-nota-academica input-media" readonly value="${media !== null ? escaparHtml(formatarNota(media)) : ''}"></td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="notas-toolbar">
            <button type="button" class="btn-notas-salvar" id="btnSalvarNotasTabela">Salvar</button>
        </div>
        <table class="tabela-notas-academicas">
            <thead>
                <tr>
                    <th>Alunos</th>
                    <th>AV1</th>
                    <th>AV2</th>
                    ${colComp}
                    <th>Média</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
        <p class="notas-legenda">AV1 = Prova · AV2 = Teste${incluirComp ? ' · AV3 = Comportamental' : ''} · Unidade: ${escaparHtml(unidade)}</p>`;

    document.getElementById('btnSalvarNotasTabela').addEventListener('click', salvarNotasAcademicas);

    container.querySelectorAll('.input-nota-academica:not(.input-media)').forEach(input => {
        input.addEventListener('input', () => atualizarMediaLinha(input.closest('tr')));
    });

    container.querySelectorAll('.link-aluno').forEach(link => {
        link.addEventListener('click', e => e.preventDefault());
    });
}

function atualizarMediaLinha(linha) {
    const incluirComp = document.getElementById('toggleComportamental').checked;
    const notas = {};
    linha.querySelectorAll('.input-nota-academica:not(.input-media)').forEach(input => {
        notas[input.dataset.tipo] = parseNota(input.value);
    });
    const media = calcularMediaBimestre(notas, incluirComp);
    const campoMedia = linha.querySelector('.input-media');
    campoMedia.value = media !== null ? formatarNota(media) : '';
}

async function salvarNotasAcademicas() {
    const turmaId = document.getElementById('avaliacaoTurma').value;
    const disciplina = document.getElementById('avaliacaoDisciplina').value.trim();
    const unidade = document.getElementById('filtroUnidade').value;
    const inputs = document.querySelectorAll('#gradeAvaliacoes .input-nota-academica:not(.input-media)');

    if (!inputs.length) {
        mostrarErro('Clique em Listar antes de salvar as notas');
        return;
    }

    try {
        for (const input of inputs) {
            const nota = parseNota(input.value);
            if (input.value.trim() !== '' && (nota === null || nota < 0 || nota > 10)) {
                mostrarErro('Notas devem estar entre 0 e 10');
                return;
            }
            await api.salvarNotaGrade({
                aluno_id: input.dataset.alunoId,
                turma_id: turmaId,
                disciplina,
                tipo: input.dataset.tipo,
                periodo: unidade,
                nota
            });
        }
        mostrarSucesso('Notas salvas com sucesso!');
        await listarNotasAcademicas();
    } catch (erro) {
        mostrarErro(erro.message);
    }
}

let cacheHorariosProfessor = null;
let diaHorarioSelecionado = null;

function abrirDiarioAulaCompleto({ turmaId, disciplina, modo, data, periodo } = {}) {
    const params = new URLSearchParams();
    if (turmaId) params.set('turma_id', turmaId);
    if (disciplina) params.set('disciplina', disciplina);
    if (modo) params.set('modo', modo);
    if (data) params.set('data', data);
    if (periodo) params.set('periodo', periodo);
    const qs = params.toString();
    window.location.href = `diario-aula.html${qs ? `?${qs}` : ''}`;
}

function obterNomesDiasHorario(resposta) {
    return (resposta?.diasSemana || ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']).slice(0, 6);
}

function mostrarVistaListaDiasHorario() {
    const lista = document.getElementById('vistaListaDiasHorario');
    const quadro = document.getElementById('vistaQuadroDiaHorario');
    const btnVoltar = document.getElementById('btnVoltarDiasHorario');
    const titulo = document.getElementById('tituloMeusHorarios');

    diaHorarioSelecionado = null;
    if (lista) lista.hidden = false;
    if (quadro) quadro.hidden = true;
    if (btnVoltar) btnVoltar.hidden = true;
    if (titulo) titulo.textContent = '📅 Meus Horários';
}

function mostrarVistaQuadroDiaHorario(nomeDia) {
    const lista = document.getElementById('vistaListaDiasHorario');
    const quadro = document.getElementById('vistaQuadroDiaHorario');
    const btnVoltar = document.getElementById('btnVoltarDiasHorario');
    const titulo = document.getElementById('tituloMeusHorarios');

    if (lista) lista.hidden = true;
    if (quadro) quadro.hidden = false;
    if (btnVoltar) btnVoltar.hidden = false;
    if (titulo) titulo.textContent = `📅 ${nomeDia}`;
}

function renderizarListaDiasHorario(resposta) {
    const container = document.getElementById('listaDiasHorario');
    if (!container) return;

    const dias = obterNomesDiasHorario(resposta);
    const horarios = resposta.horarios || [];

    if (!horarios.length) {
        container.innerHTML = '<p class="horarios-dias-vazio">Nenhum horário cadastrado para você neste filtro.</p>';
        return;
    }

    const contagemPorDia = {};
    horarios.forEach(h => {
        const dia = Number(h.diaSemana);
        if (Number.isNaN(dia)) return;
        contagemPorDia[dia] = (contagemPorDia[dia] || 0) + 1;
    });

    const diasComAula = Object.keys(contagemPorDia)
        .map(Number)
        .sort((a, b) => a - b);

    if (!diasComAula.length) {
        container.innerHTML = '<p class="horarios-dias-vazio">Nenhum horário cadastrado para você neste filtro.</p>';
        return;
    }

    container.innerHTML = diasComAula.map(dia => {
        const qtd = contagemPorDia[dia];
        const nome = dias[dia] || `Dia ${dia + 1}`;
        return `
            <button type="button" class="horario-dia-btn" data-dia="${dia}">
                <span class="horario-dia-nome">${escaparHtml(nome)}</span>
                <span class="horario-dia-meta">${qtd} tempo(s)</span>
            </button>`;
    }).join('');

    container.querySelectorAll('.horario-dia-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dia = Number(btn.dataset.dia);
            abrirQuadroDiaHorario(dia);
        });
    });
}

function renderizarQuadroDiaHorario(dia, resposta) {
    const corpo = document.getElementById('corpoQuadroDiaHorario');
    if (!corpo) return;

    const dias = obterNomesDiasHorario(resposta);
    const nomeDia = dias[dia] || `Dia ${dia + 1}`;
    const turno = document.getElementById('filtroTurnoHorario')?.value || 'todos';
    const horariosDia = (resposta.horarios || [])
        .filter(h => Number(h.diaSemana) === dia)
        .sort((a, b) => String(a.horaInicio).localeCompare(String(b.horaInicio)));

    mostrarVistaQuadroDiaHorario(nomeDia);

    if (!horariosDia.length) {
        corpo.innerHTML = '<p class="horarios-dias-vazio">Nenhuma aula neste dia para o filtro selecionado.</p>';
        return;
    }

    const renderTabelaDia = (turnoNome, slots, itens) => {
        const mapa = {};
        itens.forEach(h => {
            mapa[h.horaInicio] = h;
        });

        const horas = (slots && slots.length)
            ? slots.filter(hora => mapa[hora])
            : itens.map(h => h.horaInicio);

        const horasUnicas = [...new Set(horas)];
        const linhas = horasUnicas.map(hora => {
            const item = mapa[hora];
            if (!item) {
                return `<tr><td>${escaparHtml(hora)}</td><td>—</td></tr>`;
            }
            const turma = item.turma_id?.nome || 'Turma';
            const disc = item.disciplina || '';
            return `
                <tr>
                    <td>${escaparHtml(hora)}</td>
                    <td class="celula-horario-ocupada"><strong>${escaparHtml(disc)}</strong><br><small>${escaparHtml(turma)}</small></td>
                </tr>`;
        }).join('');

        return `
            <div class="horario-turno-bloco">
                <h3 class="horario-turno-titulo">${escaparHtml(turnoNome)} · ${itens.length} tempo(s)</h3>
                <table class="tabela tabela-horarios tabela-horarios-dia">
                    <thead>
                        <tr>
                            <th>Horário</th>
                            <th>${escaparHtml(nomeDia)}</th>
                        </tr>
                    </thead>
                    <tbody>${linhas || '<tr><td colspan="2" style="text-align:center;color:#999;">Sem aulas</td></tr>'}</tbody>
                </table>
            </div>`;
    };

    if (turno === 'todos') {
        const porTurno = {};
        horariosDia.forEach(h => {
            const t = h.turno || 'Manhã';
            if (!porTurno[t]) porTurno[t] = [];
            porTurno[t].push(h);
        });

        const slotsPorTurno = resposta.slotsPorTurno || {};
        corpo.innerHTML = Object.keys(porTurno).sort().map(t =>
            renderTabelaDia(t, slotsPorTurno[t] || resposta.slots || [], porTurno[t])
        ).join('');
        return;
    }

    corpo.innerHTML = renderTabelaDia(
        turno,
        resposta.slots || [],
        horariosDia
    );
}

function abrirQuadroDiaHorario(dia) {
    if (!cacheHorariosProfessor) return;
    diaHorarioSelecionado = dia;
    renderizarQuadroDiaHorario(dia, cacheHorariosProfessor);
}

async function carregarHorariosProfessor() {
    const lista = document.getElementById('listaDiasHorario');
    if (!lista) return;

    const turno = document.getElementById('filtroTurnoHorario')?.value || 'todos';
    const diaAtual = diaHorarioSelecionado;

    try {
        const resposta = await api.listarHorariosProfessor(turno === 'todos' ? 'todos' : turno);
        cacheHorariosProfessor = resposta;

        renderizarListaDiasHorario(resposta);

        if (diaAtual !== null && diaAtual !== undefined) {
            const aindaTemDia = (resposta.horarios || []).some(h => Number(h.diaSemana) === diaAtual);
            if (aindaTemDia) {
                renderizarQuadroDiaHorario(diaAtual, resposta);
                return;
            }
        }

        mostrarVistaListaDiasHorario();
    } catch (erro) {
        cacheHorariosProfessor = null;
        diaHorarioSelecionado = null;
        mostrarVistaListaDiasHorario();
        lista.innerHTML = `<p class="horarios-dias-vazio horarios-dias-erro">${escaparHtml(erro.message)}</p>`;
    }
}

function configurarCardAlunosAtencao() {
    const painel = document.getElementById('painelAlunosAtencao');
    const toggle = document.getElementById('toggleAlunosAtencao');
    if (!painel || !toggle || toggle.dataset.configurado) return;

    toggle.dataset.configurado = '1';
    painel.style.display = '';
    atualizarCardAlunosAtencao();

    toggle.addEventListener('change', () => {
        atualizarCardAlunosAtencao();
    });
}

function atualizarCardAlunosAtencao() {
    const toggle = document.getElementById('toggleAlunosAtencao');
    const corpo = document.getElementById('corpoAlunosAtencao');
    if (!toggle || !corpo) return;

    const ativo = toggle.checked;
    corpo.style.display = ativo ? '' : 'none';

    if (!ativo) return;

    preencherTabelaAlunosAtencao([...alunosAtencaoCache]);
}

function labelSerieTurma(turma) {
    if (!turma) return '—';
    const serie = turma.serie ? ` Turma ${turma.serie}` : '';
    if (turma.nivel === 'Ensino Médio') return `${turma.ano}º EM${serie}`;
    return `${turma.ano}º Ano${serie}`;
}

function configurarPortalProfessor() {
    document.getElementById('filtroTurnoHorario')?.addEventListener('change', carregarHorariosProfessor);
    document.getElementById('btnVoltarDiasHorario')?.addEventListener('click', () => {
        mostrarVistaListaDiasHorario();
    });

    document.querySelectorAll('.portal-acao').forEach(btn => {
        btn.addEventListener('click', () => {
            const link = btn.dataset.link;
            if (link) {
                window.location.href = link;
                return;
            }

            const secao = btn.dataset.acao;
            const menuLink = document.querySelector(`.menu a[data-secao="${secao}"]`);
            carregarSecao(secao, menuLink || null);
        });
    });
}

function renderizarTurmasProfessor() {
    const container = document.getElementById('listaTurmasProfessor');
    if (!container) return;

    if (!turmasAtuais.length) {
        const msg = obterDisciplinasUsuario().length
            ? 'Nenhuma turma cadastrada na escola.'
            : 'Nenhuma turma atribuída. Peça à secretaria para vincular suas disciplinas ao seu cadastro.';
        container.innerHTML = `<p style="color:#7f8c8d;">${escaparHtml(msg)}</p>`;
        return;
    }

    container.innerHTML = turmasAtuais.map(t => `
        <div class="card card-turma-professor">
            <h3>${escaparHtml(t.nome)}</h3>
            <p><strong>${(t.alunos || []).length}</strong> aluno(s) matriculado(s)</p>
            <p style="color:#7f8c8d;font-size:13px;">Turno ${escaparHtml(t.turno || 'Manhã')}</p>
            <div class="card-acoes-turma" style="margin-top:12px;">
                <button type="button" class="btn btn-pequeno btn-sucesso btn-ir-presenca-turma" data-turma-id="${escaparHtml(t._id)}">📋 Presença</button>
                <button type="button" class="btn btn-pequeno btn-info btn-ir-alunos-turma" data-turma-id="${escaparHtml(t._id)}">👨‍🎓 Alunos</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-ir-presenca-turma').forEach(btn => {
        btn.addEventListener('click', () => {
            const menuLink = document.querySelector('.menu a[data-secao="presenca"]');
            carregarSecao('presenca', menuLink);
            const select = document.getElementById('turmaId');
            if (select) select.value = btn.dataset.turmaId;
            carregarAlunosTurma();
        });
    });

    container.querySelectorAll('.btn-ir-alunos-turma').forEach(btn => {
        btn.addEventListener('click', () => {
            const menuLink = document.querySelector('.menu a[data-secao="alunos"]');
            carregarSecao('alunos', menuLink);
        });
    });
}

function preencherTabelaAlunosAtencao(alunosAtencao) {
    const tabelaAtencao = document.getElementById('tabelaAlunosAtencao');
    tabelaAtencao.innerHTML = '';

    if (!alunosAtencao.length) {
        tabelaAtencao.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">Nenhum aluno em atenção para este filtro</td></tr>';
        return;
    }

    const ordenados = [...alunosAtencao].sort((a, b) => {
        const ta = a.turma_id || {};
        const tb = b.turma_id || {};
        const cmpAno = (ta.ano || 0) - (tb.ano || 0);
        if (cmpAno !== 0) return cmpAno;
        const cmpSerie = String(ta.serie || '').localeCompare(String(tb.serie || ''));
        if (cmpSerie !== 0) return cmpSerie;
        return String(ta.nome || '').localeCompare(String(tb.nome || ''));
    });

    let turmaAtual = null;

    ordenados.forEach(aluno => {
        const turma = aluno.turma_id;
        const turmaKey = turma?._id ? String(turma._id) : 'sem-turma';

        if (turmaKey !== turmaAtual) {
            turmaAtual = turmaKey;
            const trGrupo = document.createElement('tr');
            trGrupo.className = 'grupo-turma-atencao';
            trGrupo.innerHTML = `<td colspan="6"><strong>${escaparHtml(turma?.nome || 'Sem turma')}</strong> · ${escaparHtml(labelSerieTurma(turma))} · ${escaparHtml(turma?.turno || '')}</td>`;
            tabelaAtencao.appendChild(trGrupo);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escaparHtml(aluno.aluno_id?.nome || 'N/A')}</td>
            <td>${escaparHtml(labelSerieTurma(turma))}<br><small>${escaparHtml(turma?.nome || '—')}</small></td>
            <td>${escaparHtml(aluno.disciplina)}</td>
            <td><span class="status status-recuperacao">${escaparHtml(aluno.situacao)}</span></td>
            <td>${escaparHtml(aluno.mediaGeral ?? '—')}</td>
            <td>
                <button class="btn btn-pequeno btn-sucesso btn-alerta-desempenho"
                    data-aluno-id="${escaparHtml(aluno.aluno_id?._id)}"
                    data-disciplina="${escaparHtml(aluno.disciplina)}"
                    data-media="${escaparHtml(aluno.mediaGeral ?? '')}">
                    Alertar
                </button>
            </td>`;
        tabelaAtencao.appendChild(tr);
    });

    tabelaAtencao.querySelectorAll('.btn-alerta-desempenho').forEach(btn => {
        btn.addEventListener('click', () => {
            enviarAlertaDesempenho(
                btn.dataset.alunoId,
                btn.dataset.disciplina,
                parseFloat(btn.dataset.media)
            );
        });
    });
}

function preencherTabelaAlunos() {
    const tabela = document.getElementById('tabelaAlunos');
    tabela.innerHTML = '';

    const alunosUnicos = new Map();
    turmasAtuais.forEach(turma => {
        (turma.alunos || []).forEach(aluno => {
            if (aluno && aluno._id) {
                alunosUnicos.set(aluno._id, { ...aluno, turma: turma.nome });
            }
        });
    });

    if (!alunosUnicos.size) {
        tabela.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">Nenhum aluno encontrado</td></tr>';
        return;
    }

    alunosUnicos.forEach(aluno => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escaparHtml(aluno.nome)}</td>
            <td>${escaparHtml(aluno.cpf || '-')}</td>
            <td>${escaparHtml(aluno.email || '-')}</td>
            <td>-</td>
            <td><span class="status status-aprovado">Ativo</span></td>
            <td>${escaparHtml(aluno.turma)}</td>
        `;
        tabela.appendChild(tr);
    });
}

async function carregarAlunosTurma() {
    const seq = ++presencaCarregarSeq;
    const turmaId = document.getElementById('turmaId').value;
    const data = document.getElementById('dataPresenca').value;
    const disciplina = obterNomeDisciplinaPresenca();
    const listaAlunos = document.getElementById('listaAlunos');
    const barraAcoes = document.getElementById('presencaAcoesBar');

    atualizarTextosPresenca();

    if (barraAcoes) barraAcoes.style.display = 'none';

    if (!turmaId || !data) {
        presencaRascunho = {};
        listaAlunos.innerHTML = '<p class="presenca-vazio">Selecione a turma e a data para ver os alunos matriculados</p>';
        return;
    }

    if (!disciplina) {
        presencaRascunho = {};
        listaAlunos.innerHTML = '<p class="presenca-vazio">Selecione a disciplina da aula</p>';
        return;
    }

    const quantidadeTempos = obterQuantidadeTemposDisciplinaPara(disciplina);
    if (!quantidadeTempos) {
        presencaRascunho = {};
        listaAlunos.innerHTML = '<p class="presenca-vazio">Disciplina sem tempos configurados pela secretaria.</p>';
        return;
    }

    const turma = turmasAtuais.find(t => String(t._id) === turmaId);
    if (!disciplinaPermitidaParaTurma(disciplina, turma)) {
        presencaRascunho = {};
        listaAlunos.innerHTML = `<p class="presenca-vazio">${escaparHtml(disciplina)} não é ofertada para a turma ${escaparHtml(turma?.nome || '')}.</p>`;
        return;
    }

    if (!turma || !turma.alunos?.length) {
        presencaRascunho = {};
        listaAlunos.innerHTML = '<p class="presenca-vazio">Nenhum aluno matriculado nesta turma</p>';
        return;
    }

    listaAlunos.innerHTML = '<p class="presenca-vazio">Carregando alunos...</p>';

    presencaRascunho = {};

    try {
        const resposta = await api.listarPresencaTurma(turmaId, data, disciplina);
        if (seq !== presencaCarregarSeq) return;

        (resposta.presencas || []).forEach(p => {
            const alunoId = String(p.aluno_id?._id || p.aluno_id);
            presencaRascunho[`${alunoId}_${p.tempo}`] = p.status;
        });
    } catch (erro) {
        if (seq !== presencaCarregarSeq) return;
        console.error(erro);
    }

    if (seq !== presencaCarregarSeq) return;

    renderizarListaPresenca(turma, quantidadeTempos);
    if (barraAcoes) barraAcoes.style.display = 'flex';
}

function renderizarListaPresenca(turma, quantidadeTempos) {
    const listaAlunos = document.getElementById('listaAlunos');

    const botoesTempo = (alunoId, tempo) => {
        const status = presencaRascunho[`${alunoId}_${tempo}`];
        const idEsc = escaparHtml(alunoId);
        return `
        <div class="presenca-tempo-coluna">
            <div class="botoes-presenca botoes-presenca-xs" data-aluno-id="${idEsc}" data-tempo="${tempo}">
                <button type="button" class="btn-presenca btn-p btn-presenca-xs ${status === 'presente' ? 'ativo' : ''}"
                    data-aluno-id="${idEsc}" data-tempo="${tempo}" data-status="presente" title="Presente">P</button>
                <button type="button" class="btn-presenca btn-f btn-presenca-xs ${status === 'falta' ? 'ativo' : ''}"
                    data-aluno-id="${idEsc}" data-tempo="${tempo}" data-status="falta" title="Falta">F</button>
            </div>
        </div>`;
    };

    const colunaRotuloTempo = (tempo) => `
        <div class="presenca-tempo-coluna presenca-tempo-coluna-rotulo">
            <span class="presenca-tempo-rotulo">${tempo}º tempo</span>
        </div>`;

    const linhas = turma.alunos.map(aluno => {
        const id = String(aluno._id);

        if (quantidadeTempos === 1) {
            return `
                <div class="linha-presenca-aluno">
                    <span class="nome-aluno">${escaparHtml(aluno.nome)}</span>
                    ${botoesTempo(id, 1)}
                </div>`;
        }

        const temposHtml = Array.from({ length: quantidadeTempos }, (_, i) => botoesTempo(id, i + 1)).join('');

        return `
            <div class="linha-presenca-aluno linha-presenca-multi">
                <span class="nome-aluno">${escaparHtml(aluno.nome)}</span>
                <div class="presenca-tempos-linha">${temposHtml}</div>
            </div>`;
    }).join('');

    const cabecalho = quantidadeTempos === 1
        ? `<div class="presenca-cabecalho"><span>Aluno</span><span>Presença</span></div>`
        : `<div class="presenca-cabecalho presenca-cabecalho-multi">
                <span>Aluno</span>
                <div class="presenca-tempos-linha presenca-tempos-cabecalho">
                    ${Array.from({ length: quantidadeTempos }, (_, i) => colunaRotuloTempo(i + 1)).join('')}
                </div>
           </div>`;

    listaAlunos.innerHTML = cabecalho + linhas;

    listaAlunos.querySelectorAll('.btn-presenca').forEach(btn => {
        btn.addEventListener('click', () => {
            marcarPresencaLocal(btn.dataset.alunoId, parseInt(btn.dataset.tempo, 10), btn.dataset.status);
        });
    });

    atualizarResumoTaxasPresenca(turma.alunos?.length || 0, quantidadeTempos);
}

function marcarPresencaLocal(alunoId, tempo, status) {
    presencaRascunho[`${alunoId}_${tempo}`] = status;

    const grupo = document.querySelector(
        `.botoes-presenca[data-aluno-id="${alunoId}"][data-tempo="${tempo}"]`
    );
    if (grupo) {
        grupo.querySelectorAll('.btn-presenca').forEach(btn => {
            btn.classList.toggle('ativo', btn.dataset.status === status);
        });
    }

    const turmaId = document.getElementById('turmaId')?.value;
    const turma = turmasAtuais.find(t => String(t._id) === turmaId);
    const disciplina = obterNomeDisciplinaPresenca();
    atualizarResumoTaxasPresenca(
        turma?.alunos?.length || 0,
        obterQuantidadeTemposDisciplinaPara(disciplina) || 1
    );
}

async function salvarPresencaTurma() {
    const turmaId = document.getElementById('turmaId').value;
    const data = document.getElementById('dataPresenca').value;
    const disciplina = obterNomeDisciplinaPresenca();
    const btnSalvar = document.getElementById('btnSalvarPresenca');

    if (!turmaId || !data || !disciplina) {
        mostrarErro('Selecione turma, data e disciplina');
        return;
    }

    const registros = Object.entries(presencaRascunho)
        .filter(([, status]) => status === 'presente' || status === 'falta')
        .map(([chave, status]) => {
            const sep = chave.lastIndexOf('_');
            const alunoId = chave.slice(0, sep);
            const tempo = parseInt(chave.slice(sep + 1), 10);
            return { aluno_id: alunoId, tempo, status };
        });

    if (!registros.length) {
        mostrarErro('Marque pelo menos um aluno (P ou F) antes de salvar');
        return;
    }

    try {
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = 'Salvando...';
        }

        const resposta = await api.registrarPresencaLote({
            turma_id: turmaId,
            data,
            disciplina,
            registros
        });

        mostrarSucesso(resposta.mensagem || 'Frequência salva com sucesso!');
    } catch (erro) {
        mostrarErro(erro.message);
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.textContent = '💾 Salvar frequência';
        }
    }
}

async function registrarConteudo(e) {
    e.preventDefault();

    try {
        const dados = {
            turma_id: document.getElementById('conteudoTurma').value,
            disciplina: document.getElementById('conteudoDisciplina').value,
            titulo: document.getElementById('conteudoTitulo').value,
            descricao: document.getElementById('conteudoDescricao').value,
            topicos: document.getElementById('conteudoTopicos').value.split(',').map(t => t.trim()).filter(Boolean),
            data: new Date().toISOString(),
            recursos: [],
            codigosBncc: (document.getElementById('conteudoBncc')?.value || '')
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean)
        };

        await api.registrarConteudo(dados);
        mostrarSucesso('Conteúdo registrado com sucesso!');
        document.getElementById('formularioConteudo').reset();

    } catch (erro) {
        mostrarErro(erro.message);
    }
}

async function enviarAlertaDesempenho(alunoId, disciplina, media) {
    try {
        await api.enviarAlertaDesempenho(alunoId, disciplina, media);
        mostrarSucesso('Alerta enviado via WhatsApp!');
    } catch (erro) {
        mostrarErro(erro.message);
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

    if (secao === 'alunos') {
        preencherTabelaAlunos();
    }

    if (secao === 'turmas') {
        renderizarTurmasProfessor();
    }

    if (secao === 'presenca') {
        carregarAlunosTurma();
    }

    if (secao === 'avaliacoes' && gradeNotasCache) {
        renderizarTabelaNotas(gradeNotasCache);
    }

    if (secao === 'ia-pedagogica') {
        prepararSecaoIA();
    }

    if (secao === 'htpc') {
        carregarHtpcProfessor();
    }

    if (secao === 'pei') {
        prepararPeiProfessor();
        carregarPeiProfessor();
    }

    if (secao === 'bncc') {
        // lista sob demanda
    }

    if (secao === 'simulados') {
        prepararSimuladosProf();
        carregarSimuladosProf();
    }
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (e) {
        window.location.href = 'index.html';
    }
}

function configurarIAPedagogica() {
    const selTurma = document.getElementById('iaTurma');
    const selAluno = document.getElementById('iaAluno');
    const btnGerar = document.getElementById('btnGerarParecerIA');
    const btnSalvar = document.getElementById('btnSalvarParecerIA');
    if (!selTurma || !btnGerar) return;

    selTurma.addEventListener('change', onMudancaTurmaIA);
    selAluno?.addEventListener('change', () => {
        iaGeradoCache = null;
        document.getElementById('iaResultado').hidden = true;
        carregarHistoricoIA();
    });
    btnGerar.addEventListener('click', gerarParecerIA);
    btnSalvar?.addEventListener('click', salvarParecerIA);
}

function prepararSecaoIA() {
    const selTurma = document.getElementById('iaTurma');
    if (!selTurma) return;
    if (!selTurma.options.length || selTurma.options.length <= 1) {
        // já preenchido em preencherSelectTurmas; se vazio, tenta de novo
        const selectIA = selTurma;
        selectIA.innerHTML = '<option value="">Selecione</option>';
        turmasAtuais.forEach((turma) => {
            const option = document.createElement('option');
            option.value = turma._id;
            option.textContent = turma.nome;
            selectIA.appendChild(option);
        });
    }
    preencherSelectDisciplinasProfessor('iaDisciplina');
}

async function onMudancaTurmaIA() {
    const turmaId = document.getElementById('iaTurma').value;
    const selAluno = document.getElementById('iaAluno');
    const turma = obterTurmaPorId(turmaId);
    preencherSelectDisciplinasProfessor('iaDisciplina', null, turma);

    iaGeradoCache = null;
    document.getElementById('iaResultado').hidden = true;
    document.getElementById('iaHistorico').innerHTML =
        '<p style="color:#7f8c8d;">Selecione um aluno para ver pareceres salvos.</p>';

    if (!turmaId) {
        selAluno.disabled = true;
        selAluno.innerHTML = '<option value="">Selecione a turma</option>';
        return;
    }

    selAluno.disabled = false;
    selAluno.innerHTML = '<option value="">Carregando...</option>';
    try {
        const alunos = turma?.alunos || [];
        selAluno.innerHTML = '<option value="">Selecione</option>';
        alunos.forEach((a) => {
            const id = a._id || a;
            const nome = a.nome || String(id);
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = nome;
            selAluno.appendChild(opt);
        });
        if (!alunos.length) {
            selAluno.innerHTML = '<option value="">Nenhum aluno nesta turma</option>';
        }
    } catch (e) {
        selAluno.innerHTML = `<option value="">Erro: ${escaparHtml(e.message)}</option>`;
    }
}

async function gerarParecerIA() {
    const turma_id = document.getElementById('iaTurma').value;
    const aluno_id = document.getElementById('iaAluno').value;
    const disciplina = document.getElementById('iaDisciplina').value;
    const aviso = document.getElementById('iaAviso');
    const btn = document.getElementById('btnGerarParecerIA');

    if (!turma_id || !aluno_id) {
        aviso.textContent = 'Selecione turma e aluno.';
        return;
    }

    btn.disabled = true;
    aviso.textContent = 'Gerando parecer...';
    try {
        const resp = await api.gerarParecerIA({
            aluno_id,
            turma_id,
            disciplina: disciplina || undefined
        });
        iaGeradoCache = resp;
        document.getElementById('iaParecer').value = resp.textoParecer || '';
        document.getElementById('iaOrientacoes').value = resp.textoOrientacoes || '';
        const s = resp.snapshot || {};
        document.getElementById('iaSnapshot').textContent =
            `Fonte: ${resp.fonte || 'local'} · Média: ${s.media != null ? s.media : '—'} · ` +
            `Frequência: ${s.frequenciaPercentual != null ? s.frequenciaPercentual + '%' : '—'} · ` +
            `Faltas: ${s.totalFaltas != null ? s.totalFaltas : '—'} · Nível: ${s.nivel || '—'}`;
        document.getElementById('iaResultado').hidden = false;
        aviso.textContent = resp.aviso || 'Revise o texto antes de salvar.';
    } catch (e) {
        aviso.textContent = e.message || 'Erro ao gerar parecer';
    } finally {
        btn.disabled = false;
    }
}

async function salvarParecerIA() {
    const turma_id = document.getElementById('iaTurma').value;
    const aluno_id = document.getElementById('iaAluno').value;
    const disciplina = document.getElementById('iaDisciplina').value;
    const textoParecer = document.getElementById('iaParecer').value.trim();
    const textoOrientacoes = document.getElementById('iaOrientacoes').value.trim();
    const aviso = document.getElementById('iaAviso');
    const btn = document.getElementById('btnSalvarParecerIA');

    if (!textoParecer || !textoOrientacoes) {
        aviso.textContent = 'Preencha parecer e orientações antes de salvar.';
        return;
    }

    const originalParecer = iaGeradoCache?.textoParecer || '';
    const originalOrient = iaGeradoCache?.textoOrientacoes || '';
    const editado = textoParecer !== originalParecer || textoOrientacoes !== originalOrient;

    btn.disabled = true;
    try {
        await api.salvarParecerIA({
            aluno_id,
            turma_id,
            disciplina: disciplina || '',
            textoParecer,
            textoOrientacoes,
            fonte: iaGeradoCache?.fonte || 'local',
            editado,
            snapshot: iaGeradoCache?.snapshot || {}
        });
        aviso.textContent = 'Parecer salvo com sucesso.';
        await carregarHistoricoIA();
    } catch (e) {
        aviso.textContent = e.message || 'Erro ao salvar';
    } finally {
        btn.disabled = false;
    }
}

async function carregarHistoricoIA() {
    const aluno_id = document.getElementById('iaAluno')?.value;
    const box = document.getElementById('iaHistorico');
    if (!box) return;
    if (!aluno_id) {
        box.innerHTML = '<p style="color:#7f8c8d;">Selecione um aluno para ver pareceres salvos.</p>';
        return;
    }
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando histórico...</p>';
    try {
        const resp = await api.listarPareceresIA(aluno_id);
        const lista = resp.pareceres || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum parecer salvo ainda para este aluno.</p>';
            return;
        }
        box.innerHTML = lista.map((p) => {
            const data = p.dataCriacao ? new Date(p.dataCriacao).toLocaleString('pt-BR') : '—';
            const autor = p.geradoPor?.nome || '—';
            const turma = p.turma_id?.nome || '—';
            const disc = p.disciplina ? ` · ${escaparHtml(p.disciplina)}` : '';
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#fff;">
                <header style="font-size:13px;color:#566573;margin-bottom:8px;">
                    ${escaparHtml(data)} · ${escaparHtml(autor)} · ${escaparHtml(turma)}${disc}
                    ${p.editado ? ' · <em>editado</em>' : ''} · fonte ${escaparHtml(p.fonte || 'local')}
                </header>
                <p style="margin:0 0 8px;white-space:pre-wrap;">${escaparHtml(p.textoParecer)}</p>
                <p style="margin:0;white-space:pre-wrap;color:#3d4a57;"><strong>Orientações:</strong>\n${escaparHtml(p.textoOrientacoes)}</p>
            </article>`;
        }).join('');
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function carregarHtpcProfessor() {
    const box = document.getElementById('listaHtpcProf');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarHtpc();
        const lista = res.reunioes || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhuma reunião pedagógica no momento.</p>';
            return;
        }
        const labelPublico = { pais: 'Pais', professores: 'Professores', todos: 'Todos' };
        box.innerHTML = lista.map((r) => {
            const data = r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '—';
            const meuId = String(usuario?._id);
            const eu = (r.participantes || []).find((p) => {
                const uid = String(p.usuario_id?._id || p.usuario_id || p.professor_id?._id || p.professor_id);
                return uid === meuId;
            });
            const presente = eu?.presente;
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff;">
                <strong>${escaparHtml(r.titulo)}</strong>
                <p style="font-size:13px;color:#566573;margin:6px 0;">${escaparHtml(data)} · ${escaparHtml(r.turno || '')} · ${escaparHtml(r.status)} · ${escaparHtml(labelPublico[r.publico] || '')}</p>
                <p style="white-space:pre-wrap;font-size:14px;">${escaparHtml(r.pauta || '')}</p>
                ${r.ata ? `<p style="font-size:13px;"><strong>Ata:</strong> ${escaparHtml(r.ata.slice(0, 300))}</p>` : ''}
                <button type="button" class="btn btn-pequeno ${presente ? 'btn-secundario' : 'btn-sucesso'}" data-htpc-eu="${escaparHtml(r._id)}" data-presente="${presente ? '0' : '1'}">
                    ${presente ? 'Presente (clique para desmarcar)' : 'Marcar minha presença'}
                </button>
            </article>`;
        }).join('');
        box.querySelectorAll('[data-htpc-eu]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api.presencaHtpc(btn.getAttribute('data-htpc-eu'), {
                        presente: btn.getAttribute('data-presente') === '1'
                    });
                    mostrarSucesso('Presença atualizada');
                    carregarHtpcProfessor();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

function prepararPeiProfessor() {
    const sel = document.getElementById('peiProfTurma');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione</option>';
    turmasAtuais.forEach((t) => {
        const o = document.createElement('option');
        o.value = t._id;
        o.textContent = t.nome;
        sel.appendChild(o);
    });
}

function onPeiProfTurmaChange() {
    const turma = obterTurmaPorId(document.getElementById('peiProfTurma').value);
    const sel = document.getElementById('peiProfAluno');
    if (!turma) {
        sel.disabled = true;
        sel.innerHTML = '<option value="">Turma primeiro</option>';
        return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione</option>';
    (turma.alunos || []).forEach((a) => {
        const o = document.createElement('option');
        o.value = a._id || a;
        o.textContent = a.nome || String(a._id || a);
        sel.appendChild(o);
    });
}

async function salvarPeiProfessor(e) {
    e.preventDefault();
    const aluno_id = document.getElementById('peiProfAluno').value;
    const turma_id = document.getElementById('peiProfTurma').value;
    if (!aluno_id) {
        mostrarErro('Selecione o aluno');
        return;
    }
    const metas = (document.getElementById('peiProfMetas').value || '')
        .split('\n').map((l) => l.trim()).filter(Boolean)
        .map((descricao) => ({ descricao, status: 'pendente' }));
    try {
        await api.criarPei({
            aluno_id,
            turma_id,
            diagnostico: document.getElementById('peiProfDiagnostico').value,
            necessidades: document.getElementById('peiProfNecessidades').value,
            estrategias: document.getElementById('peiProfEstrategias').value,
            metas,
            status: 'rascunho'
        });
        mostrarSucesso('PEI criado');
        e.target.reset();
        carregarPeiProfessor();
    } catch (err) {
        mostrarErro(err.message);
    }
}

async function carregarPeiProfessor() {
    const box = document.getElementById('listaPeiProf');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarPeis();
        const lista = res.peis || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum PEI dos seus alunos ainda.</p>';
            return;
        }
        box.innerHTML = lista.map((p) => {
            const aluno = p.aluno_id?.nome || '—';
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff;">
                <strong>${escaparHtml(aluno)}</strong> · ${escaparHtml(p.status)}
                <p style="font-size:14px;margin:8px 0;">${escaparHtml((p.diagnostico || '').slice(0, 180))}</p>
                <textarea data-pei-prof-acomp="${escaparHtml(p._id)}" rows="2" style="width:100%;margin-bottom:6px;" placeholder="Acompanhamento"></textarea>
                <button type="button" class="btn btn-pequeno btn-sucesso" data-pei-prof-add="${escaparHtml(p._id)}">Registrar</button>
            </article>`;
        }).join('');
        box.querySelectorAll('[data-pei-prof-add]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-pei-prof-add');
                const texto = box.querySelector(`[data-pei-prof-acomp="${id}"]`)?.value?.trim();
                if (!texto) return mostrarErro('Digite o texto');
                try {
                    await api.acompanhamentoPei(id, texto);
                    mostrarSucesso('Registrado');
                    carregarPeiProfessor();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function buscarBnccProfessor() {
    const box = document.getElementById('listaBncc');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Buscando...</p>';
    try {
        const params = {};
        const q = document.getElementById('bnccQ')?.value?.trim();
        const area = document.getElementById('bnccArea')?.value;
        const ano = document.getElementById('bnccAno')?.value?.trim();
        if (q) params.q = q;
        if (area) params.area = area;
        if (ano) params.ano = ano;
        const res = await api.buscarBncc(params);
        const itens = res.itens || [];
        if (!itens.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum item encontrado. Rode: node database/seed-bncc.js</p>';
            return;
        }
        box.innerHTML = `<p style="font-size:13px;color:#566573;margin-bottom:10px;">${itens.length} resultado(s). Clique em um código para copiar ao conteúdo.</p>` +
            itens.map((it) => `<article style="border:1px solid #d0d7de;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#fff;cursor:pointer;" data-bncc-codigo="${escaparHtml(it.codigo)}">
                <strong>${escaparHtml(it.codigo)}</strong>
                <span style="font-size:12px;color:#7a8794;"> · ${escaparHtml(it.area)} · ano ${escaparHtml(it.ano)} · ${escaparHtml(it.eixo || '')}</span>
                <p style="margin:6px 0 0;font-size:14px;">${escaparHtml(it.descricao)}</p>
            </article>`).join('');
        box.querySelectorAll('[data-bncc-codigo]').forEach((el) => {
            el.addEventListener('click', () => {
                const codigo = el.getAttribute('data-bncc-codigo');
                const input = document.getElementById('conteudoBncc');
                if (input) {
                    const atuais = input.value.split(',').map((c) => c.trim()).filter(Boolean);
                    if (!atuais.includes(codigo)) atuais.push(codigo);
                    input.value = atuais.join(', ');
                }
                mostrarSucesso(`Código ${codigo} adicionado ao campo de conteúdo`);
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

let simuladoCorrecaoId = null;
let simuladoCorrecaoItens = [];

function prepararSimuladosProf() {
    const sel = document.getElementById('simTurma');
    if (!sel) return;
    sel.innerHTML = '<option value="">Opcional</option>';
    turmasAtuais.forEach((t) => {
        const o = document.createElement('option');
        o.value = t._id;
        o.textContent = t.nome;
        sel.appendChild(o);
    });
    if (!document.getElementById('simData').value) {
        document.getElementById('simData').valueAsDate = new Date();
    }
}

async function salvarSimuladoProf(e) {
    e.preventDefault();
    try {
        await api.criarSimulado({
            titulo: document.getElementById('simTitulo').value.trim(),
            fonte: document.getElementById('simFonte').value,
            area: document.getElementById('simArea').value,
            quantidadeItens: Number(document.getElementById('simQtd').value) || 5,
            turma_id: document.getElementById('simTurma').value || undefined,
            dataInicio: document.getElementById('simData').value,
            dataFim: document.getElementById('simDataFim')?.value || undefined,
            anoReferencia: document.getElementById('simAnoRef').value || String(new Date().getFullYear()),
            status: 'agendado',
            modoOnline: Boolean(document.getElementById('simOnline')?.checked),
            duracaoMinutos: Number(document.getElementById('simDuracao')?.value) || 0,
            mostrarResultadoImediato: true
        });
        mostrarSucesso('Simulado agendado');
        e.target.reset();
        if (document.getElementById('simOnline')) document.getElementById('simOnline').checked = true;
        if (document.getElementById('simDuracao')) document.getElementById('simDuracao').value = '60';
        prepararSimuladosProf();
        carregarSimuladosProf();
    } catch (err) {
        mostrarErro(err.message);
    }
}

async function carregarSimuladosProf() {
    const box = document.getElementById('listaSimuladosProf');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarSimulados();
        const lista = res.simulados || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum simulado ainda.</p>';
            return;
        }
        box.innerHTML = lista.map((s) => {
            const data = s.dataInicio ? new Date(s.dataInicio).toLocaleDateString('pt-BR') : '—';
            const online = s.modoOnline ? ` · online ${s.duracaoMinutos || 0}min` : '';
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff;">
                <strong>${escaparHtml(s.titulo)}</strong>
                <p style="font-size:13px;color:#566573;margin:6px 0;">
                    ${escaparHtml(data)} · ${escaparHtml(s.fonte)} · ${escaparHtml(s.area)} · ${escaparHtml(s.status)}${escaparHtml(online)}
                    · média escola: ${s.mediaEscola != null ? s.mediaEscola + '%' : '—'}
                    · respostas: ${s.totalRespostas || 0}
                </p>
                <button type="button" class="btn btn-pequeno btn-primario" data-abrir-correcao="${escaparHtml(s._id)}">Abrir correção</button>
                <button type="button" class="btn btn-pequeno btn-sucesso" data-recorrigir="${escaparHtml(s._id)}">Recalcular média</button>
                ${!s.modoOnline ? `<button type="button" class="btn btn-pequeno" data-liberar-online="${escaparHtml(s._id)}">Liberar online</button>` : ''}
            </article>`;
        }).join('');
        box.querySelectorAll('[data-abrir-correcao]').forEach((btn) => {
            btn.addEventListener('click', () => abrirPainelCorrecao(btn.getAttribute('data-abrir-correcao')));
        });
        box.querySelectorAll('[data-recorrigir]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    const r = await api.corrigirSimulado(btn.getAttribute('data-recorrigir'));
                    mostrarSucesso(r.mensagem || 'Corrigido');
                    carregarSimuladosProf();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
        box.querySelectorAll('[data-liberar-online]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api.atualizarSimulado(btn.getAttribute('data-liberar-online'), {
                        modoOnline: true,
                        duracaoMinutos: 60
                    });
                    mostrarSucesso('Prova liberada para alunos online');
                    carregarSimuladosProf();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function abrirPainelCorrecao(simuladoId) {
    const painel = document.getElementById('painelCorrecaoSim');
    const meta = document.getElementById('simCorrecaoMeta');
    const box = document.getElementById('simCorrecaoAlunos');
    painel.style.display = 'block';
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando itens e alunos...</p>';
    try {
        const res = await api.obterSimulado(simuladoId);
        const s = res.simulado;
        simuladoCorrecaoId = s._id;
        simuladoCorrecaoItens = s.itens || [];
        meta.textContent = `${s.titulo} · ${simuladoCorrecaoItens.length} item(ns) · gabarito disponível para lançamento`;

        const turmaId = s.turma_id?._id || s.turma_id;
        let alunos = [];
        if (turmaId) {
            const turma = obterTurmaPorId(turmaId) || s.turma_id;
            alunos = (turma?.alunos || []).map((a) => ({
                _id: a._id || a,
                nome: a.nome || String(a._id || a)
            }));
            if (!alunos.length || !alunos[0].nome || alunos[0].nome.length < 3) {
                try {
                    const r = await api.requisicao(`/turmas/${turmaId}/resumo-alunos`);
                    alunos = (r.alunos || []).map((a) => ({ _id: a._id, nome: a.nome }));
                } catch (_) { /* ignore */ }
            }
        }
        if (!alunos.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Vincule uma turma ao simulado para lançar respostas por aluno, ou use “Recalcular média” se já houver respostas.</p>';
            return;
        }

        box.innerHTML = alunos.map((al) => {
            const radios = simuladoCorrecaoItens.map((it, idx) => {
                const letras = (it.alternativas || []).map((a) => a.letra).join('');
                const opts = (it.alternativas || []).map((a) =>
                    `<label style="margin-right:8px;font-weight:normal;"><input type="radio" name="r-${escaparHtml(al._id)}-${idx}" value="${escaparHtml(a.letra)}"> ${escaparHtml(a.letra)}</label>`
                ).join('');
                return `<div style="margin:6px 0;font-size:13px;"><strong>${idx + 1}.</strong> ${escaparHtml((it.enunciado || '').slice(0, 80))}… (${escaparHtml(letras || 'ABCD')})<br>${opts}</div>`;
            }).join('');
            return `<details style="border:1px solid #e0e0e0;border-radius:6px;padding:8px 10px;margin-bottom:8px;">
                <summary>${escaparHtml(al.nome)}</summary>
                <div data-aluno-lanc="${escaparHtml(al._id)}">${radios}</div>
            </details>`;
        }).join('');
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function corrigirSimuladoAtivo() {
    if (!simuladoCorrecaoId) {
        mostrarErro('Abra um simulado para correção');
        return;
    }
    const lancamentos = [];
    document.querySelectorAll('[data-aluno-lanc]').forEach((div) => {
        const alunoId = div.getAttribute('data-aluno-lanc');
        const respostas = [];
        simuladoCorrecaoItens.forEach((it, idx) => {
            const checked = div.querySelector(`input[name="r-${alunoId}-${idx}"]:checked`);
            if (checked) {
                respostas.push({ item_id: it._id, alternativa: checked.value });
            }
        });
        if (respostas.length) {
            lancamentos.push({ aluno_id: alunoId, respostas });
        }
    });

    try {
        const r = await api.corrigirSimulado(simuladoCorrecaoId, { lancamentos });
        mostrarSucesso(r.mensagem || 'Correção salva');
        carregarSimuladosProf();
    } catch (e) {
        mostrarErro(e.message);
    }
}

async function buscarItensSimProf() {
    const box = document.getElementById('listaItensSim');
    box.innerHTML = '<p style="color:#7f8c8d;">Buscando...</p>';
    try {
        const params = {};
        const fonte = document.getElementById('filtroItemFonte')?.value;
        const area = document.getElementById('filtroItemArea')?.value;
        if (fonte) params.fonte = fonte;
        if (area) params.area = area;
        const res = await api.listarItensSimulado(params);
        const itens = res.itens || [];
        if (!itens.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum item. Cadastre acima ou rode: node database/seed-itens-saeb.js</p>';
            return;
        }
        box.innerHTML = itens.map((it) => {
            const img = it.imagemUrl
                ? `<img src="${escaparHtml(it.imagemUrl)}" alt="" style="max-width:100%;max-height:180px;margin:8px 0;border-radius:6px;display:block;">`
                : '';
            const podeExcluir = it.fonte === 'escola' && it.escola_id;
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:10px;margin-bottom:8px;background:#fff;font-size:14px;">
                <strong>${escaparHtml(it.codigo)}</strong>
                <span style="color:#7a8794;font-size:12px;"> · ${escaparHtml(it.fonte)} · ${escaparHtml(it.area)} · ano ${escaparHtml(it.ano)} · gab. ${escaparHtml(it.gabarito)}</span>
                <p style="margin:6px 0 0;">${escaparHtml(it.enunciado)}</p>
                ${img}
                <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;">
                    ${(it.alternativas || []).map((a) => `<li><strong>${escaparHtml(a.letra)}</strong> ${escaparHtml(a.texto)}</li>`).join('')}
                </ul>
                ${podeExcluir ? `<button type="button" class="btn btn-pequeno btn-erro" style="margin-top:8px;" data-excluir-item="${escaparHtml(it._id)}">Excluir do banco da escola</button>` : ''}
            </article>`;
        }).join('');
        box.querySelectorAll('[data-excluir-item]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('Excluir este item do banco da escola?')) return;
                try {
                    await api.excluirItemSimulado(btn.getAttribute('data-excluir-item'));
                    mostrarSucesso('Item excluído');
                    buscarItensSimProf();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function onItemImagemChange() {
    const input = document.getElementById('itemImagem');
    const preview = document.getElementById('itemImagemPreview');
    const hidden = document.getElementById('itemImagemUrl');
    const aviso = document.getElementById('itemBancoAviso');
    const file = input?.files?.[0];
    if (!file) {
        hidden.value = '';
        preview.innerHTML = '';
        return;
    }
    aviso.textContent = 'Enviando imagem...';
    try {
        const res = await api.uploadImagemItem(file);
        hidden.value = res.url || '';
        preview.innerHTML = hidden.value
            ? `<img src="${escaparHtml(hidden.value)}" alt="Prévia" style="max-width:280px;max-height:180px;border-radius:6px;">`
            : '';
        aviso.textContent = 'Imagem pronta para salvar com o item.';
    } catch (e) {
        hidden.value = '';
        preview.innerHTML = '';
        input.value = '';
        aviso.textContent = e.message || 'Falha no upload';
        mostrarErro(e.message);
    }
}

async function salvarItemBancoProf(e) {
    e.preventDefault();
    const aviso = document.getElementById('itemBancoAviso');
    const btn = document.getElementById('btnSalvarItem');
    const alternativas = [];
    document.querySelectorAll('#itemAlternativas .alt-linha').forEach((row) => {
        const letra = row.querySelector('.alt-letra')?.value?.trim().toUpperCase();
        const texto = row.querySelector('.alt-texto')?.value?.trim();
        if (letra && texto) alternativas.push({ letra, texto });
    });
    if (alternativas.length < 2) {
        mostrarErro('Informe pelo menos 2 alternativas com texto');
        return;
    }
    const gabarito = document.getElementById('itemGabarito').value;
    if (!alternativas.some((a) => a.letra === gabarito)) {
        mostrarErro('O gabarito deve ser uma das alternativas preenchidas');
        return;
    }

    btn.disabled = true;
    aviso.textContent = 'Salvando item...';
    try {
        await api.criarItemSimulado({
            codigo: document.getElementById('itemCodigo').value.trim(),
            fonte: 'escola',
            area: document.getElementById('itemArea').value,
            ano: document.getElementById('itemAno').value.trim(),
            dificuldade: document.getElementById('itemDificuldade').value,
            enunciado: document.getElementById('itemEnunciado').value.trim(),
            imagemUrl: document.getElementById('itemImagemUrl').value || '',
            habilidadeBncc: document.getElementById('itemBncc').value.trim(),
            alternativas,
            gabarito
        });
        mostrarSucesso('Item salvo no banco da escola');
        e.target.reset();
        document.getElementById('itemImagemUrl').value = '';
        document.getElementById('itemImagemPreview').innerHTML = '';
        document.querySelector('#itemAlternativas .alt-letra').value = 'A';
        const letras = document.querySelectorAll('#itemAlternativas .alt-letra');
        if (letras[0]) letras[0].value = 'A';
        if (letras[1]) letras[1].value = 'B';
        if (letras[2]) letras[2].value = 'C';
        if (letras[3]) letras[3].value = 'D';
        aviso.textContent = '';
        const filtro = document.getElementById('filtroItemFonte');
        if (filtro) filtro.value = 'escola';
        buscarItensSimProf();
    } catch (err) {
        aviso.textContent = err.message || 'Erro ao salvar';
        mostrarErro(err.message);
    } finally {
        btn.disabled = false;
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

// Expõe funções usadas no HTML (compatibilidade com onclick)
window.carregarSecao = carregarSecao;
window.fazerLogout = fazerLogout;
