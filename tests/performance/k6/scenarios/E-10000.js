/**
 * CENÁRIO E — 10.000 usuários simultâneos
 * NÃO executar sem verificar capacidade.
 * REQUER: ALLOW_HEAVY=1 e ALLOW_10K=1
 * k6 run -e ALLOW_HEAVY=1 -e ALLOW_10K=1 tests/performance/k6/scenarios/E-10000.js
 */
import { SCENARIO_VUS, stagesFor, thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

if (__ENV.ALLOW_HEAVY !== '1' || __ENV.ALLOW_10K !== '1') {
  throw new Error(
    'CENÁRIO E (10.000 VUs) bloqueado. Verifique capacidade (check-capacity) e use ALLOW_HEAVY=1 ALLOW_10K=1.'
  );
}

const VUS = SCENARIO_VUS.E;

export const options = {
  scenarios: {
    saas_E_10000: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stagesFor(VUS, { ramp: '5m', hold: '5m', down: '3m' }),
      gracefulRampDown: '2m'
    }
  },
  thresholds: thresholdsFor('E'),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']
};

export { errors4xx, errors5xx, timeouts };

export function setup() {
  return sharedSetup();
}

export default function (data) {
  saasJourney(data);
}

export function teardown(data) {
  sharedTeardown(data);
}
