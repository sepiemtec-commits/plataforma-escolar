const NIVEL_ENSINO = {
  FUNDAMENTAL_I: 'Fundamental I',
  FUNDAMENTAL_II: 'Fundamental II',
  ENSINO_MEDIO: 'Ensino Médio'
};

const NIVEIS_LISTA = Object.values(NIVEL_ENSINO);

const ANOS_POR_NIVEL = {
  [NIVEL_ENSINO.FUNDAMENTAL_I]: [1, 2, 3, 4, 5],
  [NIVEL_ENSINO.FUNDAMENTAL_II]: [6, 7, 8, 9],
  [NIVEL_ENSINO.ENSINO_MEDIO]: [1, 2, 3]
};

const TURNOS_LISTA = ['Manhã', 'Tarde', 'Noite', 'Integral'];

function validarTurno(turno) {
  return TURNOS_LISTA.includes(turno);
}

function temProfessorTurma(nivel) {
  return nivel === NIVEL_ENSINO.FUNDAMENTAL_I;
}

function validarAnoNivel(nivel, ano) {
  const anos = ANOS_POR_NIVEL[nivel];
  return Boolean(anos && anos.includes(Number(ano)));
}

function inferirNivel(turma) {
  if (turma?.nivel && NIVEIS_LISTA.includes(turma.nivel)) {
    return turma.nivel;
  }

  const ano = Number(turma?.ano);
  const nome = (turma?.nome || '').toUpperCase();

  if (nome.includes('EM') || nome.includes('MÉDIO') || nome.includes('MEDIO')) {
    return NIVEL_ENSINO.ENSINO_MEDIO;
  }
  if (ano >= 6 && ano <= 9) return NIVEL_ENSINO.FUNDAMENTAL_II;
  if (ano >= 10 && ano <= 12) return NIVEL_ENSINO.ENSINO_MEDIO;
  if (ano >= 1 && ano <= 5) return NIVEL_ENSINO.FUNDAMENTAL_I;

  return NIVEL_ENSINO.FUNDAMENTAL_I;
}

function normalizarProfessorId(nivel, professorId) {
  return temProfessorTurma(nivel) ? (professorId || null) : null;
}

function labelAno(nivel, ano) {
  if (nivel === NIVEL_ENSINO.ENSINO_MEDIO) return `${ano}º Ano EM`;
  return `${ano}º Ano`;
}

function sugerirNomeTurma(nivel, ano, serie) {
  const letra = (serie || 'A').trim().toUpperCase();
  if (nivel === NIVEL_ENSINO.ENSINO_MEDIO) {
    return `${ano}º Ano EM ${letra}`;
  }
  return `${ano}º Ano ${letra}`;
}

function proximaSerie(nivel, ano) {
  const a = Number(ano);
  if (nivel === NIVEL_ENSINO.FUNDAMENTAL_I && a < 5) {
    return { nivel: NIVEL_ENSINO.FUNDAMENTAL_I, ano: a + 1 };
  }
  if (nivel === NIVEL_ENSINO.FUNDAMENTAL_I && a === 5) {
    return { nivel: NIVEL_ENSINO.FUNDAMENTAL_II, ano: 6 };
  }
  if (nivel === NIVEL_ENSINO.FUNDAMENTAL_II && a < 9) {
    return { nivel: NIVEL_ENSINO.FUNDAMENTAL_II, ano: a + 1 };
  }
  if (nivel === NIVEL_ENSINO.FUNDAMENTAL_II && a === 9) {
    return { nivel: NIVEL_ENSINO.ENSINO_MEDIO, ano: 1 };
  }
  if (nivel === NIVEL_ENSINO.ENSINO_MEDIO && a < 3) {
    return { nivel: NIVEL_ENSINO.ENSINO_MEDIO, ano: a + 1 };
  }
  return null;
}

function textoSerie(nivel, ano) {
  return labelAno(nivel, ano);
}

module.exports = {
  NIVEL_ENSINO,
  NIVEIS_LISTA,
  ANOS_POR_NIVEL,
  TURNOS_LISTA,
  temProfessorTurma,
  validarAnoNivel,
  validarTurno,
  inferirNivel,
  normalizarProfessorId,
  labelAno,
  sugerirNomeTurma,
  proximaSerie,
  textoSerie
};
