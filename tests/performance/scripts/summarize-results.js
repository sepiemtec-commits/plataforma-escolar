#!/usr/bin/env node
/**
 * Consolida summaries k6 + métricas de sistema em um relatório Markdown.
 * Uso: node summarize-results.js --ts 20260925-120000
 */
const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const resultsDir = path.join(__dirname, '../results');
const ts = arg('ts');
const files = fs.existsSync(resultsDir)
  ? fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json'))
  : [];

const k6Files = files.filter((f) => f.startsWith('k6-') && (!ts || f.includes(ts)));
const sysFiles = files.filter((f) => f.startsWith('sys-') && (!ts || f.includes(ts)));

function readJson(f) {
  try {
    return JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
  } catch {
    return null;
  }
}

function extractK6(summary) {
  if (!summary || !summary.metrics) return null;
  const m = summary.metrics;
  const pick = (metric, field) => {
    if (!metric) return null;
    const v = metric.values || metric;
    return v[field] != null ? v[field] : null;
  };
  return {
    reqs: pick(m.http_reqs, 'count'),
    rps: pick(m.http_reqs, 'rate'),
    failed: pick(m.http_req_failed, 'rate'),
    avg: pick(m.http_req_duration, 'avg'),
    p90: pick(m.http_req_duration, 'p(90)'),
    p95: pick(m.http_req_duration, 'p(95)'),
    p99: pick(m.http_req_duration, 'p(99)'),
    errors4xx: pick(m.errors_4xx, 'count') || 0,
    errors5xx: pick(m.errors_5xx, 'count') || 0,
    timeouts: pick(m.timeouts, 'count') || 0
  };
}

let md = `# Relatório de carga TOKEN 07\n\nGerado: ${new Date().toISOString()}\n\n`;
md += `| Cenário | req/s | latência avg | p90 | p95 | p99 | erro % | 4xx | 5xx | timeout | CPU máx % | Mem livre mín GiB | Mongo conn máx | Redis |\n`;
md += `|---------|-------|--------------|-----|-----|-----|--------|-----|-----|---------|-----------|-------------------|----------------|-------|\n`;

const byScenario = {};

for (const f of k6Files) {
  const scen = (f.match(/k6-([A-E]|smoke)-/) || [])[1] || '?';
  byScenario[scen] = byScenario[scen] || {};
  byScenario[scen].k6 = extractK6(readJson(f));
  byScenario[scen].k6File = f;
}

for (const f of sysFiles) {
  const scen = (f.match(/sys-([A-E]|smoke)-/) || [])[1] || '?';
  byScenario[scen] = byScenario[scen] || {};
  const sys = readJson(f);
  byScenario[scen].sys = sys && sys.peaks;
  byScenario[scen].redis =
    sys && sys.samples && sys.samples[0] && sys.samples[0].redis
      ? sys.samples[0].redis.available
        ? 'up'
        : 'N/A'
      : 'N/A';
}

for (const [scen, data] of Object.entries(byScenario).sort()) {
  const k = data.k6 || {};
  const s = data.sys || {};
  const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
  md += `| ${scen} | ${fmt(k.rps, 2)} | ${fmt(k.avg, 0)} | ${fmt(k.p90, 0)} | ${fmt(k.p95, 0)} | ${fmt(k.p99, 0)} | ${k.failed == null ? '—' : (k.failed * 100).toFixed(2)}% | ${k.errors4xx ?? '—'} | ${k.errors5xx ?? '—'} | ${k.timeouts ?? '—'} | ${fmt(s.cpuPctMax, 1)} | ${fmt(s.memFreeGbMin, 2)} | ${s.mongoConnectionsMax ?? '—'} | ${data.redis || 'N/A'} |\n`;
}

md += `\n## Observações\n\n`;
md += `- Redis: a aplicação **não utiliza Redis**; coluna = inventário de infra.\n`;
md += `- Login em massa exige \`DISABLE_RATE_LIMIT=1\` no servidor.\n`;
md += `- Cenário E (10k) não roda no progressive runner — exige \`ALLOW_HEAVY=1 ALLOW_10K=1\`.\n`;

const outMd = path.join(resultsDir, `RELATORIO-${ts || Date.now()}.md`);
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(outMd, md);
fs.writeFileSync(path.join(__dirname, '../../../docs/CARGA-K6-RELATORIO.md'), md);
console.log(md);
console.log(`→ ${outMd}`);
console.log('→ docs/CARGA-K6-RELATORIO.md');
