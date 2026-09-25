/**
 * Seed banco de itens SAEB/SARESP (amostra pedagógica).
 * Uso: node database/seed-itens-saeb.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { ItemAvaliacao } = require('../backend/database/schema');

const ITENS = [];

function add(item) {
  ITENS.push({
    ...item,
    codigo: item.codigo.toUpperCase(),
    gabarito: item.gabarito.toUpperCase(),
    ativo: true
  });
}

// Matemática — estilo SAEB
[
  ['SAEB-MAT-5-01', '5', 'facil', 'EF05MA01', 'Qual é o resultado de 25 + 17?', [
    ['A', '32'], ['B', '42'], ['C', '52'], ['D', '41']
  ], 'B'],
  ['SAEB-MAT-5-02', '5', 'medio', 'EF05MA08', 'Uma escola tem 4 classes com 28 alunos cada. Quantos alunos há no total?', [
    ['A', '100'], ['B', '112'], ['C', '120'], ['D', '98']
  ], 'B'],
  ['SAEB-MAT-5-03', '5', 'medio', 'EF05MA01', 'Qual fração representa metade de um inteiro?', [
    ['A', '1/3'], ['B', '2/4'], ['C', '1/5'], ['D', '3/4']
  ], 'B'],
  ['SAEB-MAT-9-01', '9', 'medio', 'EF09MA01', 'Se y = 2x + 1 e x = 3, qual o valor de y?', [
    ['A', '5'], ['B', '6'], ['C', '7'], ['D', '8']
  ], 'C'],
  ['SAEB-MAT-9-02', '9', 'dificil', 'EF09MA01', 'A sequência 2, 5, 8, 11… qual o 6º termo?', [
    ['A', '14'], ['B', '15'], ['C', '17'], ['D', '18']
  ], 'C'],
  ['SAEB-MAT-3-01', '3', 'facil', 'EF03MA01', 'Qual número vem logo após 199?', [
    ['A', '200'], ['B', '190'], ['C', '299'], ['D', '198']
  ], 'A']
].forEach(([codigo, ano, dif, bncc, enunciado, alts, gab]) => {
  add({
    codigo, fonte: 'saeb', area: 'matematica', ano, dificuldade: dif,
    habilidadeBncc: bncc, enunciado,
    alternativas: alts.map(([letra, texto]) => ({ letra, texto })),
    gabarito: gab
  });
});

// Língua Portuguesa — estilo SAEB
[
  ['SAEB-LP-5-01', '5', 'facil', 'EF15LP01', 'Em um texto de receita, a função principal é:', [
    ['A', 'Contar uma história'], ['B', 'Instruir como preparar algo'], ['C', 'Convencer a comprar'], ['D', 'Descrever uma paisagem']
  ], 'B'],
  ['SAEB-LP-5-02', '5', 'medio', 'EF35LP01', 'A palavra que completa: “O menino _____ feliz.” é:', [
    ['A', 'estava'], ['B', 'estar'], ['C', 'estive'], ['D', 'estando']
  ], 'A'],
  ['SAEB-LP-9-01', '9', 'medio', 'EF69LP01', 'Em um artigo de opinião, o autor principalmente:', [
    ['A', 'Narra fatos sem julgamento'], ['B', 'Defende um ponto de vista'], ['C', 'Lista ingredientes'], ['D', 'Define termos técnicos apenas']
  ], 'B'],
  ['SAEB-LP-9-02', '9', 'dificil', 'EF89LP01', 'Um argumento contra a ideia do autor é chamado de:', [
    ['A', 'Metáfora'], ['B', 'Contra-argumento'], ['C', 'Sinônimo'], ['D', 'Onomatopeia']
  ], 'B']
].forEach(([codigo, ano, dif, bncc, enunciado, alts, gab]) => {
  add({
    codigo, fonte: 'saeb', area: 'lingua_portuguesa', ano, dificuldade: dif,
    habilidadeBncc: bncc, enunciado,
    alternativas: alts.map(([letra, texto]) => ({ letra, texto })),
    gabarito: gab
  });
});

// SARESP — amostra
[
  ['SARESP-MAT-5-01', '5', 'medio', 'Em um gráfico de barras, o eixo vertical geralmente mostra:', [
    ['A', 'Categorias'], ['B', 'Valores / quantidades'], ['C', 'Títulos'], ['D', 'Legendas apenas']
  ], 'B'],
  ['SARESP-MAT-7-01', '7', 'medio', '15% de 200 é igual a:', [
    ['A', '20'], ['B', '25'], ['C', '30'], ['D', '35']
  ], 'C'],
  ['SARESP-LP-5-01', '5', 'facil', 'O gênero textual “notícia” circula principalmente em:', [
    ['A', 'Jornais e portais'], ['B', 'Receitas culinárias'], ['C', 'Diários íntimos'], ['D', 'Manuais de eletrodomésticos']
  ], 'A'],
  ['SARESP-LP-7-01', '7', 'medio', 'Coesão textual depende principalmente de:', [
    ['A', 'Conectivos e referenciação'], ['B', 'Tamanho da fonte'], ['C', 'Número de parágrafos só'], ['D', 'Uso exclusivo de adjetivos']
  ], 'A'],
  ['SARESP-MAT-9-01', '9', 'dificil', 'A raiz quadrada de 144 é:', [
    ['A', '10'], ['B', '11'], ['C', '12'], ['D', '14']
  ], 'C'],
  ['SARESP-MAT-3-01', '3', 'facil', 'Quanto é 8 × 7?', [
    ['A', '54'], ['B', '56'], ['C', '63'], ['D', '49']
  ], 'B']
].forEach(([codigo, ano, dif, enunciado, alts, gab]) => {
  const area = codigo.includes('MAT') ? 'matematica' : 'lingua_portuguesa';
  add({
    codigo, fonte: 'saresp', area, ano, dificuldade: dif,
    enunciado,
    alternativas: alts.map(([letra, texto]) => ({ letra, texto })),
    gabarito: gab
  });
});

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar';
  await mongoose.connect(uri);
  let n = 0;
  for (const item of ITENS) {
    await ItemAvaliacao.findOneAndUpdate(
      { codigo: item.codigo, fonte: item.fonte },
      { $set: { ...item, escola_id: null } },
      { upsert: true }
    );
    n++;
  }
  const total = await ItemAvaliacao.countDocuments();
  console.log(`✓ Itens SAEB/SARESP: ${n} processados. Total na base: ${total}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
