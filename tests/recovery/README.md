# Recuperação e resiliência (TOKEN 11)

## Stack real
- DB da app: **MongoDB**
- Redis / filas / circuit breaker: **não existem** no produto
- Postgres `veho-pg-scale`: só teste TOKEN 10 (app não depende)

## Cenários automatizados
1. App reiniciada  
2. Container reiniciado (PG teste)  
3. PostgreSQL indisponível (app isolada)  
4. Redis indisponível (N/A)  
5. Rede/serviço indisponível  
6. Timeout / Mongo down  
7. Timeout serviço externo (`withTimeout`/`withRetry`)  
8. Fila (N/A)  
9. Upload inválido  
10. Relatório inválido  

## Comandos
```bash
npm run test:resilience
npm run test:unit -- --testPathPattern=withTimeout
npm run test:api -- --testPathPattern=resiliencia
```

Relatório: `docs/RESILIENCIA-RELATORIO.md`
