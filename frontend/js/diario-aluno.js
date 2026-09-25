// frontend/js/diario-aluno.js — frequência individual (aluno / responsável)

var diarioAlunoUsuario = null;
var diarioAlunoId = null;
var diarioTurmaNome = '';
var diarioPresencasCache = [];
var diarioAnoLetivo = new Date().getFullYear();

var BIMESTRE_LABEL = {
    '1': '1º Bimestre',
    '2': '2º Bimestre',
    '3': '3º Bimestre',
    '4': '4º Bimestre',
    '': 'Todos os bimestres'
};

/** Mesmo calendário do backend (presenca.intervaloPeriodo). */
function diarioIntervaloBimestre(ano, num) {
    var a = Number(ano) || new Date().getFullYear();
    var mapa = {
        '1': { inicio: new Date(a, 1, 1), fim: new Date(a, 4, 1) },
        '2': { inicio: new Date(a, 4, 1), fim: new Date(a, 7, 1) },
        '3': { inicio: new Date(a, 7, 1), fim: new Date(a, 9, 1) },
        '4': { inicio: new Date(a, 9, 1), fim: new Date(a + 1, 0, 1) }
    };
    return mapa[String(num)] || null;
}

function diarioDiaLocal(valor) {
    var d = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diarioDataISO(valor) {
    var d = diarioDiaLocal(valor);
    if (!d) return null;
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function diarioEscapar(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function diarioIdRef(valor) {
    if (!valor) return '';
    if (typeof valor === 'object') return String(valor._id || valor.id || '');
    return String(valor);
}

function diarioFiltrarLista(bimestreNum, disciplina) {
    var alunoId = String(diarioAlunoId || '');
    var lista = diarioPresencasCache.filter(function (p) {
        return !alunoId || diarioIdRef(p.aluno_id) === alunoId || !p.aluno_id;
    });

    if (bimestreNum) {
        var faixa = diarioIntervaloBimestre(diarioAnoLetivo, bimestreNum);
        if (faixa) {
            lista = lista.filter(function (p) {
                var dia = diarioDiaLocal(p.data);
                return dia && dia >= faixa.inicio && dia < faixa.fim;
            });
        }
    }

    if (disciplina) {
        var alvo = String(disciplina).trim();
        lista = lista.filter(function (p) {
            return String(p.disciplina || '').trim() === alvo;
        });
    }

    return lista;
}

function diarioAtualizarResumo(lista) {
    var presentes = lista.filter(function (p) { return p.status === 'presente'; }).length;
    var faltas = lista.filter(function (p) { return p.status === 'falta'; }).length;
    var total = lista.filter(function (p) {
        return p.status === 'presente' || p.status === 'falta' || p.status === 'justificada' || p.status === 'atraso';
    }).length;
    var freq = total > 0 ? ((presentes / total) * 100).toFixed(1) : null;

    var elFreq = document.getElementById('resumoFrequencia');
    var elPres = document.getElementById('resumoPresentes');
    var elFalt = document.getElementById('resumoFaltas');
    if (elFreq) elFreq.textContent = freq != null ? freq + '%' : '—';
    if (elPres) elPres.textContent = String(presentes);
    if (elFalt) elFalt.textContent = String(faltas);
}

function diarioLabelStatus(status) {
    if (status === 'presente') return 'Presente';
    if (status === 'falta') return 'Falta';
    if (status === 'justificada') return 'Justificada';
    if (status === 'atraso') return 'Atraso';
    return status || '—';
}

function diarioClasseStatus(status) {
    if (status === 'presente') return 'status-presente';
    if (status === 'falta') return 'status-falta';
    return 'status-recuperacao';
}

function diarioContagemPorBimestre() {
    var cont = { '1': 0, '2': 0, '3': 0, '4': 0 };
    ['1', '2', '3', '4'].forEach(function (n) {
        cont[n] = diarioFiltrarLista(n, null).length;
    });
    return cont;
}

function diarioPreencherBimestres() {
    var sel = document.getElementById('filtroBimestreAluno');
    if (!sel) return;

    var cont = diarioContagemPorBimestre();
    var valorAtual = sel.value;

    sel.innerHTML = '';
    var optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos os bimestres';
    sel.appendChild(optTodos);

    ['1', '2', '3', '4'].forEach(function (n) {
        var opt = document.createElement('option');
        opt.value = n;
        opt.textContent = BIMESTRE_LABEL[n];
        sel.appendChild(opt);
    });

    if (valorAtual && sel.querySelector('option[value="' + valorAtual + '"]')) {
        sel.value = valorAtual;
    } else {
        var escolhido = '';
        ['2', '1', '3', '4'].some(function (n) {
            if (cont[n] > 0) {
                escolhido = n;
                return true;
            }
            return false;
        });
        sel.value = escolhido;
    }
}

function diarioPreencherDisciplinas() {
    var sel = document.getElementById('filtroDisciplinaAluno');
    if (!sel) return;

    var mapa = {};
    diarioPresencasCache.forEach(function (p) {
        var nome = String(p.disciplina || '').trim();
        if (nome) mapa[nome] = true;
    });

    var disciplinas = Object.keys(mapa).sort(function (a, b) {
        return a.localeCompare(b, 'pt-BR');
    });

    var valorAtual = sel.value;
    sel.innerHTML = '';

    var optTodas = document.createElement('option');
    optTodas.value = '';
    optTodas.textContent = 'Todas as disciplinas';
    sel.appendChild(optTodas);

    disciplinas.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        sel.appendChild(opt);
    });

    if (valorAtual && disciplinas.indexOf(valorAtual) !== -1) {
        sel.value = valorAtual;
    } else if (disciplinas.length) {
        sel.value = disciplinas[0];
    } else {
        sel.value = '';
    }
}

function renderizarDiarioAluno() {
    var container = document.getElementById('conteudoDiarioAluno');
    if (!container) return;

    var bimestre = (document.getElementById('filtroBimestreAluno') || {}).value || '';
    var disciplina = (document.getElementById('filtroDisciplinaAluno') || {}).value || '';

    var lista = diarioFiltrarLista(bimestre, disciplina);
    diarioAtualizarResumo(lista);

    var rotuloBim = BIMESTRE_LABEL[bimestre] || bimestre || 'Todos os bimestres';
    var rotuloDisc = disciplina || 'Todas as disciplinas';

    var cabecalho = '<p class="texto-muted" style="margin-bottom:12px;">' +
        (diarioTurmaNome ? 'Turma <strong>' + diarioEscapar(diarioTurmaNome) + '</strong> · ' : '') +
        diarioEscapar(rotuloDisc) + ' · ' + diarioEscapar(rotuloBim) +
        (lista.length ? ' · ' + lista.length + ' registro(s)' : '') +
        '</p>';

    if (!lista.length) {
        container.innerHTML = cabecalho +
            '<p style="text-align:center;color:#7f8c8d;padding:24px;">Nenhum lançamento neste filtro.</p>';
        return;
    }

    var ordenada = lista.slice().sort(function (a, b) {
        var da = diarioDataISO(a.data) || '';
        var db = diarioDataISO(b.data) || '';
        if (da !== db) return db.localeCompare(da);
        var disc = String(a.disciplina || '').localeCompare(String(b.disciplina || ''), 'pt-BR');
        if (disc !== 0) return disc;
        return (a.tempo || 0) - (b.tempo || 0);
    });

    var html = cabecalho +
        '<table class="tabela rel-tabela"><thead><tr>' +
        '<th>Data</th><th>Disciplina</th><th>Tempo</th><th>Situação</th>' +
        '</tr></thead><tbody>';

    ordenada.forEach(function (r) {
        var dataISO = diarioDataISO(r.data);
        var dataBR = '—';
        if (dataISO) {
            var partes = dataISO.split('-').map(Number);
            dataBR = new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('pt-BR');
        }

        html += '<tr>' +
            '<td>' + diarioEscapar(dataBR) + '</td>' +
            '<td>' + diarioEscapar(r.disciplina || '—') + '</td>' +
            '<td>' + (r.tempo != null ? r.tempo + 'º' : '—') + '</td>' +
            '<td><span class="status ' + diarioClasseStatus(r.status) + '">' +
            diarioEscapar(diarioLabelStatus(r.status)) + '</span></td>' +
            '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function iniciarDiarioAluno() {
    var container = document.getElementById('conteudoDiarioAluno');
    try {
        var resposta = await api.verificarToken();
        diarioAlunoUsuario = resposta.usuario;
        localStorage.setItem('usuario', JSON.stringify(diarioAlunoUsuario));
        api.token = localStorage.getItem('token');

        if (diarioAlunoUsuario.tipo !== 'aluno' && diarioAlunoUsuario.tipo !== 'responsavel') {
            var destino = (typeof PAINEL_POR_TIPO !== 'undefined' && PAINEL_POR_TIPO[diarioAlunoUsuario.tipo])
                ? PAINEL_POR_TIPO[diarioAlunoUsuario.tipo]
                : 'index.html';
            window.location.replace(destino);
            return;
        }

        var elNome = document.getElementById('nomeUsuario');
        if (elNome) elNome.textContent = 'Olá, ' + (diarioAlunoUsuario.nome || '');

        if (typeof configurarBotaoVoltar === 'function') {
            configurarBotaoVoltar('linkVoltar');
        } else {
            var link = document.getElementById('linkVoltar');
            if (link) {
                link.href = diarioAlunoUsuario.tipo === 'responsavel'
                    ? 'painel-responsavel.html'
                    : 'painel-aluno.html';
            }
        }

        var params = new URLSearchParams(window.location.search);
        var alunoQuery = params.get('aluno');

        if (diarioAlunoUsuario.tipo === 'aluno') {
            diarioAlunoId = String(diarioAlunoUsuario.id || diarioAlunoUsuario._id || '');
        } else {
            if (!alunoQuery) throw new Error('Selecione o aluno no painel do responsável');
            diarioAlunoId = String(alunoQuery);
        }

        var res = await api.listarPresencaAluno(diarioAlunoId);
        diarioTurmaNome = (res.turma && res.turma.nome) || '';

        // garante só registros deste aluno
        var idAlvo = String(diarioAlunoId);
        diarioPresencasCache = (res.presencas || []).filter(function (p) {
            var id = diarioIdRef(p.aluno_id);
            return !id || id === idAlvo;
        });

        if (!diarioPresencasCache.length) {
            diarioAtualizarResumo([]);
            container.innerHTML = '<p style="text-align:center;color:#7f8c8d;padding:24px;">Nenhum lançamento de presença encontrado.</p>';
            return;
        }

        var anos = [];
        diarioPresencasCache.forEach(function (p) {
            var dia = diarioDiaLocal(p.data);
            if (dia) anos.push(dia.getFullYear());
        });
        if (anos.length) diarioAnoLetivo = Math.max.apply(null, anos);

        if (!diarioTurmaNome) {
            var t0 = diarioPresencasCache[0] && diarioPresencasCache[0].turma_id;
            diarioTurmaNome = (t0 && t0.nome) || '';
        }

        diarioPreencherDisciplinas();
        diarioPreencherBimestres();
        renderizarDiarioAluno();
    } catch (erro) {
        console.error(erro);
        if (container) {
            container.innerHTML = '<p class="rel-erro">❌ ' + diarioEscapar(erro.message || 'Erro ao carregar') + '</p>';
        }
    }
}

function ligarEventosDiarioAluno() {
    var btn = document.getElementById('btnFiltrarDiarioAluno');
    if (btn) {
        btn.type = 'button';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            renderizarDiarioAluno();
        });
    }

    var selBim = document.getElementById('filtroBimestreAluno');
    if (selBim) {
        selBim.addEventListener('change', function () {
            renderizarDiarioAluno();
        });
    }

    var selDisc = document.getElementById('filtroDisciplinaAluno');
    if (selDisc) {
        selDisc.addEventListener('change', function () {
            renderizarDiarioAluno();
        });
    }
}

window.renderizarDiarioAluno = renderizarDiarioAluno;

document.addEventListener('DOMContentLoaded', function () {
    ligarEventosDiarioAluno();
    iniciarDiarioAluno();
});
