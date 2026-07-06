# 📖 Documentação da API - Plataforma Educacional

## Base URL
```
http://localhost:3000/api
```

## Autenticação
Usar header: `Authorization: Bearer {token}`

---

## 🔐 Autenticação

### POST /auth/login
Fazer login na plataforma

**Request:**
```json
{
    "email": "professor@escola.com",
    "senha": "senha123"
}
```

**Response (200):**
```json
{
    "sucesso": true,
    "mensagem": "Login realizado com sucesso",
    "token": "eyJhbGc...",
    "usuario": {
        "id": "507f1f77bcf86cd799439011",
        "nome": "João Professor",
        "email": "professor@escola.com",
        "tipo": "professor",
        "escola_id": "507f1f77bcf86cd799439012"
    }
}
```

### POST /auth/registrar
Registrar novo usuário

**Request:**
```json
{
    "nome": "Maria Silva",
    "email": "maria@escola.com",
    "senha": "senhaSegura123",
    "cpf": "123.456.789-00",
    "whatsapp": "+55119999999",
    "tipo": "aluno",
    "escola_id": "507f1f77bcf86cd799439012"
}
```

### GET /auth/verificar
Verificar se token é válido

**Headers:**
```
Authorization: Bearer eyJhbGc...
```

**Response (200):**
```json
{
    "sucesso": true,
    "usuario": { /* dados do usuário */ }
}
```

---

## 📋 Presença

### POST /presenca/registrar
Registrar presença de alunos

**Request:**
```json
{
    "aluno_id": "507f1f77bcf86cd799439013",
    "turma_id": "507f1f77bcf86cd799439014",
    "status": "presente",
    "data": "2024-05-10T08:00:00",
    "observacoes": "Aluno chegou 5 minutos atrasado"
}
```

**Response (200):**
```json
{
    "sucesso": true,
    "mensagem": "Presença registrada com sucesso",
    "presenca": { /* objeto presença */ }
}
```

### GET /presenca/turma/:turmaId?data=2024-05-10
Listar presença da turma em uma data específica

**Response (200):**
```json
{
    "sucesso": true,
    "total": 30,
    "presencas": [
        {
            "_id": "507f1f77bcf86cd799439015",
            "aluno_id": { "nome": "João", "email": "joao@escola.com" },
            "status": "presente",
            "data": "2024-05-10T08:00:00"
        }
    ]
}
```

### GET /presenca/aluno/:alunoId
Histórico de presença do aluno

**Response (200):**
```json
{
    "sucesso": true,
    "presencas": [ /* array de presenças */ ],
    "estatisticas": {
        "totalAulas": 40,
        "presentacoes": 38,
        "faltas": 2,
        "justificadas": 0,
        "frequenciaPercentual": 95.0
    }
}
```

### PUT /presenca/:presencaId
Atualizar presença

**Request:**
```json
{
    "status": "justificada",
    "observacoes": "Justificado pelos pais"
}
```

---

## 📝 Avaliação

### POST /avaliacao/lancar
Lançar nota para aluno

**Request:**
```json
{
    "aluno_id": "507f1f77bcf86cd799439013",
    "turma_id": "507f1f77bcf86cd799439014",
    "disciplina": "Matemática",
    "tipo": "prova_bimestral",
    "periodo": "1º Bimestre",
    "nota": 8.5,
    "peso": 2,
    "dataAplicacao": "2024-05-08T10:00:00"
}
```

**Tipos válidos:**
- `prova_bimestral`
- `teste_bimestral`
- `atividade`
- `trabalho`
- `prova_final`
- `recuperacao`

### GET /avaliacao/aluno/:alunoId
Listar todas as notas do aluno

**Response (200):**
```json
{
    "sucesso": true,
    "total": 5,
    "avaliacoes": [
        {
            "_id": "...",
            "disciplina": "Matemática",
            "tipo": "prova_bimestral",
            "nota": 8.5,
            "periodo": "1º Bimestre",
            "dataAplicacao": "2024-05-08T10:00:00"
        }
    ]
}
```

### GET /avaliacao/boletim/:alunoId
Obter boletim completo do aluno

**Response (200):**
```json
{
    "sucesso": true,
    "boletim": [
        {
            "_id": "...",
            "disciplina": "Matemática",
            "periodo": "1º Bimestre",
            "mediaGeral": 8.25,
            "frequenciaPercentual": 95,
            "situacao": "excelente"
        }
    ]
}
```

### POST /avaliacao/diagnosticar
Gerar diagnóstico de alunos com baixo desempenho

**Request:**
```json
{
    "turmaId": "507f1f77bcf86cd799439014",
    "periodo": "1º Bimestre"
}
```

---

## 📚 Conteúdo

### POST /conteudo/registrar
Registrar conteúdo programático da aula

**Request:**
```json
{
    "turma_id": "507f1f77bcf86cd799439014",
    "disciplina": "Matemática",
    "titulo": "Frações",
    "descricao": "Conceitos básicos de frações",
    "topicos": ["Definição", "Tipos de frações", "Operações"],
    "recursos": ["https://youtube.com/..."],
    "data": "2024-05-10T14:00:00"
}
```

