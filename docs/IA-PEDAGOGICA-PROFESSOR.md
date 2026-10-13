# NICE IA (professor) — MVP

Gera **parecer descritivo** e **orientações pedagógicas** a partir de notas e frequência já lançadas no VEHO Edu. O texto **não é publicado automaticamente**: o professor revisa, edita e salva.

A geração usa **modelo open-source local via Ollama** (sem OpenAI / API paga). Veja o guia completo: [IA-LOCAL-OLLAMA.md](./IA-LOCAL-OLLAMA.md).

## Como usar

1. Entre no **painel do professor**.
2. Abra o menu **NICE IA**.
3. (Opcional) Escolha **turma**, **aluno** e **disciplina** para contextualizar.
4. Use o **chat** para perguntar (estratégias, autores, recuperação, BNCC…).
5. Ou clique em **Gerar parecer**, revise os textos e **Salvar parecer revisado**.
6. O **histórico** do mesmo aluno lista os pareceres salvos.

## Chat interativo

Rota: `POST /api/ia/chat` com `{ mensagem, historico?, aluno_id?, turma_id?, disciplina? }`.

Com Ollama em execução, a conversa usa o modelo local (`OLLAMA_MODEL`). Se o Ollama estiver offline, cai no motor de regras com base pedagógica curada (exceto bloqueio por créditos/limites).

## Motor de regras (fallback)

Sem Ollama, a VEHO classifica a situação do aluno (excelente / bom / alerta / crítico / sem dados) e preenche textos-modelo em português pedagógico, com referências curadas (Vygotsky, Freire, Piaget, Ausubel, Wallon, BNCC…).

Base: `backend/constants/pedagogiaReferencias.js`.

## Ollama (padrão recomendado)

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

Instalação e testes: [IA-LOCAL-OLLAMA.md](./IA-LOCAL-OLLAMA.md).

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/ia/status` | Saúde Ollama + créditos |
| `GET` | `/api/ia/creditos` | Saldo e limites |
| `POST` | `/api/ia/perguntar` | Pergunta genérica autenticada |
| `POST` | `/api/ia/chat` | Chat NICE IA |
| `POST` | `/api/ia/parecer/gerar` | Gera parecer (não persiste) |
| `POST` | `/api/ia/parecer/salvar` | Salva parecer revisado |
| `GET` | `/api/ia/parecer/aluno/:alunoId` | Histórico do aluno |

## Privacidade

Prompts enviados ao modelo **não incluem** nome, CPF ou e-mail — apenas métricas pedagógicas (média, frequência, turma, disciplina).
