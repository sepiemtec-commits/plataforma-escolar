# HTPC, PEI e BNCC embarcada (MVP)

Módulos pedagógicos no VEHO Edu: reuniões **HTPC**, planos **PEI** e catálogo **BNCC** (Computação + amostra LP/Mat).

## Reuniões pedagógicas (ex-HTPC na interface)

- **Coordenador:** menu **Agendamento de reunião pedagógica** — escolhe público (**Pais**, **Professores** ou **Todos**), agenda, ata e presença.
- **Professor / responsável:** menu **Reuniões pedagógicas** — marca a própria presença nas reuniões em que foi convidado.

API interna permanece em `/api/htpc`.

## PEI

- **Coordenador:** menu PEI → criar plano (diagnóstico, necessidades, metas, estratégias, recursos) e registrar acompanhamentos.
- **Professor:** menu PEI → **somente consulta**. Busca pelo nome e turma do aluno e visualiza o documento criado pela coordenação (sem criar, editar ou registrar acompanhamento).

API: `/api/pei` — GET para coordenação e professor; POST / PUT / acompanhamento apenas `coordenador`, `diretor`, `admin`.

## BNCC embarcada

Catálogo global no Mongo (`BnccItem`). Seed:

```bash
node database/seed-bncc.js
```

Inclui ~36 códigos de **Computação** (anos 1–9 + EM) nos eixos Pensamento computacional, Mundo digital e Cultura digital, mais amostra de **Língua Portuguesa** e **Matemática**.

- **Professor:** menu BNCC → busca por texto/área/ano; clique no código copia para o campo do **Conteúdo programático**.
- Ao registrar conteúdo, envie `codigosBncc` (vírgulas).

API: `/api/bncc?q=&area=&ano=` e `/api/bncc/:codigo`.

## Limites do MVP

- Não é o banco oficial completo do MEC.
- Não gera PEI/HTPC por IA.
- Não substitui exigências de edital municipal (Cerquilho etc.) de “conteúdo BNCC embarcado” em volume industrial.
