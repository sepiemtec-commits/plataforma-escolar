// frontend/js/painel-aluno.js

let usuario = null;
let cachePainelAluno = null;
let provaAtualId = null;
let provaItens = [];
let provaTimerId = null;
let provaExpiraEm = null;

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    document.getElementById('periodoFiltro')?.addEventListener('change', () => carregarNotas());
    document.getElementById('btnLogoutMenu')?.addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader')?.addEventListener('click', fazerLogout);
    document.getElementById('btnVoltarListaProvas')?.addEventListener('click', () => {
        pararTimerProva();
        mostrarListaProvas();
        carregarProvasOnline();
    });
    document.getElementById('btnEnviarProva')?.addEventListener('click', () => enviarProvaAtual(false));

    if (window.VehoPush) {
        VehoPush.montarBotaoPush(document.getElementById('vehoPushContainer'), {
            titulo: 'Receber avisos da escola neste aparelho'
        });
    }

    await carregarPainelCompleto();
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
    usuario = await exigirPerfil('aluno');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = usuario.nome;
    return true;
}

async function obterPainelAluno(forcar) {
    if (!cachePainelAluno || forcar) {
        const resposta = await api.carregarPainelAluno();
        cachePainelAluno = resposta.painel || {};
    }
    return cachePainelAluno;
}

