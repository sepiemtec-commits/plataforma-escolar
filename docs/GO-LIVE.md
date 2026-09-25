# Go-live VEHO Edu

## Status neste ambiente

| Item | Status |
|------|--------|
| Código / app local | OK |
| Pacote Docker + Compose prod | Pronto (`Dockerfile`, `docker-compose.prod.yml`) |
| Blueprint Render | Pronto (`render.yaml`) |
| Template env produção | Pronto (`.env.production.example`) |
| Validador | `npm run validar:golive` |
| MongoDB Atlas / host na nuvem | **Pendente — precisa da sua conta** |
| Domínio + HTTPS | **Pendente** |
| Stripe live (prices + webhook) | **Pendente — chaves suas** |
| `ASSINATURA_MODO_DEV=false` | Ainda `true` no `.env` local |

> Go-live real **não fecha só no código**: exige hospedagem, banco, HTTPS e Stripe com a sua conta.

---

## Caminho rápido (Render + Atlas) — ~30–60 min

### 1. MongoDB Atlas
1. Crie cluster em https://cloud.mongodb.com  
2. Database User + Network Access (IP `0.0.0.0/0` no início)  
3. Copie a URI `mongodb+srv://...`

### 2. Stripe
1. Dashboard → 3 Products (Essencial / Profissional / Completo) com Prices mensais  
2. Copie `price_...`  
3. API keys → `sk_live_...` (ou `sk_test_...` só para demo)  
4. Depois do deploy: Webhook → `https://SEU_APP.onrender.com/api/assinatura/webhook`  
   Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 3. Render
1. https://dashboard.render.com → **New → Blueprint**  
2. Conecte o repo GitHub `plataforma-escolar` (ou faça upload)  
3. Use o `render.yaml` deste projeto  
4. Preencha as env vars (URI, Stripe, `FRONTEND_URL=https://seu-servico.onrender.com`)  
5. Deploy → teste `https://.../health`

### 4. Domínio (opcional no 1º dia)
No DNS, CNAME para o host Render; ajuste `FRONTEND_URL` e o webhook Stripe.

### 5. Validar
```bash
cp .env.production.example .env.production
# edite .env.production
npm run validar:golive -- --env .env.production
```

### 6. Checklist pós-deploy
- [ ] `/health` OK  
- [ ] `/assinar.html` abre  
- [ ] Checkout Stripe (cartão teste ou live)  
- [ ] Webhook recebe evento  
- [ ] Login do diretor após assinatura  
- [ ] Sem seeds `senha123` em produção  

---

## Alternativa VPS (Docker)

```bash
cp .env.production.example .env.production
# edite JWT_SECRET, FRONTEND_URL, Stripe...
# MONGODB_URI no compose é sobrescrito para o serviço mongo interno
docker compose -f docker-compose.prod.yml up -d --build
```

Coloque Nginx/Caddy na frente com HTTPS.

---

## O que falta você enviar para eu concluir o deploy daqui

Cole nestas mensagens (pode mascarar parcialmente):

1. **URI MongoDB Atlas** (ou diga “criei, me guia no Render”)  
2. **Conta Render/Railway** já logada no browser, **ou** chave API  
3. **Chaves Stripe** (`sk_…`, `whsec_…`, 3× `price_…`) — test ou live  
4. **URL desejada** (`*.onrender.com` ou domínio próprio)

Sem esses quatro itens, o ambiente local continua só em desenvolvimento.
