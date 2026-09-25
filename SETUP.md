# Guia de Instalação e Uso - Plataforma Educacional

## 🎯 Quick Start (Início Rápido)

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Banco de Dados
Certifique-se que MongoDB está rodando:
```bash
# No Windows (se instalado)
mongod

# No Linux/Mac
brew services start mongodb-community
```

### 3. Configurar Variáveis de Ambiente
```bash
cd backend
cp .env.example .env
nano .env  # Edite com suas configurações
```

### 4. Iniciar o Servidor
```bash
npm run dev
```

Servidor rodando em: http://localhost:3000

### 5. Servir o Frontend
```bash
cd frontend
# Opção 1: Live Server (VS Code)
# Opção 2: Python
python -m http.server 3001

# Opção 3: Node
npx http-server -p 3001
```

Acesse em: http://localhost:3001

## 👥 Usuários de Teste (Padrão)

Use estes dados para fazer login e testar:

| Função | Email | Senha |
|--------|-------|-------|
| Professor | professor@escola.com | senha123 |
| Diretor | diretor@escola.com | senha123 |
| Coordenador | coordenador@escola.com | senha123 |
| Secretaria | secretaria@escola.com | senha123 |
| Aluno | aluno1@escola.com | senha123 |
| Responsável | responsavel@escola.com | senha123 |

*Crie novos usuários através da rota `/auth/registrar` ou painel de administração*

## 📱 Configurar WhatsApp (Twilio)

1. Acesse https://www.twilio.com
2. Crie uma conta (teste grátis)
3. Vá para Console > Messaging > Try it out
4. Configure um WhatsApp Sandbox
5. Copie as credenciais e coloque em `.env`

Exemplo `.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+55xxxxxxxxxx
```

## 🗄️ Estrutura do Banco de Dados

### Coleções MongoDB

**Usuario**
- Nome, Email, CPF, WhatsApp
- Tipo (admin, diretor, coordenador, professor, aluno)
- Ativo (true/false)

**Turma**
- Nome, Ano, Série
- Professor responsável
- Lista de alunos

**Presenca**
- Aluno, Data, Status (presente/falta/justificada)
- Professor que registrou
- Notificação enviada (true/false)

**Avaliacao**
- Aluno, Nota (0-10)
- Tipo (prova, teste, atividade, etc)
- Período, Peso

**Desempenho**
- Média geral, Frequência
- Situação (aprovado/recuperação/reprovado)
- Diagnóstico do professor

## 🔧 Operações Comuns

### Registrar Presença
1. Professor faz login
2. Acessa "Presença"
3. Seleciona turma e data
4. Marca alunos presentes
5. Clica "Salvar"
6. Sistema envia alerta WhatsApp para faltas

### Lançar Avaliação
1. Professor em "Avaliações"
2. Seleciona aluno, disciplina, tipo
3. Insere nota (0-10)
4. Clica "Lançar"
5. Sistema calcula média automaticamente

### Visualizar Desempenho (Coordenador)
1. Acessa "Dashboard"
2. Vê alunos em recuperação
3. Pode enviar alertas personalizados

### Acompanhar Notas (Aluno)
1. Faz login
2. Acessa "Minhas Notas"
3. Filtra por período
4. Vê todas as avaliações

## ⚙️ Configurações da Escola

### Bimestral vs Trimestral
**Diretor pode configurar em "Configurações":**

**Bimestral (4 períodos):**
- 1º Bimestre
- 2º Bimestre
- 3º Bimestre
- 4º Bimestre

**Trimestral (3 períodos):**
- 1º Trimestre
- 2º Trimestre
- 3º Trimestre

### Tipos de Avaliação
- Prova Bimestral
- Teste Bimestral
- Atividades
- Trabalhos
- Prova Final
- Recuperação

## 📊 Relatórios e Estatísticas

### Dashboard do Diretor
- Total de alunos
- Total de professores
- Taxa de frequência média
- Alunos em recuperação

### Diagnóstico de Desempenho
- Coordenador gera relatório
- Mostra alunos com baixo desempenho
- Recomendações por disciplina

## 🔒 Segurança e Boas Práticas

### Senhas
- Mínimo 8 caracteres
- Criptografadas com bcryptjs
- Nunca armazenadas em texto plano

### Tokens JWT
- Válidos por 7 dias (configurável)
- Armazenados no localStorage
- Enviados em cada requisição

### Logs de Auditoria
- Todas as ações registradas
- Inclui: usuário, ação, data, IP
- Acessível apenas para administração

### Controle de Acesso
- Cada função tem permissões específicas
- Professor não pode ver dados de outra turma
- Aluno só vê seus próprios dados

## 🚀 Deployment (Produção)

### Heroku
```bash
heroku create seu-app
git push heroku main
```

### DigitalOcean / AWS
1. Configure servidor Ubuntu 20.04
2. Instale Node.js
3. Instale MongoDB
4. Configure nginx como reverse proxy
5. Use HTTPS com Let's Encrypt

## 📞 Suporte e Troubleshooting

### Problema: Página não carrega
- Verifique se servidor está rodando
- Verifique console do navegador (F12)
- Verifique Network tab para erros

### Problema: Presença não registra
- Verifique se turma tem alunos
- Verifique permissões do professor
- Verifique console do navegador

### Problema: WhatsApp não envia
- Verifique credenciais Twilio
- Verifique número do responsável
- Verifique saldo Twilio (teste é gratuito, mas limitado)

## 📚 Recursos Adicionais

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [Twilio WhatsApp API](https://www.twilio.com/docs/sms/whatsapp)
- [JWT.io](https://jwt.io/)

---

**Dúvidas ou problemas? Abra uma issue no repositório!**
