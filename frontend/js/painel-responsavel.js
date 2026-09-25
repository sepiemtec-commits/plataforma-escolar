// frontend/js/painel-responsavel.js

let usuario = null;

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await verificarAutenticacao();
    if (!ok) return;

    document.querySelector('.menu')?.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-secao]');
        if (!link) return;
        e.preventDefault();
        carregarSecaoResp(link.dataset.secao, link);
    });

    document.getElementById('btnLogoutMenu')?.addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader')?.addEventListener('click', fazerLogout);

    if (window.VehoPush) {
        VehoPush.montarBotaoPush(document.getElementById('vehoPushContainer'), {
            titulo: 'Receber alertas da escola neste aparelho'
        });
    }

    await carregarPainel();
});

function carregarSecaoResp(secao, linkAtivo) {
    document.querySelectorAll('main section').forEach((s) => { s.style.display = 'none'; });
    const el = document.getElementById(secao);
    if (el) el.style.display = 'block';
    document.querySelectorAll('.menu a[data-secao]').forEach((a) => a.classList.remove('ativo'));
    linkAtivo?.classList.add('ativo');
    if (secao === 'reunioes') carregarReunioesResponsavel();
}

async function carregarReunioesResponsavel() {
    const box = document.getElementById('listaReunioesResp');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    try {
        const res = await api.listarHtpc();
        const lista = res.reunioes || [];
        if (!lista.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhuma reunião para você no momento.</p>';
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
                <strong>${escapar(r.titulo)}</strong>
                <p style="font-size:13px;color:#566573;margin:6px 0;">${escapar(data)} · ${escapar(r.turno || '')} · ${escapar(r.status)} · ${escapar(labelPublico[r.publico] || '')}</p>
                <p style="white-space:pre-wrap;font-size:14px;">${escapar(r.pauta || '')}</p>
                <button type="button" class="btn btn-pequeno ${presente ? 'btn-secundario' : 'btn-sucesso'}" data-reuniao-eu="${escapar(r._id)}" data-presente="${presente ? '0' : '1'}">
                    ${presente ? 'Presente (clique para desmarcar)' : 'Marcar minha presença'}
                </button>
            </article>`;
        }).join('');
        box.querySelectorAll('[data-reuniao-eu]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await api.presencaHtpc(btn.getAttribute('data-reuniao-eu'), {
                        presente: btn.getAttribute('data-presente') === '1'
                    });
                    carregarReunioesResponsavel();
                } catch (e) {
                    alert(e.message);
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p class="alerta alerta-erro">${escapar(e.message)}</p>`;
    }
}

async function verificarAutenticacao() {
    usuario = await exigirPerfil('responsavel');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = usuario.nome;
    return true;
}

function escapar(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function carregarPainel() {
    const container = document.getElementById('listaFilhos');
    try {
        const resposta = await api.carregarPainelResponsavel();
        const painel = resposta.painel || {};
        const alunos = painel.alunosDetalhes || [];

        document.getElementById('totalFilhos').textContent = painel.alunos ?? alunos.length;

        if (!alunos.length) {
            container.innerHTML = '<p class="alerta alerta-aviso">Nenhum aluno vinculado a este responsável.</p>';
            return;
        }

        container.innerHTML = alunos.map((aluno, idx) => {
            const aberto = idx === 0;
            const desempenho = aluno.desempenho || [];
            const linhas = desempenho.length
                ? desempenho.map(d => `
                    <tr>
                        <td>${escapar(d.disciplina)}</td>
                        <td>${escapar(d.periodo)}</td>
                        <td>${d.mediaGeral ?? '—'}</td>
                        <td>${d.frequenciaPercentual != null ? `${d.frequenciaPercentual}%` : '—'}</td>
                        <td><span class="status ${['aprovado', 'excelente'].includes(d.situacao) ? 'status-presente' : 'status-recuperacao'}">${escapar(d.situacao || '—')}</span></td>
                    </tr>`).join('')
                : '<tr><td colspan="5" style="text-align:center;">Sem notas lançadas</td></tr>';

            return `
                <div class="accordion-turma" data-aluno="${escapar(aluno._id)}">
                    <button type="button" class="accordion-turma-header btn-filho" aria-expanded="${aberto}">
                        <span class="accordion-seta">${aberto ? '▼' : '▶'}</span>
                        <span class="accordion-turma-nome">${escapar(aluno.nome)}</span>
                        <span class="accordion-turma-info">
                            ${escapar(aluno.grauParentesco || '')}
                            · média ${aluno.mediaGeral ?? '—'}
                            · freq. ${aluno.frequencia != null ? `${aluno.frequencia}%` : '—'}
                            ${aluno.emRisco ? ' · em atenção' : ''}
                        </span>
                    </button>
                    <div class="accordion-turma-corpo" style="display:${aberto ? 'block' : 'none'};">
                        <div class="grid-paineis" style="margin:12px 0;">
                            <a class="card card-clicavel" href="diario-aluno.html?aluno=${encodeURIComponent(aluno._id)}" title="Abrir diário de frequência">
                                <h3>Frequência</h3>
                                <div class="card-valor">${aluno.frequencia != null ? `${aluno.frequencia}%` : '—'}</div>
                                <p class="card-dica">Clique para ver o diário</p>
                            </a>
                            <div class="card"><h3>Média geral</h3><div class="card-valor">${aluno.mediaGeral ?? '—'}</div></div>
                        </div>
                        <table class="tabela">
                            <thead>
                                <tr>
                                    <th>Disciplina</th>
                                    <th>Período</th>
                                    <th>Média</th>
                                    <th>Frequência</th>
                                    <th>Situação</th>
                                </tr>
                            </thead>
                            <tbody>${linhas}</tbody>
                        </table>
                        <p style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
                            <a class="btn btn-pequeno" href="boletim-academico.html?alunoId=${encodeURIComponent(aluno._id)}">Ver boletim</a>
                            <a class="btn btn-pequeno" href="ficha-individual.html?alunoId=${encodeURIComponent(aluno._id)}">Ficha individual</a>
                            <a class="btn btn-pequeno" href="historico-escolar.html?alunoId=${encodeURIComponent(aluno._id)}">Histórico</a>
                        </p>
                    </div>
                </div>`;
        }).join('');

        container.querySelectorAll('.btn-filho').forEach(btn => {
            btn.addEventListener('click', () => {
                const bloco = btn.closest('.accordion-turma');
                const corpo = bloco.querySelector('.accordion-turma-corpo');
                const seta = btn.querySelector('.accordion-seta');
                const aberto = corpo.style.display !== 'none';
                corpo.style.display = aberto ? 'none' : 'block';
                btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
                if (seta) seta.textContent = aberto ? '▶' : '▼';
            });
        });
    } catch (erro) {
        console.error(erro);
        container.innerHTML = `<p class="alerta alerta-erro">${escapar(erro.message)}</p>`;
    }
}

async function fazerLogout() {
    try { await api.logout(); } catch (_) { /* ignore */ }
    window.location.href = 'index.html';
}
