#!/usr/bin/env node
/**
 * TOKEN 10 — Escalabilidade PostgreSQL (ambiente de teste isolado).
 * Não altera MongoDB de produção. Espelha domínio acadêmico VEHO Edu em PG.
 *
 * Uso:
 *   node tests/database/scripts/run-token10.js
 *   SCALE_ALUNOS=100000 node tests/database/scripts/run-token10.js
 *   SCALE_ALUNOS=1000000 node tests/database/scripts/run-token10.js
 */
'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DB_DIR = path.join(ROOT, 'tests/database');
const RESULTS = path.join(DB_DIR, 'results');
const COMPOSE = path.join(DB_DIR, 'docker-compose.pg-scale.yml');
const CONTAINER = 'veho-pg-scale';
const PGUSER = 'veho_test';
const PGDATABASE = 'veho_scale';

const SCALE_STEPS = (process.env.SCALE_ALUNOS || '100000,1000000')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n > 0);

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...opts
  });
}

function psql(sql, opts = {}) {
  const args = [
    'exec', '-i', CONTAINER,
    'psql', '-U', PGUSER, '-d', PGDATABASE,
    '-v', 'ON_ERROR_STOP=1',
    '-P', 'pager=off'
  ];
  if (opts.tuplesOnly) args.push('-t', '-A');
  if (opts.quiet) args.push('-q');
  const r = spawnSync('docker', args, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').slice(0, 4000);
    throw new Error(`psql failed (${r.status}): ${err}`);
  }
  return r.stdout;
}

