/**
 * CENÁRIO D — 5.000 usuários simultâneos
 * REQUER: ALLOW_HEAVY=1 e capacidade (ver scripts/check-capacity.js)
 * k6 run -e ALLOW_HEAVY=1 tests/performance/k6/scenarios/D-5000.js
 */
import { SCENARIO_VUS, stagesFor, thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

if (__ENV.ALLOW_HEAVY !== '1') {
  throw new Error(
    'CENÁRIO D (5.000 VUs) bloqueado. Rode check-capacity e exporte ALLOW_HEAVY=1 se o ambiente aguentar.'
  );
}

const VUS = SCENARIO_VUS.D;

export const options = {
  scenarios: {
    saas_D_5000: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stagesFor(VUS, { ramp: '3m', hold: '4m', down: '2m' }),
      gracefulRampDown: '1m'
    }
  },
  thresholds: thresholdsFor('D'),
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
