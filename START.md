# 🎯 LEIA-ME PRIMEIRO - Guia Rápido

## 📍 Localização do Projeto

```
/home/guest/pastaTeste/plataforma-escolar/
```

## ⚡ Quick Start (5 minutos)

### 1. Abrir Terminal
```bash
cd /home/guest/pastaTeste/plataforma-escolar
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Banco de Dados
Certifique-se que MongoDB está rodando:
```bash
# No Linux/Mac
brew services start mongodb-community

# Ou use Atlas (nuvem)
```

### 4. Copiar Arquivo de Configuração
```bash
cp .env.example .env
```

### 5. Iniciar Backend
```bash
npm run dev
# Servidor rodando em http://localhost:3000
```

### 6. Servir Frontend (em outro terminal)
```bash
cd frontend
npx http-server -p 3001
# Acesso em http://localhost:3001
```

### 7. Fazer Login
- Email: `professor@escola.com`
- Senha: `senha123`

---

## 📚 Arquivos Importantes

| Arquivo | Descrição |
|---------|-----------|
| **README.md** | Visão geral completa do projeto |
| **SETUP.md** | Guia de instalação detalhado |
| **RESUMO.md** | Resumo estruturado |
| **docs/API.md** | Documentação de todos os endpoints |
| **docs/SEGURANCA.md** | Guia de segurança |
| **.env.example** | Template de configuração |

---

## 🗂️ Estrutura de Pastas

```
├── backend/        → Servidor (Node.js)
├── frontend/       → Interface Web
├── database/       → Schemas MongoDB
└── docs/           → Documentação
```

---

## 🔐 Credenciais de Teste

Após instalar, você pode logar com:

### Diretor
- Email: `diretor@escola.com`
- Senha: `senha123`

### Coordenador
- Email: `coord@escola.com`
- Senha: `senha123`

### Professor
- Email: `prof@escola.com`
- Senha: `senha123`

### Aluno
- Email: `aluno@escola.com`
- Senha: `senha123`

---

## ✨ Funcionalidades Principais

### 📋 Presença
- Professor registra presença de alunos
- Sistema envia alerta WhatsApp automaticamente
- Relatórios de frequência

### 📝 Notas
- Lançamento de avaliações
- Cálculo automático de médias
- Boletim eletrônico

### 📊 Painéis
- Dashboard por função (Diretor, Coordenador, Professor, Aluno)
- Estatísticas e relatórios
- Alertas de desempenho

### 💬 WhatsApp
- Notificações instantâneas
- Alertas de falta
- Boletins periódicos

---

## 🔧 Configurações Importantes

### Para Usar WhatsApp
1. Vá para https://www.twilio.com
2. Crie uma conta gratuita
3. Configure WhatsApp Sandbox
4. Copie as credenciais para `.env`

Exemplo de `.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=seu_token_aqui
TWILIO_PHONE_NUMBER=+55xxxxxxxxxxx
```

---

## 🚨 Se Algo Não Funcionar

### MongoDB não conecta
```bash
# Verificar se MongoDB está rodando
mongod --version

# Iniciar MongoDB
mongod

# Ou usar MongoDB Atlas (nuvem)
```

### Porta 3000 já em uso
```bash
# Mudar porta em .env
PORT=3001
```

### Frontend não carrega
```bash
# Certifique-se que está na pasta frontend
cd frontend

# Rodar servidor web
npx http-server -p 3001
```

---

## 📖 Próximos Passos

1. **Leia** `README.md` - Visão geral completa
2. **Siga** `SETUP.md` - Instalação passo a passo
3. **Explore** `docs/API.md` - Endpoints da API
4. **Consulte** `docs/SEGURANCA.md` - Boas práticas

---

## 🎯 Fluxo Recomendado

```
1. Instalar e rodar (este arquivo)
2. Fazer login com professor@escola.com
3. Explorar painel do professor
4. Registrar presença de alunos
5. Lançar algumas notas
6. Testar WhatsApp (se configurado)
7. Testar outros painéis (diretor, coordenador, aluno)
8. Ler documentação para personalizações
```

---

## 💡 Dicas

- Use dados de teste fornecidos
- Explore todos os painéis
- Teste o envio de notificações
- Consulte a API antes de integrar
- Verifique logs em `backend/` para erros

---

## 📞 Precisa de Ajuda?

1. Verifique **SETUP.md** para troubleshooting
2. Leia **docs/API.md** para exemplos
3. Veja **docs/SEGURANCA.md** para configurações

---

**Pronto para começar? 🚀**

```bash
cd /home/guest/pastaTeste/plataforma-escolar
npm install
npm run dev
```

---

*Criado para facilitar a gestão escolar*
