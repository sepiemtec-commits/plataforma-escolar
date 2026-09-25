# TOKEN 10 — Escalabilidade PostgreSQL (teste)

Produção VEHO Edu usa **MongoDB**. Este diretório sobe um **PostgreSQL 16 isolado** (porta `55432`) que espelha o domínio acadêmico para:

- seed sintético (100k / 1M alunos, ~5M relacionados)
- `EXPLAIN ANALYZE` (filtros, paginação, joins, dashboards, boletim, notas, frequência)
- índices ausentes / redundantes
- N+1 vs join
- pool, locks, deadlocks

## Comandos

```bash
npm run db:scale:up
npm run test:db:scale          # 100k depois 1M
npm run test:db:scale:100k
npm run test:db:scale:1m
npm run db:scale:down          # remove container + volume de teste
```

Relatório: `docs/ESCALABILIDADE-BANCO-RELATORIO.md`
