/**
 * CENÁRIO A — 100 usuários simultâneos
 * k6 run tests/performance/k6/scenarios/A-100.js
 */
import { SCENARIO_VUS, stagesFor, thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

const VUS = SCENARIO_VUS.A;

export const options = {
  scenarios: {
    saas_A_100: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stagesFor(VUS, { ramp: '30s', hold: '2m', down: '20s' }),
      gracefulRampDown: '20s'
    }
  },
  thresholds: thresholdsFor('A'),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']
};

// referência às métricas customizadas (evita tree-shake)
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
