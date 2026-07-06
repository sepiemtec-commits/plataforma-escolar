# 🎓 Plataforma Educacional - Sistema de Gestão Escolar Completo

Uma plataforma web moderna e segura para gestão escolar integrada, com suporte a presença, avaliações, conteúdo programático e notificações via WhatsApp.

## 📋 Características Principais

### Para Diretores
- 📊 Dashboard com estatísticas gerais da escola
- 👥 Gerenciamento de usuários e permissões
- ⚙️ Configurações da escola (Bimestral/Trimestral)
- 📈 Relatórios de desempenho e frequência
- ⚠️ Alertas de alunos em recuperação

### Para Coordenadores
- 📋 Monitoramento de turmas e alunos
- 📊 Análise de desempenho por disciplina
- 🔔 Envio de alertas para responsáveis
- 📈 Diagnóstico de alunos com dificuldades
- 📚 Acompanhamento do conteúdo programático

### Para Professores
- 📝 Lançamento de presenças/faltas
- 📊 Registro de avaliações (provas, testes, atividades)
- 📚 Inserção de conteúdo programático diário
- ⚠️ Alertas automáticos de falta via WhatsApp
- 👥 Visualização de alunos e seu desempenho

### Para Alunos
- 📄 Visualização de boletim completo
- 📝 Histórico de notas e avaliações
- 📋 Registro de presença e frequência
- 📚 Acesso ao conteúdo das aulas
- 🎯 Acompanhamento do desempenho

### Para Responsáveis
- 📱 Recebimento de alertas de falta via WhatsApp
- 📊 Acesso ao boletim do aluno
- ⚠️ Notificações de baixo desempenho
- 📞 Comunicação integrada com a escola

## 🛡️ Segurança

- **Autenticação JWT** com tokens seguros
- **Criptografia de senhas** com bcryptjs
- **Validação de entrada** em todas as requisições
- **Controle de acesso por função** (Role-Based Access)
- **Logs de auditoria** de todas as ações
- **HTTPS** recomendado em produção
- **CORS** configurado para segurança
- **Helmet** para proteção de headers HTTP

## 📱 Integração WhatsApp

- Alertas instantâneos de falta
- Notificações de boletim/desempenho
- Alertas de baixo desempenho
- Notificações gerais da escola
- Usa **Twilio** como provedor

## 🏗️ Arquitetura

### Backend
```
backend/
├── server.js                 # Servidor Express principal
├── middleware/
│   └── autenticacao.js       # JWT e controle de acesso
├── routes/
│   ├── autenticacao.js       # Login, registro
│   ├── presenca.js           # Presença e faltas
│   ├── avaliacao.js          # Notas e boletim
│   ├── conteudo.js           # Conteúdo programático
│   ├── painel.js             # Painéis por função
│   ├── usuarios.js           # Gerenciamento de usuários
│   └── notificacoes.js       # WhatsApp e alertas
└── services/
    └── whatsapp.js           # Serviço Twilio
```

### Frontend
```
frontend/
├── index.html                # Login
├── painel-professor.html     # Painel do professor
├── painel-diretor.html       # Painel do diretor
├── painel-aluno.html         # Painel do aluno
├── styles/
│   ├── login.css             # Estilos login
│   └── painel.css            # Estilos painéis
└── js/
    ├── api.js                # Cliente API
    ├── login.js              # Lógica login
    ├── painel-professor.js   # Lógica professor
    ├── painel-diretor.js     # Lógica diretor
    └── painel-aluno.js       # Lógica aluno
```

### Banco de Dados
```
database/
└── schema.js                 # Esquemas MongoDB
    ├── Usuario
    ├── Escola
    ├── Turma
    ├── Presenca
    ├── Conteudo
    ├── Avaliacao
    ├── Desempenho
    ├── Responsavel
    └── Log
```

## 🚀 Instalação e Configuração

### Pré-requisitos
- Node.js 14+
- MongoDB 4.4+
- Conta Twilio (para WhatsApp)

### 1. Clonar o repositório
```bash
git clone https://github.com/seu-usuario/plataforma-escolar.git
cd plataforma-escolar
```

### 2. Instalar dependências do Backend
```bash
cd backend
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Editar `.env` com suas configurações:
```env
NODE_ENV=development
PORT=3000

# Banco de Dados
MONGODB_URI=mongodb://localhost:27017/plataforma_escolar

# JWT
JWT_SECRET=sua_chave_secreta_super_segura_mude_em_producao
JWT_EXPIRE=7d

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_PHONE_NUMBER=+55xxxxxxxxxxx

