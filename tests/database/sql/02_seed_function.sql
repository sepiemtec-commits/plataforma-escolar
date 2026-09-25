-- Seed sintético em escala (TOKEN 10).
-- Parâmetros via sessão: SET veho.alunos = '100000' | '1000000'
-- Relacionados ≈ 5× alunos (notas+freq+boletim+matrícula ≈ alvo 5M em 1M alunos).

CREATE OR REPLACE FUNCTION veho_seed_scale(p_alunos BIGINT DEFAULT 100000)
RETURNS TABLE(etapa TEXT, linhas BIGINT, ms DOUBLE PRECISION) AS $$
DECLARE
  t0 TIMESTAMPTZ;
  n_escolas INT := GREATEST(10, LEAST(50, (p_alunos / 50000)::INT));
  n_turmas BIGINT;
  n_profs BIGINT;
  n_disc INT := 8;
  batch BIGINT;
BEGIN
  -- limpa (ambiente de teste apenas)
  t0 := clock_timestamp();
  TRUNCATE responsaveis, boletins, frequencias, notas, matriculas, disciplinas, turmas, usuarios, escolas RESTART IDENTITY CASCADE;
  UPDATE meta_scale SET valor = 'seeding', atualizado_em = now() WHERE chave = 'fase';
  etapa := 'truncate'; linhas := 0; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  t0 := clock_timestamp();
  INSERT INTO escolas (nome, cnpj)
  SELECT
    'Escola Scale ' || g,
    lpad(g::text, 14, '0')
  FROM generate_series(1, n_escolas) g;
  etapa := 'escolas'; linhas := n_escolas; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- professores (~1 por turma futura)
  n_turmas := GREATEST(p_alunos / 40, n_escolas);
  n_profs := n_turmas;
  t0 := clock_timestamp();
  INSERT INTO usuarios (escola_id, nome, email, tipo, ativo)
  SELECT
    1 + ((g - 1) % n_escolas),
    'Professor ' || g,
    'prof' || g || '@scale.test',
    'professor',
    TRUE
  FROM generate_series(1, n_profs) g;
  etapa := 'professores'; linhas := n_profs; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  t0 := clock_timestamp();
  INSERT INTO turmas (escola_id, nome, nivel, serie, ano, turno, professor_id)
  SELECT
    u.escola_id,
    'Turma ' || g,
    CASE (g % 3)
      WHEN 0 THEN 'Fundamental I'
      WHEN 1 THEN 'Fundamental II'
      ELSE 'Ensino Médio'
    END,
    ((g % 9) + 1)::text || 'º',
    2026,
    CASE (g % 3) WHEN 0 THEN 'Manhã' WHEN 1 THEN 'Tarde' ELSE 'Noite' END,
    u.id
  FROM generate_series(1, n_turmas) g
  JOIN usuarios u ON u.id = g AND u.tipo = 'professor';
  etapa := 'turmas'; linhas := n_turmas; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  t0 := clock_timestamp();
  INSERT INTO disciplinas (escola_id, nome)
  SELECT e.id, d.nome
  FROM escolas e
  CROSS JOIN (VALUES
    ('Matemática'),('Português'),('História'),('Geografia'),
    ('Ciências'),('Inglês'),('Arte'),('Educação Física')
  ) AS d(nome);
  etapa := 'disciplinas'; linhas := n_escolas * n_disc; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- alunos
  t0 := clock_timestamp();
  INSERT INTO usuarios (escola_id, nome, email, tipo, ativo, matricula)
  SELECT
    1 + ((g - 1) % n_escolas),
    'Aluno Scale ' || g,
    'aluno' || g || '@scale.test',
    'aluno',
    TRUE,
    g::INT
  FROM generate_series(1, p_alunos) g;
  etapa := 'alunos'; linhas := p_alunos; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- matrículas: aluno i -> turma ((i-1)%n_turmas)+1  (alunos começam após professores)
  t0 := clock_timestamp();
  INSERT INTO matriculas (turma_id, aluno_id, ativo)
  SELECT
    1 + ((a.rn - 1) % n_turmas),
    a.id,
    TRUE
  FROM (
    SELECT id, row_number() OVER (ORDER BY id) AS rn
    FROM usuarios WHERE tipo = 'aluno'
  ) a;
  etapa := 'matriculas'; linhas := p_alunos; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- notas: 2 por aluno (~2M @ 1M)
  t0 := clock_timestamp();
  INSERT INTO notas (aluno_id, turma_id, professor_id, disciplina, tipo, periodo, nota, peso, data_aplicacao)
  SELECT
    m.aluno_id,
    m.turma_id,
    t.professor_id,
    (ARRAY['Matemática','Português','História','Geografia','Ciências','Inglês','Arte','Educação Física'])
      [1 + ((m.aluno_id + k) % n_disc)],
    CASE k WHEN 1 THEN 'prova_bimestral' ELSE 'teste_bimestral' END,
    (ARRAY['1º Bimestre','2º Bimestre','3º Bimestre','4º Bimestre'])[1 + ((m.aluno_id + k) % 4)],
    round((5 + random() * 5)::numeric, 1),
    1,
    DATE '2026-03-01' + (((m.aluno_id + k) % 120)::int)
  FROM matriculas m
  JOIN turmas t ON t.id = m.turma_id
  CROSS JOIN generate_series(1, 2) k;
  GET DIAGNOSTICS batch = ROW_COUNT;
  etapa := 'notas'; linhas := batch; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- frequências: 1.5 por aluno em média → 3 a cada 2 alunos
  t0 := clock_timestamp();
  INSERT INTO frequencias (aluno_id, turma_id, professor_id, disciplina, tempo, data, status)
  SELECT
    m.aluno_id,
    m.turma_id,
    t.professor_id,
    'Geral',
    1 + (k % 3),
    DATE '2026-03-01' + (((m.aluno_id + k) % 90)::int),
    (ARRAY['presente','presente','presente','falta','atraso','justificada'])[1 + ((m.aluno_id + k) % 6)]
  FROM matriculas m
  JOIN turmas t ON t.id = m.turma_id
  CROSS JOIN generate_series(1, 2) k
  WHERE (m.aluno_id % 4) <> 0 OR k = 1; -- ~1.5x alunos
  GET DIAGNOSTICS batch = ROW_COUNT;
  etapa := 'frequencias'; linhas := batch; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- boletins: 1 linha por aluno (disciplina dominante)
  t0 := clock_timestamp();
  INSERT INTO boletins (aluno_id, turma_id, disciplina, periodo, media_geral, frequencia_pct, total_faltas, total_aulas, situacao)
  SELECT
    m.aluno_id,
    m.turma_id,
    (ARRAY['Matemática','Português','História','Geografia','Ciências','Inglês','Arte','Educação Física'])
      [1 + (m.aluno_id % n_disc)],
    '1º Bimestre',
    round((5 + random() * 5)::numeric, 1),
    round((70 + random() * 30)::numeric, 2),
    (m.aluno_id % 10)::INT,
    40,
    CASE
      WHEN (m.aluno_id % 20) = 0 THEN 'recuperacao'
      WHEN (m.aluno_id % 50) = 0 THEN 'reprovado'
      WHEN (m.aluno_id % 15) = 0 THEN 'excelente'
      ELSE 'aprovado'
    END
  FROM matriculas m;
  GET DIAGNOSTICS batch = ROW_COUNT;
  etapa := 'boletins'; linhas := batch; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  -- responsáveis: 1 a cada 2 alunos
  t0 := clock_timestamp();
  INSERT INTO usuarios (escola_id, nome, email, tipo, ativo)
  SELECT
    a.escola_id,
    'Responsável ' || a.id,
    'resp' || a.id || '@scale.test',
    'responsavel',
    TRUE
  FROM usuarios a
  WHERE a.tipo = 'aluno' AND (a.id % 2) = 0;

  INSERT INTO responsaveis (usuario_id, aluno_id, grau)
  SELECT r.id, a.id, CASE WHEN a.id % 2 = 0 THEN 'mae' ELSE 'pai' END
  FROM usuarios a
  JOIN usuarios r ON r.email = 'resp' || a.id || '@scale.test'
  WHERE a.tipo = 'aluno' AND (a.id % 2) = 0;
  GET DIAGNOSTICS batch = ROW_COUNT;
  etapa := 'responsaveis'; linhas := batch; ms := EXTRACT(EPOCH FROM (clock_timestamp() - t0)) * 1000; RETURN NEXT;

  ANALYZE;
  INSERT INTO meta_scale (chave, valor) VALUES ('alunos_seed', p_alunos::text)
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
  UPDATE meta_scale SET valor = 'baseline_seeded', atualizado_em = now() WHERE chave = 'fase';

  etapa := 'analyze_done'; linhas := p_alunos; ms := 0; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
