/**
 * TOKEN 09 — Endurance E1
 * 500 usuários simultâneos durante 2 horas (carga constante).
 *
 * Atalho de validação: ENDURANCE_MINUTES=15 k6 run ...
 * Uso: k6 run tests/performance/k6/scenarios/endurance-E1-500-2h.js
 */
import { enduranceJourney, enduranceSetup, enduranceLatency, errors4xx, errors5xx, timeouts } from '../endurance-journey.js';

const minutes = Number(__ENV.ENDURANCE_MINUTES || 120); // 2h
const VUS = Number(__ENV.ENDURANCE_VUS || 500);

export const options = {
  scenarios: {
    endurance_E1: {
      executor: 'constant-vus',
      vus: VUS,
      duration: `${minutes}m`,
      gracefulStop: '1m'
    }
  },
  thresholds: {
    // Endurance: estabilidade > pico. Falha se degradar demais.
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
    endurance_iteration_ms: ['p(95)<20000'],
    errors_5xx: ['count<100'],
    timeouts: ['count<50']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export { enduranceLatency, errors4xx, errors5xx, timeouts };

export function setup() {
  console.log(`TOKEN 09 E1 — ${VUS} VUs × ${minutes} min`);
  return enduranceSetup();
}

export default function (data) {
  enduranceJourney(data);
}
