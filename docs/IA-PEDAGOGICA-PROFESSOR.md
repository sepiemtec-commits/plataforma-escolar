# IA Pedagógica (professor) — MVP

Gera **parecer descritivo** e **orientações pedagógicas** a partir de notas e frequência já lançadas no VEHO Edu. O texto **não é publicado automaticamente**: o professor revisa, edita e salva.

## Como usar

1. Entre no **painel do professor**.
2. Abra o menu **IA Pedagógica**.
3. Escolha **turma**, **aluno** e, se quiser, **disciplina**.
4. Clique em **Gerar parecer**.
5. Revise os textos nos campos editáveis.
6. Clique em **Salvar parecer revisado**.
7. O **histórico** do mesmo aluno lista os pareceres salvos.

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

Roles: `professor`, `coordenador`, `diretor`, `admin`. O professor só gera/salva para turmas a que está vinculado.

## Limitações do MVP

- Sugestão de texto — não substitui o julgamento docente.
- Não há publicação automática para família ou boletim.
- Qualidade depende dos dados de notas/presença já lançados.
