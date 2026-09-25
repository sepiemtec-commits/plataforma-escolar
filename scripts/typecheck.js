#!/usr/bin/env node
/**
 * Typecheck leve para JS sem TypeScript: `node --check` em todos os .js do backend/scripts.
 * Falha se houver erro de sintaxe.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = ['backend', 'scripts', 'database'];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(full, acc);
    } else if (name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    const msg = (err.stderr && err.stderr.toString()) || err.message;
    console.error(`FAIL ${path.relative(ROOT, file)}\n${msg}`);
  }
}

if (failed) {
  console.error(`\ntypecheck: ${failed}/${files.length} arquivo(s) com erro de sintaxe`);
  process.exit(1);
}

console.log(`typecheck: OK (${files.length} arquivos, node --check)`);
