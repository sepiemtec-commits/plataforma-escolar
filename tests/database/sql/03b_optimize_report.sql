-- Extra otimização de relatório (Q7) — ambiente de teste.
-- Índice covering para agregações por turma.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boletins_turma_media_situacao
  ON boletins (turma_id, media_geral, situacao, frequencia_pct);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matriculas_turma_aluno
  ON matriculas (turma_id, aluno_id)
  WHERE ativo;
