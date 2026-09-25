const MAPA_NOMES = {
  artes: 'Artes',
  biologia: 'Biologia',
  ciencias: 'Ciências',
  ciências: 'Ciências',
  'educacao fisica': 'Educação Física',
  'educação física': 'Educação Física',
  espanhol: 'Espanhol',
  filosofia: 'Filosofia',
  fisica: 'Física',
  física: 'Física',
  geografia: 'Geografia',
  historia: 'História',
  história: 'História',
  ingles: 'Inglês',
  inglês: 'Inglês',
  literatura: 'Literatura',
  matematica: 'Matemática',
  matemática: 'Matemática',
  portugues: 'Português',
  português: 'Português',
  quimica: 'Química',
  química: 'Química',
  redacao: 'Redação',
  redação: 'Redação',
  robotica: 'Robótica',
  robótica: 'Robótica',
  sociologia: 'Sociologia'
};

const SUFIXO_ROMANO = {
  1: 'I',
  i: 'I',
  l: 'I',
  2: 'II',
  ii: 'II',
  ll: 'II',
  3: 'III',
  iii: 'III',
  4: 'IV',
  iv: 'IV'
};

function removerAcentos(texto) {
  return String(texto).normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizarSufixo(token) {
  if (!token) return null;
  const chave = String(token).trim().toLowerCase();
  return SUFIXO_ROMANO[chave] || String(token).toUpperCase();
}

function canonicalizarBase(base) {
  const bruto = String(base || '').trim().replace(/\s+/g, ' ');
  if (!bruto) return '';

  const chaveAcento = bruto.toLowerCase();
  if (MAPA_NOMES[chaveAcento]) return MAPA_NOMES[chaveAcento];

  const chaveSemAcento = removerAcentos(bruto).toLowerCase();
  if (MAPA_NOMES[chaveSemAcento]) return MAPA_NOMES[chaveSemAcento];

  return bruto
    .split(/\s+/)
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
    .join(' ');
}

function formatarNomeDisciplina(nome) {
  if (!nome?.trim()) return '';

  let texto = String(nome).trim().replace(/\s+/g, ' ');

  // Nome conhecido completo (evita "Espanhol" → "Espanho I" por causa do "l" final)
  const chaveDireta = texto.toLowerCase();
  if (MAPA_NOMES[chaveDireta]) return MAPA_NOMES[chaveDireta];
  const chaveSemAcento = removerAcentos(texto).toLowerCase();
  if (MAPA_NOMES[chaveSemAcento]) return MAPA_NOMES[chaveSemAcento];

  // Correção de corrupção antiga do formatador
  if (/^espanho\s*i$/i.test(texto) || /^espanhol$/i.test(removerAcentos(texto))) {
    return 'Espanhol';
  }

  if (/^biologial$/i.test(texto)) return 'Biologia I';

  let sufixo = null;
  let base = texto;

  // Sufixo romano só com espaço: "Física l", "Química ll", "Biologia I"
  const comEspaco = texto.match(/^(.+?)\s+([1-4]|I{1,3}|IV|i{1,3}|iv|l{1,3}|L{1,3})$/i);
  if (comEspaco) {
    base = comEspaco[1];
    sufixo = normalizarSufixo(comEspaco[2]);
  } else {
    // Colado: apenas dígitos/romanos explícitos — NÃO usar "l" solto (quebra Espanhol, etc.)
    const colado = texto.match(/^(.+?)([1-4]|II|III|IV|ii|iii|iv|I)$/i);
    if (colado && colado[1].length >= 4) {
      base = colado[1];
      sufixo = normalizarSufixo(colado[2]);
    }
  }

  base = canonicalizarBase(base);
  if (!base) return '';

  return sufixo ? `${base} ${sufixo}` : base;
}

function nomeBaseDisciplina(nome) {
  return formatarNomeDisciplina(nome).replace(/\s+(I|II|III|IV)$/, '');
}

function formatarListaDisciplinas(lista) {
  return [...new Set((lista || []).map(formatarNomeDisciplina).filter(Boolean))];
}

module.exports = {
  formatarNomeDisciplina,
  nomeBaseDisciplina,
  formatarListaDisciplinas
};