### GET /conteudo/turma/:turmaId
Listar conteúdo da turma

**Response (200):**
```json
{
    "sucesso": true,
    "total": 15,
    "conteudos": [ /* array de conteúdos */ ]
}
```

---

## 📊 Painéis

### GET /painel/professor
Dados para painel do professor

**Response (200):**
```json
{
    "sucesso": true,
    "painel": {
        "turmas": 2,
        "turmasDetalhes": [ /* array de turmas */ ],
        "presencasRecentes": [ /* últimas 10 presenças */ ],
        "alunosAtencao": [ /* alunos em recuperação */ ]
    }
}
```

### GET /painel/diretor
Dados para painel do diretor

**Response (200):**
```json
{
    "sucesso": true,
    "painel": {
        "escola": "Escola Estadual X",
        "estatisticas": {
            "totalAlunos": 450,
            "totalProfessores": 25,
            "totalTurmas": 15,
            "frequenciaMedia": "92.5"
        },
        "alertas": {
            "alunosRecuperacao": 12,
            "detalhes": [ /* detalhes dos alunos */ ]
        }
    }
}
```

### GET /painel/aluno
Dados para painel do aluno

**Response (200):**
```json
{
    "sucesso": true,
    "painel": {
        "aluno": "João Silva",
        "boletim": [ /* desempenho por disciplina */ ],
        "avaliacoes": [ /* últimas avaliações */ ],
        "frequencia": 95.0,
        "faltas": 2
    }
}
```

---

## 📬 Notificações

### POST /notificacoes/falta/:presencaId
Enviar alerta de falta via WhatsApp

**Response (200):**
```json
{
    "sucesso": true,
    "mensagem": "Alertas enviados para 1 responsável(is)",
    "enviados": 1
}
```

### POST /notificacoes/desempenho/:alunoId
Enviar alerta de baixo desempenho

**Request:**
```json
{
    "disciplina": "Matemática",
    "media": 4.5
}
```

### POST /notificacoes/geral
Enviar notificação geral

**Request:**
```json
{
    "titulo": "Reunião de Pais",
    "mensagem": "Reunião marcada para 20/05 às 19h",
    "destinatarios": "todos"
}
```

---

## 👥 Usuários

### GET /usuarios
Listar usuários

**Query params:**
- `tipo` - Filtrar por tipo (professor, aluno, etc)
- `escola_id` - Filtrar por escola

**Response (200):**
```json
{
    "sucesso": true,
    "total": 100,
    "usuarios": [ /* array de usuários */ ]
}
```

### PUT /usuarios/:usuarioId
Atualizar dados do usuário

**Request:**
```json
{
    "nome": "João Silva",
    "email": "joao.silva@escola.com",
    "whatsapp": "+55119999999",
    "telefone": "(11) 3000-0000"
}
```

---

## 🔍 Tratamento de Erros

### Erro 400 - Bad Request
```json
{
    "sucesso": false,
    "mensagem": "Validação falhou",
    "erros": [
        {
            "field": "email",
            "message": "Email inválido"
        }
    ]
}
```

### Erro 401 - Unauthorized
```json
{
    "sucesso": false,
    "mensagem": "Token inválido ou expirado"
}
```

### Erro 403 - Forbidden
```json
{
    "sucesso": false,
    "mensagem": "Acesso negado. Permissão insuficiente."
}
```

### Erro 404 - Not Found
```json
{
    "sucesso": false,
    "mensagem": "Recurso não encontrado"
}
```

### Erro 500 - Server Error
```json
{
    "sucesso": false,
    "mensagem": "Erro no servidor"
}
```

---

## 📝 Exemplos de Integração

### Python - Fazer Login
```python
import requests

url = "http://localhost:3000/api/auth/login"
dados = {
    "email": "professor@escola.com",
    "senha": "senha123"
}

resposta = requests.post(url, json=dados)
token = resposta.json()['token']
print(f"Token: {token}")
```

### JavaScript - Registrar Presença
```javascript
const presenca = {
    aluno_id: "507f1f77bcf86cd799439013",
    turma_id: "507f1f77bcf86cd799439014",
    status: "presente",
    data: new Date().toISOString()
};

fetch('http://localhost:3000/api/presenca/registrar', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(presenca)
}).then(r => r.json()).then(console.log);
```

### cURL - Lançar Avaliação
```bash
curl -X POST http://localhost:3000/api/avaliacao/lancar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "aluno_id": "507f1f77bcf86cd799439013",
    "turma_id": "507f1f77bcf86cd799439014",
    "disciplina": "Matemática",
    "tipo": "prova_bimestral",
    "periodo": "1º Bimestre",
    "nota": 8.5,
    "peso": 2,
    "dataAplicacao": "2024-05-08T10:00:00"
  }'
```

---

## ⚡ Rate Limiting

Limite de 100 requisições por minuto por IP.

---

## 📱 Códigos HTTP Utilizados

| Código | Significado |
|--------|-------------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Requisição inválida |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Acesso negado |
| 404 | Not Found - Não encontrado |
| 500 | Internal Server Error - Erro do servidor |

---

**Última atualização**: Maio 2024
