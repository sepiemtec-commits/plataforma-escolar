/* Inicialização das páginas acadêmicas — scripts externos (CSP) */

function formatarDataBR(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
}

function formatarDataISO(d) {
    if (!d) return '—';
    return new Date(d).toISOString().split('T')[0];
}

function exibirErroRelatorio(mensagem) {
    const el = document.getElementById('conteudo');
    if (el) {
        el.innerHTML = `<p class="rel-erro" style="color:#c0392b;padding:20px;text-align:center;">❌ ${mensagem}</p>`;
    } else {
        alert(mensagem);
    }
}

function definirNomeUsuario() {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    const el = document.getElementById('nomeUsuario');
    if (el) el.textContent = 'Olá, ' + (u.nome || '');
}

async function initFichaIndividual() {
    await initRelatorioPage(async (alunoId) => {
        try {
            definirNomeUsuario();
            const res = await api.obterFichaIndividual(alunoId);
            const f = res.ficha;

            document.getElementById('conteudo').innerHTML = `
                <p class="rel-escola-nome">${f.escola?.nome || 'Escola'}</p>
                <div class="rel-ficha-dados">
                    <p><strong>SÉRIE:</strong> ${f.turma?.nome || '—'}</p>
                    <p><strong>TURMA:</strong> ${f.turma?.serie || 'A'}</p>
                    <p><strong>TURNO:</strong> ${f.aluno.turno || 'Manhã'}</p>
                    <p><strong>ANO:</strong> ${f.anoLetivo}</p>
                    <p><strong>ALUNO(A):</strong> ${f.aluno.nome}</p>
                    <p><strong>RESPONSÁVEL:</strong> ${f.aluno.nome_responsavel || f.aluno.filiacao_mae || f.aluno.filiacao_pai || '—'}</p>
                    <p><strong>DATA DE NASCIMENTO:</strong> ${formatarDataBR(f.aluno.dataNascimento)}</p>
                    <p><strong>ENDEREÇO:</strong> ${f.aluno.endereco || '—'}</p>
                    <p><strong>CIDADE:</strong> ${f.aluno.cidade || '—'} · <strong>UF:</strong> ${f.aluno.uf || '—'}</p>
                </div>
                <table class="rel-tabela">
                    <thead>
                        <tr>
                            <th>Componentes Curriculares</th>
                            <th>CH</th>
                            <th>Resultados Finais</th>
                            <th>Faltas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${f.componentes.map(c => `
                            <tr>
                                <td>${c.disciplina}</td>
                                <td>${c.cargaHoraria} Hrs</td>
                                <td>${formatarNotaBR(c.resultadoFinal)}</td>
                                <td>${c.faltas}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });
}

async function initFichaMatricula() {
    await initRelatorioPage(async (alunoId) => {
        try {
            definirNomeUsuario();
            const res = await api.obterFichaMatricula(alunoId);
            const f = res.ficha;

            document.getElementById('conteudo').innerHTML = `
                <p class="rel-escola-nome">${f.escola}</p>
                <h2 style="color:var(--rel-azul);margin:20px 0 10px;">Dados Acadêmicos</h2>
                <div class="rel-ficha-dados">
                    <p><strong>Matrícula:</strong> ${f.matricula}</p>
                    <p><strong>Ano Letivo:</strong> ${f.dadosAcademicos.anoLetivo}</p>
                    <p><strong>Turno:</strong> ${f.dadosAcademicos.turno}</p>
                    <p><strong>Série:</strong> ${f.dadosAcademicos.serie}</p>
                    <p><strong>Turma:</strong> ${f.dadosAcademicos.turma}</p>
                    <p><strong>Tipo de Ensino:</strong> ${f.dadosAcademicos.tipoEnsino}</p>
                </div>
                <h2 style="color:var(--rel-azul);margin:20px 0 10px;">Dados do Aluno</h2>
                <div class="rel-ficha-dados">
                    <p><strong>Nome:</strong> ${f.dadosAluno.nome}</p>
                    <p><strong>Sexo:</strong> ${f.dadosAluno.sexo}</p>
                    <p><strong>Data de Nasc.:</strong> ${formatarDataISO(f.dadosAluno.dataNascimento)}</p>
                    <p><strong>Nacionalidade:</strong> ${f.dadosAluno.nacionalidade}</p>
                    <p><strong>Natural de:</strong> ${f.dadosAluno.naturalidade}</p>
                    <p><strong>Religião:</strong> ${f.dadosAluno.religiao}</p>
                    <p><strong>Endereço:</strong> ${f.dadosAluno.endereco}</p>
                    <p><strong>Bairro:</strong> ${f.dadosAluno.bairro}</p>
                    <p><strong>Telefone:</strong> ${f.dadosAluno.telefone}</p>
                    <p><strong>Cidade:</strong> ${f.dadosAluno.cidade} · <strong>UF:</strong> ${f.dadosAluno.uf}</p>
                    <p><strong>CEP:</strong> ${f.dadosAluno.cep}</p>
                </div>`;
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });
}

async function initBoletimAcademico() {
    await initRelatorioPage(async (alunoId) => {
        try {
            definirNomeUsuario();
            const u = JSON.parse(localStorage.getItem('usuario') || '{}');
            const disciplinasProf = Array.isArray(u.disciplinas) && u.disciplinas.length
                ? u.disciplinas
                : (u.disciplina ? [u.disciplina] : []);
            const selectDisc = document.getElementById('filtroDisciplinaBoletim');
            const disciplina = selectDisc?.value || disciplinasProf[0] || undefined;

            const res = await api.obterBoletimAcademico(alunoId, disciplina);
            const container = document.getElementById('conteudo');
            if (u.tipo === 'professor' && (!res.boletim?.disciplinas?.length)) {
                container.innerHTML = '<p class="rel-aviso" style="text-align:center;padding:24px;">Nenhuma nota lançada nas suas disciplinas para este aluno.</p>';
                return;
            }
            renderBoletimTabela(res.boletim, container);
            if (u.tipo === 'professor') {
                const aviso = document.createElement('p');
                aviso.style.cssText = 'text-align:center;color:#666;font-size:13px;margin-top:12px;';
                aviso.textContent = disciplinasProf.length > 1
                    ? `Exibindo apenas suas disciplinas: ${disciplinasProf.join(', ')}`
                    : `Exibindo apenas a disciplina ${disciplinasProf[0] || '—'}`;
                container.appendChild(aviso);
            }
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });

    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    const disciplinasProf = Array.isArray(u.disciplinas) && u.disciplinas.length
        ? u.disciplinas
        : (u.disciplina ? [u.disciplina] : []);
    const grupoDisc = document.getElementById('grupoDisciplinaBoletim');
    const selectDisc = document.getElementById('filtroDisciplinaBoletim');
    if (u.tipo === 'professor' && grupoDisc && selectDisc && disciplinasProf.length > 1) {
        grupoDisc.style.display = 'block';
        selectDisc.innerHTML = disciplinasProf.map(d => `<option value="${d}">${d}</option>`).join('');
        selectDisc.addEventListener('change', () => {
            document.getElementById('btnCarregar')?.click();
        });
    }
}

let alunoHistoricoAtual = null;
let gestaoBoletinsCache = [];

function obterFiltrosGestao() {
    return {
        nivel: document.getElementById('filtroEnsino')?.value || '',
        ano: document.getElementById('filtroAno')?.value || '',
        turmaId: document.getElementById('filtroTurma')?.value || ''
    };
}

function filtrarAlunosGestao(alunos) {
    const { nivel, ano, turmaId } = obterFiltrosGestao();
    return alunos.filter(a => {
        if (nivel && a.nivel !== nivel) return false;
        if (ano && String(a.ano) !== ano) return false;
        if (turmaId && String(a.turmaId) !== turmaId) return false;
        return true;
    });
}

async function carregarGestaoBoletins() {
    const conteudo = document.getElementById('conteudo');
    if (conteudo) conteudo.innerHTML = '<p class="rel-carregando">Carregando boletins...</p>';

    const res = await api.listarGestaoBoletins();
    gestaoBoletinsCache = res.alunos || [];
    renderTabelaGestaoBoletins();
}

function renderTabelaGestaoBoletins() {
    const filtrados = filtrarAlunosGestao(gestaoBoletinsCache);
    const linhas = filtrados.map(a => `
        <tr>
            <td><a class="link-aluno" href="boletim-academico.html?alunoId=${a._id}">${a.nome}</a></td>
            <td>${a.nivel || '—'}</td>
            <td>${a.ano ? a.ano + 'º' : '—'}</td>
            <td>${a.turma}</td>
            <td>${a.disciplinas}</td>
            <td>${formatarNotaBR(a.mediaGeral)}</td>
            <td>${a.situacao}</td>
            <td>
                <a href="ficha-individual.html?alunoId=${a._id}" title="Ficha">📋</a>
                <a href="boletim-academico.html?alunoId=${a._id}" title="Boletim">📊</a>
            </td>
        </tr>
    `).join('');

    document.getElementById('conteudo').innerHTML = `
        <p style="margin-bottom:12px;color:#666;">Exibindo ${filtrados.length} de ${gestaoBoletinsCache.length} alunos</p>
        <table class="rel-tabela">
            <thead>
                <tr>
                    <th>Aluno</th>
                    <th>Nível</th>
                    <th>Ano</th>
                    <th>Turma</th>
                    <th>Disciplinas</th>
                    <th>Média Geral</th>
                    <th>Situação</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${linhas || '<tr><td colspan="8">Nenhum aluno encontrado com os filtros selecionados</td></tr>'}</tbody>
        </table>`;
}

async function carregarHistorico(alunoId) {
    alunoHistoricoAtual = alunoId;
    const res = await api.listarHistoricoAluno(alunoId);
    document.getElementById('tituloHistorico').textContent =
        'Histórico Escolar de ' + (res.aluno?.nome || 'Aluno');

    const linhas = res.historicos.length ? res.historicos.map(h => `
        <tr>
            <td>${h.anoLetivo}</td>
            <td>${h.serie}</td>
            <td>${h.resultado}</td>
            <td>${h.instituicao}</td>
            <td>
                <a href="notas-historico.html?historicoId=${h._id}" title="Notas">✏️</a>
                <button type="button" class="btn-excluir-historico no-print"
                    data-id="${h._id}" title="Excluir"
                    style="border:none;background:none;cursor:pointer;">🗑️</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center">Nenhum registro. Clique em "+ Novo Ano".</td></tr>';

    document.getElementById('conteudo').innerHTML = `
        <table class="rel-tabela">
            <thead>
                <tr>
                    <th>Ano Letivo</th>
                    <th>Ano / Série</th>
                    <th>Resultado</th>
                    <th>Instituição</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>`;

    document.querySelectorAll('.btn-excluir-historico').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remover este ano do histórico?')) return;
            await api.removerHistorico(btn.dataset.id);
            await carregarHistorico(alunoHistoricoAtual);
        });
    });
}

async function initHistoricoEscolar() {
    document.getElementById('btnNovoAno')?.addEventListener('click', async () => {
        const select = document.getElementById('selectAluno');
        const alunoId = select?.value || alunoHistoricoAtual;
        if (!alunoId) return alert('Selecione um aluno');

        const ano = prompt('Ano letivo:', new Date().getFullYear());
        const serie = prompt('Série (ex: 5º Ano):', '5º Ano');
        if (!ano || !serie) return;

        try {
            await api.criarHistorico({
                aluno_id: alunoId,
                anoLetivo: parseInt(ano, 10),
                serie,
                turma: 'A',
                resultado: 'Progressão Plena'
            });
            await carregarHistorico(alunoId);
        } catch (erro) {
            alert('Erro: ' + erro.message);
        }
    });

    await initRelatorioPage(async (alunoId) => {
        try {
            definirNomeUsuario();
            await carregarHistorico(alunoId);
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });
}

async function initGestaoBoletins() {
    document.getElementById('btnAtualizar')?.addEventListener('click', async () => {
        try {
            await carregarGestaoBoletins();
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });

    try {
        await api.verificarToken();
        definirNomeUsuario();
        await carregarTurmasFiltro();
        configurarFiltrosGestao(() => renderTabelaGestaoBoletins());
        await carregarGestaoBoletins();
    } catch (erro) {
        exibirErroRelatorio(erro.message || 'Erro ao carregar gestão de boletins');
    }
}

async function initNotasHistorico() {
    const params = new URLSearchParams(window.location.search);
    const historicoId = params.get('historicoId');
    let notasAtuais = [];
    const btnSalvar = document.getElementById('btnSalvar');
    const conteudo = document.getElementById('conteudo');

    async function salvarNotasHistorico() {
        if (!historicoId) {
            alert('Abra as notas pelo link ✏️ na página Histórico Escolar.');
            return;
        }
        document.querySelectorAll('[data-idx]').forEach(input => {
            const idx = parseInt(input.dataset.idx, 10);
            const campo = input.dataset.campo;
            if (campo === 'nota') {
                notasAtuais[idx].nota = parseNotaBR(input.value);
            } else {
                notasAtuais[idx][campo] = parseInt(input.value, 10) || 0;
            }
        });
        await api.salvarNotasHistorico(historicoId, notasAtuais);
        alert('Notas salvas com sucesso!');
    }

    async function carregarNotas() {
        if (!historicoId) {
            if (btnSalvar) btnSalvar.style.display = 'none';
            if (conteudo) {
                conteudo.innerHTML = `
                    <p class="rel-aviso">
                        Para editar notas do histórico, acesse
                        <a href="historico-escolar.html">Histórico Escolar</a>,
                        selecione o aluno e clique no ícone ✏️ do ano desejado.
                    </p>`;
            }
            return;
        }

        if (btnSalvar) btnSalvar.style.display = '';
        if (conteudo) conteudo.innerHTML = '<p class="rel-carregando">Carregando notas...</p>';

        const res = await api.obterHistorico(historicoId);
        const h = res.historico;
        notasAtuais = h.notas || [];

        document.querySelector('.rel-titulo').textContent =
            `Notas — ${h.aluno_id?.nome || 'Aluno'} (${h.anoLetivo} / ${h.serie})`;

        const linhas = notasAtuais.map((n, i) => `
            <tr>
                <td>${n.disciplina}</td>
                <td><input class="rel-input-nota" type="number" data-idx="${i}" data-campo="cargaHoraria" value="${n.cargaHoraria ?? ''}"></td>
                <td><input class="rel-input-nota" type="text" data-idx="${i}" data-campo="nota" value="${n.nota != null ? String(n.nota).replace('.', ',') : ''}"></td>
                <td><input class="rel-input-nota" type="number" data-idx="${i}" data-campo="faltas" value="${n.faltas ?? 0}"></td>
            </tr>
        `).join('');

        conteudo.innerHTML = `
            <table class="rel-tabela">
                <thead>
                    <tr>
                        <th>Disciplina</th>
                        <th>CH</th>
                        <th>Nota</th>
                        <th>Falta</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>`;
    }

    btnSalvar?.addEventListener('click', async () => {
        try {
            await salvarNotasHistorico();
        } catch (erro) {
            alert('Erro: ' + erro.message);
        }
    });

    try {
        await api.verificarToken();
        definirNomeUsuario();
        await carregarNotas();
    } catch (erro) {
        exibirErroRelatorio(erro.message || 'Erro ao carregar notas do histórico');
    }
}

async function initPromocaoEscolar() {
    try {
        await api.verificarToken();
        definirNomeUsuario();

        const turmasRes = await api.listarTurmasFiltroRelatorio();
        const select = document.getElementById('filtroTurmaPromocao');
        (turmasRes.turmas || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t._id;
            opt.textContent = `${t.nome} · ${t.turno || 'Manhã'}`;
            select.appendChild(opt);
        });

        document.getElementById('btnPreviewPromocao')?.addEventListener('click', async () => {
            try {
                const turmaId = select.value || null;
                const res = await api.previewPromocao(turmaId);
                renderPreviewPromocao(res.preview);
            } catch (erro) {
                exibirErroRelatorio(erro.message);
            }
        });

        document.getElementById('btnExecutarPromocao')?.addEventListener('click', async () => {
            if (!confirm('Executar promoção automática? Alunos aprovados serão transferidos e receberão declaração de curso.')) return;
            try {
                const turmaId = select.value || null;
                const res = await api.executarPromocao(turmaId);
                renderPreviewPromocao(res.resultado, true);
                mostrarSucessoPromocao(res.mensagem);
            } catch (erro) {
                exibirErroRelatorio(erro.message);
            }
        });
    } catch {
        window.location.href = 'index.html';
    }
}

function renderPreviewPromocao(dados, executado) {
    const resumo = document.getElementById('resumoPromocao');
    if (resumo) {
        resumo.innerHTML = `
            <p><strong>Ano letivo ${dados.anoLetivo}</strong> · Total: ${dados.total}
            · Promover: ${dados.promover ?? dados.promovidos ?? 0}
            · Retidos: ${dados.retidos ?? 0}
            · Concluintes: ${dados.concluintes ?? 0}
            ${executado ? ' · <span style="color:#27ae60">Executado</span>' : ' · Simulação'}</p>`;
    }

    const linhas = (dados.alunos || []).map(a => `
        <tr>
            <td>${a.alunoNome}</td>
            <td>${a.turmaOrigem}</td>
            <td>${formatarNotaBR(a.mediaGeral)}</td>
            <td>${a.aprovado ? 'Aprovado' : 'Retido'}</td>
            <td>${a.acao === 'promover' ? (a.turmaDestino || a.seriePromovida || '—') : a.acao === 'concluinte' ? 'Concluiu EM' : 'Permanece'}</td>
            <td>${a.motivo || '—'}</td>
            <td>${a.declaracaoId ? `<a href="declaracao-curso.html?declaracaoId=${a.declaracaoId}">📄 Ver</a>` : '—'}</td>
        </tr>
    `).join('');

    document.getElementById('conteudo').innerHTML = `
        <table class="rel-tabela">
            <thead>
                <tr>
                    <th>Aluno</th>
                    <th>Turma atual</th>
                    <th>Média</th>
                    <th>Situação</th>
                    <th>Destino</th>
                    <th>Observação</th>
                    <th>Declaração</th>
                </tr>
            </thead>
            <tbody>${linhas || '<tr><td colspan="7">Nenhum aluno</td></tr>'}</tbody>
        </table>`;
}

function mostrarSucessoPromocao(msg) {
    const el = document.getElementById('resumoPromocao');
    if (el) el.innerHTML += `<p style="color:#27ae60;margin-top:8px;">${msg}</p>`;
}

const ROLES_VERIFICAR_DECLARACAO = new Set(['secretaria', 'admin', 'diretor', 'coordenador']);

function usuarioPodeVerificarDeclaracao() {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    return ROLES_VERIFICAR_DECLARACAO.has(u.tipo);
}

function renderResultadoVerificacao(res, container) {
    if (!container) return;
    container.innerHTML = `
        <div class="rel-aviso rel-verificacao-ok">
            <p><strong>Documento autêntico</strong></p>
            <p>Aluno: ${res.aluno}</p>
            <p>Ano letivo: ${res.anoLetivo} · Resultado: ${res.resultado}</p>
            <p>Instituição: ${res.instituicao}</p>
            <p>Emitido em: ${new Date(res.dataEmissao).toLocaleString('pt-BR')}</p>
            <p class="rel-hash">Hash: ${res.hashDocumento}</p>
        </div>`;
}

function configurarVerificacaoDeclaracao() {
    const btn = document.getElementById('btnVerificarCodigo');
    const input = document.getElementById('codigoVerificacao');
    if (!btn || !input) return;

    const executar = async () => {
        const codigo = input.value.trim();
        if (!codigo) return alert('Informe o código da declaração');
        const destino = document.getElementById('resultadoVerificacao') || document.getElementById('conteudo');
        try {
            const res = await api.verificarDeclaracao(codigo);
            renderResultadoVerificacao(res, destino);
        } catch (erro) {
            if (destino) {
                destino.innerHTML = `<p class="rel-erro" style="color:#c0392b;padding:12px 0;">❌ ${erro.message}</p>`;
            } else {
                exibirErroRelatorio(erro.message);
            }
        }
    };

    btn.addEventListener('click', executar);
    input.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            executar();
        }
    });
}

async function initDeclaracaoCurso() {
    const params = new URLSearchParams(window.location.search);
    const declaracaoIdUrl = params.get('declaracaoId');
    const modoVerificar = params.get('modo') === 'verificar';

    try {
        await api.verificarToken();
        definirNomeUsuario();
    } catch {
        window.location.href = 'index.html';
        return;
    }

    if (!usuarioPodeVerificarDeclaracao()) {
        document.getElementById('blocoVerificacao')?.remove();
        if (modoVerificar) {
            exibirErroRelatorio('Acesso negado. Apenas secretaria, administrador e coordenador podem verificar declarações.');
            return;
        }
    } else {
        configurarVerificacaoDeclaracao();
    }

    if (modoVerificar) {
        document.getElementById('blocoFiltrosDeclaracao')?.remove();
        const titulo = document.getElementById('tituloDeclaracao');
        if (titulo) titulo.textContent = 'Verificar autenticidade — Declaração de Curso';
        return;
    }

    if (declaracaoIdUrl) {
        try {
            document.getElementById('blocoFiltrosDeclaracao')?.remove();
            const res = await api.obterDeclaracao(declaracaoIdUrl);
            document.getElementById('conteudo').innerHTML = res.html;
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
        return;
    }

    await initRelatorioPage(async (alunoId) => {
        try {
            const res = await api.listarDeclaracoesAluno(alunoId);
            const decls = res.declaracoes || [];

            if (!decls.length) {
                document.getElementById('conteudo').innerHTML =
                    '<p class="rel-aviso">Nenhuma declaração emitida. Execute a promoção escolar ou aguarde o fim do ano letivo.</p>';
                return;
            }

            if (decls.length === 1) {
                const d = await api.obterDeclaracao(decls[0]._id);
                document.getElementById('conteudo').innerHTML = d.html;
                return;
            }

            document.getElementById('conteudo').innerHTML = `
                <p style="margin-bottom:12px;">Selecione uma declaração:</p>
                <ul class="rel-lista-declaracoes">
                    ${decls.map(d => `
                        <li>
                            <a href="declaracao-curso.html?declaracaoId=${d._id}">
                                ${d.anoLetivo} — ${d.serieCursada} — ${d.resultado}
                                (cód. ${d.codigoVerificacao})
                            </a>
                        </li>
                    `).join('')}
                </ul>`;
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    });
}

async function initAcademicoHub() {
    try {
        await api.verificarToken();
        definirNomeUsuario();
        const u = JSON.parse(localStorage.getItem('usuario') || '{}');
        const paineis = {
            diretor: 'painel-diretor.html',
            coordenador: 'painel-coordenador.html',
            secretaria: 'painel-secretaria.html',
            professor: 'painel-professor.html',
            aluno: 'painel-aluno.html'
        };
        const link = document.getElementById('linkVoltar');
        if (link) link.href = paineis[u.tipo] || 'index.html';

        if (u.tipo === 'professor') {
            const permitidos = new Set(['boletim-academico.html', 'ficha-individual.html']);
            document.querySelectorAll('.rel-hub-card').forEach(card => {
                const href = card.getAttribute('href') || '';
                if (!permitidos.has(href)) card.style.display = 'none';
            });
            const subtitulo = document.querySelector('.rel-container > p');
            if (subtitulo) {
                subtitulo.textContent = 'Consulte boletim e ficha apenas das disciplinas vinculadas ao seu cadastro.';
            }
        }

        if (usuarioPodeVerificarDeclaracao()) {
            const cardVerificar = document.getElementById('cardVerificarDeclaracao');
            if (cardVerificar) cardVerificar.style.display = '';
        }
    } catch {
        window.location.href = 'index.html';
    }
}

aoPronto(() => {
    const pagina = document.body.dataset.pagina;
    if (!pagina) return;

    const inits = {
        'ficha-individual': initFichaIndividual,
        'ficha-matricula': initFichaMatricula,
        'boletim-academico': initBoletimAcademico,
        'historico-escolar': initHistoricoEscolar,
        'gestao-boletins': initGestaoBoletins,
        'notas-historico': initNotasHistorico,
        'promocao-escolar': initPromocaoEscolar,
        'declaracao-curso': initDeclaracaoCurso,
        'academico-hub': initAcademicoHub
    };

    const init = inits[pagina];
    if (init) init();
});