# Frontend
FRONTEND_URL=http://localhost:3001
```

### 4. Iniciar o servidor
```bash
npm start
# ou em desenvolvimento
npm run dev
```

### 5. Servir o Frontend
```bash
cd frontend
# Usar um servidor web local (ex: Live Server do VS Code)
# ou: npx http-server
```

## 📊 Tipos de Avaliações Suportadas

- **Prova Bimestral** - Principal avaliação do bimestre
- **Teste Bimestral** - Avaliação complementar
- **Prova Trimestral** - Se configurado (substitui bimestral)
- **Teste Trimestral** - Se configurado
- **Atividades** - Trabalhos em classe
- **Trabalhos** - Pesquisas e projetos
- **Prova Final** - Avaliação final do período
- **Recuperação** - Aula de recuperação

## 📈 Cálculo de Médias

A plataforma usa **média ponderada**:
```
Média = (Nota1 × Peso1 + Nota2 × Peso2 + ...) / (Peso1 + Peso2 + ...)
```

**Situações do Aluno:**
- **Aprovado:** Média ≥ 6.0
- **Excelente:** Média ≥ 9.0
- **Recuperação:** Média < 6.0
- **Reprovado:** Após recuperação com média < 5.0

## 🔐 Tipos de Usuários e Permissões

| Função | Presença | Notas | Conteúdo | Painel | Alertas |
|--------|----------|-------|----------|--------|---------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Diretor | ✗ | Ver | Ver | ✓ | ✓ |
| Coordenador | Ver | Ver | Ver | ✓ | ✓ |
| Professor | ✓ | ✓ | ✓ | Seu | ✓ |
| Aluno | Ver | Ver | Ver | Seu | ✗ |
| Responsável | ✗ | Ver | ✗ | Alertas | Recebe |

## 📞 API Endpoints Principais

### Autenticação
```
POST   /api/auth/login         - Login
POST   /api/auth/registrar     - Registrar novo usuário
GET    /api/auth/verificar     - Verificar token
POST   /api/auth/logout        - Fazer logout
```

### Presença
```
POST   /api/presenca/registrar          - Registrar presença
GET    /api/presenca/turma/:turmaId     - Listar presença da turma
GET    /api/presenca/aluno/:alunoId     - Histórico do aluno
PUT    /api/presenca/:presencaId        - Atualizar presença
GET    /api/presenca/estatisticas/:turmaId - Estatísticas
```

### Avaliação
```
POST   /api/avaliacao/lancar            - Lançar nota
GET    /api/avaliacao/aluno/:alunoId    - Notas do aluno
GET    /api/avaliacao/boletim/:alunoId  - Boletim completo
PUT    /api/avaliacao/:avaliacaoId      - Atualizar nota
POST   /api/avaliacao/diagnosticar      - Gerar diagnóstico
```

### Notificações
```
POST   /api/notificacoes/falta/:presencaId          - Alerta falta
POST   /api/notificacoes/boletim/:alunoId           - Enviar boletim
POST   /api/notificacoes/desempenho/:alunoId        - Alerta desempenho
POST   /api/notificacoes/geral                      - Notificação geral
```

## 🧪 Testando a Plataforma

### Criar usuários de teste
```javascript
// Login com dados:
// Email: professor@escola.com
// Senha: senha123
```

### Criar dados de teste
```bash
# Use a API para criar turmas, alunos, etc.
# Exemplos em curl:

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"professor@escola.com","senha":"senha123"}'
```

## 🐛 Troubleshooting

### Erro: "Conexão recusada ao MongoDB"
- Verifique se MongoDB está rodando: `mongod`
- Verifique `MONGODB_URI` no `.env`

### Erro: "Token inválido ou expirado"
- Limpe localStorage: `localStorage.clear()`
- Faça login novamente

### Erro: WhatsApp não envia mensagens
- Verifique credenciais Twilio em `.env`
- Verifique número do remetente
- Verifique se o número do responsável é válido com DDD

## 📚 Documentação Adicional

- [Guia de API](docs/API.md)
- [Guia de Instalação em Produção](docs/PRODUCAO.md)
- [Guia de Configuração Twilio](docs/TWILIO.md)

## 📄 Licença

MIT License - veja LICENSE.md

## 🤝 Suporte

Para suporte, abra uma issue no GitHub ou entre em contato através do email de suporte.

---

**Desenvolvido com ❤️ para educadores e gestores escolares**
