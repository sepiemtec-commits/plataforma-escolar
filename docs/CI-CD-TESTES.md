# CI/CD e grupos de testes (TOKEN 16)

## Grupos

| Grupo | Comando | O que roda | Quando no CI |
|-------|---------|------------|--------------|
| **QUICK** | `npm run test:quick` | lint → typecheck → unit | todo PR |
| **NORMAL** | `npm run test:normal` | quick + API + integração | todo PR (após quick) |
| **FULL** | `npm run test:full` | normal + segurança + migrate:check + healthcheck + E2E | push `main` / deploy gate |
| **PERFORMANCE** | `npm run test:performance` | k6 **smoke** apenas | schedule semanal |
| **SECURITY** | `npm run test:security` | authSeguranca + segurancaApp + injection/jwt/safePath | schedule + deploy gate |

Carga pesada (**não** no PR):

```bash
# staging / máquina forte
npm run test:k6:target          # sobe alvo
npm run test:k6:A               # 100 VUs
npm run test:k6:spike:boletim   # SPIKE_MAX default
npm run test:endurance          # E1 2h
```

`npm run test:performance:heavy` falha de propósito no PR.

## Scripts auxiliares

| Script | Função |
|--------|--------|
| `npm run lint` | ESLint (backend, scripts, database, tests) |
| `npm run typecheck` | `node --check` em todos os `.js` backend/scripts/database |
| `npm run migrate:check` | `syncIndexes` dos modelos críticos (MongoMemory) |
| `npm run healthcheck` | `/health`, `/health/live`, `/health/ready`, `/metrics` |

## Workflows GitHub Actions

| Arquivo | Trigger | Conteúdo |
|---------|---------|----------|
| `.github/workflows/pr.yml` | `pull_request` + push main | QUICK → NORMAL |
| `.github/workflows/deploy-gate.yml` | push main + `workflow_dispatch` | FULL + job **Deploy permitido** |
| `.github/workflows/scheduled.yml` | cron seg 06:00 UTC + manual | SECURITY + PERFORMANCE smoke (+ spike); endurance só com flag |

## Impedir deploy se críticos falharem

1. Em **Settings → Branches → Branch protection** (main/master):
   - Require status checks: `QUICK TESTS`, `NORMAL TESTS`, e no merge pós-gate `FULL TESTS (críticos)` / `Deploy permitido`
2. No Render/CD: só deployar `main` após o workflow **Deploy Gate — Full** estar verde (ou usar check obrigatório).
3. O job `deploy-allowed` falha se `full-critical` ≠ success.

Carga pesada **nunca** é required check de PR.

## Como rodar localmente

```bash
npm ci
npm run test:quick
npm run test:normal
# pré-release:
ASSINATURA_MODO_DEV=true DISABLE_RATE_LIMIT=1 npm run test:full
npm run test:security
# perf (alvo separado):
PORT=3099 npm run test:k6:target &
PATH="$PWD/tools/bin:$PATH" BASE_URL=http://127.0.0.1:3099 npm run test:performance
```

## Nota sobre typecheck

O projeto é JavaScript. `typecheck` = validação de sintaxe (`node --check`), não TypeScript. Evolução futura: `jsconfig` + `// @ts-check` ou migração gradual TS.
