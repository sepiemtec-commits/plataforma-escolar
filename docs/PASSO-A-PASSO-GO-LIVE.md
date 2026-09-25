# Passo a passo — colocar a VEHO Edu no ar (go-live)

Siga **na ordem**. Não pule etapas. No final você cola os dados no chat do Cursor para eu configurar o restante.

Tempo estimado: **45–90 minutos** (primeira vez).

---

## Antes de começar

Tenha à mão:
- [ ] E-mail para criar contas
- [ ] Cartão (Stripe pede verificação; Atlas Free e Render Free/Starter podem pedir cartão só para validar)
- [ ] Repositório no GitHub: `sepiemtec-commits/plataforma-escolar` (já existe)

Abra 3 abas e deixe abertas:
1. MongoDB Atlas 3. Copie e salve as credenciais do usuário do banco de dados.
**Nome de usuário**
    sepiemtec_db_user
**Senha**
    DKRin5fmK0CGwkey

 
2. Stripe     - codigo stripe = excels-bravo-winner-devout

3. Render  

---

## PASSO 1 — MongoDB Atlas (banco)

1. Acesse: https://cloud.mongodb.com → **Sign up** / Login.  
2. **Create** → **Build a Database** → plano **M0 Free** → região próxima (ex.: São Paulo / Virginia).  
3. **Database Access** → **Add New Database User**  
   - Authentication: Password  
   - User: `veho_admin`  
   - Password: gere uma forte e **anote**  
   - Role: Atlas Admin (ou Read and write to any database)  
4. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) → Confirm.  
5. **Database** → **Connect** → **Drivers** → copie a URI.  
6. Substitua `<password>` pela senha real (sem `<>`).  
7. Troque o nome do banco no final da URI para `veho_edu` se ainda estiver `/?`.

**Fica assim (exemplo):**
```text
mongodb+srv://veho_admin:SUA_SENHA@cluster0.xxxxx.mongodb.net/veho_edu?retryWrites=true&w=majority
```

**Anote em um bloco de notas:**
```text
MONGODB_URI=mongodb+srv://...
```

---

## PASSO 2 — Stripe (pagamento)

### 2.1 Conta e chave
1. Acesse: https://dashboard.stripe.com → crie/entre na conta.  
2. No topo, comece com modo **Test** (para testar sem cobrar de verdade).  
3. **Developers** → **API keys** → copie a **Secret key** (`sk_test_...`).

**Anote:**
```text
STRIPE_SECRET_KEY=sk_test_...
```

### 2.2 Três planos (Products + Prices)
Crie **3 Products** (Product catalog → Add product), cada um com preço **recorrente mensal**:

| Nome no Stripe     | O que anotar                          |
|--------------------|----------------------------------------|
| VEHO Essencial     | `STRIPE_PRICE_ESSENCIAL=price_...`     |
| VEHO Profissional  | `STRIPE_PRICE_PROFISSIONAL=price_...`  |
| VEHO Completo      | `STRIPE_PRICE_COMPLETO=price_...`      |

Em cada produto: após salvar, abra o **Price** e copie o ID que começa com `price_`.

### 2.3 Webhook (faz depois do Passo 3)
Você só consegue apontar o webhook quando tiver a URL do Render. Deixe este subpasso para o **Passo 4**.

### 2.4 Portal do cliente (recomendado)
**Settings → Billing → Customer portal** → ative (cancelar / trocar cartão).

---

## PASSO 3 — Render (hospedar o app)

1. Acesse: https://dashboard.render.com → Login **com GitHub**.  
2. Autorize o acesso ao repo `plataforma-escolar` (ou à org/user dono do repo).  
3. **New +** → **Blueprint**  
   - Selecione o repositório  
   - Render deve achar o arquivo `render.yaml`  
4. Se Blueprint não funcionar: **New +** → **Web Service**  
   - Repo: `plataforma-escolar`  
   - Runtime: **Node**  
   - Build command: `npm ci --omit=dev || npm install --omit=dev`  
   - Start command: `node backend/server.js`  
   - Health check path: `/health`  
5. Em **Environment** (variáveis), cadastre **antes** do primeiro deploy (ou edite e faça Redeploy):

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `ASSINATURA_MODO_DEV` | `false` |
| `MONGODB_URI` | (URI do Passo 1) |
| `JWT_SECRET` | rode no PC: `openssl rand -hex 32` e cole o resultado |
| `JWT_EXPIRE` | `7d` |
| `FRONTEND_URL` | deixe temporário `https://COLOQUE-DEPOIS.onrender.com` e ajuste no Passo 3.6 |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_ESSENCIAL` | `price_...` |
| `STRIPE_PRICE_PROFISSIONAL` | `price_...` |
| `STRIPE_PRICE_COMPLETO` | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_PLACEHOLDER` (troca no Passo 4) |