function ensureUp() {
  try {
    const ready = sh(`docker exec ${CONTAINER} pg_isready -U ${PGUSER} -d ${PGDATABASE}`);
    if (ready.includes('accepting')) {
      console.log('✓ Postgres já pronto');
      return;
    }
  } catch (_) { /* sobe abaixo */ }

  console.log('→ Subindo PostgreSQL de teste (porta 55432)...');
  sh(`docker-compose -f "${COMPOSE}" up -d`, { stdio: 'inherit' });
  for (let i = 0; i < 60; i++) {
    try {
      const out = sh(`docker exec ${CONTAINER} pg_isready -U ${PGUSER} -d ${PGDATABASE}`);
      if (out.includes('accepting')) {
        console.log('✓ Postgres pronto');
        return;
      }
    } catch (_) { /* retry */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error('Postgres não ficou ready a tempo');
}

function loadSeedFn() {
  const sql = fs.readFileSync(path.join(DB_DIR, 'sql/02_seed_function.sql'), 'utf8');
  psql(sql);
}

function seed(alunos) {
  console.log(`\n=== SEED ${alunos.toLocaleString('pt-BR')} alunos ===`);
  const out = psql(`SELECT * FROM veho_seed_scale(${alunos});`);
  console.log(out);
  return out;
}

function counts() {
  const out = psql(`
    SELECT 'escolas' t, count(*)::text c FROM escolas
    UNION ALL SELECT 'usuarios', count(*)::text FROM usuarios
    UNION ALL SELECT 'alunos', count(*)::text FROM usuarios WHERE tipo='aluno'
    UNION ALL SELECT 'turmas', count(*)::text FROM turmas
    UNION ALL SELECT 'matriculas', count(*)::text FROM matriculas
    UNION ALL SELECT 'notas', count(*)::text FROM notas
    UNION ALL SELECT 'frequencias', count(*)::text FROM frequencias
    UNION ALL SELECT 'boletins', count(*)::text FROM boletins
    UNION ALL SELECT 'responsaveis', count(*)::text FROM responsaveis
    UNION ALL SELECT 'relacionados', (
      (SELECT count(*) FROM matriculas)
      + (SELECT count(*) FROM notas)
      + (SELECT count(*) FROM frequencias)
      + (SELECT count(*) FROM boletins)
      + (SELECT count(*) FROM responsaveis)
    )::text
    ORDER BY 1;
  `, { tuplesOnly: true });
  const map = {};
  out.trim().split('\n').forEach((line) => {
    const [t, c] = line.split('|');
    if (t) map[t] = Number(c);
  });
  return map;
}

function pickIds() {
  const raw = psql(`
    SELECT
      (SELECT id FROM escolas ORDER BY id LIMIT 1),
      (SELECT id FROM turmas WHERE escola_id = (SELECT id FROM escolas ORDER BY id LIMIT 1) ORDER BY id LIMIT 1),
      (SELECT u.id FROM usuarios u
         JOIN matriculas m ON m.aluno_id = u.id
         JOIN turmas t ON t.id = m.turma_id
        WHERE u.tipo='aluno' AND t.escola_id = (SELECT id FROM escolas ORDER BY id LIMIT 1)
        ORDER BY u.id LIMIT 1);
  `, { tuplesOnly: true }).trim();
  const [escolaId, turmaId, alunoId] = raw.split('|').map(Number);
  return { escolaId, turmaId, alunoId };
}

function explain(label, sql) {
  const plan = psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\n${sql}`);
  const execMatch = plan.match(/Execution Time:\s*([\d.]+)\s*ms/);
  const planMatch = plan.match(/Planning Time:\s*([\d.]+)\s*ms/);
  const seq = (plan.match(/Seq Scan/g) || []).length;
  const idx = (plan.match(/Index (?:Only )?Scan|Bitmap/g) || []).length;
  return {
    label,
    executionMs: execMatch ? Number(execMatch[1]) : null,
    planningMs: planMatch ? Number(planMatch[1]) : null,
    seqScans: seq,
    indexAccess: idx,
    plan
  };
}

function suiteQueries(ids) {
  const { escolaId, turmaId, alunoId } = ids;
  const page = 0;
  const pageSize = 50;

  return [
    {
      label: 'Q1_lista_alunos_filtro_paginacao_ordenacao',
      sql: `
        SELECT id, nome, email, matricula
        FROM usuarios
        WHERE escola_id = ${escolaId} AND tipo = 'aluno' AND ativo = TRUE
        ORDER BY nome
        LIMIT ${pageSize} OFFSET ${page * pageSize};
      `
    },
    {
      label: 'Q2_join_turma_matriculas_alunos',
      sql: `
        SELECT t.nome AS turma, u.nome AS aluno, u.matricula
        FROM turmas t
        JOIN matriculas m ON m.turma_id = t.id AND m.ativo
        JOIN usuarios u ON u.id = m.aluno_id
        WHERE t.escola_id = ${escolaId}
        ORDER BY t.nome, u.nome
        LIMIT 200;
      `
    },
    {
      label: 'Q3_grade_notas_turma_disciplina',
      sql: `
        SELECT u.nome, n.periodo, n.tipo, n.nota
        FROM notas n
        JOIN usuarios u ON u.id = n.aluno_id
        WHERE n.turma_id = ${turmaId} AND n.disciplina = 'Matemática'
        ORDER BY u.nome, n.periodo, n.tipo;
      `
    },
    {
      label: 'Q4_frequencia_turma_periodo',
      sql: `
        SELECT f.data, f.status, count(*) AS qtd
        FROM frequencias f
        WHERE f.turma_id = ${turmaId}
          AND f.data BETWEEN DATE '2026-03-01' AND DATE '2026-04-30'
        GROUP BY f.data, f.status
        ORDER BY f.data, f.status;
      `
    },
    {
      label: 'Q5_boletim_aluno',
      sql: `
        SELECT b.disciplina, b.periodo, b.media_geral, b.frequencia_pct, b.situacao,
               (SELECT round(avg(n.nota)::numeric,1) FROM notas n
                 WHERE n.aluno_id = b.aluno_id AND n.disciplina = b.disciplina) AS media_notas
        FROM boletins b
        WHERE b.aluno_id = ${alunoId}
        ORDER BY b.periodo, b.disciplina;
      `
    },
    {
      label: 'Q6_dashboard_recuperacao',
      sql: `
        SELECT u.nome, t.nome AS turma, b.disciplina, b.media_geral, b.situacao
        FROM boletins b
        JOIN usuarios u ON u.id = b.aluno_id
        JOIN turmas t ON t.id = b.turma_id
        WHERE t.escola_id = ${escolaId}
          AND b.situacao IN ('recuperacao','reprovado')
        ORDER BY b.media_geral NULLS LAST
        LIMIT 50;
      `
    },
    {
      label: 'Q7_relatorio_agregado_escola',
      sql: `
        SELECT
          t.nome AS turma,
          (SELECT count(*) FROM matriculas m WHERE m.turma_id = t.id AND m.ativo) AS alunos,
          (SELECT round(avg(b.media_geral)::numeric, 2) FROM boletins b WHERE b.turma_id = t.id) AS media,
          (SELECT count(*) FROM boletins b WHERE b.turma_id = t.id AND b.situacao = 'recuperacao') AS em_recuperacao,
          (SELECT round(avg(b.frequencia_pct)::numeric, 2) FROM boletins b WHERE b.turma_id = t.id) AS freq_media
        FROM turmas t
        WHERE t.escola_id = ${escolaId}
        ORDER BY t.nome
        LIMIT 100;
      `
    },
    {
      label: 'Q8_join_unico_vs_nplus1_pattern',
      sql: `
        -- padrão correto (1 query com joins) vs N+1 da API Mongo (populate em loop)
        SELECT r.usuario_id, resp.nome AS responsavel, a.id AS aluno_id, a.nome AS aluno,
               b.media_geral, b.situacao
        FROM responsaveis r
        JOIN usuarios resp ON resp.id = r.usuario_id
        JOIN usuarios a ON a.id = r.aluno_id
        LEFT JOIN boletins b ON b.aluno_id = a.id
        WHERE a.escola_id = ${escolaId}
        ORDER BY resp.nome, a.nome
        LIMIT 100;
      `
    }
  ];
}

function listIndexes() {
  return psql(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);
}

function poolAndLocks() {
  return {
    settings: psql(`
      SHOW max_connections;
      SHOW shared_buffers;
      SHOW work_mem;
    `),
    activity: psql(`
      SELECT count(*) AS connections,
             count(*) FILTER (WHERE state = 'active') AS active,
             count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_locks
      FROM pg_stat_activity
      WHERE datname = current_database();
    `),
    locks: psql(`
      SELECT locktype, mode, granted, count(*)
      FROM pg_locks
      GROUP BY 1,2,3
      ORDER BY 4 DESC
      LIMIT 20;
    `),
    deadlocks: psql(`
      SELECT deadlocks FROM pg_stat_database WHERE datname = current_database();
    `)
  };
}

function txContentionDemo() {
  // duas atualizações na mesma linha em serial — mede lock wait via advisory
  const sql = `
    BEGIN;
    SELECT pg_advisory_xact_lock(42);
    UPDATE boletins SET atualizado_em = now()
      WHERE id = (SELECT id FROM boletins ORDER BY id LIMIT 1);
    COMMIT;
    SELECT 'ok_tx' AS status;
  `;
  return psql(sql);
}

function applyOptimize() {
  console.log('\n→ Aplicando índices de otimização (teste only)...');
  for (const rel of ['sql/03_optimize_indexes.sql', 'sql/03b_optimize_report.sql']) {
    const file = path.join(DB_DIR, rel);
    if (!fs.existsSync(file)) continue;
    const r = spawnSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', PGUSER, '-d', PGDATABASE, '-v', 'ON_ERROR_STOP=1'],
      { input: fs.readFileSync(file), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    if (r.status !== 0) {
      console.warn(`${rel} CONCURRENTLY falhou, retry sem CONCURRENTLY...`);
      const plain = fs.readFileSync(file, 'utf8').replace(/ CONCURRENTLY/g, '');
      psql(plain);
    } else {
      console.log(r.stdout.slice(-400));
    }
  }
}

function dropNonPkIndexes() {
  psql(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT indexname FROM pg_indexes
        WHERE schemaname='public'
          AND indexname LIKE 'idx_%'
      LOOP
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.indexname);
      END LOOP;
      UPDATE meta_scale SET valor='baseline', atualizado_em=now() WHERE chave='fase';
      UPDATE meta_scale SET valor='pk_fk_only', atualizado_em=now() WHERE chave='indexes';
    END $$;
  `);
}

function runBenchmark(phase, ids) {
  const results = [];
  for (const q of suiteQueries(ids)) {
    process.stdout.write(`  ${phase}/${q.label}... `);
    const r = explain(q.label, q.sql);
    console.log(`${r.executionMs} ms (seq=${r.seqScans} idx=${r.indexAccess})`);
    results.push(r);
  }
  return results;
}

function nplus1Demo(ids) {
  // simula N+1: 20 round-trips vs 1 join
  const t0 = Date.now();
  psql(`
    DO $$
    DECLARE r RECORD; dummy TEXT;
    BEGIN
      FOR r IN
        SELECT id FROM usuarios
        WHERE escola_id = ${ids.escolaId} AND tipo='aluno'
        ORDER BY id LIMIT 20
      LOOP
        SELECT nome INTO dummy FROM usuarios WHERE id = r.id;
        SELECT count(*) INTO dummy FROM boletins WHERE aluno_id = r.id;
        SELECT count(*) INTO dummy FROM frequencias WHERE aluno_id = r.id;
      END LOOP;
    END $$;
  `);
  const nplus1Ms = Date.now() - t0;

  const t1 = Date.now();
  psql(`
    SELECT u.id, u.nome,
           (SELECT count(*) FROM boletins b WHERE b.aluno_id = u.id) AS boletim_linhas,
           (SELECT count(*) FROM frequencias f WHERE f.aluno_id = u.id) AS freq_linhas
    FROM usuarios u
    WHERE u.escola_id = ${ids.escolaId} AND u.tipo='aluno'
    ORDER BY u.id
    LIMIT 20;
  `);
  const joinMs = Date.now() - t1;

  return { nplus1Ms, joinMs, ratio: nplus1Ms / Math.max(joinMs, 1) };
}

function writeReport(payload) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(RESULTS, `token10-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const md = [];
  md.push('# TOKEN 10 — Escalabilidade do banco (PostgreSQL de teste)');
  md.push('');
  md.push(`Gerado: ${new Date().toISOString()}`);
  md.push('');
  md.push('## Contexto');
  md.push('');
  md.push('- **Produção VEHO Edu:** MongoDB 7 + Mongoose (não PostgreSQL).');
  md.push('- **Este TOKEN:** PostgreSQL 16 isolado (`veho-pg-scale`, porta `55432`) espelhando alunos/turmas/notas/frequência/boletins.');
  md.push('- **Produção não foi alterada.** Otimizações só no container de teste.');
  md.push('');
  md.push('## Escala seed');
  md.push('');
  for (const s of payload.scales) {
    md.push(`### ${s.alunos.toLocaleString('pt-BR')} alunos`);
    md.push('');
    md.push('| Tabela | Linhas |');
    md.push('|--------|--------|');
    Object.entries(s.counts).forEach(([k, v]) => {
      md.push(`| ${k} | ${Number(v).toLocaleString('pt-BR')} |`);
    });
    md.push('');
  }
  md.push('## Benchmark EXPLAIN ANALYZE');
  md.push('');
  md.push('| Escala | Fase | Query | Exec (ms) | SeqScan | Index |');
  md.push('|--------|------|-------|-----------|---------|-------|');
  for (const s of payload.scales) {
    for (const phase of ['baseline', 'optimized']) {
      for (const q of s.benchmarks[phase] || []) {
        md.push(`| ${s.alunos} | ${phase} | ${q.label} | ${q.executionMs} | ${q.seqScans} | ${q.indexAccess} |`);
      }
    }
  }
  md.push('');
  md.push('## N+1');
  md.push('');
  for (const s of payload.scales) {
    if (s.nplus1) {
      md.push(`- **${s.alunos} alunos:** N+1=${s.nplus1.nplus1Ms}ms vs join=${s.nplus1.joinMs}ms (×${s.nplus1.ratio.toFixed(1)})`);
    }
  }
  md.push('');
  md.push('## Pool / locks / deadlocks');
  md.push('```');
  md.push(JSON.stringify(payload.poolLocks, null, 2).slice(0, 3000));
  md.push('```');
  md.push('');
  md.push('## Índices');
  md.push('- Baseline: apenas PK/UNIQUE/FK.');
  md.push('- Otimizado: ver `tests/database/sql/03_optimize_indexes.sql`.');
  md.push('');
  md.push('## Achados aplicáveis ao Mongo de produção');
  md.push('');
  md.push(payload.mongoFindings.map((x) => `- ${x}`).join('\n'));
  md.push('');
  md.push(`JSON completo: \`${path.relative(ROOT, jsonPath)}\``);

  const mdPath = path.join(ROOT, 'docs/ESCALABILIDADE-BANCO-RELATORIO.md');
  fs.writeFileSync(mdPath, md.join('\n'));
  console.log(`\n✓ Relatório: ${mdPath}`);
  console.log(`✓ JSON: ${jsonPath}`);
  return { jsonPath, mdPath };
}

