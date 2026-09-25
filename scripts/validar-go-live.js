#!/usr/bin/env node
/**
 * Valida se o ambiente está pronto para go-live.
 * Uso: node scripts/validar-go-live.js
 *      node scripts/validar-go-live.js --env .env.production
 */
const fs = require('fs');
const path = require('path');

const envPath = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : path.join(__dirname, '..', '.env');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 0) return;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

const env = { ...process.env, ...loadEnv(envPath) };
const checks = [];

function ok(label, pass, hint) {
  checks.push({ label, pass: Boolean(pass), hint });
}

ok('Arquivo env existe', fs.existsSync(envPath), `Crie a partir de .env.production.example → ${envPath}`);
ok('NODE_ENV=production', env.NODE_ENV === 'production', 'Defina NODE_ENV=production');
ok('ASSINATURA_MODO_DEV=false', String(env.ASSINATURA_MODO_DEV).toLowerCase() === 'false', 'Desative modo dev de assinatura');
ok('MONGODB_URI', Boolean(env.MONGODB_URI), 'URI Atlas ou Mongo gerenciado');
ok(
  'JWT_SECRET forte (≥32)',
  env.JWT_SECRET && env.JWT_SECRET.length >= 32 && !/SUBSTITUA|changeme|senha/i.test(env.JWT_SECRET),
  'openssl rand -hex 32'
);
ok(
  'FRONTEND_URL HTTPS',
  /^https:\/\/[^/]+$/i.test(env.FRONTEND_URL || '') || /^https:\/\/.+/i.test(env.FRONTEND_URL || ''),
  'Ex: https://app.seudominio.com.br'
);
ok(
  'STRIPE_SECRET_KEY',
  /^sk_(live|test)_/.test(env.STRIPE_SECRET_KEY || '') || /^rk_/.test(env.STRIPE_SECRET_KEY || ''),
  'Chave Stripe (live para venda real)'
);
ok('STRIPE_WEBHOOK_SECRET', /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET || ''), 'whsec_ do endpoint de webhook');
ok('STRIPE_PRICE_ESSENCIAL', /^price_/.test(env.STRIPE_PRICE_ESSENCIAL || ''), 'Price ID Essencial');
ok('STRIPE_PRICE_PROFISSIONAL', /^price_/.test(env.STRIPE_PRICE_PROFISSIONAL || ''), 'Price ID Profissional');
ok('STRIPE_PRICE_COMPLETO', /^price_/.test(env.STRIPE_PRICE_COMPLETO || ''), 'Price ID Completo');

const live = (env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
if (live) {
  ok('Stripe live (venda real)', true);
} else if (env.STRIPE_SECRET_KEY) {
  ok('Stripe test (só demo)', true, 'Troque para sk_live_ antes de cobrar clientes');
}

console.log(`\nValidação go-live — ${envPath}\n`);
let failed = 0;
checks.forEach((c) => {
  const mark = c.pass ? '✓' : '✗';
  console.log(`${mark} ${c.label}${c.pass || !c.hint ? '' : ` — ${c.hint}`}`);
  if (!c.pass) failed++;
});
console.log(`\n${failed === 0 ? 'Pronto para go-live (env).' : `${failed} item(ns) pendente(s).`}\n`);
process.exit(failed === 0 ? 0 : 1);
