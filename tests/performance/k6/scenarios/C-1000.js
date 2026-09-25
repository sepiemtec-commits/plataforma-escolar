/**
 * CENÁRIO C — 1.000 usuários simultâneos
 * k6 run tests/performance/k6/scenarios/C-1000.js
 */
import { SCENARIO_VUS, stagesFor, thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

const VUS = SCENARIO_VUS.C;

export const options = {
  scenarios: {
    saas_C_1000: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stagesFor(VUS, { ramp: '2m', hold: '3m', down: '1m' }),
      gracefulRampDown: '45s'
    }
  },
  thresholds: thresholdsFor('C'),
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
