# 🔒 Guia de Segurança - Plataforma Educacional

## 🎯 Princípios de Segurança Implementados

### 1. Autenticação
- ✅ JWT (JSON Web Tokens) com expiração
- ✅ Senhas criptografadas com bcryptjs (10 salt rounds)
- ✅ Validação de token em toda requisição

### 2. Autorização
- ✅ Controle de acesso por função (RBAC)
- ✅ Verificação de permissões em cada endpoint
- ✅ Isolamento de dados por usuário

### 3. Proteção de Dados
- ✅ Helmet para headers HTTP seguros
- ✅ CORS configurado para origens permitidas
- ✅ Validação de entrada em todas as requisições
- ✅ SQL Injection: Não aplicável (MongoDB com Mongoose)
- ✅ XSS Protection: Sanitização de inputs

### 4. Logs e Auditoria
- ✅ Log de todas as ações
- ✅ Registro de IP e timestamp
- ✅ Rastreamento de modificações

---

## 🚀 Configuração de Segurança em Produção

### 1. Variáveis de Ambiente
```env
# Use valores REAIS e FORTES
NODE_ENV=production
JWT_SECRET=uma_chave_muito_longa_e_aleatoria_impossivel_de_adivinhar_minimo_32_caracteres
JWT_EXPIRE=7d

# Use credenciais reais
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=seu_auth_token_real_muito_longo
TWILIO_PHONE_NUMBER=+55xxxxxxxxxxxx

# Use banco de dados remoto
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/plataforma_escolar
```

### 2. Banco de Dados
```bash
# Use credenciais fortes
# Ative autenticação
# Restrinja acesso por IP
# Use SSL/TLS para conexão
```

### 3. HTTPS
```bash
# Obter certificado SSL gratuito com Let's Encrypt
sudo certbot certonly --standalone -d seu-dominio.com

# Configurar em production com nginx/reverse proxy
```

### 4. CORS
```javascript
// Production - Apenas dominios permitidos
const corsOptions = {
    origin: ['https://seu-dominio.com', 'https://www.seu-dominio.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
```

### 5. Rate Limiting
```javascript
// Instalar: npm install express-rate-limit
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite de 100 requisições
});

app.use('/api/', limiter);
```

### 6. Validação de Entrada
```javascript
// Implementar com express-validator
const { body, validationResult } = require('express-validator');

// Validar email
body('email').isEmail().normalizeEmail()

// Validar CPF
body('cpf').matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)

// Validar WhatsApp
body('whatsapp').matches(/^\+55\d{10,11}$/)

// Validar nota
body('nota').isFloat({ min: 0, max: 10 })
```

### 7. Proteção de Headers
```javascript
// Helmet já está configurado
app.use(helmet());

// Opções adicionais
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
    }
}));
```

---

## 🔐 Senhas Seguras

### Requisitos
- ✅ Mínimo 8 caracteres (ideal 12+)
- ✅ Deve conter maiúsculas e minúsculas
- ✅ Deve conter números
- ✅ Deve conter caracteres especiais (!@#$%^&*)
- ✅ Nunca compartilhada
- ✅ Atualizada regularmente

### Política Recomendada
```javascript
// Validar força de senha
function validarForcaSenha(senha) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(senha);
}
```

---

## 🛡️ Gestão de Tokens

### Boas Práticas
1. **Não armazene em cookies** (use localStorage com cuidado)
2. **Sempre use HTTPS** para transmitir tokens
3. **Implemente expiração** (JWT_EXPIRE = 7d)
4. **Implemente refresh token** para sessões longas
5. **Revogar tokens** ao fazer logout

### Refresh Token (Implementação Recomendada)
```javascript
// Gerar refresh token (válido por 30 dias)
const refreshToken = jwt.sign(
    { id: usuario._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
);

// Salvar no banco para revogação
await RefreshToken.create({
    usuario_id: usuario._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
});
```

---

## 📱 Segurança WhatsApp (Twilio)

### Boas Práticas
1. **Nunca exponha credenciais** no código
2. **Use variáveis de ambiente**
3. **Valide números de telefone** antes de enviar
4. **Implemente rate limiting** para notificações
5. **Mantenha um log** de mensagens enviadas

### Validação de Número
```javascript
// Validar com padrão brasileiro
function validarWhatsApp(numero) {
    const regex = /^\+55\d{10,11}$/;
    return regex.test(numero);
}
```

---

## 🔍 Auditoria

### O que é Registrado
- Cada login/logout
- Criação/atualização de usuários
- Registro de presenças
- Lançamento de notas
- Envio de notificações
- Tentativas de acesso não autorizado

### Como Acessar Logs
```javascript
// Buscar logs de um usuário
const logs = await Log.find({ usuario_id: usuarioId })
    .sort({ dataCriacao: -1 })
    .limit(50);

// Buscar por ação específica
const logsFaltas = await Log.find({ acao: 'REGISTROU_PRESENÇA' });

// Buscar por período
const logsRecentes = await Log.find({
    dataCriacao: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // últimos 7 dias
    }
});
```

---

## 🚨 Tratamento de Vulnerabilidades

### SQL Injection
- ✅ MongoDB com Mongoose previne SQL Injection
- ✅ Inputs são validados antes de usar em queries

### XSS (Cross-Site Scripting)
- ✅ Frontend: Use framework que faz escaping automático
- ✅ Backend: Sanitize outputs

### CSRF (Cross-Site Request Forgery)
- ✅ Implementar tokens CSRF (express-csrf)

### Exemplo - Proteção XSS
```javascript
// Sanitizar inputs
const sanitize = require('sanitize-html');

const conteudoSeguro = sanitize(inputDoUsuario, {
    allowedTags: [],
    allowedAttributes: {}
});
```

---

## 📋 Checklist de Segurança Pré-Deploy

- [ ] Variáveis de ambiente configuradas corretamente
- [ ] JWT_SECRET forte (min 32 caracteres)
- [ ] HTTPS ativado
- [ ] CORS configurado apenas para domínios permitidos
- [ ] Rate limiting implementado
- [ ] Validação de entrada em todos endpoints
- [ ] Logs de auditoria ativados
- [ ] Banco de dados com autenticação forte
- [ ] Backup automático do banco de dados
- [ ] Monitoramento e alertas configurados
- [ ] Testes de segurança realizados
- [ ] Política de privacidade publicada
- [ ] Conformidade com LGPD/GDPR verificada

---

## 📞 Resposta a Incidentes

### Suspeita de Acesso Não Autorizado
1. Verifique logs de auditoria
2. Force reset de senhas se necessário
3. Revogue tokens ativos
4. Notifique usuários afetados
5. Implemente bloqueio temporário

### Vazamento de Dados
1. Notifique diretor/coordenador imediatamente
2. Identifique dados comprometidos
3. Notifique usuários afetados
4. Reforce medidas de segurança
5. Documente incidente

---

## 🔗 Recursos de Segurança

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)

---

**Última revisão**: Maio 2024
**Responsável**: Equipe de Segurança