6. Clique **Create / Deploy**. Espere ficar **Live**.  
7. Copie a URL pública, ex.: `https://veho-edu-xxxx.onrender.com`  

**Ajuste já:**
- Variável `FRONTEND_URL` = essa URL **exata** (HTTPS, **sem** `/` no final)  
- **Manual Deploy → Deploy latest commit** (para aplicar o FRONTEND_URL)

**Anote:**
```text
FRONTEND_URL=https://veho-edu-xxxx.onrender.com
```

8. Teste no navegador:
   - `https://SUA-URL/health` → deve responder OK  
   - `https://SUA-URL/` → tela de login VEHO  
   - `https://SUA-URL/assinar.html` → planos  

Se `/health` falhou: abra **Logs** no Render e veja se `MONGODB_URI` / `JWT_SECRET` estão certos.

---

## PASSO 4 — Webhook Stripe (liga pagamento ↔ servidor)

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.  
2. Endpoint URL:
   ```text
   https://SUA-URL.onrender.com/api/assinatura/webhook
   ```
3. Eventos (selecione estes três):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Add endpoint** → abra o endpoint → **Reveal** signing secret → copie `whsec_...`.  
5. No Render → Environment → edite:
   ```text
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
6. **Redeploy** o serviço.

**Anote:**
```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## PASSO 5 — Teste de ponta a ponta

1. Abra `/assinar.html` na URL do Render.  
2. Preencha dados da escola / diretor.  
3. No checkout Stripe (modo test), use cartão:
   - Número: `4242 4242 4242 4242`  
   - Validade: qualquer data futura  
   - CVC: qualquer 3 dígitos  
4. Após pagamento, deve ativar a escola e permitir login do diretor.  
5. No Stripe → Webhooks → o endpoint deve mostrar entregas **Succeeded**.

Se o pagamento passou mas a escola não ativou: confira `STRIPE_WEBHOOK_SECRET` e os logs do Render.

---

## PASSO 6 — Cole no chat do Cursor

Copie o bloco abaixo **preenchido** e envie nesta conversa:

```text
MONGODB_URI=mongodb+srv://...
FRONTEND_URL=https://....onrender.com
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ESSENCIAL=price_...
STRIPE_PRICE_PROFISSIONAL=price_...
STRIPE_PRICE_COMPLETO=price_...
```

Com isso eu:
- confiro se está completo (`validar:golive`);
- ajudo a corrigir erro de deploy/logs;
- oriento o próximo passo (domínio próprio / chaves `sk_live_` para cobrança real).

---

## Domínio próprio (opcional, depois)

1. Compre o domínio (Registro.br / Cloudflare).  
2. No Render → seu Web Service → **Custom Domain** → siga o CNAME/A indicado.  
3. Atualize `FRONTEND_URL` para `https://seudominio.com.br`.  
4. Atualize a URL do **webhook** no Stripe para o novo domínio.  
5. Redeploy.

---

## Cobrança real (só quando o teste estiver ok)

1. No Stripe, mude para modo **Live**.  
2. Crie de novo os 3 Prices em Live (IDs diferentes).  
3. Troque no Render: `sk_live_...`, 3× `price_...`, novo `whsec_` do webhook Live.  
4. Redeploy e teste com valor baixo / 1º cliente piloto.

---

## Problemas comuns

| Sintoma | O que checar |
|---------|----------------|
| App não sobe | Logs Render: `JWT_SECRET` curto? `MONGODB_URI` errada? |
| Login CORS / links quebrados | `FRONTEND_URL` igual à URL pública |
| Pagou e não ativou | Webhook URL, `whsec_`, eventos marcados |
| Atlas “connection refused” | Network Access `0.0.0.0/0`, senha na URI (caracteres especiais: URL-encode) |
| Render “spin down” (plano free) | Primeira requisição demora ~30–60s; plano pago fica sempre ligado |

---

## Checklist final “posso divulgar?”

- [ ] `/health` OK  
- [ ] Login abre  
- [ ] `/assinar.html` + checkout test funciona  
- [ ] Webhook Succeeded  
- [ ] Diretor da escola nova consegue entrar  
- [ ] `ASSINATURA_MODO_DEV=false`  
- [ ] Sem usar senhas de demo (`senha123`) em produção  

Quando todos os itens estiverem ok: **pode prospectar com o link**.
