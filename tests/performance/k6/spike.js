/**
 * k6 — spike TOKEN 08 (publicação de boletins).
 * Uso: k6 run -e BASE_URL=http://localhost:3000 tests/performance/k6/spike.js
 * Preferir scenarios/boletim-spike.js (mesmo conteúdo).
 */
export { options, setup, default } from './scenarios/boletim-spike.js';
