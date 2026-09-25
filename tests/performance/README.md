# Performance / carga (k6) — TOKEN 07

Testes de carga do SaaS VEHO Edu com jornada realista (login → operações → logout).

## Estrutura

```
tests/performance/
  k6/
    lib/           # config, auth, ops, métricas
    saas-journey.js
    scenarios/
      smoke.js     # 5 VUs / 30s
      A-100.js     # 100 VUs
      B-500.js     # 500 VUs
      C-1000.js    # 1.000 VUs
      D-5000.js    # 5.000 VUs (ALLOW_HEAVY=1)
      E-10000.js   # 10.000 VUs (ALLOW_HEAVY=1 + ALLOW_10K=1)
    load.js / stress.js / spike.js / endurance.js  # legados
  scripts/
    check-capacity.js
    collect-system-metrics.js
    run-progressive.sh
    summarize-results.js
  results/         # JSON/TXT gerados (gitignored parcial)
```

## Pré-requisitos

1. **k6** instalado ([docs](https://k6.io/docs/get-started/installation/)) ou binário em `tools/bin/k6`
2. Servidor no ar com seed e **`DISABLE_RATE_LIMIT=1`** (senão o login em massa toma 429)
3. Credenciais: `LOAD_EMAIL` / `LOAD_PASSWORD` (default `secretaria@escola.com` / senha do seed)

```bash
DISABLE_RATE_LIMIT=1 npm start
# outro terminal:
npm run seed   # se ainda não populou
```

## Distribuição de operações (pós-login)

| Operação | Peso | Endpoint(s) |
|----------|------|-------------|
| dashboard | 18% | `/api/painel/{papel}` |
| alunos | 12% | `/api/usuarios?tipo=aluno` |
| professores | 8% | `/api/turmas/professores/lista` |
| turmas | 12% | `/api/turmas` |
| notas | 12% | `/api/avaliacao/aluno/:id` |
| frequência | 12% | `/api/presenca/turma/:id` ou visão geral |
| boletim | 8% | `/api/avaliacao/boletim/:id` |
| notificações | 6% | `/api/push/vapid-public-key` + `/api/auth/verificar` (read-only; **não** dispara WhatsApp/SMS) |
| pesquisa | 7% | `/api/bncc?q=` + listagem |
| verificar | 5% | `/api/auth/verificar` |

Cada VU: **login → 4–7 ops ponderadas → logout**.

## Métricas coletadas

| Métrica | Fonte |
|---------|--------|
| requests/sec, latência avg/p90/p95/p99 | k6 `http_req_*` |
| taxa de erro, 4xx, 5xx, timeout | k6 + counters `errors_4xx` / `errors_5xx` / `timeouts` |
| CPU, memória | `collect-system-metrics.js` |
| MongoDB (connections, opcounters) | mongosh `serverStatus` |
| Redis | amostrado se existir — **app não usa Redis** (N/A) |

## Capacidade e progressão

**Comece pequeno.** O cenário E (10k) **não** roda no progressive runner.

```bash
# Ver capacidade do host
node tests/performance/scripts/check-capacity.js A
node tests/performance/scripts/check-capacity.js E

# Smoke → A (padrão)
chmod +x tests/performance/scripts/run-progressive.sh
./tests/performance/scripts/run-progressive.sh

# Subir até C se A/B passarem
SCENARIOS=smoke,A,B,C ./tests/performance/scripts/run-progressive.sh

# D só com flag e host adequado
ALLOW_HEAVY=1 SCENARIOS=D ./tests/performance/scripts/run-progressive.sh

# E — manual, após validar capacidade
node tests/performance/scripts/check-capacity.js E
ALLOW_HEAVY=1 ALLOW_10K=1 k6 run -e ALLOW_HEAVY=1 -e ALLOW_10K=1 \
  tests/performance/k6/scenarios/E-10000.js
```

Heurística local (12 vCPU / ~16 GiB neste ambiente de desenvolvimento):

| Cenário | VUs | Default |
|---------|-----|---------|
| A | 100 | permitido |
| B | 500 | permitido |
| C | 1.000 | permitido com cautela |
| D | 5.000 | **bloqueado** sem `ALLOW_HEAVY=1` |
| E | 10.000 | **bloqueado** sem `ALLOW_HEAVY=1` + `ALLOW_10K=1` (+ RAM recomendada ≥24 GiB) |

## npm scripts

```bash
npm run test:k6:smoke
npm run test:k6:A
npm run test:k6:B
npm run test:k6:C
npm run test:k6:progressive
npm run test:k6:capacity
```

Scripts legados (`test:load`, `test:stress`, …) permanecem.

## Relatório

Após o progressive runner: `docs/CARGA-K6-RELATORIO.md` e `tests/performance/results/RELATORIO-*.md`.


## TOKEN 08 — Spike (publicação de boletins)

```bash
LOAD_DIAGNOSTICS=1 LOAD_USER_POOL=80 npm run test:k6:target
# outro terminal:
npm run test:k6:spike:boletim          # teto 1000 (100→500→1000)
ALLOW_HEAVY=1 npm run test:k6:spike:boletim:heavy   # inclui 5000
# 10k só com capacidade:
ALLOW_HEAVY=1 ALLOW_10K=1 SPIKE_MAX=10000 npm run test:k6:spike:boletim
```

Jornada do responsável: login → dashboard → boletim → notas → frequência → logout.

Diagnóstico: `GET /health/diag` + `analyze-spike-bottleneck.js` → `docs/SPIKE-BOLETIM-RELATORIO.md`.
