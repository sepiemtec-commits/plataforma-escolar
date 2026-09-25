/**
 * CENÁRIO B — 500 usuários simultâneos
 * k6 run tests/performance/k6/scenarios/B-500.js
 */
import { SCENARIO_VUS, stagesFor, thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

const VUS = SCENARIO_VUS.B;

export const options = {
  scenarios: {
    saas_B_500: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stagesFor(VUS, { ramp: '1m', hold: '3m', down: '30s' }),
      gracefulRampDown: '30s'
    }
  },
  thresholds: thresholdsFor('B'),
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
