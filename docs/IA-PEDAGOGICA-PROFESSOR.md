# NICE IA (professor) — MVP

Gera **parecer descritivo** e **orientações pedagógicas** a partir de notas e frequência já lançadas no VEHO Edu. O texto **não é publicado automaticamente**: o professor revisa, edita e salva.

## Como usar

1. Entre no **painel do professor**.
2. Abra o menu **NICE IA**.
3. (Opcional) Escolha **turma**, **aluno** e **disciplina** para contextualizar.
4. Use o **chat** para perguntar (estratégias, autores, recuperação, BNCC…).
5. Ou clique em **Gerar parecer**, revise os textos e **Salvar parecer revisado**.
6. O **histórico** do mesmo aluno lista os pareceres salvos.

## Chat interativo

Rota: `POST /api/ia/chat` com `{ mensagem, historico?, aluno_id?, turma_id?, disciplina? }`.

Com `OPENAI_API_KEY`, a conversa usa o modelo; sem chave, respostas locais com base pedagógica curada.

## Motor local (padrão)

Sem configuração extra, a VEHO classifica a situação do aluno (excelente / bom / alerta / crítico / sem dados) com base em média e frequência e preenche parágrafos-modelo em português pedagógico.

Além disso, anexa **referências pedagógicas curadas** (Vygotsky, Freire, Piaget, Ausubel, Wallon, BNCC e autores por área — Português, Matemática, Ciências, História, Geografia, EF, Artes etc.), escolhidas conforme a disciplina e o nível de alerta. O professor deve revisar antes de usar com a família.

Isso permite usar o MVP **sem conta OpenAI**.

Base de dados: `backend/constants/pedagogiaReferencias.js` (ampliável).

## OpenAI (opcional)

1. Crie conta em [platform.openai.com](https://platform.openai.com).
2. Em **API keys**, crie uma chave secreta.
3. No `.env` do projeto:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

4. Reinicie o servidor (`npm start`).

Se a chave existir, a geração tenta o modelo externo **recebendo as mesmas referências curadas no prompt** (para citar autores/ideias sem inventar bibliografia); se falhar ou a chave estiver vazia, usa o motor local.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/ia/parecer/gerar` | Gera parecer (não persiste) |
| `POST` | `/api/ia/parecer/salvar` | Salva parecer revisado |
| `GET` | `/api/ia/parecer/aluno/:id` | Lista pareceres salvos do aluno |
| `POST` | `/api/ia/chat` | Chat interativo NICE IA |

Roles: `professor`, `coordenador`, `diretor`, `admin`. O professor só gera/salva para turmas a que está vinculado.

## Limitações do MVP

- Sugestão de texto — não substitui o julgamento docente.
- Não há publicação automática para família ou boletim.
- Qualidade depende dos dados de notas/presença já lançados.
