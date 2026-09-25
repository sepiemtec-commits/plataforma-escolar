#!/usr/bin/env node
/**
 * Amostra /health/diag + CPU host durante o spike.
 * node collect-spike-diagnostics.js --base http://127.0.0.1:3000 --out results/diag.json --duration 180
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const base = (arg('base', process.env.BASE_URL || 'http://127.0.0.1:3000')).replace(/\/$/, '');
const durationSec = Number(arg('duration', '180'));
const intervalSec = Number(arg('interval', '2'));
const outFile = arg('out', path.join(__dirname, '../results', `diag-spike-${Date.now()}.json`));

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
  }
  return { idle, total };
}

let prev = cpuTimes();
function cpuPct() {
  const cur = cpuTimes();
  const idleD = cur.idle - prev.idle;
  const totalD = cur.total - prev.total;
  prev = cur;
  return totalD <= 0 ? 0 : Number((100 * (1 - idleD / totalD)).toFixed(2));
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, json: null });
        }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
  });
}

const samples = [];
const t0 = Date.now();
const endAt = t0 + durationSec * 1000;

console.error(`Coletando diag → ${outFile}`);

const timer = setInterval(async () => {
  const hostCpu = cpuPct();
  const diagRes = await fetchJson(`${base}/health/diag`);
  const sample = {
    ts: new Date().toISOString(),
    elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
    hostCpuPct: hostCpu,
    hostMemFreeGb: Number((os.freemem() / 1024 ** 3).toFixed(3)),
    diag: diagRes.json && diagRes.json.diag ? diagRes.json.diag : null,
    diagStatus: diagRes.status,
    diagError: diagRes.error || null
  };
  samples.push(sample);
  if (Date.now() >= endAt) {
    clearInterval(timer);
    finish();
  }
}, intervalSec * 1000);

function finish() {
  const peaks = {
    hostCpuMax: Math.max(0, ...samples.map((s) => s.hostCpuPct || 0)),
    rssMbMax: Math.max(0, ...samples.map((s) => (s.diag && s.diag.node && s.diag.node.rssMb) || 0)),
    heapMbMax: Math.max(0, ...samples.map((s) => (s.diag && s.diag.node && s.diag.node.heapUsedMb) || 0)),
    inFlightMax: Math.max(0, ...samples.map((s) => (s.diag && s.diag.node && s.diag.node.inFlight) || 0)),
    eventLoopP95Max: Math.max(
      0,
      ...samples.map((s) => (s.diag && s.diag.node && s.diag.node.eventLoopDelayP95Ms) || 0)
    ),
    poolWaitMax: Math.max(
      0,
      ...samples.map((s) => (s.diag && s.diag.mongo && s.diag.mongo.pool && s.diag.mongo.pool.waitQueueSize) || 0)
    ),
    poolCheckedOutMax: Math.max(
      0,
      ...samples.map((s) => (s.diag && s.diag.mongo && s.diag.mongo.pool && s.diag.mongo.pool.checkedOut) || 0)
    )
  };

  const report = {
    collectedAt: new Date().toISOString(),
    base,
    durationSec,
    sampleCount: samples.length,
    peaks,
    redis: 'N/A — aplicativo não usa Redis',
    queues: 'N/A — sem filas no backend',
    samples
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outFile, peaks }, null, 2));
  process.exit(0);
}

process.on('SIGINT', () => {
  clearInterval(timer);
  finish();
});
