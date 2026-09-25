# Status go-live VEHO Edu (atualizado automaticamente)

## Feito

| Item | Status |
|------|--------|
| Conta Stripe Test (VEHO portal) | `acct_1UIETSPZqfrCUbQZ` (chave test ok) |
| Price Essencial | `price_1UJheIPZqfrCUbQZ15V5xPOL` (R$ 199/mês) |
| Price Profissional | `price_1UJheJPZqfrCUbQZARB2lPvF` (R$ 399/mês) |
| Price Completo | `price_1UJheKPZqfrCUbQZVYUJZ74n` (R$ 699/mês) |
| Customer Portal Stripe | criado |
| MongoDB Atlas (cluster + URI) | **guardado** em `.env.production` · `MONGODB_ATIVADO=true` |
| Usuário Atlas | `sepiemtec_db_user` (senha guardada) |
| `STRIPE_SECRET_KEY` (test) | **salvo** em `.env.production` |
| `STRIPE_PUBLISHABLE_KEY` (test) | **salvo** em `.env.production` |

## Falta (nesta ordem)

1. ~~**Ativar Mongo**~~ — **feito**
2. ~~**Secret key Stripe**~~ — **feito** (modo test)
3. **Render** — criar Web Service / Blueprint (`render.yaml`) → anotar URL → `FRONTEND_URL=https://....onrender.com`
4. **Webhook Stripe** — `https://SUA-URL/api/assinatura/webhook` → colar `whsec_...`

## Colar no chat agora (próximo passo)

Depois do deploy no Render, cole:

```text
FRONTEND_URL=https://seu-servico.onrender.com
```


<!-- ativar-mongo 2026-09-25T22:25:12.745Z ok db=veho_edu -->
