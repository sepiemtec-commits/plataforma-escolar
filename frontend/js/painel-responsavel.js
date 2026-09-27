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
        const meuId = String(usuario?._id || usuario?.id || '');

        box.innerHTML = lista.map((r) => {
            const data = r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '—';
            const eu = (r.participantes || []).find((p) => idParticipanteFront(p) === meuId);
            const presente = Boolean(eu?.presente);
            return `<article class="htpc-card-resp" style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff;">
                <strong>${escapar(r.titulo)}</strong>
                <p style="font-size:13px;color:#566573;margin:6px 0;">${escapar(data)} · ${escapar(r.turno || '')} · ${escapar(r.status)} · ${escapar(labelPublico[r.publico] || '')}</p>
                <p style="white-space:pre-wrap;font-size:14px;">${escapar(r.pauta || '')}</p>
                <button type="button"
                    class="btn btn-pequeno ${presente ? 'btn-erro' : 'btn-sucesso'}"
                    data-reuniao-eu="${escapar(r._id)}"
                    data-presente="${presente ? '0' : '1'}"
                    aria-pressed="${presente ? 'true' : 'false'}">
                    ${presente ? 'Presença confirmada' : 'Marcar minha presença'}
                </button>
                <span class="htpc-feedback" style="display:block;margin-top:8px;font-size:13px;color:#7a8794;"></span>
            </article>`;
        }).join('');

        box.querySelectorAll('[data-reuniao-eu]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const artigo = btn.closest('.htpc-card-resp');
                const feedback = artigo?.querySelector('.htpc-feedback');
                const querPresente = btn.getAttribute('data-presente') === '1';
                btn.disabled = true;
                if (feedback) feedback.textContent = 'Salvando...';
                try {
                    await api.presencaHtpc(btn.getAttribute('data-reuniao-eu'), {
                        presente: querPresente
                    });
                    // Atualiza o botão na hora (vermelho = confirmado)
                    if (querPresente) {
                        btn.classList.remove('btn-sucesso');
                        btn.classList.add('btn-erro');
                        btn.textContent = 'Presença confirmada';
                        btn.setAttribute('data-presente', '0');
                        btn.setAttribute('aria-pressed', 'true');
                        if (feedback) {
                            feedback.style.color = '#b33a3a';
                            feedback.textContent = 'Presença confirmada.';
                        }
                    } else {
                        btn.classList.remove('btn-erro');
                        btn.classList.add('btn-sucesso');
                        btn.textContent = 'Marcar minha presença';
                        btn.setAttribute('data-presente', '1');
                        btn.setAttribute('aria-pressed', 'false');
                        if (feedback) {
                            feedback.style.color = '#7a8794';
                            feedback.textContent = 'Presença desmarcada.';
                        }
                    }
                } catch (e) {
                    if (feedback) {
                        feedback.style.color = '#c62828';
                        feedback.textContent = e.message || 'Erro ao registrar presença';
                    } else {
                        alert(e.message || 'Erro ao registrar presença');
                    }
                } finally {
                    btn.disabled = false;
                }
            });
        });
    } catch (e) {
        box.innerHTML = `<p class="alerta alerta-erro">${escapar(e.message)}</p>`;
    }
}

function idParticipanteFront(p) {
    const u = p?.usuario_id;
    if (u && typeof u === 'object') return String(u._id || u.id || '');
    if (u) return String(u);
    const pr = p?.professor_id;
    if (pr && typeof pr === 'object') return String(pr._id || pr.id || '');
    if (pr) return String(pr);
    return '';
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

function nivelPorMedia(media) {
    if (media == null || Number.isNaN(Number(media))) return 'sem';
    const m = Number(media);
    if (m >= 8) return 'excelente';
    if (m >= 6.5) return 'bom';
    if (m >= 5) return 'alerta';
    return 'critico';
}

function classeFill(nivel) {
    return nivel === 'sem' ? 'alerta' : nivel;
}

/** Escala 0–10 → % para barra (com teto 100). */
function mediaParaPct(media) {
    if (media == null || Number.isNaN(Number(media))) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(media) / 10) * 100)));
}

function formatarMedia(media) {
    if (media == null || Number.isNaN(Number(media))) return '—';
    return Number(media).toFixed(1).replace('.', ',');
}

