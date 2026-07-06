const { formatarNomeDisciplina, formatarListaDisciplinas } = require('./formatarDisciplina');

function disciplinasDoProfessor(usuario) {
  if (!usuario) return [];
  if (Array.isArray(usuario.disciplinas) && usuario.disciplinas.length) {
    return formatarListaDisciplinas(usuario.disciplinas);
  }
  if (usuario.disciplina) return [formatarNomeDisciplina(usuario.disciplina)];
  return [];
}

function professorTemDisciplina(usuario, nomeDisciplina) {
  if (!nomeDisciplina) return false;
  const alvo = formatarNomeDisciplina(nomeDisciplina);
  return disciplinasDoProfessor(usuario).includes(alvo);
}

function normalizarDisciplinasProfessor(body = {}) {
  const { disciplina, disciplinas } = body;
  let lista = [];

  if (Array.isArray(disciplinas)) {
    lista = disciplinas.map(d => String(d).trim()).filter(Boolean);
  } else if (typeof disciplinas === 'string' && disciplinas.trim()) {
    lista = disciplinas.split(',').map(d => d.trim()).filter(Boolean);
  } else if (disciplina?.trim()) {
    lista = [disciplina.trim()];
  }

  return formatarListaDisciplinas(lista);
}

function filtrarBoletimPorProfessor(boletim, usuario) {
  if (!boletim || usuario?.tipo !== 'professor') return boletim;
  const minhas = disciplinasDoProfessor(usuario);
  return {
    ...boletim,
    disciplinas: (boletim.disciplinas || []).filter(d => minhas.includes(d.disciplina))
  };
}

function filtrarFichaPorProfessor(ficha, usuario) {
  if (!ficha || usuario?.tipo !== 'professor') return ficha;
  const minhas = disciplinasDoProfessor(usuario);
  return {
    ...ficha,
    componentes: (ficha.componentes || []).filter(c => minhas.includes(c.disciplina))
  };
}

module.exports = {
  disciplinasDoProfessor,
  professorTemDisciplina,
  normalizarDisciplinasProfessor,
  filtrarBoletimPorProfessor,
  filtrarFichaPorProfessor
};