function mongoFindings() {
  return [
    'Schema Mongo sem índices compostos em Avaliacao (turma_id+disciplina), Desempenho (aluno_id/turma_id+situacao), Usuario (escola_id+tipo+nome), Turma (escola_id).',
    'Presenca tem unique (aluno_id,data,tempo) mas falta índice (turma_id,data) usado em dashboards/chamada.',
    'Painel/relatórios fazem Presenca.find({turma_id:{$in}}) sem projeção/agregação — padrão N+1 / full collection scan sob escala.',
    'Turma.populate(\"alunos\") carrega documentos completos; em turmas grandes amplifica I/O (equivalente a join sem covering index).',
    'Pool Mongoose já foi elevado (MONGO_MAX_POOL) após spike; manter waitQueueTimeoutMS e fail-fast LOGIN_BUSY.',
    'Recomendação prod (quando aprovado): índices Mongo espelhando 03_optimize_indexes.sql + aggregations no dashboard em vez de find+loop.'
  ];
}

function main() {
  fs.mkdirSync(RESULTS, { recursive: true });
  ensureUp();
  loadSeedFn();

  const payload = {
    startedAt: new Date().toISOString(),
    engine: 'PostgreSQL 16 (test-only mirror)',
    productionDb: 'MongoDB',
    scales: [],
    poolLocks: null,
    mongoFindings: mongoFindings()
  };

  for (const alunos of SCALE_STEPS) {
    const scale = { alunos, counts: null, benchmarks: {}, nplus1: null };
    seed(alunos);
    scale.counts = counts();
    console.log('Contagens:', scale.counts);

    dropNonPkIndexes();
    const ids = pickIds();
    console.log('IDs amostra:', ids);

    console.log('\n— Baseline (sem índices secundários) —');
    scale.benchmarks.baseline = runBenchmark('baseline', ids);
    scale.nplus1 = nplus1Demo(ids);
    console.log('N+1 demo:', scale.nplus1);

    applyOptimize();
    console.log('\n— Otimizado —');
    scale.benchmarks.optimized = runBenchmark('optimized', ids);

    scale.indexesAfter = listIndexes();
    payload.scales.push(scale);

    // se 100k e ainda vai rodar 1M, continua; se só 1M ok
  }

  payload.poolLocks = poolAndLocks();
  try { txContentionDemo(); } catch (e) {
    payload.poolLocks.txError = String(e.message || e);
  }
  payload.finishedAt = new Date().toISOString();
  writeReport(payload);
}

try {
  main();
} catch (e) {
  console.error('TOKEN10_FAIL', e.message || e);
  process.exit(1);
}
