// frontend/js/painel-professor.js - Lógica do painel do professor

let usuario = null;
let turmasAtuais = [];
let disciplinasPresenca = [];
let presencaRascunho = {};
let presencaCarregarSeq = 0;
let configEscola = { avaliacaoComportamental: false };

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();
    configurarPortalProfessor();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    carregarSecao('dashboard');
    await carregarDados();

    document.getElementById('dataPresenca').valueAsDate = new Date();

    document.getElementById('formularioConteudo').addEventListener('submit', registrarConteudo);
    document.getElementById('turmaId').addEventListener('change', () => {
        const turma = obterTurmaPorId(document.getElementById('turmaId').value);
        preencherSelectDisciplinasProfessor('disciplinaPresenca', null, turma);
        sincronizarPortalComPresenca();
        atualizarTextosPresenca();
        carregarAlunosTurma();
    });
    document.getElementById('dataPresenca').addEventListener('change', () => {
        atualizarTextosPresenca();
        carregarAlunosTurma();
    });
    document.getElementById('disciplinaPresenca').addEventListener('change', () => {
        sincronizarPortalComPresenca();
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
        preencherSelectTurmasAvaliacao();
        preencherSelectDisciplinaTurmaPortal();
        renderizarDisciplinasProfessor();
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

    selectTurma.innerHTML = '<option value="">Selecione uma turma</option>';
    selectConteudo.innerHTML = '<option value="">Selecione uma turma</option>';

    turmasAtuais.forEach(turma => {
        const option = document.createElement('option');
        option.value = turma._id;
        option.textContent = turma.nome;
        selectTurma.appendChild(option);

        const option2 = document.createElement('option');
        option2.value = turma._id;
        option2.textContent = turma.nome;
        selectConteudo.appendChild(option2);
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

function sincronizarPortalComPresenca() {
    const turmaId = document.getElementById('turmaId')?.value;
    const disciplina = document.getElementById('disciplinaPresenca')?.value;
    const portal = document.getElementById('selectDisciplinaTurma');
    if (portal && turmaId && disciplina) {
        portal.value = `${turmaId}|${disciplina}`;
    }
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
            return;
        }
        const turma = turmasAtuais.find(t => String(t._id) === turmaId);
        if (!turma) {
            contador.textContent = '';
            return;
        }
        const qtd = turma.alunos?.length || 0;
        contador.textContent = disciplina
            ? `${qtd} aluno(s) matriculado(s) — ${turma.nome} · ${disciplina}`
            : `${qtd} aluno(s) matriculado(s) — ${turma.nome}`;
    }
}

let gradeNotasCache = null;

function obterAnoLetivoVigente() {
    return configEscola.anoLetivo || new Date().getFullYear();
}

function preencherAnoLetivo() {
    const vigente = obterAnoLetivoVigente();
    const campo = document.getElementById('filtroAnoLetivo');
    if (campo) campo.value = `${vigente} (vigente)`;

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

function preencherSelectTurmasAvaliacao() {
    const select = document.getElementById('avaliacaoTurma');
    select.innerHTML = '<option value="">Selecione</option>';
    turmasAtuais.forEach(turma => {
        const option = document.createElement('option');
        option.value = turma._id;
        option.textContent = turma.serie || turma.nome.split(' ').pop() || turma.nome;
        option.dataset.nome = turma.nome;
        option.dataset.ano = turma.ano || '';
        option.dataset.serie = turma.serie || '';
        select.appendChild(option);
    });
}

function atualizarFiltrosTurma() {
    const select = document.getElementById('avaliacaoTurma');
    const opt = select.selectedOptions[0];
    const serieSelect = document.getElementById('filtroSerie');
    const ensinoSelect = document.getElementById('filtroEnsino');

    if (!opt || !opt.value) {
        serieSelect.innerHTML = '<option value="">Selecione a turma</option>';
        return;
    }

    const ano = parseInt(opt.dataset.ano, 10);
    serieSelect.innerHTML = `<option value="${opt.dataset.nome}">${opt.dataset.nome}</option>`;

    if (ano <= 5) ensinoSelect.value = 'Fundamental I';
    else if (ano <= 9) ensinoSelect.value = 'Fundamental II';
    else ensinoSelect.value = 'Ensino Médio';

    const turma = turmasAtuais.find(t => String(t._id) === opt.value);
    preencherSelectDisciplinasProfessor('avaliacaoDisciplina', null, turma);
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
        container.innerHTML = `<p class="alerta alerta-erro">${erro.message}</p>`;
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

        const celComp = incluirComp
            ? `<td><input type="text" class="input-nota-academica" data-tipo="comportamental" data-aluno-id="${aluno._id}" value="${formatarNota(comp)}"></td>`
            : '';

        return `
            <tr class="${idx % 2 === 0 ? 'linha-par' : 'linha-impar'}">
                <td class="col-aluno"><a href="#" class="link-aluno">${aluno.nome}</a></td>
                <td><input type="text" class="input-nota-academica" data-tipo="prova_bimestral" data-aluno-id="${aluno._id}" value="${formatarNota(prova)}" placeholder="0,00"></td>
                <td><input type="text" class="input-nota-academica" data-tipo="teste_bimestral" data-aluno-id="${aluno._id}" value="${formatarNota(teste)}" placeholder="0,00"></td>
                ${celComp}
                <td><input type="text" class="input-nota-academica input-media" readonly value="${media !== null ? formatarNota(media) : ''}"></td>
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
        <p class="notas-legenda">AV1 = Prova · AV2 = Teste${incluirComp ? ' · AV3 = Comportamental' : ''} · Unidade: ${unidade}</p>`;

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

function preencherSelectDisciplinaTurmaPortal() {
    const select = document.getElementById('selectDisciplinaTurma');
    if (!select) return;

    const minhas = obterDisciplinasUsuario().slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const turmasOrdenadas = [...turmasAtuais].sort((a, b) =>
        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    );

    select.innerHTML = '<option value="">Selecione turma e disciplina</option>';

    minhas.forEach(disc => {
        const turmasDisc = turmasOrdenadas.filter(t => disciplinaPermitidaParaTurma(disc, t));
        if (!turmasDisc.length) return;

        const grupo = document.createElement('optgroup');
        grupo.label = disc;

        turmasDisc.forEach(turma => {
            const option = document.createElement('option');
            option.value = `${turma._id}|${disc}`;
            option.textContent = turma.nome;
            option.dataset.turmaId = turma._id;
            option.dataset.disciplina = disc;
            grupo.appendChild(option);
        });

        select.appendChild(grupo);
    });
}

function renderizarDisciplinasProfessor() {
    const corpo = document.getElementById('corpoDisciplinasProfessor');
    if (!corpo) return;

    const minhas = obterDisciplinasUsuario().slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const turmasOrdenadas = [...turmasAtuais].sort((a, b) =>
        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    );

    if (!minhas.length) {
        corpo.innerHTML = '<p class="presenca-vazio">Nenhuma disciplina vinculada. Peça à secretaria para cadastrar suas disciplinas.</p>';
        return;
    }

    if (!turmasOrdenadas.length) {
        corpo.innerHTML = `
            <table class="portal-disciplinas-tabela">
                <thead>
                    <tr>
                        <th>Disciplina</th>
                        <th>Turma</th>
                        <th>Nível</th>
                        <th>Turno</th>
                    </tr>
                </thead>
                <tbody>
                    ${minhas.map(disc => `
                        <tr>
                            <td class="disciplina-nome">${disc}</td>
                            <td colspan="3" style="color:#7f8c8d;">Nenhuma turma cadastrada na escola</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        return;
    }

    const linhas = [];
    minhas.forEach(disc => {
        const turmasDisc = turmasOrdenadas.filter(t => disciplinaPermitidaParaTurma(disc, t));
        if (!turmasDisc.length) return;

        turmasDisc.forEach((turma, idx) => {
            linhas.push(`
                <tr>
                    ${idx === 0 ? `<td class="disciplina-nome" rowspan="${turmasDisc.length}">${disc}</td>` : ''}
                    <td>${turma.nome}</td>
                    <td>${turma.nivel || '—'}</td>
                    <td>${turma.turno || 'Manhã'}</td>
                </tr>
            `);
        });
    });

    if (!linhas.length) {
        corpo.innerHTML = '<p class="presenca-vazio">Nenhuma combinação disciplina/turma disponível para seu cadastro.</p>';
        return;
    }

    corpo.innerHTML = `
        <table class="portal-disciplinas-tabela">
            <thead>
                <tr>
                    <th>Disciplina</th>
                    <th>Turma</th>
                    <th>Nível</th>
                    <th>Turno</th>
                </tr>
            </thead>
            <tbody>${linhas.join('')}</tbody>
        </table>`;
}

async function carregarHorariosProfessor() {
    const corpo = document.getElementById('corpoHorarios');
    if (!corpo) return;

    const turno = document.getElementById('filtroTurnoHorario')?.value || 'Manhã';

    try {
        const resposta = await api.listarHorariosProfessor(turno);
        const slots = resposta.slots || [];
        const dias = resposta.diasSemana || ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const mapa = {};

        (resposta.horarios || []).forEach(h => {
            const chave = `${h.horaInicio}|${h.diaSemana}`;
            mapa[chave] = h;
        });

        if (!slots.length) {
            corpo.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:16px;">Nenhum horário cadastrado para este turno</td></tr>';
            return;
        }

        corpo.innerHTML = slots.map(hora => {
            const celulas = dias.map((_, dia) => {
                const item = mapa[`${hora}|${dia}`];
                if (!item) return '<td>—</td>';
                const turma = item.turma_id?.nome || 'Turma';
                const disc = item.disciplina || '';
                return `<td class="celula-horario-ocupada"><strong>${disc}</strong><br><small>${turma}</small></td>`;
            }).join('');
            return `<tr><td>${hora}</td>${celulas}</tr>`;
        }).join('');
    } catch (erro) {
        corpo.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#c0392b;padding:16px;">${erro.message}</td></tr>`;
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

function obterFiltroDisciplinaTurmaPortal() {
    const select = document.getElementById('selectDisciplinaTurma');
    const opt = select?.selectedOptions[0];
    if (!opt?.dataset.turmaId) return null;
    return {
        turmaId: opt.dataset.turmaId,
        disciplina: opt.dataset.disciplina || ''
    };
}

function atualizarCardAlunosAtencao() {
    const toggle = document.getElementById('toggleAlunosAtencao');
    const corpo = document.getElementById('corpoAlunosAtencao');
    const info = document.getElementById('atencaoFiltroInfo');
    if (!toggle || !corpo) return;

    const ativo = toggle.checked;
    corpo.style.display = ativo ? '' : 'none';

    if (!ativo) return;

    const filtro = obterFiltroDisciplinaTurmaPortal();
    let lista = [...alunosAtencaoCache];

    if (filtro) {
        lista = lista.filter(item =>
            String(item.turma_id?._id || item.turma_id) === String(filtro.turmaId) &&
            item.disciplina === filtro.disciplina
        );
        if (info) {
            info.textContent = `Filtrando: ${filtro.disciplina} — turma selecionada no portal.`;
        }
    } else if (info) {
        info.textContent = 'Selecione turma e disciplina acima para filtrar por turma específica.';
    }

    preencherTabelaAlunosAtencao(lista);
}

function labelSerieTurma(turma) {
    if (!turma) return '—';
    const serie = turma.serie ? ` Turma ${turma.serie}` : '';
    if (turma.nivel === 'Ensino Médio') return `${turma.ano}º EM${serie}`;
    return `${turma.ano}º Ano${serie}`;
}

function configurarPortalProfessor() {
    document.getElementById('filtroTurnoHorario')?.addEventListener('change', carregarHorariosProfessor);

    document.getElementById('selectDisciplinaTurma')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (!opt?.dataset.turmaId) {
            if (document.getElementById('toggleAlunosAtencao')?.checked) {
                atualizarCardAlunosAtencao();
            }
            return;
        }

        const turmaSelect = document.getElementById('turmaId');
        const avaliacaoSelect = document.getElementById('avaliacaoTurma');
        const disciplinaSelect = document.getElementById('disciplinaPresenca');
        const disciplinaNotas = document.getElementById('avaliacaoDisciplina');

        if (turmaSelect) turmaSelect.value = opt.dataset.turmaId;
        if (avaliacaoSelect) {
            avaliacaoSelect.value = opt.dataset.turmaId;
            atualizarFiltrosTurma();
        }
        if (disciplinaSelect && opt.dataset.disciplina) {
            disciplinaSelect.value = opt.dataset.disciplina;
        }
        if (disciplinaNotas && opt.dataset.disciplina) {
            disciplinaNotas.value = opt.dataset.disciplina;
        }

        if (document.getElementById('toggleAlunosAtencao')?.checked) {
            atualizarCardAlunosAtencao();
        }
    });

    document.querySelectorAll('.portal-acao').forEach(btn => {
        btn.addEventListener('click', () => {
            const secao = btn.dataset.acao;
            const portalSelect = document.getElementById('selectDisciplinaTurma');
            const opt = portalSelect?.selectedOptions[0];

            if (opt?.dataset.turmaId) {
                const turmaSelect = document.getElementById('turmaId');
                const avaliacaoSelect = document.getElementById('avaliacaoTurma');
                if (turmaSelect) turmaSelect.value = opt.dataset.turmaId;
                if (avaliacaoSelect) {
                    avaliacaoSelect.value = opt.dataset.turmaId;
                    atualizarFiltrosTurma();
                }
                if (opt.dataset.disciplina) {
                    const disciplinaSelect = document.getElementById('disciplinaPresenca');
                    const disciplinaNotas = document.getElementById('avaliacaoDisciplina');
                    if (disciplinaSelect) disciplinaSelect.value = opt.dataset.disciplina;
                    if (disciplinaNotas) disciplinaNotas.value = opt.dataset.disciplina;
                }
            }

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
        container.innerHTML = `<p style="color:#7f8c8d;">${msg}</p>`;
        return;
    }

    container.innerHTML = turmasAtuais.map(t => `
        <div class="card card-turma-professor">
            <h3>${t.nome}</h3>
            <p><strong>${(t.alunos || []).length}</strong> aluno(s) matriculado(s)</p>
            <p style="color:#7f8c8d;font-size:13px;">Turno ${t.turno || 'Manhã'}</p>
            <div class="card-acoes-turma" style="margin-top:12px;">
                <button type="button" class="btn btn-pequeno btn-sucesso btn-ir-presenca-turma" data-turma-id="${t._id}">📋 Presença</button>
                <button type="button" class="btn btn-pequeno btn-info btn-ir-alunos-turma" data-turma-id="${t._id}">👨‍🎓 Alunos</button>
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
            trGrupo.innerHTML = `<td colspan="6"><strong>${turma?.nome || 'Sem turma'}</strong> · ${labelSerieTurma(turma)} · ${turma?.turno || ''}</td>`;
            tabelaAtencao.appendChild(trGrupo);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${aluno.aluno_id?.nome || 'N/A'}</td>
            <td>${labelSerieTurma(turma)}<br><small>${turma?.nome || '—'}</small></td>
            <td>${aluno.disciplina}</td>
            <td><span class="status status-recuperacao">${aluno.situacao}</span></td>
            <td>${aluno.mediaGeral ?? '—'}</td>
            <td>
                <button class="btn btn-pequeno btn-sucesso btn-alerta-desempenho"
                    data-aluno-id="${aluno.aluno_id?._id}"
                    data-disciplina="${aluno.disciplina}"
                    data-media="${aluno.mediaGeral ?? ''}">
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
            <td>${aluno.nome}</td>
            <td>${aluno.cpf || '-'}</td>
            <td>${aluno.email || '-'}</td>
            <td>-</td>
            <td><span class="status status-aprovado">Ativo</span></td>
            <td>${aluno.turma}</td>
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
        listaAlunos.innerHTML = `<p class="presenca-vazio">${disciplina} não é ofertada para a turma ${turma?.nome || ''}.</p>`;
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
        return `
        <div class="presenca-tempo-coluna">
            <div class="botoes-presenca botoes-presenca-xs" data-aluno-id="${alunoId}" data-tempo="${tempo}">
                <button type="button" class="btn-presenca btn-p btn-presenca-xs ${status === 'presente' ? 'ativo' : ''}"
                    data-aluno-id="${alunoId}" data-tempo="${tempo}" data-status="presente" title="Presente">P</button>
                <button type="button" class="btn-presenca btn-f btn-presenca-xs ${status === 'falta' ? 'ativo' : ''}"
                    data-aluno-id="${alunoId}" data-tempo="${tempo}" data-status="falta" title="Falta">F</button>
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
                    <span class="nome-aluno">${aluno.nome}</span>
                    ${botoesTempo(id, 1)}
                </div>`;
        }

        const temposHtml = Array.from({ length: quantidadeTempos }, (_, i) => botoesTempo(id, i + 1)).join('');

        return `
            <div class="linha-presenca-aluno linha-presenca-multi">
                <span class="nome-aluno">${aluno.nome}</span>
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
            recursos: []
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
        const portalSelect = document.getElementById('selectDisciplinaTurma');
        const opt = portalSelect?.selectedOptions[0];
        if (opt?.dataset.turmaId && document.getElementById('turmaId')) {
            document.getElementById('turmaId').value = opt.dataset.turmaId;
        }
        if (opt?.dataset.disciplina && document.getElementById('disciplinaPresenca')) {
            document.getElementById('disciplinaPresenca').value = opt.dataset.disciplina;
        }
        carregarAlunosTurma();
    }

    if (secao === 'avaliacoes' && gradeNotasCache) {
        renderizarTabelaNotas(gradeNotasCache);
    }
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (erro) {
        console.error('Erro ao fazer logout:', erro);
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

// Expõe funções usadas no HTML (compatibilidade com onclick)
window.carregarSecao = carregarSecao;
window.fazerLogout = fazerLogout;
