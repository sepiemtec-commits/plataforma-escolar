/**
 * Smoke rápido — 5 VUs / ~30s — valida jornada antes dos cenários A–E
 * k6 run tests/performance/k6/scenarios/smoke.js
 */
import { thresholdsFor } from '../lib/config.js';
import { errors4xx, errors5xx, timeouts } from '../lib/ops.js';
import { saasJourney, sharedSetup, sharedTeardown } from '../saas-journey.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    ...thresholdsFor('A'),
    http_req_failed: ['rate<0.1']
  },
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
