#!/usr/bin/env node
/**
 * Cria/atualiza o Web Service no Render + webhook Stripe.
 *
 * Uso:
 *   RENDER_API_KEY=rnd_... node scripts/deploy-render.js
 *   # ou salve RENDER_API_KEY em .env.production e rode:
 *   node scripts/deploy-render.js
 *
 * API key: https://dashboard.render.com/u/settings#api-keys
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env.production');
const statusPath = path.join(ROOT, 'docs', 'GO-LIVE-STATUS.md');
const REPO = 'https://github.com/sepiemtec-commits/plataforma-escolar';
const SERVICE_NAME = 'veho-edu';
const API = 'https://api.render.com/v1';

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 0) return;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

function setEnvKey(file, key, value) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text += (text.endsWith('\n') || !text ? '' : '\n') + `${key}=${value}\n`;
  fs.writeFileSync(file, text);
}

function api(method, apiPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + apiPath);
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let json = null;
          try {
            json = d ? JSON.parse(d) : null;
          } catch {
            json = d;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Render ${method} ${apiPath} → ${res.statusCode}: ${typeof json === 'string' ? json : JSON.stringify(json)}`
            );
            err.status = res.statusCode;
            err.body = json;
            reject(err);
            return;
          }
          resolve(json);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(url, attempts = 36) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const code = await new Promise((resolve) => {
        const req = https.get(`${url}/health`, { timeout: 10000 }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => {
          req.destroy();
          resolve(0);
        });
      });
      if (code === 200) return true;
      process.stdout.write(`  health ${code || '—'} (tentativa ${i}/${attempts})\n`);
    } catch {
      process.stdout.write(`  health erro (tentativa ${i}/${attempts})\n`);
    }
    await sleep(10000);
  }
  return false;
}

function patchStatus(frontendUrl) {
  if (!fs.existsSync(statusPath)) return;
  let md = fs.readFileSync(statusPath, 'utf8');
  md = md.replace(
    /3\. \*\*Render\*\*[^\n]*/,
    `3. ~~**Render**~~ — **feito** → \`${frontendUrl}\``
  );
  if (!md.includes('| Render Web Service |')) {
    md = md.replace(
      /\| `STRIPE_PUBLISHABLE_KEY` \(test\) \| \*\*salvo\*\* em `\.env\.production` \|/,
      `| \`STRIPE_PUBLISHABLE_KEY\` (test) | **salvo** em \`.env.production\` |\n| Render Web Service | **Live** \`${frontendUrl}\` |`
    );
  }
  fs.writeFileSync(statusPath, md);
}

