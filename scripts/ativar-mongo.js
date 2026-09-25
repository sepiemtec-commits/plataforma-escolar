#!/usr/bin/env node
/**
 * Ativa Mongo de produção: testa MONGODB_URI em .env.production
 * e marca MONGODB_ATIVADO=true se a conexão funcionar.
 *
 * Uso: node scripts/ativar-mongo.js
 */
const fs = require('fs');
const path = require('path');
const http = require('https');
const mongoose = require('mongoose');

const envPath = path.join(__dirname, '..', '.env.production');
const statusPath = path.join(__dirname, '..', 'docs', 'GO-LIVE-STATUS.md');

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

function setEnvFlag(file, key, value) {
  let text = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text += `\n${key}=${value}\n`;
  fs.writeFileSync(file, text);
}

function fetchIp() {
  return new Promise((resolve) => {
    http
      .get('https://api.ipify.org', (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(d.trim() || 'desconhecido'));
      })
      .on('error', () => resolve('desconhecido'));
  });
}

function patchStatus(ativado, detail) {
  if (!fs.existsSync(statusPath)) return;
  let md = fs.readFileSync(statusPath, 'utf8');
  md = md.replace(
    /\| MongoDB Atlas \(cluster \+ URI\) \|.*\|/,
    `| MongoDB Atlas (cluster + URI) | **guardado** em \`.env.production\` · \`MONGODB_ATIVADO=${ativado}\` |`
  );
  if (ativado === 'true') {
    md = md.replace(
      /1\. \*\*Ativar Mongo\*\*[^\n]*/,
      '1. ~~**Ativar Mongo**~~ — **feito** (conexão Atlas OK)'
    );
  }
  const stamp = `\n\n<!-- ativar-mongo ${new Date().toISOString()} ${detail} -->\n`;
  if (!md.includes('<!-- ativar-mongo')) md += stamp;
  else md = md.replace(/<!-- ativar-mongo[\s\S]*?-->/, stamp.trim());
  fs.writeFileSync(statusPath, md);
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error('✗ .env.production não encontrado');
    process.exit(1);
  }
  const env = loadEnv(envPath);
  const uri = env.MONGODB_URI;
  if (!uri || /USER:SENHA|xxxxx|SUBSTITUA/i.test(uri)) {
    console.error('✗ MONGODB_URI inválida ou placeholder em .env.production');
    process.exit(1);
  }

  console.log('Testando conexão Atlas…');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    await mongoose.connection.db.admin().command({ ping: 1 });
    const db = mongoose.connection.name;
    await mongoose.disconnect();

    setEnvFlag(envPath, 'MONGODB_ATIVADO', 'true');
    patchStatus('true', `ok db=${db}`);
    console.log(`✓ Mongo Atlas conectado (db=${db})`);
    console.log('✓ MONGODB_ATIVADO=true em .env.production');
    console.log('✓ docs/GO-LIVE-STATUS.md atualizado');
    process.exit(0);
  } catch (err) {
    const ip = await fetchIp();
    setEnvFlag(envPath, 'MONGODB_ATIVADO', 'false');
    patchStatus('false', `blocked ip=${ip}`);
    console.error('✗ Não conectou ao Atlas');
    console.error(`  Motivo: ${String(err.message || err).split('\n')[0]}`);
    console.error('');
    console.error('Faça isto no Atlas (1 minuto):');
    console.error('  1. https://cloud.mongodb.com → Network Access');
    console.error('  2. Add IP Address → Allow Access from Anywhere (0.0.0.0/0)');
    console.error(`     (ou só este IP: ${ip})`);
    console.error('  3. Confirm → aguarde ~1 min');
    console.error('  4. Rode de novo: node scripts/ativar-mongo.js');
    process.exit(1);
  }
}

main();
