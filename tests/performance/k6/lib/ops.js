import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, REQUEST_TIMEOUT, OP_WEIGHTS } from './config.js';
import { authHeaders } from './auth.js';

export const errors4xx = new Counter('errors_4xx');
export const errors5xx = new Counter('errors_5xx');
export const timeouts = new Counter('timeouts');
export const opsByName = new Counter('ops_by_name');

function track(res) {
  if (!res) return;
  if (res.timed_out) timeouts.add(1);
  if (res.status >= 400 && res.status < 500) errors4xx.add(1);
  if (res.status >= 500) errors5xx.add(1);
}

function get(path, token, op) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: authHeaders(token),
    timeout: REQUEST_TIMEOUT,
    tags: { op }
  });
  track(res);
  opsByName.add(1, { op });
  check(res, {
    [`${op} não 5xx`]: (r) => r.status < 500,
    [`${op} autenticado`]: (r) => r.status !== 401
  });
  return res;
}

/** Painel conforme tipo do usuário (secretaria por default no seed de carga). */
export function opDashboard(token, usuario) {
  const tipo = (usuario && usuario.tipo) || 'secretaria';
  const map = {
    diretor: '/api/painel/diretor',
    secretaria: '/api/painel/secretaria',
    coordenador: '/api/painel/coordenador',
    professor: '/api/painel/professor',
    aluno: '/api/painel/aluno',
    responsavel: '/api/painel/responsavel',
    admin: '/api/painel/diretor'
  };
  return get(map[tipo] || '/api/painel/secretaria', token, 'dashboard');
}

export function opAlunos(token) {
  return get('/api/usuarios?tipo=aluno', token, 'alunos');
}

export function opProfessores(token) {
  // lista dedicada + fallback por filtro
  const res = get('/api/turmas/professores/lista', token, 'professores');
  if (res.status === 403 || res.status === 404) {
    return get('/api/usuarios?tipo=professor', token, 'professores');
  }
  return res;
}

export function opTurmas(token) {
  return get('/api/turmas', token, 'turmas');
}

export function opNotas(token, ctx) {
  if (ctx && ctx.turmaId) {
    // grade exige professor — secretaria usa notas do aluno
    if (ctx.alunoId) return get(`/api/avaliacao/aluno/${ctx.alunoId}`, token, 'notas');
  }
  if (ctx && ctx.alunoId) return get(`/api/avaliacao/aluno/${ctx.alunoId}`, token, 'notas');
  return get('/api/usuarios?tipo=aluno', token, 'notas');
}

export function opFrequencia(token, ctx) {
  if (ctx && ctx.turmaId) {
    return get(`/api/presenca/turma/${ctx.turmaId}`, token, 'frequencia');
  }
  return get('/api/presenca/visao-geral', token, 'frequencia');
}

export function opBoletim(token, ctx) {
  if (ctx && ctx.alunoId) {
    return get(`/api/avaliacao/boletim/${ctx.alunoId}`, token, 'boletim');
  }
  return get('/api/relatorios/gestao-boletins', token, 'boletim');
}

/**
 * Notificações: rotas de envio são destrutivas — usamos canal push (read-only)
 * + painel (agregados), sem disparar WhatsApp/SMS.
 */
export function opNotificacoes(token) {
  get('/api/push/vapid-public-key', token, 'notificacoes');
  return get('/api/auth/verificar', token, 'notificacoes_sessao');
}

export function opPesquisa(token) {
  const termos = ['matem', 'port', 'EF05', 'aluno', 'turma'];
  const q = termos[Math.floor(Math.random() * termos.length)];
  // BNCC autenticado + usuários (busca administrativa)
  get(`/api/bncc?q=${encodeURIComponent(q)}&limit=20`, token, 'pesquisa_bncc');
  return get(`/api/usuarios?tipo=aluno`, token, 'pesquisa_usuarios');
}

export function opVerificar(token) {
  return get('/api/auth/verificar', token, 'verificar');
}

const OP_FNS = {
  dashboard: opDashboard,
  alunos: opAlunos,
  professores: opProfessores,
  turmas: opTurmas,
  notas: opNotas,
  frequencia: opFrequencia,
  boletim: opBoletim,
  notificacoes: opNotificacoes,
  pesquisa: opPesquisa,
  verificar: opVerificar
};

export function pickWeightedOp() {
  const total = OP_WEIGHTS.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of OP_WEIGHTS) {
    r -= o.weight;
    if (r <= 0) return o.name;
  }
  return OP_WEIGHTS[0].name;
}

/** Executa N operações ponderadas (jornada pós-login). */
export function runWeightedOps(token, ctx, usuario, count = 5) {
  for (let i = 0; i < count; i++) {
    const name = pickWeightedOp();
    const fn = OP_FNS[name];
    if (!fn) continue;
    if (name === 'dashboard') fn(token, usuario);
    else if (['notas', 'frequencia', 'boletim'].includes(name)) fn(token, ctx);
    else fn(token);
  }
}
