/**
 * Base pedagógica curada (MVP) — referências a pensadores e abordagens por área.
 * Usada pelo motor local e injetada no prompt OpenAI. Não inventa citações bibliográficas
 * completas; oferece ideias e aplicações práticas revisáveis pelo professor.
 */

const GERAIS = [
  {
    autor: 'Lev Vygotsky',
    ideia: 'Zona de Desenvolvimento Proximal (ZDP)',
    aplicacao:
      'Propor tarefas um pouco além do que o aluno faz sozinho, com mediação do professor ou de pares mais experientes.'
  },
  {
    autor: 'Paulo Freire',
    ideia: 'Diálogo e problematização',
    aplicacao:
      'Partir da realidade do aluno, ouvir suas hipóteses e construir o conteúdo em diálogo, evitando depósito unilateral de informação.'
  },
  {
    autor: 'Jean Piaget',
    ideia: 'Construtivismo / equilibração',
    aplicacao:
      'Oferecer situações-problema que gerem desequilíbrio cognitivo e permitam o aluno reconstruir esquemas por ação e reflexão.'
  },
  {
    autor: 'David Ausubel',
    ideia: 'Aprendizagem significativa',
    aplicacao:
      'Ancorar o novo conteúdo em conhecimentos prévios explícitos (organizadores prévios, mapas, perguntas diagnósticas).'
  },
  {
    autor: 'Henri Wallon',
    ideia: 'Integração afetividade–cognição',
    aplicacao:
      'Considerar clima emocional, vínculo e motivação como parte do plano pedagógico, não só o desempenho cognitivo.'
  },
  {
    autor: 'BNCC',
    ideia: 'Competências e habilidades',
    aplicacao:
      'Alinhar a intervenção a habilidades específicas da etapa/disciplina e tornar evidências de aprendizagem observáveis.'
  }
];

/** Chaves normalizadas → área */
const AREA_POR_PALAVRA = [
  { re: /portugu|l[ií]ngua\s*port|literat|reda[cç]|leitura|escrita/i, area: 'linguagens' },
  { re: /matem|álgebra|algebra|geometr|aritm|n[uú]mero|fra[cç]/i, area: 'matematica' },
  { re: /ci[eê]ncia|biolog|f[ií]sica|qu[ií]mica|natureza/i, area: 'ciencias' },
  { re: /hist[oó]ria/i, area: 'historia' },
  { re: /geograf/i, area: 'geografia' },
  { re: /educa[cç][aã]o\s*f[ií]sica|\bef\b|esporte|corpo/i, area: 'ed_fisica' },
  { re: /arte|m[uú]sica|teatro|dan[cç]a|visual/i, area: 'artes' },
  { re: /ingl[eê]s|espanhol|l[ií]ngua\s*estrangeira/i, area: 'linguagens' },
  { re: /filosof|sociolog/i, area: 'humanas' }
];

const POR_AREA = {
  linguagens: [
    {
      autor: 'Emília Ferreiro / Ana Teberosky',
      ideia: 'Psicogênese da língua escrita',
      aplicacao:
        'Diagnosticar hipóteses de escrita/leitura e planejar intervenções no nível em que o aluno se encontra, não só “treinar cópia”.'
    },
    {
      autor: 'Isabel Solé',
      ideia: 'Estratégias de leitura',
      aplicacao:
        'Ensinar previsão, inferência, monitoramento e sumarização de forma explícita em textos adequados à turma.'
    },
    {
      autor: 'Magda Soares',
      ideia: 'Letramento',
      aplicacao:
        'Articular domínio do código com práticas sociais de leitura e escrita significativas para o aluno.'
    }
  ],
  matematica: [
    {
      autor: 'Ubiratan D’Ambrosio',
      ideia: 'Etnomatemática',
      aplicacao:
        'Conectar problemas matemáticos a contextos culturais e cotidianos do aluno para dar sentido aos procedimentos.'
    },
    {
      autor: 'George Pólya',
      ideia: 'Resolução de problemas (heurísticas)',
      aplicacao:
        'Explicitar etapas: compreender o problema, planejar, executar e verificar — em vez de só treinar algoritmo.'
    },
    {
      autor: 'Constance Kamii',
      ideia: 'Construção do número',
      aplicacao:
        'Priorizar compreensão e autonomia de raciocínio numérico antes da memorização mecânica de regras.'
    }
  ],
  ciencias: [
    {
      autor: 'John Dewey',
      ideia: 'Aprender fazendo / investigação',
      aplicacao:
        'Organizar ciclos de pergunta, hipótese, observação/experimento e conclusão com registro do aluno.'
    },
    {
      autor: 'BNCC Ciências da Natureza',
      ideia: 'Investigação científica escolar',
      aplicacao:
        'Trabalhar fenômenos com evidências, modelos e argumentação, ligando conceitos à vida cotidiana.'
    }
  ],
  historia: [
    {
      autor: 'Marc Bloch / historiografia escolar',
      ideia: 'Fonte e evidência histórica',
      aplicacao:
        'Usar documentos, imagens e relatos para o aluno perguntar “como sabemos?” em vez de só memorizar datas.'
    },
    {
      autor: 'Paulo Freire',
      ideia: 'Leitura crítica do mundo',
      aplicacao:
        'Relacionar processos históricos a questões do presente da comunidade do aluno.'
    }
  ],
  geografia: [
    {
      autor: 'Milton Santos',
      ideia: 'Espaço geográfico e cotidiano',
      aplicacao:
        'Partir do espaço vivido (bairro, trajeto, escola) para construir conceitos de território, lugar e rede.'
    },
    {
      autor: 'BNCC Geografia',
      ideia: 'Raciocínio geográfico',
      aplicacao:
        'Treinar localização, comparação, conexão e analogia com mapas e situações reais.'
    }
  ],
  ed_fisica: [
    {
      autor: 'Coletivo de Autores (EF crítica)',
      ideia: 'Cultura corporal',
      aplicacao:
        'Tratar esporte, jogo, luta, ginástica e dança como práticas culturais, não só rendimento físico.'
    },
    {
      autor: 'Wallon',
      ideia: 'Corpo e emoção',
      aplicacao:
        'Incluir cooperação, respeito e autorregulação emocional nas vivências corporais.'
    }
  ],
  artes: [
    {
      autor: 'Ana Mae Barbosa',
      ideia: 'Abordagem triangular',
      aplicacao:
        'Combinar fazer artístico, apreciar/fruir e contextualizar historicamente as produções.'
    }
  ],
  humanas: [
    {
      autor: 'Paulo Freire',
      ideia: 'Educação problematizadora',
      aplicacao:
        'Mediar debates com respeito à argumentação e à escuta, ligando conceitos a dilemas sociais.'
    }
  ]
};

