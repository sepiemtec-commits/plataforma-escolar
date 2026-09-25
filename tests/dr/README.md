# TOKEN 12 — Backup & Disaster Recovery

Ambiente **isolado** (`veho-mongo-dr:27018`). Não altera produção.

```bash
npm run db:dr:up
npm run test:dr
npm run db:dr:down   # remove volume de teste
```

Relatório: `docs/BACKUP-DR-RELATORIO.md`
