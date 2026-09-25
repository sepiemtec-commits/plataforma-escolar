/**
 * TOKEN 09 — Endurance E2
 * 1.000 usuários simultâneos durante 4 horas.
 *
 * Requer máquina adequada. Atalho: ENDURANCE_MINUTES=20
 * Uso: k6 run tests/performance/k6/scenarios/endurance-E2-1000-4h.js
 */
import { enduranceJourney, enduranceSetup, enduranceLatency, errors4xx, errors5xx, timeouts } from '../endurance-journey.js';

const minutes = Number(__ENV.ENDURANCE_MINUTES || 240); // 4h
const VUS = Number(__ENV.ENDURANCE_VUS || 1000);

if (__ENV.ALLOW_ENDURANCE_E2 !== '1' && minutes >= 60) {
  throw new Error(
    'E2 (1000 VUs × 4h) exige ALLOW_ENDURANCE_E2=1. Para smoke use ENDURANCE_MINUTES=15.'
  );
}

export const options = {
  scenarios: {
    endurance_E2: {
      executor: 'constant-vus',
      vus: VUS,
      duration: `${minutes}m`,
      gracefulStop: '2m'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.15'],
    http_req_duration: ['p(95)<8000'],
    endurance_iteration_ms: ['p(95)<30000'],
    errors_5xx: ['count<300'],
    timeouts: ['count<100']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export { enduranceLatency, errors4xx, errors5xx, timeouts };

export function setup() {
  console.log(`TOKEN 09 E2 — ${VUS} VUs × ${minutes} min`);
  return enduranceSetup();
}

export default function (data) {
  enduranceJourney(data);
}
