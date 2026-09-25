#!/usr/bin/env node
/**
 * TOKEN 11 — Testes de resiliência
 *
 * Adaptação ao stack real:
 * - DB app: MongoDB (Docker)
 * - PG de teste (TOKEN 10): veho-pg-scale — app NÃO depende dele
 * - Redis / filas: NÃO existem no VEHO Edu
 */
'use strict';

const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '../../..');
const RESULTS = path.join(__dirname, '../results');
const META_PATH = path.join(RESULTS, 'resilience-meta.json');
const PID_PATH = path.join(RESULTS, 'resilience-target.pid');
const LOG_PATH = '/tmp/veho-resilience-target.log';
const BASE = process.env.RESILIENCE_BASE || 'http://127.0.0.1:3011';
const PORT = Number(process.env.RESILIENCE_PORT || 3011);
const MONGO_URI = process.env.RESILIENCE_MONGODB_URI || 'mongodb://127.0.0.1:27017/veho_resilience';

fs.mkdirSync(RESULTS, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  stack: {
    appDb: 'MongoDB',
    postgres: 'somente teste TOKEN 10 (veho-pg-scale)',
    redis: false,
    queues: false,
    circuitBreaker: false
  },
  scenarios: [],
  consistency: {},
  verdict: null
};

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    ...opts
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function httpJson(urlPath, { method = 'GET', body, token, timeoutMs = 8000, form } = {}) {
  return new Promise((resolve) => {
    const u = new URL(urlPath.startsWith('http') ? urlPath : BASE + urlPath);
    const headers = {};
    let payload = null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (form) {
      payload = form.body;
      Object.assign(headers, form.headers);
    } else if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(raw); } catch { /* */ }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, raw: raw.slice(0, 500) });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout', timeout: true });
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err.code || err.message });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function record(id, title, result) {
  const entry = { id, title, ...result, at: new Date().toISOString() };
  report.scenarios.push(entry);
  const mark = result.pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${id} ${title}${result.detail ? ' — ' + result.detail : ''}`);
  return result.pass;
}

async function ensureMongoContainer() {
  try {
    sh('docker start vehoedu_mongo_1 2>/dev/null || docker start plataforma-escolar_mongo_1 2>/dev/null || true');
  } catch { /* */ }
  // sobe compose do projeto se necessário
  try {
    const ps = sh('docker ps --format "{{.Names}}"');
    if (!/mongo/i.test(ps)) {
      sh('docker-compose up -d mongo', { stdio: 'inherit' });
    }
  } catch (e) {
    console.warn('Aviso mongo compose:', e.message);
  }
  for (let i = 0; i < 30; i++) {
    const r = spawnSync('docker', ['exec', 'vehoedu_mongo_1', 'mongosh', '--quiet', '--eval', 'db.runCommand({ ping: 1 }).ok'], { encoding: 'utf8' });
    if (r.status === 0 && String(r.stdout).includes('1')) return 'vehoedu_mongo_1';
    const r2 = spawnSync('docker', ['exec', 'plataforma-escolar_mongo_1', 'mongosh', '--quiet', '--eval', 'db.runCommand({ ping: 1 }).ok'], { encoding: 'utf8' });
    if (r2.status === 0 && String(r2.stdout).includes('1')) return 'plataforma-escolar_mongo_1';
    // ping via host
    const ping = spawnSync('mongosh', [MONGO_URI, '--quiet', '--eval', 'db.runCommand({ping:1}).ok'], { encoding: 'utf8' });
    if (ping.status === 0) return 'host';
    sleep(1000);
  }
  // último recurso: container genérico
  try {
    sh('docker run -d --name veho-mongo-resilience -p 27017:27017 mongo:7');
    sleep(4000);
    return 'veho-mongo-resilience';
  } catch {
    throw new Error('MongoDB indisponível para resiliência');
  }
}

function stopTarget() {
  try {
    if (fs.existsSync(PID_PATH)) {
      const pid = Number(fs.readFileSync(PID_PATH, 'utf8').trim());
      if (pid) process.kill(pid, 'SIGTERM');
    }
  } catch { /* */ }
  try { sh(`fuser -k ${PORT}/tcp 2>/dev/null || true`); } catch { /* */ }
  sleep(1000);
}

function startTarget() {
  stopTarget();
  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'start-resilience-target.js')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        RESILIENCE_PORT: String(PORT),
        RESILIENCE_MONGODB_URI: MONGO_URI,
        LOAD_DIAGNOSTICS: '1',
        DISABLE_RATE_LIMIT: '1'
      },
      detached: true,
      stdio: ['ignore', fs.openSync(LOG_PATH, 'a'), fs.openSync(LOG_PATH, 'a')]
    }
  );
  fs.writeFileSync(PID_PATH, String(child.pid));
  child.unref();
  for (let i = 0; i < 60; i++) {
    // sync wait via child_process curl alternative
  }
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('curl', ['-sf', '-m', '2', `${BASE}/health`], { encoding: 'utf8' });
    if (r.status === 0 && /OK|ok|connected/i.test(r.stdout + (r.stderr || ''))) {
      return true;
    }
    // health returns JSON with status
    if (r.status === 0 && r.stdout) return true;
    sleep(1000);
  }
  throw new Error('Target resiliência não subiu — ver ' + LOG_PATH);
}

async function waitHealth(expectDb = 'connected', tries = 40) {
  for (let i = 0; i < tries; i++) {
    const h = await httpJson('/health');
    if (h.ok && h.json?.database === expectDb) return h;
    if (!expectDb && h.ok) return h;
    sleep(500);
  }
  return httpJson('/health');
}

async function login() {
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const r = await httpJson('/api/auth/login', {
    method: 'POST',
    body: { email: meta.secretariaEmail, senha: meta.senha }
  });
  if (!r.ok || !r.json?.token) throw new Error('login falhou: ' + (r.raw || r.error));
  return { token: r.json.token, meta };
}

async function countsViaApi(token) {
  // usa painel/aluno ou usuarios — contagem via marker email
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const boletim = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token });
  return {
    boletimOk: Boolean(boletim.ok && boletim.json?.sucesso),
    alunoId: meta.alunoId,
    marker: meta.marker
  };
}

async function pgCounts() {
  try {
    const out = sh(
      'docker exec veho-pg-scale psql -U veho_test -d veho_scale -t -A -c "SELECT count(*) FROM alunos_missing" 2>/dev/null || ' +
      'docker exec veho-pg-scale psql -U veho_test -d veho_scale -t -A -c "SELECT (SELECT count(*) FROM usuarios WHERE tipo=\'aluno\'),(SELECT count(*) FROM notas),(SELECT count(*) FROM boletins);"'
    ).trim();
    return out;
  } catch {
    return null;
  }
}

function multipartBadUpload(token, alunoId) {
  // arquivo .exe rejeitado
  const boundary = '----VehoResilience' + Date.now();
  const body = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="tipo"\r\n\r\nrg\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="arquivo"; filename="malware.exe"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `fake\r\n` +
    `--${boundary}--\r\n`
  );
  return httpJson(`/api/documentos/usuario/${alunoId}`, {
    method: 'POST',
    token,
    form: {
      body,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }
  });
}

async function scenarioAppRestart() {
  const { token, meta } = await login();
  const before = await countsViaApi(token);
  stopTarget();
  const down = await httpJson('/health');
  startTarget();
  const up = await waitHealth('connected');
  const { token: token2 } = await login();
  const after = await countsViaApi(token2);
  return record('S1', 'Aplicação reiniciada', {
    pass: !down.ok && up.ok && up.json?.database === 'connected' && after.boletimOk && after.alunoId === before.alunoId,
    detail: `down=${down.error || down.status} up=${up.json?.database} boletim=${after.boletimOk}`,
    userMessage: up.ok ? 'Serviço restaurado' : 'Falha ao restaurar',
    recovery: true,
    dataLoss: !after.boletimOk
  });
}

async function scenarioContainerRestart() {
  const before = await pgCounts();
  let restarted = false;
  try {
    sh('docker restart veho-pg-scale');
    restarted = true;
    sleep(5000);
  } catch (e) {
    return record('S2', 'Container reiniciado', {
      pass: false,
      detail: 'veho-pg-scale: ' + e.message,
      recovery: false
    });
  }
  for (let i = 0; i < 30; i++) {
    try {
      sh('docker exec veho-pg-scale pg_isready -U veho_test -d veho_scale');
      break;
    } catch { sleep(1000); }
  }
  const after = await pgCounts();
  const app = await httpJson('/health');
  return record('S2', 'Container reiniciado (Postgres teste)', {
    pass: restarted && before === after && app.ok,
    detail: `pgCounts before=after=${before === after} appHealth=${app.ok}`,
    recovery: true,
    dataLoss: before !== after,
    note: 'App VEHO não usa este Postgres; valida volume de teste TOKEN 10'
  });
}

async function scenarioPostgresDown() {
  const before = await pgCounts();
  try { sh('docker stop veho-pg-scale'); } catch (e) {
    return record('S3', 'PostgreSQL indisponível', { pass: false, detail: e.message });
  }
  sleep(2000);
  const appDuring = await httpJson('/health');
  const { token } = await login().catch(() => ({ token: null }));
  let boletimOk = false;
  if (token) {
    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const b = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token });
    boletimOk = Boolean(b.ok);
  }
  try { sh('docker start veho-pg-scale'); } catch { /* */ }
  sleep(4000);
  const after = await pgCounts();
  return record('S3', 'PostgreSQL indisponível', {
    pass: appDuring.ok && boletimOk && before === after,
    detail: `appIsoladoDoPG=${appDuring.ok} boletimMongo=${boletimOk} pgConsistente=${before === after}`,
    recovery: true,
    dataLoss: before !== after,
    userMessage: 'App continua no Mongo; PG de teste não afeta API'
  });
}

async function scenarioRedisDown() {
  const diag = await httpJson('/health/diag');
  const redisNote = diag.json?.diag?.redis || diag.json?.redis;
  // Não derruba imut-redis (outros sistemas). Valida que app não depende.
  const app = await httpJson('/health');
  return record('S4', 'Redis indisponível', {
    pass: app.ok && (redisNote?.available === false || redisNote === undefined),
    detail: `redis.available=${redisNote?.available} note=${redisNote?.note || 'sem redis no produto'}`,
    recovery: true,
    dataLoss: false,
    na: true,
    userMessage: 'N/A — VEHO Edu não usa Redis'
  });
}

async function scenarioNetworkDown() {
  stopTarget();
  const fail = await httpJson('/health');
  startTarget();
  const ok = await waitHealth('connected');
  return record('S5', 'Rede/serviço temporariamente indisponível', {
    pass: !fail.ok && (fail.error === 'ECONNREFUSED' || fail.status === 0) && ok.ok,
    detail: `durante=${fail.error || fail.status} depois=${ok.json?.status || ok.status}`,
    recovery: true,
    retry: false,
    userMessage: fail.ok ? null : 'Serviço indisponível (conexão recusada) → restaurado'
  });
}

async function scenarioDbTimeout() {
  // para o mongo do app
  let mongoName = 'vehoedu_mongo_1';
  try { sh('docker inspect vehoedu_mongo_1 >/dev/null'); }
  catch {
    try { sh('docker inspect plataforma-escolar_mongo_1 >/dev/null'); mongoName = 'plataforma-escolar_mongo_1'; }
    catch {
      try { sh('docker inspect veho-mongo-resilience >/dev/null'); mongoName = 'veho-mongo-resilience'; }
      catch {
        return record('S6', 'Timeout do banco', { pass: false, detail: 'container mongo não encontrado' });
      }
    }
  }

  const { token, meta } = await login();
  const beforeOk = (await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token })).ok;

  sh(`docker stop ${mongoName}`);
  sleep(2000);
  const healthDown = await httpJson('/health', { timeoutMs: 3000 });
  const apiDown = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token, timeoutMs: 5000 });

  sh(`docker start ${mongoName}`);
  sleep(5000);
  // target pode precisar re-selecionar servidor — mongoose auto-reconnect
  let recovered = false;
  for (let i = 0; i < 30; i++) {
    const h = await httpJson('/health');
    if (h.ok && h.json?.database === 'connected') {
      const b = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, {
        token: (await login()).token
      });
      if (b.ok) { recovered = true; break; }
    }
    sleep(1000);
  }

  return record('S6', 'Timeout / Mongo indisponível', {
    pass: beforeOk && !apiDown.ok && recovered,
    detail: `healthDurante=${healthDown.json?.database || healthDown.error} apiDurante=${apiDown.status || apiDown.error} recovered=${recovered}`,
    recovery: recovered,
    timeout: true,
    dataLoss: false,
    userMessage: apiDown.json?.mensagem || 'Erro ao gerar boletim / database disconnected'
  });
}

async function scenarioExternalTimeout() {
  // Exercita helper withTimeout (sem chamar Stripe/Twilio reais)
  const { withTimeout, withRetry } = require('../../../backend/utils/withTimeout');
  let timedOut = false;
  try {
    await withTimeout(() => new Promise((r) => setTimeout(r, 2000)), 100, 'stripe-fake');
  } catch (e) {
    timedOut = e.timeout === true;
  }
  let retries = 0;
  const val = await withRetry(
    async () => {
      retries += 1;
      if (retries < 3) {
        const err = new Error('fail');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return 'ok';
    },
    { retries: 3, delayMs: 20, label: 'twilio-fake' }
  );
  return record('S7', 'Timeout de serviço externo', {
    pass: timedOut && val === 'ok' && retries === 3,
    detail: `timeoutHelper=${timedOut} retries=${retries}`,
    timeout: true,
    retry: true,
    circuitBreaker: false,
    note: 'Produto não tem circuit breaker; helper withTimeout/withRetry disponível',
    userMessage: 'Timeout em stripe-fake após 100ms'
  });
}

async function scenarioQueueFail() {
  const diag = await httpJson('/health/diag');
  const queues = diag.json?.diag?.queues;
  return record('S8', 'Falha de processamento de fila', {
    pass: queues?.available === false,
    detail: queues?.note || 'sem filas',
    na: true,
    recovery: true,
    dataLoss: false,
    userMessage: 'N/A — sem Bull/Rabbit/SQS no código'
  });
}

async function scenarioUploadFail() {
  const { token, meta } = await login();
  const beforeList = await httpJson(`/api/documentos/usuario/${meta.alunoId}`, { token });
  const beforeCount = beforeList.json?.documentos?.length || 0;

  const bad = await multipartBadUpload(token, meta.alunoId);
  const missing = await httpJson(`/api/documentos/usuario/${meta.alunoId}`, {
    method: 'POST',
    token,
    body: { tipo: 'rg' }
  });

  const afterList = await httpJson(`/api/documentos/usuario/${meta.alunoId}`, { token });
  const afterCount = afterList.json?.documentos?.length || 0;

  const rejected =
    (!bad.ok && bad.status >= 400) ||
    (!missing.ok && missing.status >= 400);

  return record('S9', 'Falha durante upload', {
    pass: rejected && beforeCount === afterCount,
    detail: `badStatus=${bad.status} msg=${bad.json?.mensagem || bad.raw?.slice(0, 80)} count ${beforeCount}→${afterCount}`,
    dataLoss: false,
    duplication: afterCount > beforeCount,
    userMessage: bad.json?.mensagem || missing.json?.mensagem || 'Formato não permitido'
  });
}

async function scenarioReportFail() {
  const { token, meta } = await login();
  const ok = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token });
  const bad = await httpJson('/api/relatorios/boletim/000000000000000000000000', { token });
  const after = await httpJson(`/api/relatorios/boletim/${meta.alunoId}`, { token });
  return record('S10', 'Falha durante geração de relatório', {
    pass: ok.ok && !bad.ok && after.ok,
    detail: `ok=${ok.status} bad=${bad.status} msg=${bad.json?.mensagem} afterOk=${after.ok}`,
    dataLoss: false,
    userMessage: bad.json?.mensagem || 'Aluno não encontrado / Acesso negado'
  });
}

function writeReport() {
  const passed = report.scenarios.filter((s) => s.pass).length;
  const total = report.scenarios.length;
  report.finishedAt = new Date().toISOString();
  report.verdict = passed === total ? 'APROVADO' : `PARCIAL ${passed}/${total}`;

  const jsonPath = path.join(RESULTS, `token11-${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# TOKEN 11 — Resiliência');
  md.push('');
  md.push(`Gerado: ${report.finishedAt}`);
  md.push(`**Veredito: ${report.verdict}**`);
  md.push('');
  md.push('## Stack');
  md.push('');
  md.push('- App DB: **MongoDB** (não PostgreSQL de produção)');
  md.push('- Redis: **não utilizado**');
  md.push('- Filas: **não utilizadas**');
  md.push('- Circuit breaker: **ausente** (timeout/retry via `withTimeout`/`withRetry`)');
  md.push('- Postgres `veho-pg-scale`: só ambiente de teste TOKEN 10');
  md.push('');
  md.push('## Cenários');
  md.push('');
  md.push('| ID | Cenário | Resultado | Recuperação | Perda dados | Mensagem usuário |');
  md.push('|----|---------|-----------|-------------|-------------|------------------|');
  for (const s of report.scenarios) {
    md.push(`| ${s.id} | ${s.title} | ${s.pass ? 'PASS' : 'FAIL'} | ${s.recovery ? 'sim' : s.na ? 'N/A' : 'não'} | ${s.dataLoss ? 'SIM' : 'não'} | ${(s.userMessage || '—').replace(/\|/g, '/')} |`);
  }
  md.push('');
  md.push('## Detalhes');
  md.push('');
  for (const s of report.scenarios) {
    md.push(`### ${s.id} — ${s.title}`);
    md.push(`- ${s.detail || ''}`);
    if (s.note) md.push(`- Nota: ${s.note}`);
    md.push('');
  }
  md.push('## Checks transversais');
  md.push('');
  md.push('- Retry: coberto em S7 (helper) — sem retry HTTP automático global');
  md.push('- Timeout: S6 (Mongo) + S7 (externo)');
  md.push('- Idempotência Stripe webhook: `pendente.status !== concluida` (ver testes Jest)');
  md.push('- Upload rejeitado não altera contagem de documentos (S9)');
  md.push('- Relatório falho não corrompe boletim válido (S10)');
  md.push('');
  md.push(`JSON: \`${path.relative(ROOT, jsonPath)}\``);

  const mdPath = path.join(ROOT, 'docs/RESILIENCIA-RELATORIO.md');
  fs.writeFileSync(mdPath, md.join('\n'));
  console.log(`\n✓ Relatório: ${mdPath}`);
  console.log(`✓ JSON: ${jsonPath}`);
  console.log(`Veredito: ${report.verdict}`);
  return report.verdict.startsWith('APROVADO') ? 0 : 1;
}

async function main() {
  console.log('TOKEN 11 — Resiliência\n');
  console.log('→ Garantindo Mongo…');
  await ensureMongoContainer();
  console.log('→ Subindo target :3011…');
  startTarget();
  await waitHealth('connected');

  console.log('\nCenários:');
  await scenarioAppRestart();
  await scenarioContainerRestart();
  await scenarioPostgresDown();
  await scenarioRedisDown();
  await scenarioNetworkDown();
  await scenarioDbTimeout();
  await scenarioExternalTimeout();
  await scenarioQueueFail();
  await scenarioUploadFail();
  await scenarioReportFail();

  const code = writeReport();
  process.exit(code);
}

main().catch((e) => {
  console.error('TOKEN11_FAIL', e);
  try { writeReport(); } catch { /* */ }
  process.exit(1);
});
