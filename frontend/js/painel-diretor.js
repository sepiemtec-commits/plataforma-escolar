// frontend/js/painel-diretor.js

let usuario = null;
let ultimoRelatorioDownload = null;

document.addEventListener('DOMContentLoaded', async () => {
    configurarNavegacao();

    const usuarioOk = await verificarAutenticacao();
    if (!usuarioOk) return;

    carregarSecao('dashboard');

    document.getElementById('btnLogoutMenu').addEventListener('click', (e) => {
        e.preventDefault();
        fazerLogout();
    });
    document.getElementById('btnLogoutHeader').addEventListener('click', fazerLogout);
    document.getElementById('btnGerarRelatorio').addEventListener('click', gerarRelatorio);
    document.getElementById('btnDownloadRelatorio').addEventListener('click', baixarRelatorio);
    document.getElementById('btnSalvarConfig').addEventListener('click', salvarConfiguracao);
    document.getElementById('btnPortalAssinatura')?.addEventListener('click', abrirPortalAssinatura);
    document.getElementById('btnRecuperacaoDash').addEventListener('click', alternarRecuperacaoDash);
    document.getElementById('formCadastroUsuario')?.addEventListener('submit', cadastrarUsuarioDiretor);
    document.getElementById('cadTipo')?.addEventListener('change', atualizarCamposCadastroUsuario);

    await carregarPainel();
});

function alternarRecuperacaoDash() {
    const btn = document.getElementById('btnRecuperacaoDash');
    const corpo = document.getElementById('corpoRecuperacao');
    const seta = document.getElementById('setaRecuperacao');
    const aberto = corpo.style.display !== 'none';

    corpo.style.display = aberto ? 'none' : 'block';
    btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
    if (seta) seta.textContent = aberto ? '▶' : '▼';
}

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
    usuario = await exigirPerfil('diretor');
    if (!usuario) return false;
    document.getElementById('nomeUsuario').textContent = `${usuario.nome} (${usuario.tipo})`;
    return true;
}

