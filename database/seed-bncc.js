/**
 * Seed BNCC embarcado — Computação (complementar) + amostra LP/Mat.
 * Uso: node database/seed-bncc.js
 * Idempotente: upsert por codigo.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { BnccItem } = require('../backend/database/schema');

const ITENS = [];

function add(codigo, area, eixo, ano, descricao, fonte) {
  ITENS.push({ codigo, area, eixo, ano, descricao, fonte });
}

// ——— BNCC Computação (amostra pedagógica alinhada aos eixos oficiais) ———
const eixosComp = [
  'Pensamento computacional',
  'Mundo digital',
  'Cultura digital'
];

const anosEF = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const descricoesPC = [
  'Identificar padrões e regularidades em situações cotidianas e digitais.',
  'Decompor problemas simples em partes menores para solucioná-los.',
  'Utilizar algoritmos (sequências de passos) para descrever soluções.',
  'Reconhecer abstrações em jogos, mapas e representações.',
  'Criar e depurar sequências lógicas com blocos ou pseudocódigo.',
  'Comparar soluções algorítmicas quanto à clareza e eficiência.',
  'Modelar problemas com variáveis, condições e repetições.',
  'Aplicar pensamento computacional em projetos interdisciplinares.',
  'Avaliar estratégias de resolução e comunicar o processo.'
];
const descricoesMD = [
  'Reconhecer dispositivos e componentes básicos de hardware e software.',
  'Diferenciar informação, dado e mídia digital.',
  'Utilizar ferramentas digitais com segurança e organização de arquivos.',
  'Compreender redes e conectividade de forma introdutória.',
  'Produzir e editar conteúdos multimídia simples.',
  'Analisar o funcionamento de aplicativos e serviços digitais.',
  'Identificar riscos digitais e práticas de proteção de dados.',
  'Explorar armazenamento local e em nuvem de forma crítica.',
  'Relacionar infraestrutura digital e serviços cotidianos.'
];
const descricoesCD = [
  'Participar de práticas digitais com respeito e ética.',
  'Reconhecer autoria, direitos e responsabilidades em conteúdos online.',
  'Debater usos sociais das tecnologias e inclusão digital.',
  'Produzir comunicação digital colaborativa.',
  'Analisar informações e combater desinformação.',
  'Refletir sobre identidade e presença digital.',
  'Usar tecnologias para cidadania e participação.',
  'Avaliar impacto das tecnologias no cotidiano e no trabalho.',
  'Propor projetos digitais com sentido comunitário.'
];

anosEF.forEach((ano, i) => {
  add(`EF${ano}CO01`, 'computacao', eixosComp[0], ano, descricoesPC[i], 'bncc_computacao');
  add(`EF${ano}CO02`, 'computacao', eixosComp[1], ano, descricoesMD[i], 'bncc_computacao');
  add(`EF${ano}CO03`, 'computacao', eixosComp[2], ano, descricoesCD[i], 'bncc_computacao');
});

// Ensino Médio — amostra Computação
['1', '2', '3'].forEach((ano, i) => {
  add(`EM${ano}CO01`, 'computacao', eixosComp[0], `EM${ano}`, `Aprofundar algoritmos e modelagem computacional (EM${ano}).`, 'bncc_computacao');
  add(`EM${ano}CO02`, 'computacao', eixosComp[1], `EM${ano}`, `Analisar sistemas digitais e dados em escala (EM${ano}).`, 'bncc_computacao');
  add(`EM${ano}CO03`, 'computacao', eixosComp[2], `EM${ano}`, `Projetos de cultura digital e cidadania (EM${ano}).`, 'bncc_computacao');
});

// ——— Amostra LP / Matemática (códigos ilustrativos para vínculo pedagógico) ———
const amostraLP = [
  ['EF15LP01', '1-5', 'Identificar a função social de textos que circulam em campos da vida cotidiana.'],
  ['EF15LP02', '1-5', 'Estabelecer expectativas em relação ao texto a partir de conhecimentos prévios.'],
  ['EF35LP01', '3-5', 'Ler e compreender textos do campo artístico-literário.'],
  ['EF67LP01', '6-7', 'Analisar a função social de textos e a relação com o contexto de produção.'],
  ['EF69LP01', '6-9', 'Diferenciar fatos de opiniões em textos informativos e argumentativos.'],
  ['EF89LP01', '8-9', 'Analisar argumentos e contra-argumentos em textos argumentativos.'],
  ['EF01LP01', '1', 'Reconhecer que textos são lidos e escritos da esquerda para a direita.'],
  ['EF02LP01', '2', 'Ler e escrever palavras com correspondências regulares diretas.'],
  ['EF03LP01', '3', 'Ler e escrever palavras com correspondências regulares que apresentam variação.'],
  ['EF04LP01', '4', 'Grafar palavras utilizando regras de correspondência fonema-grafema regulares.']
];

amostraLP.forEach(([codigo, ano, desc]) => {
  add(codigo, 'lingua_portuguesa', 'Linguagem / Leitura e escrita', ano, desc, 'bncc_amostra');
});

const amostraMAT = [
  ['EF01MA01', '1', 'Contar de maneira exata ou aproximada quantidades de objetos.'],
  ['EF02MA01', '2', 'Comparar e ordenar números naturais até a ordem de centenas.'],
  ['EF03MA01', '3', 'Ler, escrever e comparar números naturais até a ordem de unidade de milhar.'],
  ['EF04MA01', '4', 'Ler, escrever e ordenar números naturais até a ordem de dezenas de milhar.'],
  ['EF05MA01', '5', 'Ler, escrever e ordenar números naturais até a ordem das centenas de milhar.'],
  ['EF06MA01', '6', 'Comparar, ordenar, ler e escrever números naturais e números racionais.'],
  ['EF07MA01', '7', 'Resolver e elaborar problemas com números naturais envolvendo as quatro operações.'],
  ['EF08MA01', '8', 'Efetuar cálculos com potências de expoentes naturais.'],
  ['EF09MA01', '9', 'Reconhecer e utilizar padrões algébricos e funções afins em contextos.'],
  ['EF05MA08', '5', 'Resolver e elaborar problemas de multiplicação e divisão com números naturais.']
];

amostraMAT.forEach(([codigo, ano, desc]) => {
  add(codigo, 'matematica', 'Números / Álgebra', ano, desc, 'bncc_amostra');
});

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar';
  await mongoose.connect(uri);
  console.log('Conectado:', uri);

  let upserts = 0;
  for (const item of ITENS) {
    await BnccItem.findOneAndUpdate(
      { codigo: item.codigo },
      { $set: item },
      { upsert: true, new: true }
    );
    upserts++;
  }

  const total = await BnccItem.countDocuments();
  console.log(`✓ BNCC seed: ${upserts} itens processados. Total na base: ${total}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
