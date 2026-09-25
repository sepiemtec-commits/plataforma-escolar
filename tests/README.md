# Testes — VEHO Edu

Estratégia completa: [`docs/TESTES-ARQUITETURA.md`](../docs/TESTES-ARQUITETURA.md).

## Layout

| Pasta | Conteúdo |
|-------|----------|
| `unit/` | Jest — funções puras |
| `integration/` | Jest + Mongo de teste |
| `api/` | Contratos HTTP |
| `e2e/` | Ponteiros / futuros fluxos browser |
| `security/` | AuthZ, injection, tenant |
| `database/` | Integridade / índices |
| `performance/k6/` | Load, stress, spike, endurance |
| `recovery/` | Falha e retomada |
| `helpers/` | Utilitários compartilhados |
| `*.test.js` (raiz) | Suite legada já coberta — **não duplicar** |

## Comandos

```bash
npm test                 # Jest (unit + o que estiver em tests/**/*.test.js)
npm run test:coverage
npm run test:e2e         # scripts/teste-e2e-funcionalidade.js
npm run test:isolamento  # scripts/test-isolamento-escola.js
npm run test:load        # k6 run tests/performance/k6/load.js
```
