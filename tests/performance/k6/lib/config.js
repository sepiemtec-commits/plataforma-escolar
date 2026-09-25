/**
 * Config compartilhada — cenários TOKEN 07
 * Variáveis de ambiente:
 *   BASE_URL          default http://localhost:3000
 *   LOAD_EMAIL        default secretaria@escola.com
 *   LOAD_PASSWORD     default senha123
 *   LOAD_TIMEOUT      default 30s
 *   SCENARIO          A|B|C|D|E (opcional, para logs)
 */
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const LOAD_EMAIL = __ENV.LOAD_EMAIL || 'secretaria@escola.com';
export const LOAD_PASSWORD = __ENV.LOAD_PASSWORD || 'senha123';
export const REQUEST_TIMEOUT = __ENV.LOAD_TIMEOUT || '30s';

/** VUs alvo por cenário (TOKEN 07) */
export const SCENARIO_VUS = {
  A: 100,
  B: 500,
  C: 1000,
  D: 5000,
  E: 10000
};

/**
 * Capacidade mínima recomendada (heurística local).
 * Cenários D/E exigem confirmação explícita (ALLOW_HEAVY=1).
 */
export const CAPACITY = {
  A: { minCpu: 2, minRamGb: 2, allowByDefault: true },
  B: { minCpu: 4, minRamGb: 4, allowByDefault: true },
  C: { minCpu: 6, minRamGb: 6, allowByDefault: true },
  D: { minCpu: 8, minRamGb: 12, allowByDefault: false },
  E: { minCpu: 12, minRamGb: 24, allowByDefault: false }
};

/**
 * Thresholds por cenário — mais folgados conforme a carga sobe.
 * http_req_failed usa rate; tags customizadas em metrics.js.
 */
export function thresholdsFor(scenario) {
  const map = {
    A: { fail: 0.02, p95: 1500, p99: 3000 },
    B: { fail: 0.05, p95: 2500, p99: 5000 },
    C: { fail: 0.08, p95: 4000, p99: 8000 },
    D: { fail: 0.15, p95: 8000, p99: 15000 },
    E: { fail: 0.25, p95: 12000, p99: 20000 }
  };
  const t = map[scenario] || map.A;
  return {
    http_req_failed: [`rate<${t.fail}`],
    http_req_duration: [`p(95)<${t.p95}`, `p(99)<${t.p99}`],
    checks: ['rate>0.85'],
    'http_req_duration{expected_response:true}': [`p(90)<${t.p95}`],
    errors_4xx: ['count>=0'], // informativo — sem fail
    errors_5xx: scenario === 'A' || scenario === 'B' ? ['count<50'] : ['count>=0'],
    timeouts: ['count>=0']
  };
}

/**
 * Stages progressivos até o alvo de VUs (ramp + hold + ramp-down).
 */
export function stagesFor(vus, { ramp = '1m', hold = '2m', down = '30s' } = {}) {
  return [
    { duration: ramp, target: Math.max(1, Math.floor(vus * 0.3)) },
    { duration: ramp, target: vus },
    { duration: hold, target: vus },
    { duration: down, target: 0 }
  ];
}

/** Distribuição realista de operações (após login). Soma = 100 */
export const OP_WEIGHTS = [
  { name: 'dashboard', weight: 18 },
  { name: 'alunos', weight: 12 },
  { name: 'professores', weight: 8 },
  { name: 'turmas', weight: 12 },
  { name: 'notas', weight: 12 },
  { name: 'frequencia', weight: 12 },
  { name: 'boletim', weight: 8 },
  { name: 'notificacoes', weight: 6 },
  { name: 'pesquisa', weight: 7 },
  { name: 'verificar', weight: 5 }
];
