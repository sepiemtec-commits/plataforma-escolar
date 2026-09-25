let usuario = null;
let dadosPainel = null;
let turmasNotificacao = [];

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    document.getElementById('btnLogoutMenu')?.addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader')?.addEventListener('click', fazerLogout);
    document.getElementById('formularioNotificacao')?.addEventListener('submit', enviarNotificacao);
    document.getElementById('periodoDesempenho')?.addEventListener('change', carregarDesempenho);
    document.getElementById('btnGerarDiagnostico')?.addEventListener('click', gerarDiagnostico);
    document.getElementById('notificacaoDestino')?.addEventListener('change', atualizarCamposDestinoNotificacao);
    document.getElementById('notificacaoTurma')?.addEventListener('change', onTurmaNotificacaoChange);
    document.getElementById('filtroTurmaCoordenador')?.addEventListener('change', () => {
        renderizarTurmas();
    });
    document.getElementById('formHtpc')?.addEventListener('submit', salvarHtpc);
    document.getElementById('formPei')?.addEventListener('submit', salvarPei);
    document.getElementById('peiTurma')?.addEventListener('change', onPeiTurmaChange);

    carregarSecao('dashboard');
    await carregarDashboard();
});

function configurarNavegacao() {
    document.querySelector('.menu')?.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-secao]');
        if (!link) return;
        e.preventDefault();
        carregarSecao(link.dataset.secao, link);
    });
}

async function verificarAutenticacao() {
    usuario = await exigirPerfil('coordenador');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = usuario.nome;
    return true;
}

async function carregarDashboard() {
    try {
        const resposta = await api.carregarPainelCoordenador();
        dadosPainel = resposta.painel;

        document.getElementById('totalTurmas').textContent = dadosPainel.turmas ?? 0;
        document.getElementById('alunosRecuperacao').textContent = dadosPainel.alunosRecuperacao ?? 0;
        document.getElementById('frequenciaEscola').textContent = `${dadosPainel.frequenciaMedia ?? 0}%`;

        renderizarTabelaDisciplinas(dadosPainel.desempenho || []);
    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);
        mostrarErro(erro.message || 'Erro ao carregar painel do coordenador');
    }
}

function renderizarTabelaDisciplinas(lista) {
    const tabelaDisciplinas = document.getElementById('tabelaDisciplinas');
    if (!tabelaDisciplinas) return;

    if (!lista.length) {
        tabelaDisciplinas.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sem dados de desempenho</td></tr>';
        return;
    }

    tabelaDisciplinas.innerHTML = lista.map(disciplina => {
        const media = disciplina.mediaGeral != null ? Number(disciplina.mediaGeral).toFixed(2) : '—';
        const nome = disciplina._id || '—';
        return `
            <tr>
                <td>${escaparHtml(nome)}</td>
                <td><strong>${escaparHtml(media)}</strong></td>
                <td>${disciplina.alunosRecuperacao ?? 0}</td>
                <td>
                    <button type="button" class="btn btn-pequeno btn-sucesso" data-disciplina="${escaparHtml(nome)}">
                        Alertar
                    </button>
                </td>
            </tr>`;
    }).join('');

    tabelaDisciplinas.querySelectorAll('[data-disciplina]').forEach(btn => {
        btn.addEventListener('click', () => enviarAlertaDisciplina(btn.dataset.disciplina));
    });
}

function preencherFiltroTurmasCoordenador() {
    const select = document.getElementById('filtroTurmaCoordenador');
    if (!select) return;

    const atual = select.value;
    const turmas = dadosPainel?.turmasResumo || [];

    select.innerHTML = `
        <option value="">Selecione...</option>
        <option value="__todas__">Todas as turmas</option>
    `;

    turmas.forEach(turma => {
        const opt = document.createElement('option');
        opt.value = turma._id;
        const detalhes = [turma.nivel, turma.turno].filter(Boolean).join(' · ');
        opt.textContent = detalhes ? `${turma.nome} (${detalhes})` : turma.nome;
        select.appendChild(opt);
    });

    if (atual === '__todas__' || turmas.some(t => String(t._id) === String(atual))) {
        select.value = atual;
    }
}

