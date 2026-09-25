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
        el.innerHTML = `<p class="rel-erro" style="color:#c0392b;padding:20px;text-align:center;">❌ ${escaparHtml(mensagem)}</p>`;
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
                <p class="rel-escola-nome">${escaparHtml(f.escola?.nome || 'Escola')}</p>
                <div class="rel-ficha-dados">
                    <p><strong>SÉRIE:</strong> ${escaparHtml(f.turma?.nome || '—')}</p>
                    <p><strong>TURMA:</strong> ${escaparHtml(f.turma?.serie || 'A')}</p>
                    <p><strong>TURNO:</strong> ${escaparHtml(f.aluno.turno || 'Manhã')}</p>
                    <p><strong>ANO:</strong> ${escaparHtml(f.anoLetivo)}</p>
                    <p><strong>ALUNO(A):</strong> ${escaparHtml(f.aluno.nome)}</p>
                    <p><strong>RESPONSÁVEL:</strong> ${escaparHtml(f.aluno.nome_responsavel || f.aluno.filiacao_mae || f.aluno.filiacao_pai || '—')}</p>
                    <p><strong>DATA DE NASCIMENTO:</strong> ${escaparHtml(formatarDataBR(f.aluno.dataNascimento))}</p>
                    <p><strong>ENDEREÇO:</strong> ${escaparHtml(f.aluno.endereco || '—')}</p>
                    <p><strong>CIDADE:</strong> ${escaparHtml(f.aluno.cidade || '—')} · <strong>UF:</strong> ${escaparHtml(f.aluno.uf || '—')}</p>
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
                                <td>${escaparHtml(c.disciplina)}</td>
                                <td>${escaparHtml(c.cargaHoraria)} Hrs</td>
                                <td>${escaparHtml(formatarNotaBR(c.resultadoFinal))}</td>
                                <td>${escaparHtml(c.faltas)}</td>
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
                <p class="rel-escola-nome">${escaparHtml(f.escola)}</p>
                <h2 style="color:var(--rel-azul);margin:20px 0 10px;">Dados Acadêmicos</h2>
                <div class="rel-ficha-dados">
                    <p><strong>Matrícula:</strong> ${escaparHtml(f.matricula)}</p>
                    <p><strong>Ano Letivo:</strong> ${escaparHtml(f.dadosAcademicos.anoLetivo)}</p>
                    <p><strong>Turno:</strong> ${escaparHtml(f.dadosAcademicos.turno)}</p>
                    <p><strong>Série:</strong> ${escaparHtml(f.dadosAcademicos.serie)}</p>
                    <p><strong>Turma:</strong> ${escaparHtml(f.dadosAcademicos.turma)}</p>
                    <p><strong>Tipo de Ensino:</strong> ${escaparHtml(f.dadosAcademicos.tipoEnsino)}</p>
                </div>
                <h2 style="color:var(--rel-azul);margin:20px 0 10px;">Dados do Aluno</h2>
                <div class="rel-ficha-dados">
                    <p><strong>Nome:</strong> ${escaparHtml(f.dadosAluno.nome)}</p>
                    <p><strong>Sexo:</strong> ${escaparHtml(f.dadosAluno.sexo)}</p>
                    <p><strong>Data de Nasc.:</strong> ${escaparHtml(formatarDataISO(f.dadosAluno.dataNascimento))}</p>
                    <p><strong>Nacionalidade:</strong> ${escaparHtml(f.dadosAluno.nacionalidade)}</p>
                    <p><strong>Natural de:</strong> ${escaparHtml(f.dadosAluno.naturalidade)}</p>
                    <p><strong>Religião:</strong> ${escaparHtml(f.dadosAluno.religiao)}</p>
                    <p><strong>Endereço:</strong> ${escaparHtml(f.dadosAluno.endereco)}</p>
                    <p><strong>Bairro:</strong> ${escaparHtml(f.dadosAluno.bairro)}</p>
                    <p><strong>Telefone:</strong> ${escaparHtml(f.dadosAluno.telefone)}</p>
                    <p><strong>Cidade:</strong> ${escaparHtml(f.dadosAluno.cidade)} · <strong>UF:</strong> ${escaparHtml(f.dadosAluno.uf)}</p>
                    <p><strong>CEP:</strong> ${escaparHtml(f.dadosAluno.cep)}</p>
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
        selectDisc.innerHTML = disciplinasProf.map(d => `<option value="${escaparHtml(d)}">${escaparHtml(d)}</option>`).join('');
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
            <td><a class="link-aluno" href="boletim-academico.html?alunoId=${escaparHtml(a._id)}">${escaparHtml(a.nome)}</a></td>
            <td>${escaparHtml(a.nivel || '—')}</td>
            <td>${a.ano ? escaparHtml(a.ano + 'º') : '—'}</td>
            <td>${escaparHtml(a.turma)}</td>
            <td>${escaparHtml(a.disciplinas)}</td>
            <td>${escaparHtml(formatarNotaBR(a.mediaGeral))}</td>
            <td>${escaparHtml(a.situacao)}</td>
            <td>
                <a href="ficha-individual.html?alunoId=${escaparHtml(a._id)}" title="Ficha">📋</a>
                <a href="boletim-academico.html?alunoId=${escaparHtml(a._id)}" title="Boletim">📊</a>
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

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const soConsulta = usuario.tipo === 'aluno' || usuario.tipo === 'responsavel';

    const linhas = res.historicos.length ? res.historicos.map(h => `
        <tr>
            <td>${escaparHtml(h.anoLetivo)}</td>
            <td>${escaparHtml(h.serie)}</td>
            <td>${escaparHtml(h.resultado)}</td>
            <td>${escaparHtml(h.instituicao)}</td>
            ${soConsulta ? '' : `
            <td>
                <a href="notas-historico.html?historicoId=${escaparHtml(h._id)}" title="Notas">✏️</a>
                <button type="button" class="btn-excluir-historico no-print"
                    data-id="${escaparHtml(h._id)}" title="Excluir"
                    style="border:none;background:none;cursor:pointer;">🗑️</button>
            </td>`}
        </tr>
    `).join('') : `<tr><td colspan="${soConsulta ? 4 : 5}" style="text-align:center">${
        soConsulta
            ? 'Nenhum registro de histórico encontrado.'
            : 'Nenhum registro. Clique em "+ Novo Ano".'
    }</td></tr>`;

    document.getElementById('conteudo').innerHTML = `
        <table class="rel-tabela">
            <thead>
                <tr>
                    <th>Ano Letivo</th>
                    <th>Ano / Série</th>
                    <th>Resultado</th>
                    <th>Instituição</th>
                    ${soConsulta ? '' : '<th>Ações</th>'}
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>`;

    if (soConsulta) return;

    document.querySelectorAll('.btn-excluir-historico').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remover este ano do histórico?')) return;
            await api.removerHistorico(btn.dataset.id);
            await carregarHistorico(alunoHistoricoAtual);
        });
    });
}