async function carregarPainelCompleto() {
    try {
        await obterPainelAluno(true);
        await carregarBoletim();
        await carregarNotas();
    } catch (erro) {
        console.error(erro);
        const tabela = document.getElementById('tabelaBoletim');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="5" class="alerta alerta-erro">${escaparHtml(erro.message)}</td></tr>`;
        }
    }
}

async function carregarBoletim() {
    try {
        const painel = await obterPainelAluno();
        const boletim = painel.boletim || [];

        document.getElementById('frequencia').textContent = `${painel.frequencia ?? 0}%`;

        const situacoes = boletim.map(b => b.situacao).filter(Boolean);
        let situacaoGeral = '—';
        if (situacoes.includes('reprovado')) situacaoGeral = 'Reprovado';
        else if (situacoes.includes('recuperacao')) situacaoGeral = 'Recuperação';
        else if (situacoes.includes('excelente')) situacaoGeral = 'Excelente';
        else if (situacoes.includes('aprovado')) situacaoGeral = 'Aprovado';
        document.getElementById('situacao').textContent = situacaoGeral;

        const tabelaBoletim = document.getElementById('tabelaBoletim');
        if (!boletim.length) {
            tabelaBoletim.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum desempenho lançado ainda</td></tr>';
            return;
        }

        tabelaBoletim.innerHTML = boletim.map(item => {
            const statusClass = ['aprovado', 'excelente'].includes(item.situacao)
                ? 'status-presente'
                : 'status-recuperacao';
            return `
                <tr>
                    <td>${escaparHtml(item.disciplina || '—')}</td>
                    <td>${escaparHtml(item.periodo || '—')}</td>
                    <td><strong>${escaparHtml(item.mediaGeral ?? '—')}</strong></td>
                    <td>${escaparHtml(item.frequenciaPercentual ?? 0)}%</td>
                    <td><span class="status ${statusClass}">${escaparHtml(item.situacao || '—')}</span></td>
                </tr>`;
        }).join('');
    } catch (erro) {
        console.error('Erro ao carregar boletim:', erro);
    }
}

async function carregarNotas() {
    try {
        const painel = await obterPainelAluno();
        const periodo = document.getElementById('periodoFiltro')?.value || '';
        const tabelaNotas = document.getElementById('tabelaNotas');

        let notas = painel.avaliacoes || [];
        if (periodo) notas = notas.filter(n => n.periodo === periodo);

        if (!notas.length) {
            tabelaNotas.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma nota registrada</td></tr>';
            return;
        }

        tabelaNotas.innerHTML = notas.map(nota => `
            <tr>
                <td>${escaparHtml(nota.disciplina || '—')}</td>
                <td>${escaparHtml(nota.tipo || '—')}</td>
                <td>${escaparHtml(nota.periodo || '—')}</td>
                <td><strong>${escaparHtml(nota.nota ?? '—')}</strong></td>
                <td>${escaparHtml(nota.dataAplicacao ? new Date(nota.dataAplicacao).toLocaleDateString('pt-BR') : '—')}</td>
            </tr>
        `).join('');
    } catch (erro) {
        console.error('Erro ao carregar notas:', erro);
    }
}

function rotuloSituacaoProva(s) {
    const map = {
        nao_iniciada: 'Não iniciada',
        em_andamento: 'Em andamento',
        enviada: 'Enviada',
        expirada: 'Tempo esgotado'
    };
    return map[s] || s || '—';
}

function mostrarListaProvas() {
    document.getElementById('listaProvasAluno').style.display = 'block';
    document.getElementById('areaFazerProva').style.display = 'none';
    provaAtualId = null;
    provaItens = [];
}

function mostrarAreaProva() {
    document.getElementById('listaProvasAluno').style.display = 'none';
    document.getElementById('areaFazerProva').style.display = 'block';
}

async function carregarProvasOnline() {
    const box = document.getElementById('boxListaProvas');
    if (!box) return;
    box.innerHTML = '<p style="color:#7f8c8d;">Carregando...</p>';
    mostrarListaProvas();
    try {
        const res = await api.minhasProvasOnline();
        const provas = res.provas || [];
        if (!provas.length) {
            box.innerHTML = '<p style="color:#7f8c8d;">Nenhuma prova online disponível no momento.</p>';
            return;
        }
        box.innerHTML = provas.map((p) => {
            const data = p.dataInicio ? new Date(p.dataInicio).toLocaleDateString('pt-BR') : '—';
            const resultado =
                p.meuPercentual != null ? ` · resultado: ${p.meuPercentual}%` : '';
            const podeFazer =
                p.aberto &&
                !['enviada', 'expirada'].includes(p.minhaSituacao);
            const btnLabel =
                p.minhaSituacao === 'em_andamento' ? 'Continuar' : 'Iniciar';
            return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:10px;background:#fff;">
                <strong>${escaparHtml(p.titulo)}</strong>
                <p style="font-size:13px;color:#566573;margin:6px 0 10px;">
                    ${escaparHtml(data)} · ${escaparHtml(p.fonte || '')} · ${escaparHtml(p.area || '')}
                    · ${p.totalItens || 0} questões · ${p.duracaoMinutos || 0} min
                    · ${escaparHtml(rotuloSituacaoProva(p.minhaSituacao))}${escaparHtml(resultado)}
                    ${p.aberto ? '' : ' · <em>fora do período</em>'}
                </p>
                ${podeFazer
                    ? `<button type="button" class="btn btn-pequeno btn-primario" data-iniciar-prova="${escaparHtml(p._id)}">${btnLabel}</button>`
                    : ''}
                ${['enviada', 'expirada'].includes(p.minhaSituacao)
                    ? `<button type="button" class="btn btn-pequeno" data-ver-resultado="${escaparHtml(p._id)}">Ver resultado</button>`
                    : ''}
            </article>`;
        }).join('');

        box.querySelectorAll('[data-iniciar-prova]').forEach((btn) => {
            btn.addEventListener('click', () => iniciarProva(btn.getAttribute('data-iniciar-prova')));
        });
        box.querySelectorAll('[data-ver-resultado]').forEach((btn) => {
            btn.addEventListener('click', () => verResultadoProva(btn.getAttribute('data-ver-resultado')));
        });
    } catch (e) {
        box.innerHTML = `<p style="color:#c62828;">${escaparHtml(e.message)}</p>`;
    }
}

