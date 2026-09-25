#!/usr/bin/env node
/**
 * Amostra CPU, memória, MongoDB e Redis enquanto o k6 roda.
 * Uso: node collect-system-metrics.js --out results/sys-A.json --interval 2 --duration 180
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

const intervalSec = Number(arg('interval', '2'));
const durationSec = Number(arg('duration', '120'));
const outFile = arg('out', path.join(__dirname, '../results', `sys-${Date.now()}.json`));
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar';

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
  }
  return { idle, total };
}

let prevCpu = cpuTimes();

function sampleCpuPct() {
  const cur = cpuTimes();
  const idleDelta = cur.idle - prevCpu.idle;
  const totalDelta = cur.total - prevCpu.total;
  prevCpu = cur;
  if (totalDelta <= 0) return 0;
  return Number((100 * (1 - idleDelta / totalDelta)).toFixed(2));
}

function sampleMongo() {
  try {
    const js = `
      const s = db.serverStatus();
      print(JSON.stringify({
        ok: 1,
        connections: s.connections,
        opcounters: s.opcounters,
        mem: s.mem,
        network: s.network
      }));
    `;
    const out = execSync(`mongosh "${mongoUri}" --quiet --eval ${JSON.stringify(js)}`, {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const line = out.trim().split('\n').filter(Boolean).pop();
    return JSON.parse(line);
  } catch (e) {
    return { ok: 0, error: 'mongo indisponível' };
  }
}

function sampleRedis() {
  try {
    const info = execSync('redis-cli INFO memory', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const used = (info.match(/used_memory_human:(.+)/) || [])[1];
    const ping = execSync('redis-cli ping', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return { available: ping === 'PONG', used_memory_human: (used || '').trim() };
  } catch {
    return { available: false, note: 'N/A — VEHO Edu não depende de Redis' };
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });

const samples = [];
const started = Date.now();
const endAt = started + durationSec * 1000;

console.error(`Coletando métricas → ${outFile} (${durationSec}s, intervalo ${intervalSec}s)`);

const timer = setInterval(() => {
  const mem = process.memoryUsage();
  const sample = {
    ts: new Date().toISOString(),
    elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
    host: {
      cpuPct: sampleCpuPct(),
      loadAvg: os.loadavg(),
      memFreeGb: Number((os.freemem() / 1024 ** 3).toFixed(3)),
      memTotalGb: Number((os.totalmem() / 1024 ** 3).toFixed(3)),
      processRssMb: Number((mem.rss / 1024 ** 2).toFixed(1))
    },
    mongo: sampleMongo(),
    redis: sampleRedis()
  };
  samples.push(sample);
  if (Date.now() >= endAt) {
    clearInterval(timer);
    finish();
  }
}, intervalSec * 1000);

function finish() {
  const summary = {
    collectedAt: new Date().toISOString(),
    durationSec,
    intervalSec,
    sampleCount: samples.length,
    peaks: {
      cpuPctMax: Math.max(0, ...samples.map((s) => s.host.cpuPct)),
      memFreeGbMin: Math.min(...samples.map((s) => s.host.memFreeGb)),
      mongoConnectionsMax: Math.max(
        0,
        ...samples.map((s) => (s.mongo && s.mongo.connections && s.mongo.connections.current) || 0)
      )
    },
    redisNote: 'VEHO Edu não usa Redis; campo presente para inventário de infra',
    samples
  };
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: true, outFile, peaks: summary.peaks }, null, 2));
  process.exit(0);
}

process.on('SIGINT', () => {
  clearInterval(timer);
  finish();
});
