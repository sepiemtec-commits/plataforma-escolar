# TOKEN 16 — CI/CD e Testes Automáticos

Gerado: 2026-09-25  
**Veredito: CONFIGURADO**

## O que foi entregue

| Item | Detalhe |
|------|---------|
| QUICK / NORMAL / FULL / PERFORMANCE / SECURITY | scripts npm + docs |
| PR | `.github/workflows/pr.yml` — lint, typecheck, unit, API, integração |
| Pré-deploy | `.github/workflows/deploy-gate.yml` — full + E2E + segurança + migrate + health; job **Deploy permitido** |
| Periódico | `.github/workflows/scheduled.yml` — security + k6 smoke (+ spike); endurance só com flag |
| Carga pesada no PR | **não** incluída |
| Docs | `docs/CI-CD-TESTES.md` |

## Comandos

```bash
npm run test:quick
npm run test:normal
ASSINATURA_MODO_DEV=true DISABLE_RATE_LIMIT=1 npm run test:full
npm run test:security
npm run test:performance   # smoke only
```

## Impedir deploy

Job `deploy-allowed` falha se FULL falhar. Configure branch protection exigindo:

- `QUICK TESTS`
- `NORMAL TESTS`
- `FULL TESTS (críticos)` / `Deploy permitido`

## Health em deploy

- Docker `HEALTHCHECK` → `/health/ready`
- Render `healthCheckPath` → `/health/ready`

## Validação local (esta sessão)

| Check | Resultado |
|-------|-----------|
| typecheck | OK (77 arquivos) |
| migrate:check | OK |
| healthcheck | OK |
| integration | 2 passed |
| lint | 0 errors (warnings residuais ≤80) |
| security | suítes auth/segurança |

## Nota

`typecheck` = sintaxe JS (`node --check`); projeto ainda sem TypeScript.