async function carregarPainel() {
    try {
        const painel = await api.carregarPainelDiretor();

        document.getElementById('totalAlunos').textContent = painel.painel.estatisticas.totalAlunos;
        document.getElementById('totalProfessores').textContent = painel.painel.estatisticas.totalProfessores;
        document.getElementById('totalTurmas').textContent = painel.painel.estatisticas.totalTurmas;
        document.getElementById('frequenciaMedia').textContent = painel.painel.estatisticas.frequenciaMedia + '%';

        if (painel.painel.configuracao) {
            preencherConfiguracao(painel.painel.configuracao);
        }

        const tabelaRecuperacao = document.getElementById('tabelaRecuperacao');
        const infoRecuperacao = document.getElementById('infoRecuperacao');
        const detalhes = painel.painel.alertas?.detalhes || [];
        const totalAlertas = painel.painel.alertas?.alunosRecuperacao ?? detalhes.length;

        infoRecuperacao.textContent = `${totalAlertas} registro(s)`;
        tabelaRecuperacao.innerHTML = '';

        if (!detalhes.length) {
            tabelaRecuperacao.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #27ae60;">Nenhum aluno em recuperação</td></tr>';
        } else {
            detalhes.forEach(aluno => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escaparHtml(aluno.aluno_id?.nome || 'N/A')}</td>
                    <td>—</td>
                    <td>${escaparHtml(aluno.disciplina || '—')}</td>
                    <td>${aluno.mediaGeral != null ? escaparHtml(aluno.mediaGeral) : '—'}</td>
                    <td><span class="status status-recuperacao">${escaparHtml(aluno.situacao)}</span></td>
                `;
                tabelaRecuperacao.appendChild(tr);
            });
        }

    } catch (erro) {
        console.error('Erro ao carregar painel:', erro);
    }
}

function preencherConfiguracao(config) {
    const tipoAvaliacao = document.getElementById('tipoAvaliacao');
    const alertasWhatsapp = document.getElementById('alertasWhatsapp');
    const alertasSms = document.getElementById('alertasSms');
    const alertasPush = document.getElementById('alertasPush');

    if (tipoAvaliacao && config.tipoAvaliacao) {
        tipoAvaliacao.value = config.tipoAvaliacao;
    }
    if (alertasWhatsapp) {
        alertasWhatsapp.checked = config.alertasWhatsapp !== false;
    }
    if (alertasSms) {
        alertasSms.checked = Boolean(config.alertasSms);
    }
    if (alertasPush) {
        alertasPush.checked = Boolean(config.alertasPush);
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

    if (secao === 'usuarios') {
        atualizarCamposCadastroUsuario();
        carregarListaUsuarios();
    }
}

const LABELS_TIPO_USUARIO = {
    aluno: 'Aluno',
    professor: 'Professor',
    coordenador: 'Coordenador',
    secretaria: 'Secretaria',
    diretor: 'Diretor',
    responsavel: 'Responsável',
    admin: 'Administrador',
    servente: 'Servente',
    porteiro: 'Porteiro',
    estagiario: 'Estagiário(a)',
    orientador_pedagogico: 'Orientador Pedagógico',
    agente_inclusao: 'Agente de Inclusão',
    bibliotecaria: 'Bibliotecária',
    copeira: 'Copeira',
    auxiliar_coordenacao: 'Auxiliar de Coordenação'
};

function labelTipoUsuario(tipo) {
    return LABELS_TIPO_USUARIO[tipo] || tipo || '—';
}

function montarTabelaUsuarios(lista) {
    if (!lista.length) {
        return '<p class="texto-muted" style="padding:12px 4px;">Nenhum registro neste grupo.</p>';
    }

    return `
        <div class="tabela-usuarios-wrap">
            <table class="tabela">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Tipo</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(u => `
                        <tr>
                            <td>${escaparHtml(u.nome)}</td>
                            <td>${escaparHtml(u.email)}</td>
                            <td>${escaparHtml(labelTipoUsuario(u.tipo))}</td>
                            <td>${u.ativo ? 'Ativo' : 'Inativo'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

function montarAbaUsuario({ id, titulo, total, conteudo, aberto }) {
    return `
        <div class="accordion-turma accordion-usuarios" data-aba="${id}">
            <button type="button" class="accordion-turma-header btn-aba-usuario" aria-expanded="${aberto ? 'true' : 'false'}">
                <span class="accordion-seta">${aberto ? '▼' : '▶'}</span>
                <span class="accordion-turma-nome">${escaparHtml(titulo)}</span>
                <span class="accordion-turma-info">${total} registro(s)</span>
            </button>
            <div class="accordion-turma-corpo" style="display:${aberto ? 'block' : 'none'};">
                ${conteudo}
            </div>
        </div>`;
}

function configurarAbasUsuarios(container) {
    container.querySelectorAll('.btn-aba-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
            const painel = btn.closest('.accordion-usuarios');
            const corpo = painel.querySelector('.accordion-turma-corpo');
            const seta = btn.querySelector('.accordion-seta');
            const aberto = corpo.style.display !== 'none';

            corpo.style.display = aberto ? 'none' : 'block';
            btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
            if (seta) seta.textContent = aberto ? '▶' : '▼';
        });
    });
}

function mostrarMsgCadastro(texto, tipo) {
    const el = document.getElementById('msgCadastroUsuario');
    if (!el) return;
    el.style.display = 'block';
    el.className = `alerta alerta-${tipo === 'erro' ? 'erro' : 'sucesso'}`;
    el.textContent = texto;
}

async function atualizarCamposCadastroUsuario() {
    const tipo = document.getElementById('cadTipo')?.value;
    const grupo = document.getElementById('grupoCadDisciplinas');
    const lista = document.getElementById('cadDisciplinasLista');
    if (!grupo || !lista) return;

    if (tipo !== 'professor') {
        grupo.style.display = 'none';
        lista.innerHTML = '';
        return;
    }

    grupo.style.display = 'block';
    lista.innerHTML = '<p class="texto-muted">Carregando disciplinas...</p>';
    try {
        const res = await api.listarDisciplinas();
        const discs = (res.disciplinas || []).filter(d => d.ativo !== false);
        if (!discs.length) {
            lista.innerHTML = '<p class="texto-muted">Nenhuma disciplina configurada. Cadastre em Secretaria → Disciplinas.</p>';
            return;
        }
        lista.innerHTML = discs.map(d => `
            <label style="display:block;margin:4px 0;">
                <input type="checkbox" class="cad-disc-check" value="${escaparHtml(d.nome)}">
                ${escaparHtml(d.nome)}
            </label>
        `).join('');
    } catch (erro) {
        lista.innerHTML = `<p class="alerta alerta-erro">${escaparHtml(erro.message)}</p>`;
    }
}

function obterDisciplinasCadastro() {
    return [...document.querySelectorAll('.cad-disc-check:checked')].map(el => el.value);
}

async function cadastrarUsuarioDiretor(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSalvarUsuario');
    const msg = document.getElementById('msgCadastroUsuario');
    if (msg) msg.style.display = 'none';

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Salvando...';
        }

        const tipo = document.getElementById('cadTipo').value;
        const senha = document.getElementById('cadSenha').value.trim();
        const dados = {
            tipo,
            nome: document.getElementById('cadNome').value.trim(),
            email: document.getElementById('cadEmail').value.trim(),
            cpf: document.getElementById('cadCpf').value.trim(),
            whatsapp: document.getElementById('cadWhatsapp').value.trim(),
            telefone: document.getElementById('cadTelefone').value.trim() || undefined
        };
        if (senha) dados.senha = senha;

        if (tipo === 'professor') {
            dados.disciplinas = obterDisciplinasCadastro();
            if (!dados.disciplinas.length) {
                mostrarMsgCadastro('Selecione ao menos uma disciplina do professor.', 'erro');
                return;
            }
        }

        const res = await api.cadastrarUsuario(dados);
        const senhaIni = res.senhaInicial || senha || '—';
        const aviso = res.senhaGerada ? ' (temporária — anote agora)' : '';
        mostrarMsgCadastro(
            `Usuário cadastrado: ${res.usuario?.email || dados.email}. Senha: ${senhaIni}${aviso}`,
            'ok'
        );

        document.getElementById('formCadastroUsuario').reset();
        atualizarCamposCadastroUsuario();
        await carregarListaUsuarios();
    } catch (erro) {
        mostrarMsgCadastro(erro.message || 'Erro ao cadastrar', 'erro');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Cadastrar usuário';
        }
    }
}

async function carregarListaUsuarios() {
    const container = document.getElementById('listaUsuarios');
    container.innerHTML = '<p class="alerta alerta-info">Carregando usuários...</p>';

    try {
        const resposta = await api.listarUsuarios();
        const usuarios = resposta.usuarios || [];

        if (!usuarios.length) {
            container.innerHTML = '<p>Nenhum usuário encontrado.</p>';
            return;
        }

        const alunos = usuarios
            .filter(u => u.tipo === 'aluno')
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

        const funcionarios = usuarios
            .filter(u => u.tipo !== 'aluno' && u.tipo !== 'responsavel')
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

        container.innerHTML = `
            <div class="usuarios-abas">
                ${montarAbaUsuario({
                    id: 'alunos',
                    titulo: 'Alunos',
                    total: alunos.length,
                    conteudo: montarTabelaUsuarios(alunos),
                    aberto: true
                })}
                ${montarAbaUsuario({
                    id: 'funcionarios',
                    titulo: 'Funcionários',
                    total: funcionarios.length,
                    conteudo: montarTabelaUsuarios(funcionarios),
                    aberto: false
                })}
            </div>`;

        configurarAbasUsuarios(container);
    } catch (erro) {
        container.innerHTML = `<p class="alerta alerta-erro">${escaparHtml(erro.message)}</p>`;
    }
}

async function fazerLogout() {
    try {
        await api.logout();
        window.location.href = 'index.html';
    } catch (erro) {
        window.location.href = 'index.html';
    }
}

function formatarNumero(valor, sufixo = '') {
    if (valor == null || Number.isNaN(Number(valor))) return '—';
    return `${valor}${sufixo}`;
}

function slugArquivo(texto) {
    return String(texto || 'relatorio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .slice(0, 60);
}

function montarHtmlDownload(conteudoInterno, meta) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório — ${escaparHtml(meta.escola)} — ${escaparHtml(meta.periodo)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #2c3e50; margin: 24px; }
  h1, h2, h3 { margin: 0 0 8px; }
  .muted { color: #7f8c8d; font-size: 13px; margin-bottom: 20px; }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 24px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
  .card strong { display: block; font-size: 12px; color: #7f8c8d; }
  .card span { font-size: 22px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 28px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
  th { background: #f4f6f7; }
  h3 { margin-top: 8px; }
</style>
</head>
<body>
${conteudoInterno}
</body>
</html>`;
}

function baixarRelatorio() {
    if (!ultimoRelatorioDownload) {
        alert('Gere o relatório antes de baixar.');
        return;
    }

    const { htmlInterno, escola, periodo, anoLetivo } = ultimoRelatorioDownload;
    const html = montarHtmlDownload(htmlInterno, { escola, periodo });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const nome = `relatorio-diretor-${slugArquivo(periodo)}-${anoLetivo || new Date().getFullYear()}.html`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

async function gerarRelatorio() {
    const periodo = document.getElementById('periodoRelatorio').value;
    const container = document.getElementById('conteudoRelatorio');
    const btn = document.getElementById('btnGerarRelatorio');
    const btnDownload = document.getElementById('btnDownloadRelatorio');

    btn.disabled = true;
    btn.textContent = 'Gerando...';
    container.innerHTML = '<p class="alerta alerta-info">Gerando relatório...</p>';
    btnDownload.style.display = 'none';
    ultimoRelatorioDownload = null;

    try {
        const resposta = await api.gerarRelatorioDiretor(periodo);
        const r = resposta.relatorio;
        if (!r) throw new Error('Relatório vazio');

        const dataGeracao = new Date(r.geradoEm).toLocaleString('pt-BR');
        const sit = r.resumoSituacao || {};

        const htmlInterno = `
            <div class="relatorio-diretor-print">
                <div class="relatorio-cabecalho">
                    <h3>${escaparHtml(r.escola)}</h3>
                    <p><strong>Relatório Gerencial</strong> — ${escaparHtml(r.periodo)} · Ano letivo ${escaparHtml(r.anoLetivo)}</p>
                    <p class="texto-muted">Gerado em ${escaparHtml(dataGeracao)}</p>
                </div>

                <div class="grid-paineis" style="margin: 20px 0;">
                    <div class="card"><h3>Alunos</h3><div class="card-valor">${r.estatisticas.totalAlunos}</div></div>
                    <div class="card"><h3>Professores</h3><div class="card-valor">${r.estatisticas.totalProfessores}</div></div>
                    <div class="card"><h3>Turmas</h3><div class="card-valor">${r.estatisticas.totalTurmas}</div></div>
                    <div class="card"><h3>Média Geral</h3><div class="card-valor">${formatarNumero(r.estatisticas.mediaGeralEscola)}</div></div>
                    <div class="card"><h3>Frequência</h3><div class="card-valor">${formatarNumero(r.frequencia.frequenciaMedia, '%')}</div></div>
                </div>

                <h3>Frequência no período</h3>
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Lançamentos</th>
                            <th>Presentes</th>
                            <th>Faltas</th>
                            <th>Justificadas</th>
                            <th>Atrasos</th>
                            <th>Taxa</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${r.frequencia.totalLancamentos}</td>
                            <td>${r.frequencia.presentes}</td>
                            <td>${r.frequencia.faltas}</td>
                            <td>${r.frequencia.justificadas}</td>
                            <td>${r.frequencia.atrasos}</td>
                            <td>${formatarNumero(r.frequencia.frequenciaMedia, '%')}</td>
                        </tr>
                    </tbody>
                </table>

                <h3 style="margin-top:24px;">Desempenho acadêmico</h3>
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Excelente</th>
                            <th>Aprovado</th>
                            <th>Recuperação</th>
                            <th>Reprovado</th>
                            <th>Registros</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${sit.excelente || 0}</td>
                            <td>${sit.aprovado || 0}</td>
                            <td>${sit.recuperacao || 0}</td>
                            <td>${sit.reprovado || 0}</td>
                            <td>${r.estatisticas.registrosDesempenho}</td>
                        </tr>
                    </tbody>
                </table>

                <h3 style="margin-top:24px;">Por turma</h3>
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Turma</th>
                            <th>Série</th>
                            <th>Alunos</th>
                            <th>Média</th>
                            <th>Em risco</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(r.porTurma || []).length
                            ? r.porTurma.map(t => `
                                <tr>
                                    <td>${escaparHtml(t.turma)}</td>
                                    <td>${escaparHtml(t.serie)}</td>
                                    <td>${t.totalAlunos}</td>
                                    <td>${formatarNumero(t.mediaTurma)}</td>
                                    <td>${t.emRisco}</td>
                                </tr>`).join('')
                            : '<tr><td colspan="5" style="text-align:center;">Nenhuma turma cadastrada</td></tr>'}
                    </tbody>
                </table>

                <h3 style="margin-top:24px;">Alunos em recuperação / reprovação</h3>
                <table class="tabela">
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Disciplina</th>
                            <th>Período</th>
                            <th>Média</th>
                            <th>Situação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(r.alertas || []).length
                            ? r.alertas.map(a => `
                                <tr>
                                    <td>${escaparHtml(a.aluno)}</td>
                                    <td>${escaparHtml(a.turma)}</td>
                                    <td>${escaparHtml(a.disciplina)}</td>
                                    <td>${escaparHtml(a.periodo)}</td>
                                    <td>${formatarNumero(a.media)}</td>
                                    <td>${escaparHtml(a.situacao)}</td>
                                </tr>`).join('')
                            : '<tr><td colspan="6" style="text-align:center;color:#27ae60;">Nenhum aluno em recuperação neste período</td></tr>'}
                    </tbody>
                </table>
            </div>`;

        container.innerHTML = htmlInterno;
        ultimoRelatorioDownload = {
            htmlInterno,
            escola: r.escola,
            periodo: r.periodo,
            anoLetivo: r.anoLetivo
        };
        btnDownload.style.display = 'inline-block';
    } catch (erro) {
        console.error(erro);
        container.innerHTML = `<p class="alerta alerta-erro">${escaparHtml(erro.message || 'Erro ao gerar relatório')}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar Relatório';
    }
}

async function salvarConfiguracao() {
    try {
        await api.salvarConfiguracaoEscola({
            tipoAvaliacao: document.getElementById('tipoAvaliacao').value,
            alertasWhatsapp: document.getElementById('alertasWhatsapp').checked,
            alertasSms: document.getElementById('alertasSms')?.checked === true,
            alertasPush: document.getElementById('alertasPush')?.checked === true
        });
        alert('Configurações salvas com sucesso!');
    } catch (erro) {
        alert('Erro ao salvar: ' + erro.message);
    }
}

async function abrirPortalAssinatura() {
    try {
        const res = await api.requisicao('/assinatura/portal', { method: 'POST' });
        if (res.url) {
            window.location.href = res.url;
            return;
        }
        alert(res.mensagem || 'Portal indisponível');
    } catch (erro) {
        alert(erro.message || 'Não foi possível abrir o portal de assinatura');
    }
}

window.carregarSecao = carregarSecao;
window.fazerLogout = fazerLogout;
