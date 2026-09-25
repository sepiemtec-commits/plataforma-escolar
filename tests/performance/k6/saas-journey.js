/**
 * Jornada SaaS realista — usada por todos os cenários A–E.
 * Fluxo: login → descoberta de contexto → N ops ponderadas → logout
 */
import { sleep } from 'k6';
import { login, logout, discoverContext } from './lib/auth.js';
import { runWeightedOps } from './lib/ops.js';
import { BASE_URL } from './lib/config.js';
import http from 'k6/http';
import { check } from 'k6';

export function healthGate() {
  const res = http.get(`${BASE_URL}/health`, { timeout: '10s', tags: { op: 'health' } });
  const ok = check(res, { 'health 200': (r) => r.status === 200 });
  if (!ok) {
    throw new Error(`Servidor indisponível em ${BASE_URL}/health — status ${res.status}`);
  }
  return res;
}

/**
 * setup compartilhado: valida health e faz login + contexto uma vez
 * (VUs ainda fazem login próprio na jornada para exercitar /login).
 */
export function sharedSetup() {
  healthGate();
  // setup usa credencial dedicada (primeiro do pool ou LOAD_EMAIL) — sem logout no teardown
  // para não invalidar VUs; contexto é descoberto uma vez.
  const session = login();
  if (!session) {
    console.warn(
      'AVISO: login no setup falhou. Defina LOAD_EMAIL/LOAD_PASSWORD e DISABLE_RATE_LIMIT=1 no servidor.'
    );
    return { ctx: {}, usuario: null };
  }
  const ctx = discoverContext(session.token);
  // não devolver setupToken para teardown — evita logout global
  return { ctx, usuario: session.usuario };
}

export function saasJourney(data) {
  const session = login();
  if (!session) {
    sleep(1);
    return;
  }

  const ctx = (data && data.ctx && data.ctx.turmaId) ? data.ctx : discoverContext(session.token);
  const usuario = session.usuario || (data && data.usuario) || null;

  const n = 4 + Math.floor(Math.random() * 4);
  runWeightedOps(session.token, ctx, usuario, n);

  logout(session.token);
  sleep(0.3 + Math.random() * 0.9);
}

export function sharedTeardown() {
  // intencionalmente vazio — logout por VU já ocorre na jornada
}
