#!/usr/bin/env node
/**
 * TOKEN 15 — Bateria final de pré-produção
 * Executa o que for viável no host, coleta evidências objetivas e gera relatório.
 * NÃO declara "pronto para produção" automaticamente.
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '../../..');
const OUT_DIR = path.join(ROOT, 'tests/preprod/results');
const DOC = path.join(ROOT, 'docs/PRE-PRODUCAO-RELATORIO.md');
const JSON_OUT = path.join(OUT_DIR, 'token15-results.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const startedAt = new Date().toISOString();
const results = [];

function run(name, cmd, opts = {}) {
  const t0 = Date.now();
  const logFile = path.join(OUT_DIR, `${name.replace(/[^a-z0-9_-]/gi, '_')}.log`);
  let status = 'PASS';
  let detail = '';
  let exitCode = 0;
  let skipped = false;

  if (opts.skip) {
    skipped = true;
    status = 'SKIP';
    detail = opts.skip;
    results.push({ name, status, ms: 0, exitCode: null, detail, logFile: null, category: opts.category || name });
    console.log(`[SKIP] ${name}: ${detail}`);
    return { status, skipped: true };
  }

  console.log(`[RUN ] ${name} …`);
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: opts.timeoutMs || 600000,
      env: { ...process.env, ...(opts.env || {}), FORCE_COLOR: '0' },
      maxBuffer: 20 * 1024 * 1024,
      shell: '/bin/bash'
    });
    fs.writeFileSync(logFile, out);
    detail = summarizeLog(out, opts.parse);
  } catch (err) {
    exitCode = err.status == null ? 1 : err.status;
    const out = `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`;
    fs.writeFileSync(logFile, out);
    status = opts.allowFail ? 'WARN' : 'FAIL';
    detail = summarizeLog(out, opts.parse) || err.message;
  }

  const ms = Date.now() - t0;
  results.push({ name, status, ms, exitCode, detail, logFile: path.relative(ROOT, logFile), category: opts.category || name });
  console.log(`[${status}] ${name} (${ms}ms) ${detail.slice(0, 120)}`);
  return { status, ms, detail };
}

function summarizeLog(out, parse) {
  if (!out) return '';
  if (typeof parse === 'function') {
    try {
      return parse(out) || '';
    } catch {
      /* fallthrough */
    }
  }
  const lines = String(out).split('\n');
  const hit =
    lines.find((l) => /Tests:|passed|failed|PASS|FAIL|Veredito|http_req|checks\.*:|EXIT=/i.test(l)) ||
    lines.filter((l) => l.trim()).slice(-3).join(' | ');
  return String(hit).trim().slice(0, 240);
}

function parseJest(out) {
  const m = out.match(/Tests:\s*([^\n]+)/);
  const s = out.match(/Test Suites:\s*([^\n]+)/);
  return [s && s[1], m && m[1]].filter(Boolean).join(' · ');
}

function parsePlaywright(out) {
  const m = out.match(/(\d+) passed/);
  const f = out.match(/(\d+) failed/);
  return `${m ? m[1] + ' passed' : '?'}${f ? `, ${f[1]} failed` : ''}`;
}

function parseK6(out) {
  const checks = out.match(/checks_total[^\n]*|checks\.+:[^\n]+/i);
  const httpFail = out.match(/http_req_failed[^:]*:\s*([^\n]+)/);
  const p95 = out.match(/http_req_duration[^\n]*p\(95\)=([^\s]+)/) || out.match(/p\(95\)[=:]?\s*([^\s]+)/);
  return [checks && checks[0], httpFail && `failed=${httpFail[1].trim()}`, p95 && `p95=${p95[1]}`]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 240);
}