function createStripeWebhook(frontendUrl, stripeKey) {
  const endpoint = `${frontendUrl.replace(/\/$/, '')}/api/assinatura/webhook`;
  try {
    const out = execFileSync(
      'stripe',
      [
        'webhook_endpoints',
        'create',
        '--url',
        endpoint,
        '--enabled-events',
        'checkout.session.completed',
        '--enabled-events',
        'customer.subscription.updated',
        '--enabled-events',
        'customer.subscription.deleted',
        '--enabled-events',
        'invoice.paid',
        '--enabled-events',
        'invoice.payment_failed',
        '-d',
        'api_version=2024-11-20.acacia',
      ],
      {
        env: { ...process.env, STRIPE_API_KEY: stripeKey },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const secretMatch = out.match(/whsec_[A-Za-z0-9]+/);
    const idMatch = out.match(/we_[A-Za-z0-9]+/);
    return { secret: secretMatch ? secretMatch[0] : null, id: idMatch ? idMatch[0] : null, raw: out };
  } catch (e) {
    // fallback: curl-style via stripe raw
    try {
      const out = execFileSync(
        'stripe',
        [
          'post',
          '/v1/webhook_endpoints',
          '-d',
          `url=${endpoint}`,
          '-d',
          'enabled_events[]=checkout.session.completed',
          '-d',
          'enabled_events[]=customer.subscription.updated',
          '-d',
          'enabled_events[]=customer.subscription.deleted',
          '-d',
          'enabled_events[]=invoice.paid',
          '-d',
          'enabled_events[]=invoice.payment_failed',
        ],
        {
          env: { ...process.env, STRIPE_API_KEY: stripeKey },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      const secretMatch = out.match(/"secret":\s*"(whsec_[^"]+)"/) || out.match(/whsec_[A-Za-z0-9]+/);
      const secret = Array.isArray(secretMatch) ? secretMatch[1] || secretMatch[0] : null;
      return { secret, id: null, raw: out };
    } catch (e2) {
      throw new Error(`Falha ao criar webhook Stripe: ${e2.stderr || e2.message || e.message}`);
    }
  }
}

async function main() {
  const fileEnv = loadEnv(envPath);
  const apiKey = process.env.RENDER_API_KEY || fileEnv.RENDER_API_KEY;
  if (!apiKey) {
    console.error(`
Falta RENDER_API_KEY (não consigo criar o serviço sem ela).

1. Abra: https://dashboard.render.com/u/settings#api-keys
2. Create API Key → copie (começa com rnd_)
3. Cole no chat OU rode:

   RENDER_API_KEY=rnd_... node scripts/deploy-render.js
`);
    process.exit(2);
  }

  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ESSENCIAL',
    'STRIPE_PRICE_PROFISSIONAL',
    'STRIPE_PRICE_COMPLETO',
  ];
  for (const k of required) {
    if (!fileEnv[k]) {
      console.error(`Falta ${k} em .env.production`);
      process.exit(1);
    }
  }

  console.log('→ owners Render…');
  const owners = await api('GET', '/owners', null, apiKey);
  const list = Array.isArray(owners) ? owners.map((o) => o.owner || o) : [];
  const owner = list[0];
  if (!owner || !owner.id) {
    console.error('Nenhum workspace Render encontrado para esta API key.');
    process.exit(1);
  }
  const ownerId = owner.id;
  console.log(`  owner: ${owner.name || owner.email || ownerId}`);

  console.log('→ listar services…');
  const servicesRaw = await api('GET', '/services?limit=50', null, apiKey);
  const services = (Array.isArray(servicesRaw) ? servicesRaw : []).map((s) => s.service || s);
  let service = services.find((s) => s.name === SERVICE_NAME);

  if (!service) {
    console.log(`→ criando web service "${SERVICE_NAME}"…`);
    const created = await api(
      'POST',
      '/services',
      {
        type: 'web_service',
        name: SERVICE_NAME,
        ownerId,
        repo: REPO,
        branch: 'master',
        autoDeploy: 'yes',
        envVars: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'PORT', value: '3000' },
          { key: 'ASSINATURA_MODO_DEV', value: 'false' },
          { key: 'JWT_EXPIRE', value: fileEnv.JWT_EXPIRE || '7d' },
          { key: 'MONGODB_URI', value: fileEnv.MONGODB_URI },
          { key: 'JWT_SECRET', value: fileEnv.JWT_SECRET },
          { key: 'ENCRYPTION_KEY', value: fileEnv.ENCRYPTION_KEY || fileEnv.JWT_SECRET },
          { key: 'FRONTEND_URL', value: `https://${SERVICE_NAME}.onrender.com` },
          { key: 'STRIPE_SECRET_KEY', value: fileEnv.STRIPE_SECRET_KEY },
          { key: 'STRIPE_PUBLISHABLE_KEY', value: fileEnv.STRIPE_PUBLISHABLE_KEY || '' },
          { key: 'STRIPE_PRICE_ESSENCIAL', value: fileEnv.STRIPE_PRICE_ESSENCIAL },
          { key: 'STRIPE_PRICE_PROFISSIONAL', value: fileEnv.STRIPE_PRICE_PROFISSIONAL },
          { key: 'STRIPE_PRICE_COMPLETO', value: fileEnv.STRIPE_PRICE_COMPLETO },
          { key: 'STRIPE_WEBHOOK_SECRET', value: fileEnv.STRIPE_WEBHOOK_SECRET || 'whsec_PLACEHOLDER' },
        ],
        serviceDetails: {
          runtime: 'node',
          plan: process.env.RENDER_PLAN || 'free',
          region: 'oregon',
          healthCheckPath: '/health/ready',
          envSpecificDetails: {
            buildCommand: 'npm ci --omit=dev || npm install --omit=dev',
            startCommand: 'node backend/server.js',
          },
        },
      },
      apiKey
    );
    service = created.service || created;
    console.log(`  criado: ${service.id}`);
  } else {
    console.log(`  já existe: ${service.id}`);
  }

  const serviceId = service.id;
  let frontendUrl =
    (service.serviceDetails && service.serviceDetails.url) ||
    `https://${SERVICE_NAME}.onrender.com`;

  console.log(`→ URL prevista: ${frontendUrl}`);
  console.log('→ atualizando env vars…');
  await api(
    'PUT',
    `/services/${serviceId}/env-vars`,
    [
      { key: 'NODE_ENV', value: 'production' },
      { key: 'PORT', value: '3000' },
      { key: 'ASSINATURA_MODO_DEV', value: 'false' },
      { key: 'JWT_EXPIRE', value: fileEnv.JWT_EXPIRE || '7d' },
      { key: 'MONGODB_URI', value: fileEnv.MONGODB_URI },
      { key: 'JWT_SECRET', value: fileEnv.JWT_SECRET },
      { key: 'ENCRYPTION_KEY', value: fileEnv.ENCRYPTION_KEY || fileEnv.JWT_SECRET },
      { key: 'FRONTEND_URL', value: frontendUrl },
      { key: 'STRIPE_SECRET_KEY', value: fileEnv.STRIPE_SECRET_KEY },
      { key: 'STRIPE_PUBLISHABLE_KEY', value: fileEnv.STRIPE_PUBLISHABLE_KEY || '' },
      { key: 'STRIPE_PRICE_ESSENCIAL', value: fileEnv.STRIPE_PRICE_ESSENCIAL },
      { key: 'STRIPE_PRICE_PROFISSIONAL', value: fileEnv.STRIPE_PRICE_PROFISSIONAL },
      { key: 'STRIPE_PRICE_COMPLETO', value: fileEnv.STRIPE_PRICE_COMPLETO },
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        value: fileEnv.STRIPE_WEBHOOK_SECRET || 'whsec_PLACEHOLDER',
      },
    ],
    apiKey
  );

  // Trigger deploy if service already existed
  try {
    console.log('→ disparando deploy…');
    await api('POST', `/services/${serviceId}/deploys`, { clearCache: 'do_not_clear' }, apiKey);
  } catch (e) {
    console.log(`  (deploy auto ou já em andamento: ${e.message.slice(0, 120)})`);
  }

  console.log('→ aguardando health…');
  const ok = await waitHealthy(frontendUrl);
  if (!ok) {
    console.error(`Serviço ainda não respondeu em ${frontendUrl}/health — veja logs no Render.`);
    process.exit(1);
  }
  console.log('  health OK');

  setEnvKey(envPath, 'FRONTEND_URL', frontendUrl);
  setEnvKey(envPath, 'RENDER_API_KEY', apiKey);
  setEnvKey(envPath, 'RENDER_SERVICE_ID', serviceId);

  console.log('→ criando webhook Stripe…');
  let whsec = fileEnv.STRIPE_WEBHOOK_SECRET;
  if (!whsec || !/^whsec_/.test(whsec) || whsec.includes('PLACEHOLDER')) {
    const wh = createStripeWebhook(frontendUrl, fileEnv.STRIPE_SECRET_KEY);
    if (!wh.secret) {
      console.error('Webhook criado mas secret não veio na resposta. Cole o whsec_ do dashboard Stripe.');
      console.error(wh.raw.slice(0, 500));
      process.exit(1);
    }
    whsec = wh.secret;
    setEnvKey(envPath, 'STRIPE_WEBHOOK_SECRET', whsec);
    console.log(`  webhook OK${wh.id ? ` (${wh.id})` : ''}`);
    await api(
      'PUT',
      `/services/${serviceId}/env-vars`,
      [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'PORT', value: '3000' },
        { key: 'ASSINATURA_MODO_DEV', value: 'false' },
        { key: 'JWT_EXPIRE', value: fileEnv.JWT_EXPIRE || '7d' },
        { key: 'MONGODB_URI', value: fileEnv.MONGODB_URI },
        { key: 'JWT_SECRET', value: fileEnv.JWT_SECRET },
        { key: 'ENCRYPTION_KEY', value: fileEnv.ENCRYPTION_KEY || fileEnv.JWT_SECRET },
        { key: 'FRONTEND_URL', value: frontendUrl },
        { key: 'STRIPE_SECRET_KEY', value: fileEnv.STRIPE_SECRET_KEY },
        { key: 'STRIPE_PUBLISHABLE_KEY', value: fileEnv.STRIPE_PUBLISHABLE_KEY || '' },
        { key: 'STRIPE_PRICE_ESSENCIAL', value: fileEnv.STRIPE_PRICE_ESSENCIAL },
        { key: 'STRIPE_PRICE_PROFISSIONAL', value: fileEnv.STRIPE_PRICE_PROFISSIONAL },
        { key: 'STRIPE_PRICE_COMPLETO', value: fileEnv.STRIPE_PRICE_COMPLETO },
        { key: 'STRIPE_WEBHOOK_SECRET', value: whsec },
      ],
      apiKey
    );
    try {
      await api('POST', `/services/${serviceId}/deploys`, { clearCache: 'do_not_clear' }, apiKey);
    } catch {
      /* ignore */
    }
  } else {
    console.log('  webhook secret já existia no .env.production');
  }

  patchStatus(frontendUrl);

  if (fs.existsSync(statusPath)) {
    let md = fs.readFileSync(statusPath, 'utf8');
    md = md.replace(
      /4\. \*\*Webhook Stripe\*\*[^\n]*/,
      '4. ~~**Webhook Stripe**~~ — **feito** (`whsec_` salvo)'
    );
    fs.writeFileSync(statusPath, md);
  }

  console.log(`
Pronto.
  FRONTEND_URL=${frontendUrl}
  Dashboard: https://dashboard.render.com/web/${serviceId}
`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