/** Agrega desempenho por disciplina (média dos períodos). */
function agregarPorDisciplina(desempenho) {
    const map = new Map();
    (desempenho || []).forEach((d) => {
        const key = d.disciplina || 'Geral';
        if (!map.has(key)) map.set(key, { disciplina: key, medias: [], freqs: [], situacoes: [] });
        const row = map.get(key);
        if (d.mediaGeral != null) row.medias.push(Number(d.mediaGeral));
        if (d.frequenciaPercentual != null) row.freqs.push(Number(d.frequenciaPercentual));
        if (d.situacao) row.situacoes.push(d.situacao);
    });
    return [...map.values()]
        .map((r) => ({
            disciplina: r.disciplina,
            media: r.medias.length
                ? r.medias.reduce((a, b) => a + b, 0) / r.medias.length
                : null,
            frequencia: r.freqs.length
                ? r.freqs.reduce((a, b) => a + b, 0) / r.freqs.length
                : null
        }))
        .sort((a, b) => (b.media ?? -1) - (a.media ?? -1));
}

/** Média geral por período (para tendência). */
function tendenciaPorPeriodo(desempenho) {
    const map = new Map();
    (desempenho || []).forEach((d) => {
        const p = d.periodo || '—';
        if (!map.has(p)) map.set(p, []);
        if (d.mediaGeral != null) map.get(p).push(Number(d.mediaGeral));
    });
    return [...map.entries()]
        .map(([periodo, vals]) => ({
            periodo,
            media: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }))
        .filter((x) => x.media != null)
        .slice(-8);
}

function contarNiveis(porDisc) {
    const c = { excelente: 0, bom: 0, alerta: 0, critico: 0, sem: 0 };
    porDisc.forEach((d) => {
        c[nivelPorMedia(d.media)] += 1;
    });
    return c;
}

