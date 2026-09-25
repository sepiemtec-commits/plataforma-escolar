/**
 * Converte valores de query/body em escalares seguros para filtros MongoDB.
 * Rejeita objetos (ex.: { $ne: null }) que caracterizam NoSQL operator injection.
 */
function asScalarString(valor) {
  if (valor == null || valor === '') return undefined;
  if (typeof valor === 'object') return undefined;
  return String(valor);
}

function asScalar(valor) {
  if (valor == null || valor === '') return undefined;
  if (typeof valor === 'object') return undefined;
  return valor;
}

module.exports = { asScalarString, asScalar };