async function initHistoricoEscolar() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const soConsulta = usuario.tipo === 'aluno' || usuario.tipo === 'responsavel';
    if (soConsulta) {
        document.getElementById('btnNovoAno')?.remove();
    }

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
                <td>${escaparHtml(n.disciplina)}</td>
                <td><input class="rel-input-nota" type="number" data-idx="${i}" data-campo="cargaHoraria" value="${escaparHtml(n.cargaHoraria ?? '')}"></td>
                <td><input class="rel-input-nota" type="text" data-idx="${i}" data-campo="nota" value="${escaparHtml(n.nota != null ? String(n.nota).replace('.', ',') : '')}"></td>
                <td><input class="rel-input-nota" type="number" data-idx="${i}" data-campo="faltas" value="${escaparHtml(n.faltas ?? 0)}"></td>
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
            <p><strong>Ano letivo ${escaparHtml(dados.anoLetivo)}</strong> · Total: ${escaparHtml(dados.total)}
            · Promover: ${escaparHtml(dados.promover ?? dados.promovidos ?? 0)}
            · Retidos: ${escaparHtml(dados.retidos ?? 0)}
            · Concluintes: ${escaparHtml(dados.concluintes ?? 0)}
            ${executado ? ' · <span style="color:#27ae60">Executado</span>' : ' · Simulação'}</p>`;
    }

    const linhas = (dados.alunos || []).map(a => `
        <tr>
            <td>${escaparHtml(a.alunoNome)}</td>
            <td>${escaparHtml(a.turmaOrigem)}</td>
            <td>${escaparHtml(formatarNotaBR(a.mediaGeral))}</td>
            <td>${a.aprovado ? 'Aprovado' : 'Retido'}</td>
            <td>${escaparHtml(a.acao === 'promover' ? (a.turmaDestino || a.seriePromovida || '—') : a.acao === 'concluinte' ? 'Concluiu EM' : 'Permanece')}</td>
            <td>${escaparHtml(a.motivo || '—')}</td>
            <td>${a.declaracaoId ? `<a href="declaracao-curso.html?declaracaoId=${escaparHtml(a.declaracaoId)}">📄 Ver</a>` : '—'}</td>
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
    if (el) el.innerHTML += `<p style="color:#27ae60;margin-top:8px;">${escaparHtml(msg)}</p>`;
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
            <p>Aluno: ${escaparHtml(res.aluno)}</p>
            <p>Ano letivo: ${escaparHtml(res.anoLetivo)} · Resultado: ${escaparHtml(res.resultado)}</p>
            <p>Instituição: ${escaparHtml(res.instituicao)}</p>
            <p>Emitido em: ${escaparHtml(new Date(res.dataEmissao).toLocaleString('pt-BR'))}</p>
            <p class="rel-hash">Hash: ${escaparHtml(res.hashDocumento)}</p>
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
                destino.innerHTML = `<p class="rel-erro" style="color:#c0392b;padding:12px 0;">❌ ${escaparHtml(erro.message)}</p>`;
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
        configurarBotaoVoltar('linkVoltar');
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
        if (titulo) titulo.textContent = '🔐 Verificar Declaração';
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
                            <a href="declaracao-curso.html?declaracaoId=${escaparHtml(d._id)}">
                                ${escaparHtml(d.anoLetivo)} — ${escaparHtml(d.serieCursada)} — ${escaparHtml(d.resultado)}
                                (cód. ${escaparHtml(d.codigoVerificacao)})
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
        const link = document.getElementById('linkVoltar');
        if (link) link.classList.add('rel-btn-voltar');
        configurarBotaoVoltar('linkVoltar');

        if (u.tipo === 'professor') {
            const permitidos = new Set([
                'boletim-academico.html',
                'ficha-individual.html',
                'diario-aula.html'
            ]);
            document.querySelectorAll('.rel-hub-card').forEach(card => {
                const href = card.getAttribute('href') || '';
                if (!permitidos.has(href)) card.style.display = 'none';
            });
            const subtitulo = document.querySelector('.rel-container > p');
            if (subtitulo) {
                subtitulo.textContent = 'Consulte boletim, ficha e diário de aula das disciplinas vinculadas ao seu cadastro.';
            }
        }

        if (u.tipo === 'aluno' || u.tipo === 'responsavel') {
            const permitidos = new Set([
                'boletim-academico.html',
                'ficha-individual.html',
                'historico-escolar.html',
                'ficha-matricula.html'
            ]);
            document.querySelectorAll('.rel-hub-card').forEach(card => {
                const href = (card.getAttribute('href') || '').split('?')[0];
                if (!permitidos.has(href)) card.style.display = 'none';
            });
            const subtitulo = document.querySelector('.rel-container > p');
            if (subtitulo) {
                subtitulo.textContent = u.tipo === 'responsavel'
                    ? 'Consulte boletim, ficha e histórico dos alunos vinculados a você.'
                    : 'Consulte seu boletim, ficha individual e histórico escolar.';
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

function rotuloStatusDiario(status) {
    const map = {
        presente: 'P',
        falta: 'F',
        justificada: 'J',
        atraso: 'A'
    };
    return map[status] || status || '—';
}

function formatarPctDiario(valor) {
    if (valor == null) return '—';
    return `${Number(valor).toFixed(1).replace('.', ',')}%`;
}

function renderDiarioAula(diario) {
    const container = document.getElementById('conteudo');
    if (!container || !diario) return;

    const periodoLabel = diario.modo === 'dia'
        ? (() => {
            const rotulo = String(diario.periodo?.rotulo || '');
            const m = rotulo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[3]}/${m[2]}/${m[1]}` : formatarDataBR(rotulo);
        })()
        : diario.periodo?.rotulo;

    const resumo = diario.resumoFrequencia || {};
    const alunos = diario.alunos || [];
    const conteudos = diario.conteudos || [];
    const datasAula = diario.datasAula || [];

    const tabelaFrequencia = alunos.length
        ? `
            <table class="rel-tabela diario-tabela-freq">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Aluno</th>
                        <th>Matrícula</th>
                        <th>Presenças</th>
                        <th>Faltas</th>
                        <th>Just.</th>
                        <th>Atrasos</th>
                        <th>% Presença</th>
                        <th>% Falta</th>
                    </tr>
                </thead>
                <tbody>
                    ${alunos.map((a, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="diario-nome-aluno">${escaparHtml(a.nome)}</td>
                            <td>${escaparHtml(a.matriculaNumero || '—')}</td>
                            <td>${a.presentes}</td>
                            <td>${a.faltas}</td>
                            <td>${a.justificadas}</td>
                            <td>${a.atrasos}</td>
                            <td>${escaparHtml(formatarPctDiario(a.taxaPresenca))}</td>
                            <td>${escaparHtml(formatarPctDiario(a.taxaFalta))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`
        : '<p class="rel-aviso">Nenhum aluno na turma.</p>';

    let detalheDia = '';
    if (diario.modo === 'dia' && alunos.some(a => Object.keys(a.detalhes || {}).length)) {
        const dataKey = datasAula[0] || formatarDataISO(diario.periodo?.rotulo);
        detalheDia = `
            <h3 class="diario-secao-titulo">Chamada do dia</h3>
            <table class="rel-tabela diario-tabela-chamada">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Aluno</th>
                        <th>Registros (tempo → status)</th>
                    </tr>
                </thead>
                <tbody>
                    ${alunos.map((a, i) => {
                        const regs = (a.detalhes?.[dataKey] || [])
                            .sort((x, y) => x.tempo - y.tempo)
                            .map(r => `<span class="diario-chip diario-chip-${escaparHtml(r.status)}">${escaparHtml(r.tempo)}º ${escaparHtml(rotuloStatusDiario(r.status))}</span>`)
                            .join(' ') || '<span class="diario-chip">—</span>';
                        return `<tr><td>${i + 1}</td><td>${escaparHtml(a.nome)}</td><td>${regs}</td></tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    const listaConteudos = conteudos.length
        ? `
            <ol class="diario-conteudos-lista">
                ${conteudos.map(c => `
                    <li class="diario-conteudo-item">
                        <div class="diario-conteudo-cab">
                            <strong>${escaparHtml(formatarDataBR(c.data))}</strong>
                            <span>${escaparHtml(c.titulo)}</span>
                            <small>Prof. ${escaparHtml(c.professor)}</small>
                        </div>
                        ${c.descricao ? `<p class="diario-conteudo-desc">${escaparHtml(c.descricao)}</p>` : ''}
                        ${c.observacoes ? `<p class="diario-conteudo-obs"><em>Observações:</em> ${escaparHtml(c.observacoes)}</p>` : ''}
                        ${(c.topicos || []).length
                            ? `<p class="diario-conteudo-topicos"><em>Tópicos:</em> ${escaparHtml(c.topicos.join(', '))}</p>`
                            : ''}
                    </li>
                `).join('')}
            </ol>`
        : '<p class="rel-aviso">Nenhum conteúdo programático registrado neste período.</p>';

    container.innerHTML = `
        <article class="diario-documento">
            <header class="diario-cabecalho">
                <p class="rel-escola-nome">${escaparHtml(diario.escola?.nome || 'Escola')}</p>
                <h2 class="diario-doc-titulo">Diário de Classe</h2>
                <div class="diario-meta">
                    <p><strong>Ano letivo:</strong> ${escaparHtml(diario.escola?.anoLetivo || '—')}</p>
                    <p><strong>Turma:</strong> ${escaparHtml(diario.turma?.nome || '—')} · ${escaparHtml(diario.turma?.turno || '')}</p>
                    <p><strong>Disciplina:</strong> ${escaparHtml(diario.disciplina || '—')}</p>
                    <p><strong>Professor(es):</strong> ${escaparHtml(diario.professor?.nome || '—')}</p>
                    <p><strong>Período:</strong> ${escaparHtml(periodoLabel || '—')}</p>
                    ${diario.quantidadeTempos
                        ? `<p><strong>Tempos/aula:</strong> ${escaparHtml(diario.quantidadeTempos)}</p>`
                        : ''}
                </div>
            </header>

            <section class="diario-secao">
                <h3 class="diario-secao-titulo">1. Conteúdo programático</h3>
                ${listaConteudos}
            </section>

            <section class="diario-secao">
                <h3 class="diario-secao-titulo">2. Frequência (presença e falta)</h3>
                <div class="diario-resumo-freq">
                    <div><span>Presenças</span><strong>${resumo.presentes || 0}</strong></div>
                    <div><span>Faltas</span><strong>${resumo.faltas || 0}</strong></div>
                    <div><span>% Presença</span><strong>${escaparHtml(formatarPctDiario(resumo.taxaPresenca))}</strong></div>
                    <div><span>% Falta</span><strong>${escaparHtml(formatarPctDiario(resumo.taxaFalta))}</strong></div>
                    <div><span>Lançamentos</span><strong>${resumo.lancados || 0}</strong></div>
                </div>
                ${tabelaFrequencia}
                ${detalheDia}
            </section>

            <footer class="diario-rodape">
                <p>Documento gerado em ${escaparHtml(formatarDataBR(diario.geradoEm))} às ${escaparHtml(new Date(diario.geradoEm).toLocaleTimeString('pt-BR'))}</p>
                <div class="diario-assinatura">
                    <div>
                        <p>________________________________</p>
                        <p>${escaparHtml(diario.professor?.nome || 'Professor(a)')}</p>
                        <small>Professor(a) responsável</small>
                    </div>
                    <div>
                        <p>________________________________</p>
                        <p>${escaparHtml(diario.escola?.assinatura?.representante || 'Diretor(a)')}</p>
                        <small>${escaparHtml(diario.escola?.assinatura?.cargo || 'Direção')}</small>
                    </div>
                </div>
            </footer>
        </article>`;
}

async function initDiarioAula() {
    try {
        await api.verificarToken();
    } catch {
        window.location.href = 'index.html';
        return;
    }

    definirNomeUsuario();
    configurarBotaoVoltar('linkVoltar');
    configurarBotaoImprimir();

    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const modoEl = document.getElementById('filtroModoDiario');
    const grupoData = document.getElementById('grupoDataDiario');
    const grupoPeriodo = document.getElementById('grupoPeriodoDiario');
    const dataEl = document.getElementById('filtroDataDiario');
    const periodoEl = document.getElementById('filtroPeriodoDiario');
    const turmaEl = document.getElementById('filtroTurmaDiario');
    const discEl = document.getElementById('filtroDisciplinaDiario');
    const grupoProf = document.getElementById('grupoProfessorDiario');
    const profEl = document.getElementById('filtroProfessorDiario');
    const btn = document.getElementById('btnCarregarDiario');

    if (dataEl && !dataEl.value) {
        dataEl.valueAsDate = new Date();
    }

    const atualizarModo = () => {
        const modo = modoEl?.value || 'periodo';
        if (grupoData) grupoData.style.display = modo === 'dia' ? '' : 'none';
        if (grupoPeriodo) grupoPeriodo.style.display = modo === 'periodo' ? '' : 'none';
    };
    modoEl?.addEventListener('change', atualizarModo);
    atualizarModo();

    let opcoes = { turmas: [], disciplinas: [], professores: [], anoLetivo: new Date().getFullYear() };

    try {
        opcoes = await api.obterOpcoesDiarioAula();
    } catch (erro) {
        exibirErroRelatorio(erro.message);
        return;
    }

    window.__diarioSetOpcoes?.(opcoes);

    preencherSelect(
        turmaEl,
        (opcoes.turmas || []).map(t => ({ value: String(t._id), label: t.nome })),
        'Selecione a turma'
    );
    preencherSelect(
        discEl,
        (opcoes.disciplinas || []).map(d => ({ value: d, label: d })),
        'Selecione a disciplina'
    );

    const gestao = ['admin', 'diretor', 'coordenador', 'secretaria'].includes(usuario.tipo);
    if (gestao && grupoProf && profEl) {
        grupoProf.style.display = '';
        preencherSelect(
            profEl,
            (opcoes.professores || []).map(p => ({ value: String(p._id), label: p.nome })),
            'Todos'
        );
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('turma_id') && turmaEl) turmaEl.value = params.get('turma_id');
    if (params.get('disciplina') && discEl) discEl.value = params.get('disciplina');
    if (params.get('modo') && modoEl) {
        modoEl.value = params.get('modo');
        atualizarModo();
    }
    if (params.get('data') && dataEl) dataEl.value = params.get('data');
    if (params.get('periodo') && periodoEl) periodoEl.value = params.get('periodo');

    // Prefill lançamento do dia (professor)
    const turmaLancar = document.getElementById('filtroTurmaLancar');
    const discLancar = document.getElementById('filtroDisciplinaLancar');
    const dataLancar = document.getElementById('filtroDataLancar');
    if (params.get('turma_id') && turmaLancar) turmaLancar.value = params.get('turma_id');
    if (params.get('disciplina') && discLancar) discLancar.value = params.get('disciplina');
    if (params.get('data') && dataLancar) dataLancar.value = params.get('data');

    const carregar = async () => {
        if (typeof window.__diarioCarregarConsulta === 'function') {
            await window.__diarioCarregarConsulta();
            return;
        }
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
                ano: opcoes.anoLetivo,
                professorId: gestao ? (profEl?.value || undefined) : undefined
            });
            renderDiarioAula(res.diario);
        } catch (erro) {
            exibirErroRelatorio(erro.message);
        }
    };

    btn?.addEventListener('click', carregar);

    // Se veio com parâmetros e for consulta, carrega; se professor com params, abre lançamento
    if (params.get('turma_id') && params.get('disciplina')) {
        if (usuario.tipo === 'professor' && (params.get('modo') !== 'periodo')) {
            const modoUso = document.getElementById('filtroModoUsoDiario');
            if (modoUso) {
                modoUso.value = 'lancar';
                modoUso.dispatchEvent(new Event('change'));
            }
            if (typeof abrirDiarioDoDia === 'function') {
                await abrirDiarioDoDia();
            } else {
                // diario-classe.js pode carregar depois do aoPronto paralelo
                setTimeout(() => {
                    if (typeof abrirDiarioDoDia === 'function') abrirDiarioDoDia();
                }, 50);
            }
        } else if (params.get('modo') === 'periodo' || gestao) {
            const modoUso = document.getElementById('filtroModoUsoDiario');
            if (modoUso) {
                modoUso.value = 'consultar';
                modoUso.dispatchEvent(new Event('change'));
            }
            await carregar();
        }
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
        'diario-aula': initDiarioAula,
        'academico-hub': initAcademicoHub
    };

    const init = inits[pagina];
    if (init) init();
});
