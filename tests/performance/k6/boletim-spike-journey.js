/**
 * Jornada "Publicação de Boletins" — responsáveis no pico.
 * Fluxo: login → dashboard → boletim → notas → frequência → logout
 */
import { sleep } from 'k6';
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { BASE_URL, LOAD_PASSWORD, REQUEST_TIMEOUT } from './lib/config.js';
import { authHeaders, login, logout } from './lib/auth.js';
import { errors4xx, errors5xx, timeouts } from './lib/ops.js';

export const trendLogin = new Trend('boletim_spike_login', true);
export const trendDashboard = new Trend('boletim_spike_dashboard', true);
export const trendBoletim = new Trend('boletim_spike_boletim', true);
export const trendNotas = new Trend('boletim_spike_notas', true);
export const trendFrequencia = new Trend('boletim_spike_frequencia', true);
export const stageErrors = new Counter('boletim_spike_stage_errors');

export { errors4xx, errors5xx, timeouts };

const respPool = new SharedArray('resp_users', () => {
  const candidates = [
    'tests/performance/results/load-users-responsaveis.json',
    '../results/load-users-responsaveis.json',
    '../../results/load-users-responsaveis.json'
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(open(p));
      const users = parsed.users || [];
      if (users.length) return users;
    } catch {
      /* tenta próximo */
    }
  }
  try {
    const parsed = JSON.parse(open('tests/performance/results/load-users.json'));
    return (parsed.users || []).filter((u) => u.tipo === 'responsavel');
  } catch {
    return [];
  }
});

function pickResp() {
  if (respPool.length) {
    const vu = __VU > 0 ? __VU : 1;
    return respPool[(vu - 1) % respPool.length];
  }
  return {
    email: __ENV.LOAD_EMAIL || 'responsavel1@escola.com',
    password: LOAD_PASSWORD,
    alunoId: __ENV.LOAD_ALUNO_ID || ''
  };
}

function timedGet(path, token, op, trend) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: authHeaders(token),
    timeout: REQUEST_TIMEOUT,
    tags: { op, scenario: 'boletim_spike' }
  });
  if (trend) trend.add(res.timings.duration);
  if (res.timed_out) timeouts.add(1);
  if (res.status >= 400 && res.status < 500) errors4xx.add(1);
  if (res.status >= 500) {
    errors5xx.add(1);
    stageErrors.add(1, { op });
  }
  check(res, {
    [`${op} ok`]: (r) => r.status >= 200 && r.status < 400
  });
  return res;
}

export function healthGate() {
  const res = http.get(`${BASE_URL}/health`, { timeout: '10s', tags: { op: 'health' } });
  if (res.status !== 200) {
    throw new Error(`health falhou: ${res.status}`);
  }
}

export function boletimSpikeSetup() {
  healthGate();
  if (!respPool.length) {
    console.warn(
      'AVISO: load-users-responsaveis.json vazio — rode start-load-target com pool de responsáveis.'
    );
  } else {
    console.log(`Pool responsáveis: ${respPool.length}`);
  }
  return { startedAt: Date.now(), poolSize: respPool.length };
}

/** Uma sessão de responsável no dia da publicação dos boletins. */
export function boletimSpikeJourney() {
  const cred = pickResp();
  const t0 = Date.now();
  const session = login(cred.email, cred.password || LOAD_PASSWORD);
  trendLogin.add(Date.now() - t0);

  if (!session) {
    stageErrors.add(1, { op: 'login' });
    sleep(0.5);
    return;
  }

  const alunoId = cred.alunoId || (session.usuario && session.usuario.aluno_id) || '';

  timedGet('/api/painel/responsavel', session.token, 'dashboard', trendDashboard);

  if (alunoId) {
    timedGet(`/api/avaliacao/boletim/${alunoId}`, session.token, 'boletim', trendBoletim);
    timedGet(`/api/avaliacao/aluno/${alunoId}`, session.token, 'notas', trendNotas);
    timedGet(`/api/presenca/aluno/${alunoId}`, session.token, 'frequencia', trendFrequencia);
  } else {
    timedGet('/api/auth/verificar', session.token, 'verificar', trendBoletim);
  }

  logout(session.token);
  sleep(0.1 + Math.random() * 0.3);
}
