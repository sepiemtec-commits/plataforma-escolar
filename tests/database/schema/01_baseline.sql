-- TOKEN 10 baseline: schema relacional espelhando domínio VEHO Edu
-- Índices mínimos (PKs/FKs/uniques apenas) — intencional para medir Seq Scan.

-- pg_stat_statements opcional (exige shared_preload_libraries); ignorado se indisponível
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_stat_statements indisponível: %', SQLERRM;
END $$;

CREATE TABLE escolas (
  id            BIGSERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  cnpj          TEXT NOT NULL UNIQUE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id            BIGSERIAL PRIMARY KEY,
  escola_id     BIGINT NOT NULL REFERENCES escolas(id),
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN (
    'admin','diretor','coordenador','secretaria','professor','aluno','responsavel'
  )),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  matricula     INTEGER,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- email unique só depois do seed (performance)

CREATE TABLE turmas (
  id            BIGSERIAL PRIMARY KEY,
  escola_id     BIGINT NOT NULL REFERENCES escolas(id),
  nome          TEXT NOT NULL,
  nivel         TEXT NOT NULL,
  serie         TEXT,
  ano           INTEGER NOT NULL,
  turno         TEXT NOT NULL DEFAULT 'Manhã',
  professor_id  BIGINT REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matriculas (
  id            BIGSERIAL PRIMARY KEY,
  turma_id      BIGINT NOT NULL REFERENCES turmas(id),
  aluno_id      BIGINT NOT NULL REFERENCES usuarios(id),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (turma_id, aluno_id)
);

CREATE TABLE disciplinas (
  id            BIGSERIAL PRIMARY KEY,
  escola_id     BIGINT NOT NULL REFERENCES escolas(id),
  nome          TEXT NOT NULL,
  UNIQUE (escola_id, nome)
);

-- Espelho de Avaliacao (notas)
CREATE TABLE notas (
  id            BIGSERIAL PRIMARY KEY,
  aluno_id      BIGINT NOT NULL REFERENCES usuarios(id),
  turma_id      BIGINT NOT NULL REFERENCES turmas(id),
  professor_id  BIGINT REFERENCES usuarios(id),
  disciplina    TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  periodo       TEXT NOT NULL,
  nota          NUMERIC(4,1) NOT NULL,
  peso          NUMERIC(3,1) NOT NULL DEFAULT 1,
  data_aplicacao DATE NOT NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Espelho de Presenca (frequência)
CREATE TABLE frequencias (
  id            BIGSERIAL PRIMARY KEY,
  aluno_id      BIGINT NOT NULL REFERENCES usuarios(id),
  turma_id      BIGINT NOT NULL REFERENCES turmas(id),
  professor_id  BIGINT REFERENCES usuarios(id),
  disciplina    TEXT NOT NULL DEFAULT 'Geral',
  tempo         SMALLINT NOT NULL DEFAULT 1,
  data          DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('presente','falta','justificada','atraso')),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Espelho de Desempenho (boletim)
CREATE TABLE boletins (
  id            BIGSERIAL PRIMARY KEY,
  aluno_id      BIGINT NOT NULL REFERENCES usuarios(id),
  turma_id      BIGINT NOT NULL REFERENCES turmas(id),
  disciplina    TEXT NOT NULL,
  periodo       TEXT NOT NULL,
  media_geral   NUMERIC(4,1),
  frequencia_pct NUMERIC(5,2),
  total_faltas  INTEGER NOT NULL DEFAULT 0,
  total_aulas   INTEGER NOT NULL DEFAULT 0,
  situacao      TEXT CHECK (situacao IN ('aprovado','recuperacao','reprovado','excelente')),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE responsaveis (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id),
  aluno_id      BIGINT NOT NULL REFERENCES usuarios(id),
  grau          TEXT,
  UNIQUE (usuario_id, aluno_id)
);

-- Marcador de fase de otimização
CREATE TABLE meta_scale (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO meta_scale (chave, valor) VALUES
  ('fase', 'baseline'),
  ('indexes', 'pk_fk_only');