const POR_NIVEL = {
  excelente: [
    {
      autor: 'Vygotsky',
      ideia: 'Mediação entre pares',
      aplicacao:
        'Convidar o aluno a tutorar colegas (ZDP), aprofundando o próprio domínio ao ensinar.'
    }
  ],
  bom: [
    {
      autor: 'Ausubel',
      ideia: 'Organizador prévio',
      aplicacao:
        'Antes de novos tópicos, mapear o que já sabe e o que falta consolidar.'
    }
  ],
  alerta: [
    {
      autor: 'Vygotsky',
      ideia: 'Andaime (scaffolding)',
      aplicacao:
        'Reduzir a complexidade da tarefa em etapas com apoio gradual, retirando o suporte conforme avança.'
    },
    {
      autor: 'Freire',
      ideia: 'Escuta do educando',
      aplicacao:
        'Investigar com o aluno o que dificulta (conteúdo, ritmo, casa, afeto) antes de só “dar mais exercício”.'
    }
  ],
  critico: [
    {
      autor: 'Wallon',
      ideia: 'Acolhimento afetivo',
      aplicacao:
        'Recompor vínculo e segurança emocional como condição para retomar a aprendizagem cognitiva.'
    },
    {
      autor: 'BNCC / equidade',
      ideia: 'Trajetórias de recuperação',
      aplicacao:
        'Plano individualizado com habilidades prioritárias, evidências semanais e articulação com coordenação/família.'
    }
  ],
  sem_dados: [
    {
      autor: 'Avaliação diagnóstica',
      ideia: 'Levantamento inicial',
      aplicacao:
        'Antes de parecer conclusivo, reunir evidências mínimas (tarefas, chamada, observação em sala).'
    }
  ]
};

function normalizarArea(disciplina) {
  const d = String(disciplina || '').trim();
  if (!d) return null;
  for (const { re, area } of AREA_POR_PALAVRA) {
    if (re.test(d)) return area;
  }
  return 'geral';
}

/**
 * Seleciona um pacote pequeno de referências para o parecer.
 * @returns {{ area: string|null, referencias: Array<{autor,ideia,aplicacao}> }}
 */
function selecionarReferencias(disciplina, nivel) {
  const area = normalizarArea(disciplina);
  const refs = [];
  const visto = new Set();

  function push(list, max) {
    for (const item of list || []) {
      if (refs.length >= max) break;
      const key = `${item.autor}|${item.ideia}`;
      if (visto.has(key)) continue;
      visto.add(key);
      refs.push(item);
    }
  }

  push(POR_NIVEL[nivel] || [], 2);
  if (area && area !== 'geral') push(POR_AREA[area] || [], 2);
  push(GERAIS, 2);

  return { area: area || null, referencias: refs.slice(0, 5) };
}

function formatarReferenciasParaTexto(referencias) {
  if (!referencias?.length) return '';
  const linhas = referencias.map(
    (r, i) =>
      `${i + 1}. **${r.autor}** — ${r.ideia}: ${r.aplicacao}`
  );
  return (
    `\n\nFundamentos e autores (sugestão — revise antes de usar com a família):\n` +
    linhas.join('\n')
  );
}

function formatarReferenciasParaPrompt(referencias, area) {
  return {
    area_disciplinar: area,
    referencias_curadas: (referencias || []).map((r) => ({
      autor: r.autor,
      ideia: r.ideia,
      aplicacao_sugerida: r.aplicacao
    })),
    instrucao:
      'Use 1–3 dessas referências de forma natural nas orientações (cite o autor/ideia). Não invente livros ou anos. Se não couber, diga que a sugestão é inspirada na abordagem X.'
  };
}

module.exports = {
  GERAIS,
  POR_AREA,
  selecionarReferencias,
  formatarReferenciasParaTexto,
  formatarReferenciasParaPrompt,
  normalizarArea
};
