const {
  disciplinaPermitidaParaTurma,
  filtrarDisciplinasParaTurma,
  disciplinasPadraoPorTurma,
  labelRestricaoDisciplina,
  DISCIPLINAS_PADRAO
} = require('../../backend/constants/disciplinas');
const { NIVEL_ENSINO } = require('../../backend/constants/ensino');
const {
  disciplinasDoProfessor,
  professorTemDisciplina,
  normalizarDisciplinasProfessor,
  filtrarBoletimPorProfessor
} = require('../../backend/utils/professorDisciplinas');

describe('disciplinas — restrição por turma/nível', () => {
  const fund1 = { nivel: NIVEL_ENSINO.FUNDAMENTAL_I, ano: 4 };
  const nono = { nivel: NIVEL_ENSINO.FUNDAMENTAL_II, ano: 9 };
  const em = { nivel: NIVEL_ENSINO.ENSINO_MEDIO, ano: 2 };

  test('comportamento normal: Matemática em qualquer nível', () => {
    expect(disciplinaPermitidaParaTurma('Matemática', fund1)).toBe(true);
    expect(disciplinaPermitidaParaTurma('Matemática', em)).toBe(true);
  });

  test('regra: Física só EM ou 9º', () => {
    expect(disciplinaPermitidaParaTurma('Física', fund1)).toBe(false);
    expect(disciplinaPermitidaParaTurma('Física', nono)).toBe(true);
    expect(disciplinaPermitidaParaTurma('Física', em)).toBe(true);
  });

  test('regra: Filosofia só EM', () => {
    expect(disciplinaPermitidaParaTurma('Filosofia', nono)).toBe(false);
    expect(disciplinaPermitidaParaTurma('Filosofia', em)).toBe(true);
    expect(labelRestricaoDisciplina('Filosofia')).toBe('Ensino Médio');
  });

  test('dados ausentes: sem nome ou turma → liberado (contrato atual)', () => {
    expect(disciplinaPermitidaParaTurma('', fund1)).toBe(true);
    expect(disciplinaPermitidaParaTurma('Física', null)).toBe(true);
  });

  test('filtrar e padrão por turma', () => {
    const lista = filtrarDisciplinasParaTurma(['Matemática', 'Física', 'Filosofia'], fund1);
    expect(lista).toEqual(['Matemática']);
    expect(disciplinasPadraoPorTurma(em).length).toBeGreaterThan(0);
    expect(DISCIPLINAS_PADRAO).toContain('Português');
  });
});

describe('professores — disciplinas e permissão de boletim', () => {
  test('disciplinasDoProfessor usa lista ou campo único', () => {
    expect(disciplinasDoProfessor(null)).toEqual([]);
    expect(disciplinasDoProfessor({ disciplinas: ['matematica', 'fisica'] })).toEqual([
      'Matemática',
      'Física'
    ]);
    expect(disciplinasDoProfessor({ disciplina: 'portugues' })).toEqual(['Português']);
  });

  test('professorTemDisciplina — inválido / duplicidade normalizada', () => {
    const prof = { disciplinas: ['Matemática', 'Matemática'] };
    expect(professorTemDisciplina(prof, '')).toBe(false);
    expect(professorTemDisciplina(prof, 'matematica')).toBe(true);
    expect(professorTemDisciplina(prof, 'História')).toBe(false);
  });

  test('normalizarDisciplinasProfessor — string, array e ausente', () => {
    expect(normalizarDisciplinasProfessor({})).toEqual([]);
    expect(normalizarDisciplinasProfessor({ disciplina: '  inglês ' })).toEqual(['Inglês']);
    expect(normalizarDisciplinasProfessor({ disciplinas: 'Física, Química' })).toEqual([
      'Física',
      'Química'
    ]);
  });

  test('permissão: professor só vê suas disciplinas no boletim', () => {
    const boletim = {
      disciplinas: [
        { disciplina: 'Matemática', mediaFinal: 7 },
        { disciplina: 'Português', mediaFinal: 8 }
      ]
    };
    const filtrado = filtrarBoletimPorProfessor(boletim, {
      tipo: 'professor',
      disciplinas: ['Matemática']
    });
    expect(filtrado.disciplinas).toHaveLength(1);
    expect(filtrarBoletimPorProfessor(boletim, { tipo: 'diretor' })).toBe(boletim);
  });
});
