/**
 * k6 — stress: sobe até saturar e observa ponto de quebra.
 * Uso: k6 run -e BASE_URL=http://localhost:3000 tests/performance/k6/stress.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 20 },
    { duration: '3m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '2m', target: 150 },
    { duration: '2m', target: 0 }
  ],
  thresholds: {
    // Em stress, documentamos falha — limite mais folgado para o run completar
    http_req_failed: ['rate<0.15'],
    http_req_duration: ['p(95)<3000']
  }
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { 'status é 200 ou 5xx sob stress': (r) => r.status === 200 || r.status >= 500 });
  sleep(0.5);
}
