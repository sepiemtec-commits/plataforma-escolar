#!/usr/bin/env node
/**
 * Analisa k6 summary + diag e aponta o PRIMEIRO gargalo técnico.
 * node analyze-spike-bottleneck.js --k6 results/k6-....json --diag results/diag-....json
 */
const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

function read(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function metric(summary, name) {
  const m = summary.metrics && summary.metrics[name];
  if (!m) return null;
  return m.values || m;
}

const k6Path = arg('k6');
const diagPath = arg('diag');
if (!k6Path) {
  console.error('Uso: --k6 <summary.json> [--diag <diag.json>]');
  process.exit(1);
}

const k6 = read(k6Path);
const diag = diagPath && fs.existsSync(diagPath) ? read(diagPath) : null;

const failed = metric(k6, 'http_req_failed');
const dur = metric(k6, 'http_req_duration');
const login = metric(k6, 'boletim_spike_login');
const boletim = metric(k6, 'boletim_spike_boletim');
const timeouts = metric(k6, 'timeouts');
const e5 = metric(k6, 'errors_5xx');
const e4 = metric(k6, 'errors_4xx');
const reqs = metric(k6, 'http_reqs');

const candidates = [];

function add(component, evidence, severity, firstAtHint) {
  candidates.push({ component, evidence, severity, firstAtHint });
}

if (login && login['p(95)'] > 2000) {
  add(
    'CPU / bcrypt no login',
    `boletim_spike_login p95=${login['p(95)'].toFixed(0)}ms (hash bcrypt por VU no pico)`,
    login['p(95)'] > 4000 ? 'alto' : 'médio',
    'Primeiros segundos do spike de login em massa'
  );
}

if (diag && diag.peaks) {
  if (diag.peaks.eventLoopP95Max > 100) {
    add(
      'Event loop Node.js saturado',
      `eventLoopDelayP95 máx=${diag.peaks.eventLoopP95Max}ms (I/O + sync bcrypt competindo)`,
      diag.peaks.eventLoopP95Max > 250 ? 'alto' : 'médio',
      `quando event loop p95 > 100ms (amostras diag)`
    );
  }
  if (diag.peaks.hostCpuMax > 85) {
    add(
      'CPU do host',
      `CPU host máx=${diag.peaks.hostCpuMax}%`,
      diag.peaks.hostCpuMax > 95 ? 'alto' : 'médio',
      'pico de CPU correlacionado ao ramp de VUs'
    );
  }
  if (diag.peaks.poolWaitMax > 0 || (diag.peaks.poolCheckedOutMax >= 90 && diag.peaks.inFlightMax > 80)) {
    add(
      'Pool de conexões MongoDB (mongoose maxPoolSize≈100)',
      `checkedOut máx=${diag.peaks.poolCheckedOutMax}, waitQueue máx=${diag.peaks.poolWaitMax}, inFlight máx=${diag.peaks.inFlightMax}`,
      'alto',
      'quando waitQueue>0 ou checkedOut≈maxPool sob inFlight alto'
    );
  }
  if (diag.peaks.rssMbMax > 1024) {
    add(
      'Memória do processo Node (RSS)',
      `RSS máx=${diag.peaks.rssMbMax} MiB`,
      diag.peaks.rssMbMax > 2048 ? 'alto' : 'médio',
      'crescimento de heap/RSS ao longo do spike'
    );
  }
  if (diag.peaks.inFlightMax > 200) {
    add(
      'Fila de requisições no processo Node (in-flight)',
      `inFlight máx=${diag.peaks.inFlightMax} (single-thread event loop)`,
      'alto',
      'antes de 5xx — requisições acumulam no servidor'
    );
  }
}

if (dur && dur['p(95)'] > 3000) {
  add(
    'Latência HTTP geral (backend saturado)',
    `http_req_duration p95=${dur['p(95)'].toFixed(0)}ms p99=${(dur['p(99)'] || 0).toFixed(0)}ms`,
    'alto',
    'após saturação CPU/pool/event-loop'
  );
}

if (timeouts && timeouts.count > 0) {
  add(
    'Timeouts de cliente k6',
    `timeouts=${timeouts.count} (LOAD_TIMEOUT / servidor sem responder a tempo)`,
    'alto',
    'depois da saturação — sintoma, não causa raiz'
  );
}

if (e5 && e5.count > 0) {
  add(
    'HTTP 5xx',
    `errors_5xx=${e5.count}`,
    'alto',
    'falha após esgotar fila/pool — sintoma'
  );
}

if (failed && failed.rate > 0.05) {
  add(
    'Taxa de erro HTTP',
    `http_req_failed=${(failed.rate * 100).toFixed(2)}%`,
    'médio',
    'sintoma agregado'
  );
}

add(
  'Redis',
  'Não utilizado pelo VEHO Edu — descartado como gargalo',
  'n/a',
  null
);
add(
  'Filas (Bull/SQS/etc.)',
  'Não existem no backend — descartado como gargalo',
  'n/a',
  null
);

// Prioridade causal (não só “pior latência”):
// 1) pool Mongo com waitQueue  2) event loop  3) CPU host  4) bcrypt/login  5) sintomas HTTP
function rank(c) {
  const map = {
    'Pool de conexões MongoDB (mongoose maxPoolSize≈100)': 0,
    'Event loop Node.js saturado': 1,
    'CPU do host': 2,
    'CPU / bcrypt no login': 3,
    'Fila de requisições no processo Node (in-flight)': 4,
    'Memória do processo Node (RSS)': 5,
    'Latência HTTP geral (backend saturado)': 6,
    'Timeouts de cliente k6': 7,
    'HTTP 5xx': 8,
    'Taxa de erro HTTP': 9
  };
  return map[c.component] ?? 50;
}

const real = candidates.filter((c) => c.severity !== 'n/a');
const order = { alto: 0, médio: 1, medio: 1, baixo: 2 };
real.sort((a, b) => rank(a) - rank(b) || (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

const first = real[0] || {
  component: 'Indeterminado',
  evidence: 'Sem limiares cruzados — veja métricas brutas',
  severity: 'info'
};

// Cadeia causal para o relatório
const cadeia = [];
if (diag && diag.peaks && diag.peaks.poolWaitMax > 0) {
  cadeia.push(
    `Pool Mongo esgotado (checkedOut=${diag.peaks.poolCheckedOutMax}/${100}, waitQueue=${diag.peaks.poolWaitMax}) → requisições esperam conexão`
  );
}
if (diag && diag.peaks && diag.peaks.eventLoopP95Max > 100) {
  cadeia.push(
    `Event loop p95=${diag.peaks.eventLoopP95Max}ms → bcrypt.compare + callbacks atrasam todas as rotas`
  );
}
if (login && login['p(95)'] > 2000) {
  cadeia.push(
    `Login p95=${login['p(95)'].toFixed(0)}ms (primeiro contato do responsável) — sintoma visível do gargalo acima`
  );
}
if (failed && failed.rate > 0.2) {
  cadeia.push(
    `Taxa de falha ${(failed.rate * 100).toFixed(1)}% — timeouts de cliente / fila, não “queda misteriosa”`
  );
}

const report = {
  titulo: 'TOKEN 08 — Análise de gargalo (spike publicação de boletins)',
  geradoEm: new Date().toISOString(),
  resumoK6: {
    rps: reqs && reqs.rate,
    failedRate: failed && failed.rate,
    durationP95: dur && dur['p(95)'],
    durationP99: dur && dur['p(99)'],
    loginP95: login && login['p(95)'],
    boletimP95: boletim && boletim['p(95)'],
    timeouts: timeouts && timeouts.count,
    errors4xx: e4 && e4.count,
    errors5xx: e5 && e5.count
  },
  diagPeaks: diag && diag.peaks,
  primeiroGargalo: first,
  cadeiaCausal: cadeia,
  todosCandidatos: candidates,
  interpretacao: [
    'Causa raiz ≠ “o sistema caiu”: correlacionar o primeiro limiar técnico cruzado com o ramp de VUs.',
    'Login bcrypt é CPU-bound e compete com o event loop — frequentemente o primeiro a degradar em spike de responsáveis.',
    'Pool Mongo (~100) satura quando inFlight >> maxPoolSize; waitQueue>0 confirma.',
    'Redis/filas: N/A neste produto.'
  ]
};

const outMd = path.join(__dirname, '../../../docs/SPIKE-BOLETIM-RELATORIO.md');
let md = `# ${report.titulo}\n\n`;
md += `Gerado: ${report.geradoEm}\n\n`;
md += `## Primeiro gargalo\n\n`;
md += `**${first.component}** (${first.severity})\n\n`;
md += `${first.evidence}\n\n`;
if (first.firstAtHint) md += `Quando: ${first.firstAtHint}\n\n`;
if (cadeia.length) {
  md += `## Cadeia causal\n\n`;
  cadeia.forEach((step, i) => {
    md += `${i + 1}. ${step}\n`;
  });
  md += `\n`;
}
md += `## Métricas k6\n\n`;
md += `| Métrica | Valor |\n|---------|-------|\n`;
md += `| req/s | ${report.resumoK6.rps ?? '—'} |\n`;
md += `| erro % | ${report.resumoK6.failedRate != null ? (report.resumoK6.failedRate * 100).toFixed(2) + '%' : '—'} |\n`;
md += `| p95 geral | ${report.resumoK6.durationP95 != null ? report.resumoK6.durationP95.toFixed(0) + ' ms' : '—'} |\n`;
md += `| p99 geral | ${report.resumoK6.durationP99 != null ? report.resumoK6.durationP99.toFixed(0) + ' ms' : '—'} |\n`;
md += `| login p95 | ${report.resumoK6.loginP95 != null ? report.resumoK6.loginP95.toFixed(0) + ' ms' : '—'} |\n`;
md += `| boletim p95 | ${report.resumoK6.boletimP95 != null ? report.resumoK6.boletimP95.toFixed(0) + ' ms' : '—'} |\n`;
md += `| timeouts | ${report.resumoK6.timeouts ?? '—'} |\n`;
md += `| 4xx / 5xx | ${report.resumoK6.errors4xx ?? '—'} / ${report.resumoK6.errors5xx ?? '—'} |\n\n`;
if (diag && diag.peaks) {
  md += `## Picos de diagnóstico\n\n`;
  md += '```json\n' + JSON.stringify(diag.peaks, null, 2) + '\n```\n\n';
}
md += `## Candidatos\n\n`;
for (const c of candidates) {
  md += `- **${c.component}** (${c.severity}): ${c.evidence}\n`;
}
md += `\n## Como reproduzir\n\n`;
md += '```bash\nLOAD_DIAGNOSTICS=1 LOAD_USER_POOL=200 npm run test:k6:target\nnpm run test:k6:spike:boletim\n```\n';

fs.writeFileSync(outMd, md);
fs.writeFileSync(path.join(__dirname, '../results', `bottleneck-${Date.now()}.json`), JSON.stringify(report, null, 2));
console.log(md);
console.log(`→ ${outMd}`);
