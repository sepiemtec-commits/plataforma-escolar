#!/usr/bin/env node
/**
 * Consolida k6 summary + monitor endurance → docs/ENDURANCE-RELATORIO.md
 */
const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const monPath = arg('mon');
const k6Path = arg('k6');
const label = arg('label') || 'E1';

const mon = monPath ? JSON.parse(fs.readFileSync(monPath, 'utf8')) : null;
const k6 = k6Path ? JSON.parse(fs.readFileSync(k6Path, 'utf8')) : null;

function m(summary, name, field) {
  if (!summary || !summary.metrics || !summary.metrics[name]) return null;
  const v = summary.metrics[name].values || summary.metrics[name];
  return field ? v[field] : v;
}

let md = `# Relatório TOKEN 09 — Endurance (${label})\n\n`;
md += `Gerado: ${new Date().toISOString()}\n\n`;
md += `> O gargalo do spike (pool Mongo) **não foi corrigido** — endurance mede degradação no tempo sob carga constante.\n\n`;

if (k6) {
  md += `## k6\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| req/s | ${m(k6, 'http_reqs', 'rate') ?? '—'} |\n`;
  md += `| erro % | ${m(k6, 'http_req_failed', 'rate') != null ? (m(k6, 'http_req_failed', 'rate') * 100).toFixed(2) + '%' : '—'} |\n`;
  md += `| p95 | ${m(k6, 'http_req_duration', 'p(95)') != null ? m(k6, 'http_req_duration', 'p(95)').toFixed(0) + ' ms' : '—'} |\n`;
  md += `| p99 | ${m(k6, 'http_req_duration', 'p(99)') != null ? m(k6, 'http_req_duration', 'p(99)').toFixed(0) + ' ms' : '—'} |\n`;
  md += `| 5xx | ${m(k6, 'errors_5xx', 'count') ?? '—'} |\n`;
  md += `| timeouts | ${m(k6, 'timeouts', 'count') ?? '—'} |\n\n`;
}

if (mon) {
  md += `## Início vs meio vs fim\n\n`;
  md += `| Fase | RSS MiB | Heap MiB | CPU % | EL p95 ms | pool wait | refreshTokens | temp MiB |\n`;
  md += `|------|---------|----------|-------|-----------|-----------|---------------|----------|\n`;
  for (const [nome, f] of [
    ['início', mon.fases.inicio],
    ['meio', mon.fases.meio],
    ['fim', mon.fases.fim]
  ]) {
    if (!f) continue;
    md += `| ${nome} | ${f.rssMb ?? '—'} | ${f.heapMb ?? '—'} | ${f.cpu ?? '—'} | ${f.eventLoopP95 ?? '—'} | ${f.poolWait ?? '—'} | ${f.refreshTokens ?? '—'} | ${f.tempMb ?? '—'} |\n`;
  }
  md += `\n### Crescimento início→fim (%)\n\n`;
  md += '```json\n' + JSON.stringify(mon.crescimentoPct, null, 2) + '\n```\n\n';
  md += `### Degradacões\n\n`;
  if (!mon.degradacoes || !mon.degradacoes.length) {
    md += `- Nenhuma degradação progressiva acima dos limiares.\n`;
  } else {
    for (const d of mon.degradacoes) {
      md += `- **${d.tipo}** (${d.severidade}): ${d.metrica} ${d.growthPct != null ? d.growthPct + '%' : d.deltaMb != null ? '+' + d.deltaMb + ' MiB' : ''}\n`;
    }
  }
  md += `\n### Veredito\n\n`;
  md += mon.aprovado
    ? `**APROVADO** (online ${mon.onlinePct}%, sem degradação alta).\n`
    : `**NÃO APROVADO** (online ${mon.onlinePct}%). Permanecer online não basta.\n`;
  md += `\n${mon.criterio}\n`;
}

md += `\n## Redis / filas / cache\n\n`;
md += `- Redis: N/A\n- Filas: N/A\n- Cache app: N/A (JWT stateless)\n`;

const out = path.join(__dirname, '../../../docs/ENDURANCE-RELATORIO.md');
fs.writeFileSync(out, md);
console.log(md);
console.log(`→ ${out}`);