function auditInfra() {
  const findings = [];
  const appJs = fs.readFileSync(path.join(ROOT, 'backend/app.js'), 'utf8');
  const hasHealth = /app\.get\(['"]\/health['"]/.test(appJs);
  const hasReady = /\/ready|readiness/i.test(appJs);
  const hasLive = /\/live|liveness/i.test(appJs);
  const hasMetrics = /\/metrics|prometheus/i.test(appJs);
  const diag = /LOAD_DIAGNOSTICS/.test(appJs);

  findings.push({
    item: 'health check',
    status: hasHealth ? 'PRESENT' : 'ABSENT',
    evidence: hasHealth ? 'GET /health (status + database readyState)' : 'endpoint ausente'
  });
  findings.push({
    item: 'readiness',
    status: hasReady ? 'PRESENT' : 'ABSENT',
    evidence: hasReady ? 'endpoint encontrado' : 'sem /ready distinto — /health mistura liveness+DB'
  });
  findings.push({
    item: 'liveness',
    status: hasLive ? 'PRESENT' : 'ABSENT',
    evidence: hasLive ? 'endpoint encontrado' : 'sem /live — apenas /health'
  });
  findings.push({
    item: 'métricas Prometheus',
    status: hasMetrics ? 'PRESENT' : 'ABSENT',
    evidence: hasMetrics ? 'encontrado' : 'sem /metrics exportável'
  });
  findings.push({
    item: 'diagnóstico sob carga',
    status: diag ? 'OPTIONAL' : 'ABSENT',
    evidence: 'GET /health/diag somente se LOAD_DIAGNOSTICS=1'
  });

  const rate = fs.existsSync(path.join(ROOT, 'backend/middleware/rateLimitLogin.js'));
  findings.push({
    item: 'rate limit',
    status: rate ? 'PARTIAL' : 'ABSENT',
    evidence: rate ? 'rateLimitLogin no login/recuperar-senha; sem rate limit global de API' : 'ausente'
  });

  const withTimeout = fs.existsSync(path.join(ROOT, 'backend/utils/withTimeout.js'));
  findings.push({
    item: 'timeouts / retries',
    status: withTimeout ? 'PARTIAL' : 'ABSENT',
    evidence: withTimeout
      ? 'withTimeout/withRetry utilitário; sem circuit breaker global'
      : 'ausente'
  });

  const codeTree = execSync('grep -RIl --include="*.js" -E "bull|BullMQ|amqp|ioredis|createClient\\(|node-cache|redis" backend || true', {
    cwd: ROOT,
    encoding: 'utf8'
  });
  const hasQueue = /bull|amqp/i.test(codeTree);
  const hasRedis = /ioredis|createClient|redis/i.test(codeTree) && !/rate-limit|comment/i.test(codeTree);
  findings.push({
    item: 'filas',
    status: hasQueue ? 'PRESENT' : 'ABSENT',
    evidence: hasQueue ? 'detectado' : 'sem Bull/Rabbit/SQS no backend'
  });
  findings.push({
    item: 'cache distribuído',
    status: hasRedis ? 'PRESENT' : 'ABSENT',
    evidence: hasRedis ? 'Redis detectado' : 'sem Redis/cache app-level (só IdempotencyRecord Mongo)'
  });

  const hasWinston = fs.existsSync(path.join(ROOT, 'node_modules/winston')) ||
    /winston|pino|bunyan/.test(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  findings.push({
    item: 'logs estruturados',
    status: hasWinston ? 'PRESENT' : 'PARTIAL',
    evidence: hasWinston ? 'logger estruturado' : 'console.log/error predominante; sem agregação APM'
  });
  findings.push({
    item: 'monitoramento / alertas',
    status: 'ABSENT',
    evidence: 'sem integração Datadog/Sentry/Prometheus alert manager no repositório'
  });

  return findings;
}

function classifyFailures(infra, suiteResults) {
  const critical = [];
  const high = [];
  const medium = [];
  const low = [];

  for (const r of suiteResults) {
    if (r.status === 'FAIL') {
      if (/segurança|auth|tenant|isolamento|e2e|unit|api/i.test(r.name)) {
        critical.push(`${r.name}: ${r.detail}`);
      } else if (/concorr|backup|restaura|resili/i.test(r.name)) {
        high.push(`${r.name}: ${r.detail}`);
      } else {
        medium.push(`${r.name}: ${r.detail}`);
      }
    }
  }

  for (const f of infra) {
    if (f.status === 'ABSENT') {
      if (/monitoramento|métricas|readiness|liveness/.test(f.item)) {
        high.push(`Infra — ${f.item}: ${f.evidence}`);
      } else if (/filas|cache|logs/.test(f.item)) {
        medium.push(`Infra — ${f.item}: ${f.evidence}`);
      } else {
        low.push(`Infra — ${f.item}: ${f.evidence}`);
      }
    } else if (f.status === 'PARTIAL') {
      medium.push(`Infra — ${f.item} (parcial): ${f.evidence}`);
    }
  }

  // Riscos conhecidos de tokens anteriores
  high.push('Carga: cenário A (100 VUs) cruzou p95 SLO (2,17s > 1,5s) — docs/CARGA-K6-RELATORIO.md');
  high.push('Endurance E1 amostra: NÃO APROVADO — docs/ENDURANCE-RELATORIO.md');
  medium.push('Go-live incompleto: Mongo produção / Stripe secret / webhook — docs/GO-LIVE-STATUS.md');
  medium.push('Cenários k6 B–E e endurance E2 não reexecutados nesta bateria (custo/tempo/RAM)');
  low.push('Web Push VAPID não configurado em ambientes de teste');

  return { critical, high, medium, low };
}

function priorEvidence() {
  return [
    {
      name: 'carga k6 (TOKEN 07 — histórico)',
      status: 'PRIOR',
      detail: 'smoke PASS; A latência SLO falhou (p95 2,17s); B–E não executados',
      source: 'docs/CARGA-K6-RELATORIO.md'
    },
    {
      name: 'spike boletim (TOKEN 08 — histórico)',
      status: 'PRIOR',
      detail: 'relatório SPIKE-BOLETIM — pool/login gate aplicados',
      source: 'docs/SPIKE-BOLETIM-RELATORIO.md'
    },
    {
      name: 'endurance (TOKEN 09 — histórico)',
      status: 'PRIOR',
      detail: 'E1 amostra NÃO APROVADO',
      source: 'docs/ENDURANCE-RELATORIO.md'
    },
    {
      name: 'banco escala (TOKEN 10 — histórico)',
      status: 'PRIOR',
      detail: 'APROVADO no relatório de escalabilidade PG/Mongo índices',
      source: 'docs/ESCALABILIDADE-BANCO-RELATORIO.md'
    },
    {
      name: 'resiliência (TOKEN 11 — histórico)',
      status: 'PRIOR',
      detail: 'APROVADO — S1–S10; Redis/filas N/A',
      source: 'docs/RESILIENCIA-RELATORIO.md'
    },
    {
      name: 'backup/DR (TOKEN 12 — histórico)',
      status: 'PRIOR',
      detail: 'APROVADO — RTO drill ~1s; RPO pós-backup esperado',
      source: 'docs/BACKUP-DR-RELATORIO.md'
    }
  ];
}

function waitHttp(url, timeoutMs = 90000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const u = new URL(url);
      const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname, timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return reject(new Error('timeout waitHttp'));
        setTimeout(tick, 1000);
      });
      req.on('error', () => {
        if (Date.now() - t0 > timeoutMs) return reject(new Error('timeout waitHttp'));
        setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

async function withLoadTarget(fn) {
  const port = process.env.PREPROD_LOAD_PORT || '3099';
  const base = `http://127.0.0.1:${port}`;
  let child;
  try {
    child = spawn('node', ['tests/performance/scripts/start-load-target.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: port, ASSINATURA_MODO_DEV: 'true', DISABLE_RATE_LIMIT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
    });
    child.stderr.on('data', (d) => {
      buf += d.toString();
    });
    await waitHttp(`${base}/health`, 120000);
    await fn(base, buf);
  } finally {
    if (child && child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function gitChangedFiles() {
  try {
    const out = execSync('git status --porcelain && git diff --name-only HEAD~30..HEAD 2>/dev/null | head -n 80', {
      cwd: ROOT,
      encoding: 'utf8'
    });
    const files = new Set();
    for (const line of out.split('\n')) {
      const m = line.match(/^(?:[ MADRCU?!]{1,2}\s+)?(.+)$/);
      if (m && m[1] && !m[1].startsWith('??')) files.add(m[1].replace(/^\s+/, ''));
      else if (line.trim() && !line.startsWith(' ')) files.add(line.trim());
    }
    // Prefer working tree changes for TOKEN 13-15
    const wt = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    const wtFiles = wt
      .split('\n')
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
    return wtFiles.length ? wtFiles : [...files].slice(0, 60);
  } catch {
    return [];
  }
}

async function main() {
  // 1) Unit
  run('unitários', 'npm run test:unit 2>&1', { category: 'unitários', parse: parseJest, timeoutMs: 180000 });

  // 2) API (+ auth, autorização, tenant, segurança app, concorrência, resiliência API)
  run('API (jest api)', 'npm run test:api 2>&1', { category: 'API', parse: parseJest, timeoutMs: 300000 });

  run('autenticação/autorização', 'npm run test:api -- --testPathPattern="auth|authSeguranca" 2>&1', {
    category: 'autenticação',
    parse: parseJest,
    timeoutMs: 180000
  });

  run('multi-tenancy', 'npm run test:isolamento 2>&1', {
    category: 'multi-tenancy',
    parse: parseJest,
    timeoutMs: 180000
  });

  run('segurança', 'npm run test:api -- --testPathPattern=segurancaApp 2>&1 && npm run test:unit -- --testPathPattern="rolesAndInjection|safePath|sanitize|jwt" 2>&1', {
    category: 'segurança',
    parse: parseJest,
    timeoutMs: 180000
  });

  run('concorrência', 'npm run test:concurrency 2>&1', {
    category: 'concorrência',
    parse: parseJest,
    timeoutMs: 120000
  });

  // Integração: pasta dedicada vazia — coberto por API harness
  run('integração', 'true', {
    category: 'integração',
    skip: 'Pasta tests/integration sem suíte automatizada; cobertura via npm test:api + isolamento'
  });

  // E2E
  run(
    'E2E Playwright',
    'ASSINATURA_MODO_DEV=true DISABLE_RATE_LIMIT=1 npx playwright test --config=tests/e2e/playwright.config.js --retries=0 2>&1',
    { category: 'E2E', parse: parsePlaywright, timeoutMs: 300000, env: { CI: 'true' } }
  );

  // Recuperação / backup — reexecutar se containers disponíveis
  let dockerOk = false;
  try {
    execSync('docker ps >/dev/null 2>&1', { cwd: ROOT });
    dockerOk = true;
  } catch {
    dockerOk = false;
  }

  if (dockerOk) {
    run('recuperação (TOKEN 11)', 'npm run test:resilience 2>&1', {
      category: 'recuperação',
      timeoutMs: 300000,
      allowFail: true
    });
    run('backup/restauração (TOKEN 12)', 'npm run test:dr 2>&1', {
      category: 'backup',
      timeoutMs: 300000,
      allowFail: true
    });
  } else {
    run('recuperação (TOKEN 11)', 'true', { skip: 'Docker indisponível — usar evidência PRIOR', category: 'recuperação' });
    run('backup/restauração (TOKEN 12)', 'true', { skip: 'Docker indisponível — usar evidência PRIOR', category: 'backup' });
  }

  // Banco — escala leve se PG up
  run('banco (escala TOKEN 10)', 'SCALE_ALUNOS=1000 npm run test:db:scale 2>&1', {
    category: 'banco',
    timeoutMs: 300000,
    allowFail: true
  });

  // Performance: smoke + stress curto customizado via env se target subir
  try {
    await withLoadTarget(async (base) => {
      run(
        'carga k6 smoke',
        `PATH="$PWD/tools/bin:$PATH" k6 run -e BASE_URL=${base} tests/performance/k6/scenarios/smoke.js 2>&1`,
        { category: 'carga', parse: parseK6, timeoutMs: 180000, allowFail: true }
      );

      // Stress abreviado (não o stress.js de 12min) — 60s ramp
      const stressShort = path.join(OUT_DIR, 'stress-short.js');
      fs.writeFileSync(
        stressShort,
        `
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  stages: [
    { duration: '20s', target: 30 },
    { duration: '20s', target: 80 },
    { duration: '20s', target: 0 }
  ],
  thresholds: { http_req_failed: ['rate<0.2'] }
};
const BASE = __ENV.BASE_URL;
export default function () {
  const res = http.get(BASE + '/health');
  check(res, { ok: (r) => r.status === 200 });
  sleep(0.3);
}
`
      );
      run(
        'stress k6 (abreviado 60s)',
        `PATH="$PWD/tools/bin:$PATH" k6 run -e BASE_URL=${base} "${stressShort}" 2>&1`,
        { category: 'stress', parse: parseK6, timeoutMs: 180000, allowFail: true }
      );

      run(
        'spike boletim (amostra SPIKE_MAX=100)',
        `PATH="$PWD/tools/bin:$PATH" k6 run -e BASE_URL=${base} -e SPIKE_MAX=100 tests/performance/k6/scenarios/boletim-spike.js 2>&1`,
        { category: 'spike', parse: parseK6, timeoutMs: 300000, allowFail: true }
      );
    });
  } catch (err) {
    run('carga k6 smoke', 'true', { skip: `load-target falhou: ${err.message}`, category: 'carga' });
    run('stress k6', 'true', { skip: 'depende do load-target', category: 'stress' });
    run('spike', 'true', { skip: 'depende do load-target', category: 'spike' });
  }

  run('endurance', 'true', {
    category: 'endurance',
    skip: 'E1=2h / E2=4h — não reexecutado nesta bateria; ver docs/ENDURANCE-RELATORIO.md (NÃO APROVADO na amostra)'
  });

  // Go-live checklist
  run('validar:golive', 'npm run validar:golive 2>&1', {
    category: 'go-live',
    allowFail: true,
    timeoutMs: 30000
  });

  const infra = auditInfra();
  const prior = priorEvidence();
  const failures = classifyFailures(infra, results);

  const executed = results.filter((r) => r.status !== 'SKIP');
  const approved = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');
  const warned = results.filter((r) => r.status === 'WARN');
  const skipped = results.filter((r) => r.status === 'SKIP');

  const bottlenecks = [
    'p95 login/jornada SaaS sob 100 VUs > 1,5s (TOKEN 07)',
    'Mongo pool / waitQueue no spike de boletim (mitigado parcialmente — TOKEN 08)',
    'Endurance amostra não sustentou critérios (TOKEN 09)',
    'Sem cache de leitura (boletim/relatórios recalculam a cada request)',
    'Health único sem readiness/liveness separados para orquestradores'
  ];

  const risks = [
    'Ambiente de produção (Atlas/Stripe/webhook) ainda incompleto conforme GO-LIVE-STATUS',
    'Ausência de monitoramento/alertas em produção aumenta MTTR',
    'Rate limit só no login — APIs autenticadas vulneráveis a abuso de quota',
    'Sem filas: jobs longos (XLS, notificações) bloqueiam request path',
    'Endurance e carga pesada (B–E) sem gate verde recente neste host',
    'Backup automático de documentos em disco não acoplado ao pipeline de produção'
  ];

  const recommendations = [
    'Separar /health/live e /health/ready (DB + deps) antes do deploy em K8s/Render',
    'Expor métricas Prometheus (latência p95, erros 5xx, pool Mongo) + alertas básicos',
    'Integrar Sentry (ou similar) para erros não tratados',
    'Otimizar jornada sob carga até p95 < 1,5s em A; só então progredir B/C',
    'Reexecutar endurance E1 em staging dedicado e exigir PASS documentado',
    'Rate limit global por IP/tenant nas rotas autenticadas sensíveis',
    'Concluir checklist go-live (Mongo ativo, Stripe live/test keys, webhook)',
    'Agendar backup Atlas + archive de private/documentos com restore drill mensal',
    'Adicionar suíte tests/integration real (hoje só README)'
  ];

  // Production readiness: explícito NÃO automático
  const blockingCritical = failures.critical.length;
  const blockingHighPerf = failed.some((f) => /carga|stress|spike|endurance/i.test(f.name));
  const goLiveFail = results.some((r) => r.name.includes('golive') && r.status !== 'PASS');
  const verdict =
    blockingCritical === 0 && failed.length === 0 && !goLiveFail
      ? 'CONDICIONAL — suítes locais verdes, mas NÃO pronto para produção (lacunas de ops/perf/go-live)'
      : failed.length
        ? 'NÃO PRONTO — há falhas na bateria desta sessão'
        : 'NÃO PRONTO — evidências de risco residual (ops/perf/go-live)';

  const payload = {
    token: 15,
    startedAt,
    finishedAt: new Date().toISOString(),
    verdict,
    summary: {
      executed: executed.length,
      approved: approved.length,
      failed: failed.length,
      warned: warned.length,
      skipped: skipped.length
    },
    results,
    prior,
    infra,
    failures,
    bottlenecks,
    risks,
    changedFiles: gitChangedFiles(),
    recommendations
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
  writeMarkdown(payload);
  console.log('\n=== TOKEN 15 ===');
  console.log(verdict);
  console.log(`JSON: ${JSON_OUT}`);
  console.log(`MD:   ${DOC}`);
  process.exit(failed.length ? 1 : 0);
}

function writeMarkdown(p) {
  const lines = [];
  lines.push('# TOKEN 15 — Teste Final de Pré-Produção');
  lines.push('');
  lines.push(`Gerado: ${p.finishedAt}`);
  lines.push(`**Veredito: ${p.verdict}**`);
  lines.push('');
  lines.push('> Este relatório **não** declara o sistema pronto para produção apenas porque suítes automatizadas passaram. O veredito considera falhas desta sessão, evidências históricas de performance e lacunas de operação.');
  lines.push('');
  lines.push('## TESTES EXECUTADOS');
  lines.push('');
  lines.push('| Suíte | Status | Duração | Evidência |');
  lines.push('|-------|--------|---------|-----------|');
  for (const r of p.results) {
    lines.push(`| ${r.name} | **${r.status}** | ${r.ms || 0} ms | ${(r.detail || r.skip || '').replace(/\|/g, '/')} |`);
  }
  lines.push('');
  lines.push('### Evidências históricas (não reexecutadas integralmente)');
  lines.push('');
  lines.push('| Item | Status | Fonte |');
  lines.push('|------|--------|-------|');
  for (const r of p.prior) {
    lines.push(`| ${r.name} | ${r.status} — ${r.detail} | ${r.source} |`);
  }
  lines.push('');
  lines.push('## TESTES APROVADOS');
  lines.push('');
  const ap = p.results.filter((r) => r.status === 'PASS');
  if (!ap.length) lines.push('- Nenhum nesta sessão.');
  else ap.forEach((r) => lines.push(`- ${r.name}: ${r.detail}`));
  lines.push('');
  lines.push('## TESTES REPROVADOS');
  lines.push('');
  const fl = p.results.filter((r) => r.status === 'FAIL');
  if (!fl.length) lines.push('- Nenhum FAIL nesta sessão.');
  else fl.forEach((r) => lines.push(`- **${r.name}**: ${r.detail} (log: ${r.logFile})`));
  const wn = p.results.filter((r) => r.status === 'WARN');
  if (wn.length) {
    lines.push('');
    lines.push('### Avisos (WARN / allowFail)');
    wn.forEach((r) => lines.push(`- ${r.name}: ${r.detail}`));
  }
  lines.push('');
  lines.push('## FALHAS CRÍTICAS');
  lines.push('');
  (p.failures.critical.length ? p.failures.critical : ['Nenhuma classificada como crítica nesta sessão.']).forEach((x) =>
    lines.push(`- ${x}`)
  );
  lines.push('');
  lines.push('## FALHAS ALTAS');
  lines.push('');
  p.failures.high.forEach((x) => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## FALHAS MÉDIAS');
  lines.push('');
  p.failures.medium.forEach((x) => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## FALHAS BAIXAS');
  lines.push('');
  p.failures.low.forEach((x) => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## GARGALOS');
  lines.push('');
  p.bottlenecks.forEach((x) => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## RISCOS');
  lines.push('');
  p.risks.forEach((x) => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## CHECAGENS DE OPERAÇÃO');
  lines.push('');
  lines.push('| Item | Status | Evidência |');
  lines.push('|------|--------|-----------|');
  for (const f of p.infra) {
    lines.push(`| ${f.item} | ${f.status} | ${f.evidence} |`);
  }
  lines.push('');
  lines.push('## ARQUIVOS ALTERADOS');
  lines.push('');
  lines.push('Working tree no momento da bateria (git status):');
  lines.push('');
  if (p.changedFiles.length) p.changedFiles.forEach((f) => lines.push(`- \`${f}\``));
  else lines.push('- (limpo ou indisponível)');
  lines.push('');
  lines.push('## RECOMENDAÇÕES TÉCNICAS');
  lines.push('');
  p.recommendations.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  lines.push('');
  lines.push('## Resumo quantitativo');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(p.summary, null, 2));
  lines.push('```');
  lines.push('');
  lines.push(`Artefato JSON: \`tests/preprod/results/token15-results.json\``);
  lines.push('');

  fs.writeFileSync(DOC, lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
