#!/usr/bin/env node
/**
 * Verifica capacidade do host antes de cenários pesados (D/E).
 * Uso: node tests/performance/scripts/check-capacity.js [A|B|C|D|E]
 * Exit 0 = permitido; 2 = bloqueado; 1 = erro.
 */
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const SCENARIO = (process.argv[2] || 'A').toUpperCase();
const SCENARIO_KEY = SCENARIO === 'SMOKE' ? 'smoke' : SCENARIO;
const ALLOW_HEAVY = process.env.ALLOW_HEAVY === '1';
const ALLOW_10K = process.env.ALLOW_10K === '1';

const RULES = {
  smoke: { vus: 5, minCpu: 1, minRamGb: 1, heavy: false },
  A: { vus: 100, minCpu: 2, minRamGb: 2, heavy: false },
  B: { vus: 500, minCpu: 4, minRamGb: 4, heavy: false },
  C: { vus: 1000, minCpu: 4, minRamGb: 6, heavy: false },
  D: { vus: 5000, minCpu: 8, minRamGb: 12, heavy: true },
  E: { vus: 10000, minCpu: 12, minRamGb: 24, heavy: true, needs10k: true }
};

function memGb() {
  return {
    total: os.totalmem() / 1024 ** 3,
    free: os.freemem() / 1024 ** 3
  };
}

function loadAvg() {
  return os.loadavg();
}

function redisStatus() {
  try {
    const out = execSync('redis-cli ping', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return { available: out === 'PONG', detail: out };
  } catch {
    return { available: false, detail: 'não instalado / não usado pelo VEHO Edu' };
  }
}

function mongoStatus() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar';
  try {
    // tenta mongosh sem auth
    const script = `db.runCommand({ ping: 1 })`;
    execSync(`mongosh "${uri}" --quiet --eval '${script}'`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { available: true, uri: uri.replace(/\/\/.*@/, '//***@') };
  } catch {
    try {
      execSync(`mongo "${uri}" --quiet --eval 'db.runCommand({ping:1})'`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return { available: true, uri: uri.replace(/\/\/.*@/, '//***@') };
    } catch {
      return { available: false, uri, detail: 'mongosh/mongo indisponível ou DB offline' };
    }
  }
}

function healthHttp() {
  const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    const out = execSync(`curl -sf -m 5 "${base}/health"`, { encoding: 'utf8', timeout: 8000 });
    return { ok: true, body: JSON.parse(out) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

const rule = RULES[SCENARIO_KEY];
if (!rule) {
  console.error(`Cenário inválido: ${SCENARIO}`);
  process.exit(1);
}

const cpus = os.cpus().length;
const mem = memGb();
const load = loadAvg();
const redis = redisStatus();
const mongo = mongoStatus();
const health = healthHttp();

const report = {
  scenario: SCENARIO_KEY,
  targetVus: rule.vus,
  host: {
    hostname: os.hostname(),
    platform: os.platform(),
    cpus,
    loadAvg1m: load[0],
    memTotalGb: Number(mem.total.toFixed(2)),
    memFreeGb: Number(mem.free.toFixed(2))
  },
  mongo,
  redis: {
    ...redis,
    note: 'VEHO Edu não usa Redis no código atual — métrica N/A se ausente'
  },
  serverHealth: health,
  flags: { ALLOW_HEAVY, ALLOW_10K },
  decision: { allowed: true, reasons: [] }
};

if (cpus < rule.minCpu) {
  report.decision.reasons.push(`CPU: ${cpus} < mínimo ${rule.minCpu}`);
}
if (mem.total < rule.minRamGb) {
  report.decision.reasons.push(`RAM total: ${mem.total.toFixed(1)}GiB < mínimo ${rule.minRamGb}GiB`);
}
if (mem.free < Math.min(2, rule.minRamGb * 0.25) && rule.heavy) {
  report.decision.reasons.push(`RAM livre baixa: ${mem.free.toFixed(1)}GiB`);
}
if (rule.heavy && !ALLOW_HEAVY) {
  report.decision.reasons.push('Cenário pesado: defina ALLOW_HEAVY=1 após revisar capacidade');
}
if (rule.needs10k && !ALLOW_10K) {
  report.decision.reasons.push('Cenário 10k: defina ALLOW_10K=1 explicitamente');
}
if (!health.ok) {
  report.decision.reasons.push(`Servidor /health falhou (${process.env.BASE_URL || 'http://localhost:3000'})`);
}

report.decision.allowed = report.decision.reasons.length === 0;

const outDir = require('path').join(__dirname, '../results');
fs.mkdirSync(outDir, { recursive: true });
const outFile = require('path').join(outDir, `capacity-${SCENARIO}-${Date.now()}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
console.log(`\n→ ${outFile}`);

if (!report.decision.allowed) {
  console.error('\nBLOQUEADO:', report.decision.reasons.join('; '));
  process.exit(2);
}
console.log(`\nOK — cenário ${SCENARIO} (${rule.vus} VUs) permitido neste host.`);
process.exit(0);
