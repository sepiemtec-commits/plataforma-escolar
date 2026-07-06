const { inferirNivel, NIVEL_ENSINO } = require('./ensino');
const { nomeBaseDisciplina } = require('../utils/formatarDisciplina');

const DISCIPLINAS_EM_E_NONO = ['Física', 'Química', 'Biologia'];
const DISCIPLINAS_EM_APENAS = ['Sociologia', 'Filosofia'];

const DISCIPLINAS_PADRAO = [
  'Artes', 'Biologia', 'Ciências', 'Educação Física', 'Espanhol',
  'Filosofia', 'Física', 'Geografia', 'História', 'Inglês',
  'Matemática', 'Português', 'Química', 'Sociologia'
];

function disciplinaPermitidaParaTurma(nomeDisciplina, turma) {
  if (!nomeDisciplina?.trim() || !turma) return true;

  const base = nomeBaseDisciplina(nomeDisciplina);
  const nivel = turma.nivel || inferirNivel(turma);
  const ano = Number(turma.ano);

  if (DISCIPLINAS_EM_E_NONO.includes(base)) {
    return nivel === NIVEL_ENSINO.ENSINO_MEDIO
      || (nivel === NIVEL_ENSINO.FUNDAMENTAL_II && ano === 9);
  }

  if (DISCIPLINAS_EM_APENAS.includes(base)) {
    return nivel === NIVEL_ENSINO.ENSINO_MEDIO;
  }

  return true;
}

function filtrarDisciplinasParaTurma(disciplinas, turma) {
  const lista = Array.isArray(disciplinas) ? disciplinas : [];
  return lista.filter(item => {
    const nome = typeof item === 'string' ? item : item?.nome;
    return disciplinaPermitidaParaTurma(nome, turma);
  });
}

function disciplinasPadraoPorTurma(turma) {
  return filtrarDisciplinasParaTurma(DISCIPLINAS_PADRAO, turma);
}

function labelRestricaoDisciplina(nomeDisciplina) {
  const base = nomeBaseDisciplina(nomeDisciplina);
  if (DISCIPLINAS_EM_E_NONO.includes(base)) {
    return 'Ensino Médio e 9º ano';
  }
  if (DISCIPLINAS_EM_APENAS.includes(base)) {
    return 'Ensino Médio';
  }
  return null;
}

module.exports = {
  DISCIPLINAS_EM_E_NONO,
  DISCIPLINAS_EM_APENAS,
  DISCIPLINAS_PADRAO,
  disciplinaPermitidaParaTurma,
  filtrarDisciplinasParaTurma,
  disciplinasPadraoPorTurma,
  labelRestricaoDisciplina
};