function renderizarResumoTodasTurmas() {
    const turmas = dadosPainel?.turmasResumo || [];
    if (!turmas.length) {
        return '<p style="color:#7f8c8d;">Nenhuma turma cadastrada.</p>';
    }

    return `
        <table class="tabela">
            <thead>
                <tr>
                    <th>Turma</th>
                    <th>Professor</th>
                    <th>Alunos</th>
                    <th>Frequência</th>
                </tr>
            </thead>
            <tbody>
                ${turmas.map(turma => `
                    <tr>
                        <td>${escaparHtml(turma.nome)}</td>
                        <td>${escaparHtml(turma.professor)}</td>
                        <td>${escaparHtml(turma.totalAlunos)}</td>
                        <td>${turma.frequencia != null ? `${escaparHtml(turma.frequencia)}%` : '—'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

async function renderizarDetalheTurmaCoordenador(turmaId) {
    const turma = (dadosPainel?.turmasResumo || []).find(t => String(t._id) === String(turmaId));
    if (!turma) {
        return '<p style="color:#c0392b;">Turma não encontrada.</p>';
    }

    let alunosHtml = '<p style="color:#7f8c8d;">Carregando frequência dos alunos...</p>';

    try {
        const resposta = await api.obterVisaoGeralPresenca({
            modo: 'periodo',
            periodo: 'Anual',
            turmaId
        });
        const alunos = resposta.quadro?.[0]?.alunos || [];

        if (!alunos.length) {
            alunosHtml = '<p style="color:#7f8c8d;">Nenhum aluno nesta turma.</p>';
        } else {
            alunosHtml = `
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th style="text-align:center;">Presentes</th>
                            <th style="text-align:center;">Faltas</th>
                            <th style="text-align:center;">% Presença</th>
                            <th style="text-align:center;">% Faltas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${alunos.map(aluno => `
                            <tr>
                                <td>${escaparHtml(aluno.nome)}</td>
                                <td style="text-align:center;">${aluno.presentes || 0}</td>
                                <td style="text-align:center;">${aluno.faltas || 0}</td>
                                <td style="text-align:center;"><strong class="taxa-aluno-presente">${aluno.taxaPresenca != null ? `${escaparHtml(aluno.taxaPresenca)}%` : '—'}</strong></td>
                                <td style="text-align:center;"><strong class="taxa-aluno-falta">${aluno.taxaFalta != null ? `${escaparHtml(aluno.taxaFalta)}%` : '—'}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        }
    } catch (erro) {
        alunosHtml = `<p class="alerta alerta-erro">❌ ${escaparHtml(erro.message)}</p>`;
    }

    return `
        <div class="card" style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;">${escaparHtml(turma.nome)}</h3>
            <p style="margin:0;color:#566573;">
                Professor: <strong>${escaparHtml(turma.professor)}</strong> ·
                Alunos: <strong>${escaparHtml(turma.totalAlunos)}</strong> ·
                Frequência da turma: <strong>${turma.frequencia != null ? `${escaparHtml(turma.frequencia)}%` : '—'}</strong>
            </p>
            <p style="margin:12px 0 0;">
                <a class="btn btn-pequeno btn-info" href="presenca-geral.html?turma_id=${escaparHtml(turma._id)}">Abrir quadro de presença</a>
            </p>
        </div>
        <h3 style="margin:0 0 12px;">Frequência dos alunos (ano letivo)</h3>
        ${alunosHtml}`;
}

async function renderizarTurmas() {
    const painel = document.getElementById('painelTurmasCoordenador');
    if (!painel) return;

    preencherFiltroTurmasCoordenador();

    const filtroId = document.getElementById('filtroTurmaCoordenador')?.value || '';

    if (!filtroId) {
        painel.innerHTML = '<p style="color:#7f8c8d;">Selecione uma turma acima para começar.</p>';
        return;
    }

    if (filtroId === '__todas__') {
        painel.innerHTML = renderizarResumoTodasTurmas();
        return;
    }

    painel.innerHTML = '<p style="color:#7f8c8d;">Carregando turma...</p>';
    painel.innerHTML = await renderizarDetalheTurmaCoordenador(filtroId);
}

function carregarSecao(secao, linkAtivo) {
    document.querySelectorAll('main section').forEach(s => { s.style.display = 'none'; });
    const el = document.getElementById(secao);
    if (el) el.style.display = 'block';

    document.querySelectorAll('.menu a[data-secao]').forEach(a => a.classList.remove('ativo'));
    if (linkAtivo) {
        linkAtivo.classList.add('ativo');
    } else {
        const menuLink = document.querySelector(`.menu a[data-secao="${secao}"]`);
        menuLink?.classList.add('ativo');
    }

    if (secao === 'turmas') {
        if (!dadosPainel) {
            carregarDashboard().then(renderizarTurmas);
        } else {
            renderizarTurmas();
        }
    }

    if (secao === 'desempenho') {
        carregarDesempenho();
    }

    if (secao === 'notificacoes') {
        prepararFormularioNotificacao();
    }

    if (secao === 'htpc') {
        carregarListaHtpc();
    }

    if (secao === 'pei') {
        prepararFormPei();
        carregarListaPei();
    }

    if (secao === 'simulados-hist') {
        carregarHistoricoSimulados();
    }
}

async function prepararFormularioNotificacao() {
    try {
        if (!turmasNotificacao.length) {
            const res = await api.listarTurmas();
            turmasNotificacao = res.turmas || [];
        }
        preencherSelectTurmasNotificacao();
        atualizarCamposDestinoNotificacao();
    } catch (erro) {
        mostrarErro(erro.message || 'Erro ao carregar turmas para notificação');
    }
}

function preencherSelectTurmasNotificacao() {
    const select = document.getElementById('notificacaoTurma');
    if (!select) return;

    const atual = select.value;
    select.innerHTML = '<option value="">Selecione a turma</option>';
    turmasNotificacao.forEach(turma => {
        const opt = document.createElement('option');
        opt.value = turma._id;
        opt.textContent = `${turma.nome}${turma.turno ? ` (${turma.turno})` : ''}`;
        select.appendChild(opt);
    });
    if (atual) select.value = atual;
}

function atualizarCamposDestinoNotificacao() {
    const destino = document.getElementById('notificacaoDestino')?.value || 'todos';
    const grupoTurma = document.getElementById('grupoNotifTurma');
    const grupoAluno = document.getElementById('grupoNotifAluno');

    if (grupoTurma) grupoTurma.style.display = destino === 'turma' || destino === 'aluno' ? 'block' : 'none';
    if (grupoAluno) grupoAluno.style.display = destino === 'aluno' ? 'block' : 'none';

    if (destino === 'aluno') {
        onTurmaNotificacaoChange();
    }

    atualizarResumoDestinoNotificacao();
}

function onTurmaNotificacaoChange() {
    const destino = document.getElementById('notificacaoDestino')?.value;
    const turmaId = document.getElementById('notificacaoTurma')?.value;
    const selectAluno = document.getElementById('notificacaoAluno');
    if (!selectAluno) return;

    selectAluno.innerHTML = '<option value="">Selecione o aluno</option>';

    if (destino !== 'aluno') {
        atualizarResumoDestinoNotificacao();
        return;
    }

    const turma = turmasNotificacao.find(t => String(t._id) === String(turmaId));
    const alunos = (turma?.alunos || []).slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    if (!turmaId) {
        selectAluno.innerHTML = '<option value="">Selecione a turma primeiro</option>';
        atualizarResumoDestinoNotificacao();
        return;
    }

    if (!alunos.length) {
        selectAluno.innerHTML = '<option value="">Nenhum aluno nesta turma</option>';
        atualizarResumoDestinoNotificacao();
        return;
    }

    alunos.forEach(aluno => {
        const opt = document.createElement('option');
        opt.value = aluno._id;
        opt.textContent = aluno.nome;
        selectAluno.appendChild(opt);
    });

    selectAluno.onchange = atualizarResumoDestinoNotificacao;
    atualizarResumoDestinoNotificacao();
}

function atualizarResumoDestinoNotificacao() {
    const el = document.getElementById('resumoDestinoNotif');
    if (!el) return;

    const destino = document.getElementById('notificacaoDestino')?.value || 'todos';
    const turmaId = document.getElementById('notificacaoTurma')?.value;
    const alunoId = document.getElementById('notificacaoAluno')?.value;
    const turma = turmasNotificacao.find(t => String(t._id) === String(turmaId));
    const aluno = (turma?.alunos || []).find(a => String(a._id) === String(alunoId));

    if (destino === 'todos') {
        el.textContent = 'A mensagem será enviada por WhatsApp a todos os responsáveis cadastrados na escola.';
        return;
    }

    if (destino === 'turma') {
        el.textContent = turma
            ? `A mensagem será enviada aos responsáveis dos alunos da turma ${turma.nome}.`
            : 'Selecione a turma de destino.';
        return;
    }

    if (destino === 'aluno') {
        el.textContent = aluno
            ? `A mensagem será enviada ao responsável de ${aluno.nome}.`
            : 'Selecione a turma e o aluno.';
    }
}

async function gerarDiagnostico() {
    const periodo = document.getElementById('periodoDiagnostico').value;

    try {
        const diagnostico = await api.diagnosticarAlunos(null, periodo);
        const conteudo = document.getElementById('conteudoDiagnostico');
        if (!conteudo) return;

        if (!diagnostico.diagnosticos?.length) {
            conteudo.innerHTML = '<div class="alerta alerta-sucesso">✓ Nenhum aluno em recuperação neste período</div>';
            return;
        }

        conteudo.innerHTML = `
            <table class="tabela">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Disciplina</th>
                        <th>Média</th>
                        <th>Recomendação</th>
                    </tr>
                </thead>
                <tbody>
                    ${diagnostico.diagnosticos.map(diag => `
                        <tr>
                            <td>${escaparHtml(diag.aluno?.nome || 'N/A')}</td>
                            <td>${escaparHtml(diag.disciplina)}</td>
                            <td>${escaparHtml(diag.media ?? '—')}</td>
                            <td>${escaparHtml(diag.recomendacao)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (erro) {
        console.error('Erro ao gerar diagnóstico:', erro);
        mostrarErro(erro.message);
    }
}

async function carregarDesempenho() {
    const periodo = document.getElementById('periodoDesempenho')?.value;
    const conteudo = document.getElementById('conteudoDesempenho');
    if (!conteudo) return;

    conteudo.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';

    try {
        const diagnostico = await api.diagnosticarAlunos(null, periodo);
        const lista = diagnostico.diagnosticos || [];

        if (!lista.length) {
            conteudo.innerHTML = '<div class="alerta alerta-sucesso">✓ Nenhum aluno em recuperação neste período</div>';
            return;
        }

        conteudo.innerHTML = `
            <table class="tabela">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Disciplina</th>
                        <th>Média</th>
                        <th>Situação</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(item => `
                        <tr>
                            <td>${escaparHtml(item.aluno?.nome || 'N/A')}</td>
                            <td>${escaparHtml(item.disciplina)}</td>
                            <td>${escaparHtml(item.media ?? '—')}</td>
                            <td>${escaparHtml(item.situacao || 'recuperação')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } catch (erro) {
        conteudo.innerHTML = `<p class="alerta alerta-erro">❌ ${escaparHtml(erro.message)}</p>`;
    }
}

async function enviarNotificacao(e) {
    e.preventDefault();

    const destino = document.getElementById('notificacaoDestino').value;
    const titulo = document.getElementById('notificacaoTitulo').value.trim();
    const mensagem = document.getElementById('notificacaoMensagem').value.trim();
    const turmaId = document.getElementById('notificacaoTurma')?.value || '';
    const alunoId = document.getElementById('notificacaoAluno')?.value || '';
    const btn = document.getElementById('btnEnviarNotificacao');

    if (!titulo || !mensagem) {
        mostrarErro('Preencha título e mensagem');
        return;
    }

    if (destino === 'turma' && !turmaId) {
        mostrarErro('Selecione a turma');
        return;
    }

    if (destino === 'aluno' && !alunoId) {
        mostrarErro('Selecione o aluno');
        return;
    }

    const canais = {
        whatsapp: document.getElementById('canalWhatsapp')?.checked !== false,
        sms: Boolean(document.getElementById('canalSms')?.checked),
        push: Boolean(document.getElementById('canalPush')?.checked)
    };

    if (!canais.whatsapp && !canais.sms && !canais.push) {
        mostrarErro('Selecione ao menos um canal');
        return;
    }

    const payload = { titulo, mensagem, destino, canais };
    if (destino === 'turma') payload.turma_id = turmaId;
    if (destino === 'aluno') payload.aluno_id = alunoId;

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
        }

        const res = await api.requisicao('/notificacoes/geral', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const e = res.enviados || {};
        const detalhe = [
            e.whatsapp ? `WhatsApp: ${e.whatsapp}` : null,
            e.sms ? `SMS: ${e.sms}` : null,
            e.push ? `Push: ${e.push}` : null
        ].filter(Boolean).join(' · ');

        mostrarSucesso(res.mensagem || (detalhe ? `Enviado — ${detalhe}` : 'Notificação enviada'));
        document.getElementById('formularioNotificacao').reset();
        const wa = document.getElementById('canalWhatsapp');
        if (wa) wa.checked = true;
        atualizarCamposDestinoNotificacao();
    } catch (erro) {
        mostrarErro(erro.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✓ Enviar';
        }
    }
}

async function enviarAlertaDisciplina(disciplina) {
    mostrarSucesso(`Alertas sendo enviados para alunos da disciplina ${disciplina}`);
}

async function carregarListaHtpc() {
    const box = document.getElementById('listaHtpc');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarHtpc();
        const lista = res.reunioes || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhuma reunião pedagógica cadastrada.</p>';
            return;
        }
        const labelPublico = { pais: 'Pais', professores: 'Professores', todos: 'Todos' };
        box.innerHTML = lista.map((r) => {
            const data = r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '—';
            const presentes = (r.participantes || []).filter((p) => p.presente).length;
            const total = (r.participantes || []).length;
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff;">
                <header style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <strong>${escaparHtml(r.titulo)}</strong>
                    <span style="font-size:13px;color:#566573;">${escaparHtml(data)} · ${escaparHtml(r.turno || '')} · ${escaparHtml(r.status)} · ${escaparHtml(labelPublico[r.publico] || 'Professores')}</span>
                </header>
                <p style="margin:8px 0;white-space:pre-wrap;font-size:14px;">${escaparHtml(r.pauta || 'Sem pauta')}</p>
                <p style="margin:0 0 8px;font-size:13px;color:#566573;">Presença: ${presentes}/${total}</p>
                <label style="display:block;font-size:13px;margin-bottom:4px;">Ata</label>
                <textarea data-htpc-ata="${escaparHtml(r._id)}" rows="3" style="width:100%;margin-bottom:8px;">${escaparHtml(r.ata || '')}</textarea>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-pequeno btn-primario" data-htpc-salvar="${escaparHtml(r._id)}">Salvar ata</button>
                    <button type="button" class="btn btn-pequeno btn-sucesso" data-htpc-realizar="${escaparHtml(r._id)}">Marcar realizada</button>
                    <button type="button" class="btn btn-pequeno btn-erro" data-htpc-excluir="${escaparHtml(r._id)}" data-htpc-titulo="${escaparHtml(r.titulo)}">Excluir</button>
                </div>
                <div style="margin-top:10px;font-size:13px;">
                    ${(r.participantes || []).slice(0, 20).map((p) => {
                        const nome = p.nome || p.usuario_id?.nome || p.professor_id?.nome || 'Participante';
                        const uid = p.usuario_id?._id || p.usuario_id || p.professor_id?._id || p.professor_id;
                        const checked = p.presente ? 'checked' : '';
                        const tipoLabel = p.tipo === 'responsavel' ? 'pais' : 'prof';
                        return `<label style="display:inline-block;margin:2px 10px 2px 0;">
                            <input type="checkbox" data-htpc-presenca="${escaparHtml(r._id)}" data-user="${escaparHtml(uid)}" ${checked}>
                            ${escaparHtml(nome)} <small>(${tipoLabel})</small>
                        </label>`;
                    }).join('')}
                </div>
            </article>`;
        }).join('');

        box.querySelectorAll('[data-htpc-salvar]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-htpc-salvar');
                const ata = box.querySelector(`[data-htpc-ata="${id}"]`)?.value || '';
                try {
                    await api.atualizarHtpc(id, { ata });
                    mostrarSucesso('Ata salva');
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
        box.querySelectorAll('[data-htpc-realizar]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api.atualizarHtpc(btn.getAttribute('data-htpc-realizar'), { status: 'realizada' });
                    mostrarSucesso('Reunião marcada como realizada');
                    carregarListaHtpc();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
        box.querySelectorAll('[data-htpc-excluir]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const titulo = btn.getAttribute('data-htpc-titulo') || 'esta reunião';
                if (!confirm(`Excluir a reunião "${titulo}"? Esta ação não pode ser desfeita.`)) return;
                try {
                    await api.excluirHtpc(btn.getAttribute('data-htpc-excluir'));
                    mostrarSucesso('Reunião excluída');
                    carregarListaHtpc();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
        box.querySelectorAll('[data-htpc-presenca]').forEach((chk) => {
            chk.addEventListener('change', async () => {
                try {
                    await api.presencaHtpc(chk.getAttribute('data-htpc-presenca'), {
                        usuario_id: chk.getAttribute('data-user'),
                        presente: chk.checked
                    });
                } catch (e) {
                    mostrarErro(e.message);
                    chk.checked = !chk.checked;
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function salvarHtpc(e) {
    e.preventDefault();
    const publicoEl = document.querySelector('input[name="htpcPublico"]:checked');
    try {
        await api.criarHtpc({
            titulo: document.getElementById('htpcTitulo').value.trim(),
            data: document.getElementById('htpcData').value,
            turno: document.getElementById('htpcTurno').value,
            pauta: document.getElementById('htpcPauta').value,
            publico: publicoEl?.value || 'professores'
        });
        mostrarSucesso('Reunião agendada');
        e.target.reset();
        const def = document.querySelector('input[name="htpcPublico"][value="professores"]');
        if (def) def.checked = true;
        carregarListaHtpc();
    } catch (err) {
        mostrarErro(err.message);
    }
}

async function prepararFormPei() {
    const sel = document.getElementById('peiTurma');
    if (!sel) return;
    try {
        if (!turmasNotificacao.length) {
            const res = await api.listarTurmas();
            turmasNotificacao = res.turmas || [];
        }
        sel.innerHTML = '<option value="">Selecione</option>' +
            turmasNotificacao.map((t) => `<option value="${escaparHtml(t._id)}">${escaparHtml(t.nome)}</option>`).join('');
    } catch (e) {
        console.error(e);
    }
}

async function onPeiTurmaChange() {
    const turmaId = document.getElementById('peiTurma').value;
    const sel = document.getElementById('peiAluno');
    if (!turmaId) {
        sel.disabled = true;
        sel.innerHTML = '<option value="">Selecione a turma</option>';
        return;
    }
    let alunos = [];
    try {
        const res = await api.requisicao(`/turmas/${turmaId}/resumo-alunos`);
        alunos = res.alunos || res.turma?.alunos || [];
    } catch (_) {
        const turma = turmasNotificacao.find((t) => String(t._id) === String(turmaId));
        alunos = turma?.alunos || [];
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione</option>' +
        alunos.map((a) => {
            const id = a._id || a.aluno_id || a;
            const nome = a.nome || a.aluno?.nome || String(id);
            return `<option value="${escaparHtml(id)}">${escaparHtml(nome)}</option>`;
        }).join('');
}

async function salvarPei(e) {
    e.preventDefault();
    const aluno_id = document.getElementById('peiAluno').value;
    const turma_id = document.getElementById('peiTurma').value;
    if (!aluno_id) {
        mostrarErro('Selecione o aluno');
        return;
    }
    const metasTxt = document.getElementById('peiMetas').value || '';
    const metas = metasTxt.split('\n').map((l) => l.trim()).filter(Boolean).map((descricao) => ({
        descricao,
        status: 'pendente'
    }));
    try {
        await api.criarPei({
            aluno_id,
            turma_id: turma_id || undefined,
            diagnostico: document.getElementById('peiDiagnostico').value,
            necessidades: document.getElementById('peiNecessidades').value,
            estrategias: document.getElementById('peiEstrategias').value,
            recursos: document.getElementById('peiRecursos').value,
            status: document.getElementById('peiStatus').value,
            metas
        });
        mostrarSucesso('PEI salvo');
        e.target.reset();
        document.getElementById('peiAluno').disabled = true;
        carregarListaPei();
    } catch (err) {
        mostrarErro(err.message);
    }
}

async function carregarListaPei() {
    const box = document.getElementById('listaPei');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarPeis();
        const lista = res.peis || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhum PEI cadastrado.</p>';
            return;
        }
        box.innerHTML = lista.map((p) => {
            const aluno = p.aluno_id?.nome || '—';
            const turma = p.turma_id?.nome || '—';
            const acops = (p.acompanhamentos || []).slice(-3).reverse();
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff;" data-pei-id="${escaparHtml(p._id)}">
                <header><strong>${escaparHtml(aluno)}</strong> · ${escaparHtml(turma)} · <em>${escaparHtml(p.status)}</em></header>
                <p style="font-size:14px;margin:8px 0;"><strong>Diagnóstico:</strong> ${escaparHtml((p.diagnostico || '').slice(0, 200))}</p>
                <p style="font-size:13px;color:#566573;margin:0 0 8px;">Metas: ${(p.metas || []).length}</p>
                <div style="font-size:13px;margin-bottom:8px;">
                    ${acops.map((a) => `<div style="margin-bottom:4px;">${escaparHtml(a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '')}: ${escaparHtml(a.texto)}</div>`).join('') || '<em>Sem acompanhamentos</em>'}
                </div>
                <textarea data-pei-acomp="${escaparHtml(p._id)}" rows="2" style="width:100%;margin-bottom:6px;" placeholder="Novo acompanhamento"></textarea>
                <button type="button" class="btn btn-pequeno btn-sucesso" data-pei-add="${escaparHtml(p._id)}">Registrar acompanhamento</button>
            </article>`;
        }).join('');

        box.querySelectorAll('[data-pei-add]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-pei-add');
                const texto = box.querySelector(`[data-pei-acomp="${id}"]`)?.value?.trim();
                if (!texto) {
                    mostrarErro('Digite o acompanhamento');
                    return;
                }
                try {
                    await api.acompanhamentoPei(id, texto);
                    mostrarSucesso('Acompanhamento registrado');
                    carregarListaPei();
                } catch (e) {
                    mostrarErro(e.message);
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function carregarHistoricoSimulados() {
    const resumo = document.getElementById('resumoHistoricoSim');
    const box = document.getElementById('listaHistoricoSim');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.historicoSimulados();
        const serie = res.serie || [];
        resumo.innerHTML = `
            <div class="grid-paineis">
                <div class="card"><h3>Simulados</h3><div class="card-valor">${res.totalSimulados || 0}</div></div>
                <div class="card"><h3>Média geral</h3><div class="card-valor">${res.mediaGeral != null ? res.mediaGeral + '%' : '—'}</div></div>
            </div>`;
        if (!serie.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Ainda não há simulados com resultados. Professores agendam em Simulados SAEB/SARESP.</p>';
            return;
        }
        box.innerHTML = '<table class="tabela"><thead><tr><th>Data</th><th>Título</th><th>Fonte</th><th>Área</th><th>Média</th><th>Resp.</th><th>Status</th></tr></thead><tbody>' +
            serie.map((s) => {
                const data = s.dataInicio ? new Date(s.dataInicio).toLocaleDateString('pt-BR') : '—';
                return `<tr>
                    <td>${escaparHtml(data)}</td>
                    <td>${escaparHtml(s.titulo)}</td>
                    <td>${escaparHtml(s.fonte || '')}</td>
                    <td>${escaparHtml(s.area || '')}</td>
                    <td><strong>${s.mediaEscola != null ? s.mediaEscola + '%' : '—'}</strong></td>
                    <td>${s.totalRespostas || 0}</td>
                    <td>${escaparHtml(s.status || '')}</td>
                </tr>`;
            }).join('') + '</tbody></table>';

        const porArea = res.porArea || {};
        const areasHtml = Object.keys(porArea).map((area) => {
            const pts = porArea[area];
            return `<div style="margin-top:16px;"><h3 style="font-size:15px;">Série — ${escaparHtml(area)}</h3>
                <p style="font-size:13px;color:#566573;">${pts.map((p) => `${escaparHtml(new Date(p.data).toLocaleDateString('pt-BR'))}: ${p.media}%`).join(' → ')}</p></div>`;
        }).join('');
        box.innerHTML += areasHtml;
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

async function fazerLogout() {
    try {
        await api.logout();
    } catch {}
    window.location.href = 'index.html';
}

function mostrarSucesso(mensagem) {
    const alerta = document.createElement('div');
    alerta.className = 'alerta alerta-sucesso';
    alerta.textContent = '✓ ' + mensagem;
    alerta.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999';
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 3000);
}

function mostrarErro(mensagem) {
    const alerta = document.createElement('div');
    alerta.className = 'alerta alerta-erro';
    alerta.textContent = '❌ ' + mensagem;
    alerta.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999';
    document.body.appendChild(alerta);
    setTimeout(() => alerta.remove(), 4000);
}

window.carregarSecao = carregarSecao;
window.gerarDiagnostico = gerarDiagnostico;
window.carregarDesempenho = carregarDesempenho;
window.fazerLogout = fazerLogout;