function formatarTempoRestante(ms) {
    if (ms == null) return 'Sem limite';
    if (ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function pararTimerProva() {
    if (provaTimerId) {
        clearInterval(provaTimerId);
        provaTimerId = null;
    }
    provaExpiraEm = null;
}

function atualizarTimerUI() {
    const el = document.getElementById('provaTimer');
    if (!el) return;
    if (!provaExpiraEm) {
        el.textContent = 'Sem limite';
        return;
    }
    const rest = provaExpiraEm - Date.now();
    el.textContent = formatarTempoRestante(rest);
    if (rest <= 0) {
        pararTimerProva();
        el.textContent = '00:00';
        enviarProvaAtual(true);
    }
}

function iniciarTimerProva(expiraEm) {
    pararTimerProva();
    if (!expiraEm) {
        document.getElementById('provaTimer').textContent = 'Sem limite';
        return;
    }
    provaExpiraEm = new Date(expiraEm).getTime();
    atualizarTimerUI();
    provaTimerId = setInterval(atualizarTimerUI, 1000);
}

function renderQuestoes(itens, respostasSalvas = []) {
    const box = document.getElementById('provaQuestoes');
    const mapa = {};
    (respostasSalvas || []).forEach((r) => {
        mapa[String(r.item_id)] = r.alternativa;
    });
    box.innerHTML = (itens || []).map((it, idx) => {
        const id = String(it._id);
        const img = it.imagemUrl
            ? `<img src="${escaparHtml(it.imagemUrl)}" alt="" style="max-width:100%;max-height:280px;margin:10px 0;border-radius:6px;">`
            : '';
        const alts = (it.alternativas || []).map((a) => {
            const checked = mapa[id] === a.letra ? 'checked' : '';
            return `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;cursor:pointer;">
                <input type="radio" name="q_${escaparHtml(id)}" value="${escaparHtml(a.letra)}" ${checked}>
                <span><strong>${escaparHtml(a.letra)})</strong> ${escaparHtml(a.texto)}</span>
            </label>`;
        }).join('');
        return `<article style="border:1px solid #d0d7de;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff;">
            <p style="margin:0 0 8px;"><strong>${idx + 1}.</strong> ${escaparHtml(it.enunciado)}</p>
            ${img}
            ${alts}
        </article>`;
    }).join('');
}

async function iniciarProva(id) {
    try {
        const res = await api.iniciarProvaOnline(id);
        provaAtualId = id;
        provaItens = res.itens || [];
        document.getElementById('provaTitulo').textContent = res.titulo || 'Prova';
        document.getElementById('provaResultado').innerHTML = '';
        document.getElementById('btnEnviarProva').disabled = false;
        renderQuestoes(provaItens, res.respostasSalvas || []);
        iniciarTimerProva(res.expiraEm);
        mostrarAreaProva();
    } catch (e) {
        alert(e.message || 'Não foi possível iniciar a prova');
    }
}

function coletarRespostasProva() {
    return provaItens.map((it) => {
        const sel = document.querySelector(`input[name="q_${it._id}"]:checked`);
        return {
            item_id: it._id,
            alternativa: sel ? sel.value : ''
        };
    });
}

async function enviarProvaAtual(auto = false) {
    if (!provaAtualId) return;
    if (!auto) {
        const ok = confirm('Enviar a prova agora? Não será possível alterar depois.');
        if (!ok) return;
    }
    const btn = document.getElementById('btnEnviarProva');
    if (btn) btn.disabled = true;
    try {
        const res = await api.enviarProvaOnline(provaAtualId, coletarRespostasProva());
        pararTimerProva();
        const c = res.correcao;
        const box = document.getElementById('provaResultado');
        if (c) {
            box.innerHTML = `<div class="alerta alerta-sucesso" style="padding:12px;border-radius:8px;background:#e8f5e9;">
                ${escaparHtml(res.mensagem || 'Enviado')}: <strong>${c.acertos}/${c.total}</strong> (${c.percentual}%)
            </div>`;
        } else {
            box.innerHTML = `<div class="alerta" style="padding:12px;">${escaparHtml(res.mensagem || 'Prova enviada. Resultado será liberado pelo professor.')}</div>`;
        }
    } catch (e) {
        if (btn) btn.disabled = false;
        alert(e.message || 'Erro ao enviar');
    }
}

async function verResultadoProva(id) {
    try {
        const res = await api.meuResultadoProva(id);
        if (!res.liberado) {
            alert(res.mensagem || 'Resultado ainda não liberado');
            return;
        }
        alert(`${res.titulo}\n\nAcertos: ${res.acertos}/${res.total}\nPercentual: ${res.percentual}%`);
    } catch (e) {
        alert(e.message);
    }
}

function carregarSecao(secao, linkAtivo) {
    document.querySelectorAll('main section').forEach(s => {
        s.style.display = 'none';
    });
    const el = document.getElementById(secao);
    if (el) el.style.display = 'block';

    document.querySelectorAll('.menu a').forEach(a => a.classList.remove('ativo'));
    if (linkAtivo) linkAtivo.classList.add('ativo');

    if (secao === 'provas') carregarProvasOnline();
    if (secao !== 'provas') pararTimerProva();
}

async function fazerLogout() {
    try {
        await api.logout();
    } catch (_) { /* ignore */ }
    window.location.href = 'index.html';
}

window.carregarSecao = carregarSecao;
window.carregarNotas = carregarNotas;
window.fazerLogout = fazerLogout;
