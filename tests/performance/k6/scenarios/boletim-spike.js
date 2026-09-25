/**
 * TOKEN 08 — Spike: publicação de boletins
 *
 * Escada rápida: 100 → 500 → 1.000 → (5.000) → (10.000)
 * Picos altos exigem ALLOW_HEAVY / ALLOW_10K (mesmo gate do TOKEN 07).
 *
 * k6 run tests/performance/k6/scenarios/boletim-spike.js
 * SPIKE_MAX=1000 k6 run ...   # limita o teto (default: 1000 sem flags)
 */
import {
  boletimSpikeJourney,
  boletimSpikeSetup,
  errors4xx,
  errors5xx,
  timeouts,
  trendLogin,
  trendDashboard,
  trendBoletim,
  trendNotas,
  trendFrequencia
} from '../boletim-spike-journey.js';

function resolveMaxVus() {
  const envMax = Number(__ENV.SPIKE_MAX || 0);
  if (envMax > 0) return envMax;
  if (__ENV.ALLOW_10K === '1' && __ENV.ALLOW_HEAVY === '1') return 10000;
  if (__ENV.ALLOW_HEAVY === '1') return 5000;
  return 1000; // teto seguro sem flags
}

const MAX = resolveMaxVus();

function spikeStages(maxVus) {
  const ladder = [100, 500, 1000, 5000, 10000].filter((v) => v <= maxVus);
  const stages = [{ duration: '10s', target: 0 }];
  for (const v of ladder) {
    stages.push({ duration: '15s', target: v }); // subida abrupta
    stages.push({ duration: '20s', target: v }); // sustenta o pico
  }
  stages.push({ duration: '20s', target: Math.min(100, maxVus) }); // alívio
  stages.push({ duration: '10s', target: 0 });
  return stages;
}

export const options = {
  scenarios: {
    publicacao_boletins: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: spikeStages(MAX),
      gracefulRampDown: '15s'
    }
  },
  thresholds: {
    // Spike tolera mais falha, mas registra o ponto de ruptura
    http_req_failed: ['rate<0.25'],
    http_req_duration: ['p(95)<8000', 'p(99)<15000'],
    boletim_spike_login: ['p(95)<5000'],
    boletim_spike_boletim: ['p(95)<5000'],
    errors_5xx: ['count<500'],
    timeouts: ['count<200']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export { errors4xx, errors5xx, timeouts, trendLogin, trendDashboard, trendBoletim, trendNotas, trendFrequencia };

export function setup() {
  console.log(`TOKEN 08 spike — teto ${MAX} VUs (ALLOW_HEAVY=${__ENV.ALLOW_HEAVY || '0'} ALLOW_10K=${__ENV.ALLOW_10K || '0'})`);
  return boletimSpikeSetup();
}

export default function () {
  boletimSpikeJourney();
}
