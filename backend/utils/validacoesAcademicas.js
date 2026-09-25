/**
 * Regras acadêmicas puras compartilhadas (notas / frequência).
 * Espelham as validações das rotas avaliacao/presenca — sem I/O.
 */
const STATUS_PRESENCA = ['presente', 'falta', 'justificada', 'atraso'];

const TIPOS_USUARIO_GESTAO = ['admin', 'diretor', 'coordenador', 'secretaria'];
const TIPOS_USUARIO_PEDAGOGICO = ['professor', 'coordenador', 'diretor', 'orientador_pedagogico'];
const TIPOS_USUARIO_FAMILIA = ['aluno', 'responsavel'];

function validarNota(nota) {
  if (nota === null || nota === '' || nota === undefined) {
    return { ok: true, limpar: true, nota: null };
  }
  const notaNum = typeof nota === 'number' ? nota : parseFloat(nota);
  if (Number.isNaN(notaNum) || notaNum < 0 || notaNum > 10) {
    return { ok: false, mensagem: 'Nota deve estar entre 0 e 10' };
  }
  return { ok: true, limpar: false, nota: notaNum };
}

function statusPresencaValido(status) {
  return STATUS_PRESENCA.includes(status);
}

function montarResumoFrequencia(statuses = []) {
  const presentes = statuses.filter((s) => s === 'presente').length;
  const faltas = statuses.filter((s) => s === 'falta').length;
  const justificadas = statuses.filter((s) => s === 'justificada').length;
  const atrasos = statuses.filter((s) => s === 'atraso').length;
  const lancados = presentes + faltas + justificadas + atrasos;

  return {
    presentes,
    faltas,
    justificadas,
    atrasos,
    lancados,
    taxaPresenca: lancados > 0 ? Number(((presentes / lancados) * 100).toFixed(1)) : null,
    taxaFalta: lancados > 0 ? Number(((faltas / lancados) * 100).toFixed(1)) : null
  };
}

function papelPodeGerenciarMatricula(tipo) {
  return TIPOS_USUARIO_GESTAO.includes(tipo);
}

function papelPodeLancarNota(tipo) {
  return tipo === 'professor' || TIPOS_USUARIO_GESTAO.includes(tipo) || tipo === 'coordenador';
}

function papelFamilia(tipo) {
  return TIPOS_USUARIO_FAMILIA.includes(tipo);
}

module.exports = {
  STATUS_PRESENCA,
  TIPOS_USUARIO_GESTAO,
  TIPOS_USUARIO_PEDAGOGICO,
  TIPOS_USUARIO_FAMILIA,
  validarNota,
  statusPresencaValido,
  montarResumoFrequencia,
  papelPodeGerenciarMatricula,
  papelPodeLancarNota,
  papelFamilia
};
