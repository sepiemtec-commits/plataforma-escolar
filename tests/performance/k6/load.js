/**
 * Legado — aponta para jornada SaaS leve (30 VUs).
 * Preferir: tests/performance/k6/scenarios/A-100.js
 * Uso: k6 run -e BASE_URL=http://localhost:3000 tests/performance/k6/load.js
 */
import { stagesFor, thresholdsFor } from './lib/config.js';
import { errors4xx, errors5xx, timeouts } from './lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from './saas-journey.js';

export const options = {
  stages: stagesFor(30, { ramp: '30s', hold: '2m', down: '20s' }),
  thresholds: thresholdsFor('A'),
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)']
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