function svgDonut(contagem) {
    const total = Object.values(contagem).reduce((a, b) => a + b, 0) || 1;
    const cores = {
        excelente: '#2d6a4f',
        bom: '#5b8c5a',
        alerta: '#d97706',
        critico: '#c44536',
        sem: '#a8b0b8'
    };
    const ordem = ['excelente', 'bom', 'alerta', 'critico', 'sem'];
    const r = 54;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = ordem
        .filter((k) => contagem[k] > 0)
        .map((k) => {
            const frac = contagem[k] / total;
            const len = frac * c;
            const dash = `${len} ${c - len}`;
            const el = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${cores[k]}" stroke-width="18"
                stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
                transform="rotate(-90 80 80)" />`;
            offset += len;
            return el;
        })
        .join('');

    const legendLabels = {
        excelente: 'Excelente (≥8)',
        bom: 'Bom',
        alerta: 'Atenção',
        critico: 'Crítico',
        sem: 'Sem nota'
    };
    const legend = ordem
        .filter((k) => contagem[k] > 0)
        .map(
            (k) =>
                `<li><span class="resp-kpi-dot ${k}"></span>${legendLabels[k]}: ${contagem[k]}</li>`
        )
        .join('');

    return `
        <div class="resp-kpi-donut-wrap">
            <svg class="resp-kpi-donut" viewBox="0 0 160 160" aria-hidden="true">
                <circle cx="80" cy="80" r="54" fill="none" stroke="#e8ecef" stroke-width="18" />
                ${arcs}
                <text x="80" y="76" text-anchor="middle" font-size="13" fill="#7a8794">Disciplinas</text>
                <text x="80" y="96" text-anchor="middle" font-size="22" font-weight="700" fill="#2f3a45">${total}</text>
            </svg>
            <ul class="resp-kpi-donut-legend">${legend}</ul>
        </div>`;
}

function renderDashboardAluno(aluno) {
    const desempenho = aluno.desempenho || [];
    const porDisc = agregarPorDisciplina(desempenho);
    const tendencia = tendenciaPorPeriodo(desempenho);
    const contagem = contarNiveis(porDisc);
    const media = aluno.mediaGeral;
    const freq = aluno.frequencia;
    const nivelGeral = nivelPorMedia(media);
    const classeRisco = aluno.emRisco ? 'risco' : nivelGeral === 'excelente' || nivelGeral === 'bom' ? 'ok' : nivelGeral === 'alerta' ? 'atencao' : '';

    const barras =
        porDisc.length === 0
            ? '<p class="resp-kpi-vazio">Ainda não há médias por disciplina. Quando o professor lançar notas, elas aparecem aqui.</p>'
            : `<div class="resp-kpi-barras">${porDisc
                  .map((d) => {
                      const nivel = nivelPorMedia(d.media);
                      const pct = mediaParaPct(d.media);
                      return `<div class="resp-kpi-barra-item">
                        <span class="nome" title="${escapar(d.disciplina)}">${escapar(d.disciplina)}</span>
                        <div class="resp-kpi-track"><div class="resp-kpi-fill ${classeFill(nivel)}" style="width:${pct}%"></div></div>
                        <span class="pct">${formatarMedia(d.media)}</span>
                      </div>`;
                  })
                  .join('')}</div>`;

    const maxT = Math.max(...tendencia.map((t) => t.media || 0), 10);
    const tendenciaHtml =
        tendencia.length < 2
            ? '<p class="resp-kpi-vazio">Tendência aparece quando houver mais de um período com notas.</p>'
            : `<div class="resp-kpi-tendencia" aria-label="Tendência por período">${tendencia
                  .map((t) => {
                      const h = Math.max(8, Math.round((t.media / maxT) * 64));
                      const nivel = nivelPorMedia(t.media);
                      const cor =
                          nivel === 'excelente'
                              ? '#2d6a4f'
                              : nivel === 'bom'
                                ? '#5b8c5a'
                                : nivel === 'alerta'
                                  ? '#d97706'
                                  : '#c44536';
                      return `<div class="col">
                        <div class="barra-t" style="height:${h}px;background:${cor}" title="${escapar(t.periodo)}: ${formatarMedia(t.media)}"></div>
                        <span class="periodo-t">${escapar(t.periodo)}</span>
                      </div>`;
                  })
                  .join('')}</div>`;

    const freqPct = freq != null ? Math.max(0, Math.min(100, Number(freq))) : 0;
    const freqNivel = freq == null ? 'sem' : freq >= 90 ? 'excelente' : freq >= 75 ? 'bom' : freq >= 60 ? 'alerta' : 'critico';

    return `
        <div class="resp-kpi">
            <div class="resp-kpi-card">
                <h4>Visão geral</h4>
                <div class="resp-kpi-metricas">
                    <div class="resp-kpi-metrica ${classeRisco}">
                        <span class="label">Média geral</span>
                        <span class="valor">${formatarMedia(media)}</span>
                    </div>
                    <div class="resp-kpi-metrica ${freqNivel === 'critico' || freqNivel === 'alerta' ? 'atencao' : freqNivel === 'excelente' || freqNivel === 'bom' ? 'ok' : ''}">
                        <span class="label">Frequência</span>
                        <span class="valor">${freq != null ? `${String(freq).replace('.', ',')}%` : '—'}</span>
                    </div>
                    <div class="resp-kpi-metrica ${aluno.emRisco ? 'risco' : 'ok'}">
                        <span class="label">Situação</span>
                        <span class="valor" style="font-size:1rem;">${aluno.emRisco ? 'Atenção' : 'Em dia'}</span>
                    </div>
                </div>
                <h4>Notas por disciplina</h4>
                ${barras}
                <div class="resp-kpi-freq">
                    <h4 style="margin-top:16px;">Frequência nas aulas</h4>
                    <div class="resp-kpi-track">
                        <div class="resp-kpi-fill ${classeFill(freqNivel === 'sem' ? 'alerta' : freqNivel)}" style="width:${freqPct}%"></div>
                    </div>
                    <p style="font-size:12px;color:#7a8794;margin:6px 0 0;">
                        Faltas registradas: ${aluno.faltas != null ? aluno.faltas : '—'}
                        · Meta sugerida: ≥ 75%
                    </p>
                </div>
            </div>
            <div class="resp-kpi-card">
                <h4>Distribuição do desempenho</h4>
                ${porDisc.length ? svgDonut(contagem) : '<p class="resp-kpi-vazio">Sem disciplinas para o gráfico.</p>'}
                <h4 style="margin-top:8px;">Evolução por período</h4>
                ${tendenciaHtml}
            </div>
        </div>`;
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
                        <td>${d.mediaGeral != null ? formatarMedia(d.mediaGeral) : '—'}</td>
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
                            · média ${formatarMedia(aluno.mediaGeral)}
                            · freq. ${aluno.frequencia != null ? `${aluno.frequencia}%` : '—'}
                            ${aluno.emRisco ? ' · em atenção' : ''}
                        </span>
                    </button>
                    <div class="accordion-turma-corpo" style="display:${aberto ? 'block' : 'none'};">
                        ${renderDashboardAluno(aluno)}
                        <div class="grid-paineis" style="margin:12px 0;">
                            <a class="card card-clicavel" href="diario-aluno.html?aluno=${encodeURIComponent(aluno._id)}" title="Abrir diário de frequência">
                                <h3>Diário de frequência</h3>
                                <div class="card-valor">${aluno.frequencia != null ? `${aluno.frequencia}%` : '—'}</div>
                                <p class="card-dica">Clique para detalhes</p>
                            </a>
                            <div class="card"><h3>Média geral</h3><div class="card-valor">${formatarMedia(aluno.mediaGeral)}</div></div>
                            <div class="card"><h3>Faltas</h3><div class="card-valor">${aluno.faltas != null ? aluno.faltas : '—'}</div></div>
                        </div>
                        <h3 style="margin:16px 0 8px;font-size:1rem;">Detalhe por período</h3>
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
