-- Otimizações SOMENTE no ambiente de teste (TOKEN 10).
-- Índices alinhados às consultas de painel/boletim/notas/frequência/relatórios.

-- Usuarios: filtro tenant + tipo + ordenação
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_escola_tipo_nome
  ON usuarios (escola_id, tipo, nome);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_email
  ON usuarios (email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usuarios_tipo_id
  ON usuarios (tipo, id);

-- Turmas por escola + joins professor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_turmas_escola_nome
  ON turmas (escola_id, nome);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_turmas_professor
  ON turmas (professor_id);

-- Matrículas (joins aluno↔turma)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matriculas_aluno
  ON matriculas (aluno_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matriculas_turma_ativo
  ON matriculas (turma_id) WHERE ativo;

-- Notas: grade por turma+disciplina; boletim por aluno
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notas_turma_disc_periodo
  ON notas (turma_id, disciplina, periodo);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notas_aluno_periodo
  ON notas (aluno_id, periodo, disciplina);

-- Frequência: dashboard por turma/data; por aluno
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_freq_turma_data
  ON frequencias (turma_id, data);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_freq_aluno_data
  ON frequencias (aluno_id, data DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_freq_turma_status
  ON frequencias (turma_id, status);

-- Boletins / desempenho
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletins_aluno_periodo
  ON boletins (aluno_id, periodo, disciplina);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletins_turma_situacao
  ON boletins (turma_id, situacao);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletins_situacao_media
  ON boletins (situacao, media_geral)
  WHERE situacao IN ('recuperacao', 'reprovado');

-- Responsáveis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responsaveis_aluno
  ON responsaveis (aluno_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responsaveis_usuario
  ON responsaveis (usuario_id);

-- Remover índice redundante exemplo (se criado por engano em testes):
-- idx_notas_aluno sozinho é coberto por idx_notas_aluno_periodo
DROP INDEX IF EXISTS idx_notas_aluno_only;

UPDATE meta_scale SET valor = 'optimized', atualizado_em = now() WHERE chave = 'fase';
UPDATE meta_scale SET valor = 'covering_tenant_academic', atualizado_em = now() WHERE chave = 'indexes';

ANALYZE usuarios;
ANALYZE turmas;
ANALYZE matriculas;
ANALYZE notas;
ANALYZE frequencias;
ANALYZE boletins;
ANALYZE responsaveis;
