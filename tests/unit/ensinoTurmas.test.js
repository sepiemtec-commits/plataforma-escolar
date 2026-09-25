const {
  validarAnoNivel,
  validarTurno,
  inferirNivel,
  sugerirNomeTurma,
  temProfessorTurma,
  normalizarProfessorId,
  NIVEL_ENSINO,
  TURNOS_LISTA
} = require('../../backend/constants/ensino');

describe('turmas / ensino — validação de nível, ano e turno', () => {
  test('comportamento normal: anos válidos por nível', () => {
    expect(validarAnoNivel(NIVEL_ENSINO.FUNDAMENTAL_I, 3)).toBe(true);
    expect(validarAnoNivel(NIVEL_ENSINO.FUNDAMENTAL_II, 8)).toBe(true);
    expect(validarAnoNivel(NIVEL_ENSINO.ENSINO_MEDIO, 2)).toBe(true);
  });

  test('dados inválidos: ano fora do nível', () => {
    expect(validarAnoNivel(NIVEL_ENSINO.FUNDAMENTAL_I, 8)).toBe(false);
    expect(validarAnoNivel(NIVEL_ENSINO.ENSINO_MEDIO, 5)).toBe(false);
    expect(validarAnoNivel('Inexistente', 1)).toBe(false);
  });

  test('dados ausentes: turno inválido', () => {
    expect(validarTurno('Manhã')).toBe(true);
    expect(validarTurno('Madrugada')).toBe(false);
    expect(validarTurno('')).toBe(false);
    expect(TURNOS_LISTA).toContain('Integral');
  });

  test('inferirNivel por ano e por nome', () => {
    expect(inferirNivel({ ano: 7 })).toBe(NIVEL_ENSINO.FUNDAMENTAL_II);
    expect(inferirNivel({ ano: 2, nome: '2º Ano EM A' })).toBe(NIVEL_ENSINO.ENSINO_MEDIO);
    expect(inferirNivel({ nivel: NIVEL_ENSINO.FUNDAMENTAL_I, ano: 99 })).toBe(
      NIVEL_ENSINO.FUNDAMENTAL_I
    );
  });

  test('sugerirNomeTurma e professor só no Fund. I', () => {
    expect(sugerirNomeTurma(NIVEL_ENSINO.FUNDAMENTAL_II, 6, 'B')).toBe('6º Ano B');
    expect(sugerirNomeTurma(NIVEL_ENSINO.ENSINO_MEDIO, 1, 'a')).toBe('1º Ano EM A');
    expect(temProfessorTurma(NIVEL_ENSINO.FUNDAMENTAL_I)).toBe(true);
    expect(temProfessorTurma(NIVEL_ENSINO.ENSINO_MEDIO)).toBe(false);
    expect(normalizarProfessorId(NIVEL_ENSINO.ENSINO_MEDIO, 'prof1')).toBeNull();
    expect(normalizarProfessorId(NIVEL_ENSINO.FUNDAMENTAL_I, 'prof1')).toBe('prof1');
  });
});
