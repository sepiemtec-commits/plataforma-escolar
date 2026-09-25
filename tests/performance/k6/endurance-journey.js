/**
 * TOKEN 09 — Jornada endurance (usuários online com think-time).
 * Menos agressiva que spike: simula sessão real, não rajada.
 */
import { sleep } from 'k6';
import { login, logout, discoverContext } from './lib/auth.js';
import { runWeightedOps, errors4xx, errors5xx, timeouts } from './lib/ops.js';
import { BASE_URL } from './lib/config.js';
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

export const enduranceLatency = new Trend('endurance_iteration_ms', true);
export { errors4xx, errors5xx, timeouts };

export function enduranceSetup() {
  const res = http.get(`${BASE_URL}/health`, { timeout: '10s' });
  check(res, { 'health 200': (r) => r.status === 200 });
  if (res.status !== 200) throw new Error(`health falhou: ${res.status}`);
  const session = login();
  let ctx = {};
  if (session) {
    ctx = discoverContext(session.token);
    // não faz logout do setup — evita invalidar pool
  }
  return { ctx, startedAt: Date.now() };
}

/**
 * Uma iteração = 1 usuário ativo por alguns segundos.
 * think-time alto → 500 VUs ≠ 500 req simultâneas no mesmo ms.
 */
export function enduranceJourney(data) {
  const t0 = Date.now();
  const session = login();
  if (!session) {
    sleep(2);
    enduranceLatency.add(Date.now() - t0);
    return;
  }
  const ctx = (data && data.ctx && data.ctx.turmaId) ? data.ctx : discoverContext(session.token);
  const n = 3 + Math.floor(Math.random() * 3); // 3–5 ops
  runWeightedOps(session.token, ctx, session.usuario, n);
  logout(session.token);
  enduranceLatency.add(Date.now() - t0);
  // think-time: usuário “lendo a tela”
  sleep(2 + Math.random() * 4);
}
