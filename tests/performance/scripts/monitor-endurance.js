#!/usr/bin/env node
/**
 * Monitor de endurance — amostra /health/diag e compara início / meio / fim.
 *
 * node monitor-endurance.js --base http://127.0.0.1:3000 --duration 7200 --interval 30 \
 *   --out results/endurance-mon.json
 *
 * Critérios de NÃO aprovação (mesmo online):
 * - RSS cresce >25% início→fim
 * - heap cresce >30%
 * - event loop p95 sobe >2×
 * - waitQueue médio sobe no terço final
 * - refreshTokens acumulam sem bound (possível leak de sessão)
 * - temp files crescem >50 MB
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const base = (arg('base', process.env.BASE_URL || 'http://127.0.0.1:3000')).replace(/\/$/, '');
const durationSec = Number(arg('duration', '7200'));
const intervalSec = Number(arg('interval', '30'));
const outFile = arg('out', path.join(__dirname, '../results', `endurance-mon-${Date.now()}.json`));

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
function cpuPct() {
  const cur = cpuTimes();
  const i = cur.idle - prevCpu.idle;
  const t = cur.total - prevCpu.total;
  prevCpu = cur;
  return t <= 0 ? 0 : Number((100 * (1 - i / t)).toFixed(2));
}

function fetchDiag() {
  return new Promise((resolve) => {
    const req = http.get(`${base}/health/diag`, { timeout: 5000 }, (res) => {
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

function sliceStats(samples, fromFrac, toFrac) {
  const n = samples.length;
  if (!n) return null;
  const a = Math.floor(n * fromFrac);
  const b = Math.max(a + 1, Math.ceil(n * toFrac));
  const slice = samples.slice(a, b);
  const avg = (fn) => {
    const vals = slice.map(fn).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3));
  };
  return {
    n: slice.length,
    rssMb: avg((s) => s.diag && s.diag.node && s.diag.node.rssMb),
    heapMb: avg((s) => s.diag && s.diag.node && s.diag.node.heapUsedMb),
    cpu: avg((s) => s.hostCpuPct),
    eventLoopP95: avg((s) => s.diag && s.diag.node && s.diag.node.eventLoopDelayP95Ms),
    poolWait: avg((s) => s.diag && s.diag.mongo && s.diag.mongo.pool && s.diag.mongo.pool.waitQueueSize),
    poolCheckedOut: avg((s) => s.diag && s.diag.mongo && s.diag.mongo.pool && s.diag.mongo.pool.checkedOut),
    refreshTokens: avg((s) => s.diag && s.diag.sessions && s.diag.sessions.totalRefreshTokens),
    tempMb: avg((s) => s.diag && s.diag.tempFiles && s.diag.tempFiles.mb),
    req5xx: avg((s) => s.diag && s.diag.node && s.diag.node.req5xx)
  };
}

function growth(start, end, key) {
  if (!start || !end || start[key] == null || end[key] == null || start[key] === 0) return null;
  return Number((((end[key] - start[key]) / Math.abs(start[key])) * 100).toFixed(1));
}

const samples = [];
const t0 = Date.now();
const endAt = t0 + durationSec * 1000;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
console.error(`Endurance monitor ${durationSec}s → ${outFile}`);

const timer = setInterval(async () => {
  const diagRes = await fetchDiag();
  samples.push({
    ts: new Date().toISOString(),
    elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
    hostCpuPct: cpuPct(),
    hostMemFreeGb: Number((os.freemem() / 1024 ** 3).toFixed(3)),
    diag: diagRes.json && diagRes.json.diag,
    diagStatus: diagRes.status,
    diagError: diagRes.error || null
  });
  // checkpoint parcial a cada ~10 amostras
  if (samples.length % 10 === 0) {
    fs.writeFileSync(outFile + '.partial.json', JSON.stringify({ samples }, null, 2));
  }
  if (Date.now() >= endAt) {
    clearInterval(timer);
    finish();
  }
}, intervalSec * 1000);

function finish() {
  const inicio = sliceStats(samples, 0, 0.15);
  const meio = sliceStats(samples, 0.4, 0.6);
  const fim = sliceStats(samples, 0.85, 1);

  const degradacoes = [];
  const gRss = growth(inicio, fim, 'rssMb');
  const gHeap = growth(inicio, fim, 'heapMb');
  const gEl = growth(inicio, fim, 'eventLoopP95');
  const gWait = growth(inicio, fim, 'poolWait');
  const gSess = growth(inicio, fim, 'refreshTokens');
  const gTmp = growth(inicio, fim, 'tempMb');

  if (gRss != null && gRss > 25) {
    degradacoes.push({ tipo: 'memory_leak_suspeita', metrica: 'RSS', growthPct: gRss, severidade: 'alta' });
  }
  if (gHeap != null && gHeap > 30) {
    degradacoes.push({ tipo: 'heap_growth', metrica: 'heapUsed', growthPct: gHeap, severidade: 'alta' });
  }
  if (gEl != null && gEl > 100) {
    degradacoes.push({
      tipo: 'event_loop_degradation',
      metrica: 'eventLoopP95',
      growthPct: gEl,
      severidade: 'alta'
    });
  }
  if (gWait != null && gWait > 50 && fim.poolWait > 10) {
    degradacoes.push({
      tipo: 'db_pool_pressure_growth',
      metrica: 'poolWait',
      growthPct: gWait,
      severidade: 'média'
    });
  }
  if (gSess != null && gSess > 50 && fim.refreshTokens > (inicio.refreshTokens || 0) + 100) {
    degradacoes.push({
      tipo: 'session_accumulation',
      metrica: 'refreshTokens',
      growthPct: gSess,
      severidade: 'média'
    });
  }
  if (fim && inicio && fim.tempMb != null && inicio.tempMb != null && fim.tempMb - inicio.tempMb > 50) {
    degradacoes.push({
      tipo: 'temp_files_growth',
      metrica: 'tempMb',
      deltaMb: Number((fim.tempMb - inicio.tempMb).toFixed(2)),
      severidade: 'média'
    });
  }
  // CPU: crescimento sustentado no terço final vs início
  const gCpu = growth(inicio, fim, 'cpu');
  if (gCpu != null && gCpu > 40 && fim.cpu > 50) {
    degradacoes.push({ tipo: 'cpu_growth', metrica: 'cpu', growthPct: gCpu, severidade: 'média' });
  }

  const online = samples.filter((s) => s.diagStatus === 200).length;
  const onlinePct = samples.length ? (online / samples.length) * 100 : 0;

  const aprovado =
    onlinePct >= 95 &&
    degradacoes.filter((d) => d.severidade === 'alta').length === 0 &&
    !(fim && fim.rssMb && inicio && inicio.rssMb && fim.rssMb > inicio.rssMb * 1.25);

  const report = {
    geradoEm: new Date().toISOString(),
    base,
    durationSec,
    intervalSec,
    sampleCount: samples.length,
    onlinePct: Number(onlinePct.toFixed(2)),
    fases: { inicio, meio, fim },
    crescimentoPct: {
      rss: gRss,
      heap: gHeap,
      eventLoopP95: gEl,
      poolWait: gWait,
      refreshTokens: gSess,
      tempMb: gTmp,
      cpu: gCpu
    },
    degradacoes,
    redis: 'N/A',
    queues: 'N/A',
    aprovado,
    criterio:
      'Aprovado somente se online≥95% E sem degradação alta (RSS/heap/event-loop). Permanecer online sozinho NÃO aprova.',
    samples
  };

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outFile, aprovado, degradacoes, fases: report.fases, crescimentoPct: report.crescimentoPct }, null, 2));
  process.exit(aprovado ? 0 : 2);
}

process.on('SIGINT', () => {
  clearInterval(timer);
  finish();
});
process.on('SIGTERM', () => {
  clearInterval(timer);
  finish();
});
