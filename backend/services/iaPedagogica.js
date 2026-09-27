// backend/services/iaPedagogica.js — Parecer e orientações para o professor
const { Avaliacao, Presenca, Desempenho, Usuario, Turma } = require('../database/schema');
const {
  selecionarReferencias,
  formatarReferenciasParaTexto,
  formatarReferenciasParaPrompt
} = require('../constants/pedagogiaReferencias');

function mediaDeNotas(avaliacoes) {
  if (!avaliacoes.length) return null;
  const somaPeso = avaliacoes.reduce((s, a) => s + (a.peso || 1), 0);
  if (!somaPeso) return null;
  const soma = avaliacoes.reduce((s, a) => s + Number(a.nota) * (a.peso || 1), 0);
  return Math.round((soma / somaPeso) * 10) / 10;
}

function classificarSituacao(media, freqPercentual) {
  const m = media == null ? null : Number(media);
  const f = freqPercentual == null ? null : Number(freqPercentual);

  if (m != null && m < 5) return 'critico';
  if (f != null && f < 75) return 'critico';
  if (m != null && m < 6.5) return 'alerta';
  if (f != null && f < 85) return 'alerta';
  if (m != null && m >= 8 && (f == null || f >= 90)) return 'excelente';
  if (m != null || f != null) return 'bom';
  return 'sem_dados';
}

/**
 * Monta snapshot pedagógico do aluno a partir dos dados já existentes.
 */
async function montarSnapshot({ alunoId, turmaId, disciplina, escolaId }) {
  const aluno = await Usuario.findOne({ _id: alunoId, escola_id: escolaId, tipo: 'aluno' })
    .select('nome email matriculaNumero')
    .lean();
  if (!aluno) {
    const err = new Error('Aluno não encontrado');
    err.status = 404;
    throw err;
  }

  const turma = await Turma.findOne({ _id: turmaId, escola_id: escolaId })
    .select('nome ano serie turno')
    .lean();
  if (!turma) {
    const err = new Error('Turma não encontrada');
    err.status = 404;
    throw err;
  }

  const filtroAv = { aluno_id: alunoId, turma_id: turmaId };
  const filtroPres = { aluno_id: alunoId, turma_id: turmaId };
  const filtroDes = { aluno_id: alunoId, turma_id: turmaId };
  if (disciplina) {
    filtroAv.disciplina = disciplina;
    filtroPres.disciplina = disciplina;
    filtroDes.disciplina = disciplina;
  }

  const [avaliacoes, presencas, desempenhos] = await Promise.all([
    Avaliacao.find(filtroAv).select('nota peso tipo periodo disciplina').lean(),
    Presenca.find(filtroPres).select('status').lean(),
    Desempenho.find(filtroDes).select('mediaGeral frequenciaPercentual totalFaltas totalAulas situacao periodo disciplina').lean()
  ]);

  const media = mediaDeNotas(avaliacoes);
  const totalAulas = presencas.length;
  const totalFaltas = presencas.filter((p) => p.status === 'falta').length;
  const totalPresentes = presencas.filter((p) => p.status === 'presente' || p.status === 'atraso').length;
  let frequenciaPercentual = null;
  if (totalAulas > 0) {
    frequenciaPercentual = Math.round((totalPresentes / totalAulas) * 1000) / 10;
  }

  // Preferir desempenho já calculado quando existir
  let mediaFinal = media;
  let freqFinal = frequenciaPercentual;
  let totalFaltasFinal = totalFaltas;
  if (desempenhos.length) {
    const medias = desempenhos.map((d) => d.mediaGeral).filter((n) => n != null);
    if (medias.length) {
      mediaFinal = Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 10) / 10;
    }
    const freqs = desempenhos.map((d) => d.frequenciaPercentual).filter((n) => n != null);
    if (freqs.length) {
      freqFinal = Math.round((freqs.reduce((a, b) => a + b, 0) / freqs.length) * 10) / 10;
    }
    totalFaltasFinal = desempenhos.reduce((s, d) => s + (d.totalFaltas || 0), 0) || totalFaltas;
  }

  const nivel = classificarSituacao(mediaFinal, freqFinal);

  return {
    aluno,
    turma,
    disciplina: disciplina || '',
    media: mediaFinal,
    frequenciaPercentual: freqFinal,
    totalFaltas: totalFaltasFinal,
    totalAulas,
    totalAvaliacoes: avaliacoes.length,
    nivel,
    desempenhos
  };
}

function gerarTextoLocal(snapshot) {
  const nome = snapshot.aluno.nome;
  const turma = snapshot.turma.nome || 'turma';
  const disc = snapshot.disciplina ? ` em ${snapshot.disciplina}` : '';
  const mediaTxt = snapshot.media != null ? snapshot.media.toFixed(1).replace('.', ',') : 'sem notas lançadas';
  const freqTxt = snapshot.frequenciaPercentual != null
    ? `${String(snapshot.frequenciaPercentual).replace('.', ',')}%`
    : 'sem registros de presença suficientes';
  const faltasTxt = snapshot.totalFaltas != null ? String(snapshot.totalFaltas) : '0';

  let textoParecer = '';
  let textoOrientacoes = '';

  switch (snapshot.nivel) {
    case 'excelente':
      textoParecer =
        `${nome}, da turma ${turma}${disc}, apresenta desempenho consistente e acima da média da expectativa pedagógica. ` +
        `A média registrada é ${mediaTxt} e a frequência está em ${freqTxt} (faltas: ${faltasTxt}). ` +
        `O acompanhamento indica engajamento e assimilação satisfatória dos conteúdos trabalhados no período.`;
      textoOrientacoes =
        `Sugestões pedagógicas:\n` +
        `1. Propor desafios de aprofundamento e atividades de extensão para manter o ritmo de aprendizagem.\n` +
        `2. Incentivar o aluno a apoiar colegas em trabalhos colaborativos (tutoria entre pares).\n` +
        `3. Registrar evidências de excelência no portfólio/diário para devolutiva positiva à família.\n` +
        `4. Manter monitoramento contínuo para evitar acomodação após períodos de alto rendimento.`;
      break;

    case 'bom':
      textoParecer =
        `${nome}, da turma ${turma}${disc}, encontra-se em situação pedagógica adequada. ` +
        `A média registrada é ${mediaTxt} e a frequência está em ${freqTxt} (faltas: ${faltasTxt}). ` +
        `Há indícios de acompanhamento regular das atividades, com espaço para consolidação e avanço pontual.`;
      textoOrientacoes =
        `Sugestões pedagógicas:\n` +
        `1. Reforçar pontos específicos com exercícios direcionados nas habilidades ainda instáveis.\n` +
        `2. Combinar com o aluno metas de curto prazo (ex.: próxima avaliação / entrega de atividade).\n` +
        `3. Manter comunicação breve e objetiva com a família sobre progresso e rotina de estudo.\n` +
        `4. Revisar estratégias de sala quando a média oscilar próximo ao limite de aprovação.`;
      break;

    case 'alerta':
      textoParecer =
        `${nome}, da turma ${turma}${disc}, apresenta sinais de alertas pedagógicos que merecem atenção imediata. ` +
        `A média registrada é ${mediaTxt} e a frequência está em ${freqTxt} (faltas: ${faltasTxt}). ` +
        `O quadro sugere dificuldades pontuais de aprendizagem e/ou irregularidade na participação, com risco de aprofundamento se não houver intervenção.`;
      textoOrientacoes =
        `Sugestões pedagógicas:\n` +
        `1. Diagnosticar habilidades com maior defasagem e planejar recuperação paralela curta.\n` +
        `2. Conversar com o aluno sobre rotina de estudo e barreiras (conteúdo, organização, motivação).\n` +
        `3. Acionar a família com devolutiva clara e combinados de acompanhamento em casa.\n` +
        `4. Registrar intervenções no diário e reavaliar em 2–3 semanas com nova evidência de aprendizado.\n` +
        `5. Considerar apoio da coordenação se não houver melhora após as primeiras ações.`;
      break;

    case 'critico':
      textoParecer =
        `${nome}, da turma ${turma}${disc}, encontra-se em situação pedagógica crítica. ` +
        `A média registrada é ${mediaTxt} e a frequência está em ${freqTxt} (faltas: ${faltasTxt}). ` +
        `Os indicadores apontam risco concreto de retenção ou perda de continuidade da aprendizagem, exigindo plano de intervenção estruturado.`;
      textoOrientacoes =
        `Sugestões pedagógicas:\n` +
        `1. Elaborar plano individualizado com metas semanais e critérios objetivos de acompanhamento.\n` +
        `2. Priorizar recuperação das habilidades essenciais da disciplina e reduzir sobrecarga de conteúdos avançados.\n` +
        `3. Acionar coordenação pedagógica e, se pertinente, equipe de apoio/orientação.\n` +
        `4. Comunicar a família com urgência, documentando combinados e responsabilidades.\n` +
        `5. Monitorar frequência diariamente e investigar causas de faltas reiteradas.\n` +
        `6. Reavaliar o plano a cada bimestre com evidências (notas, participação, tarefas).`;
      break;

    default:
      textoParecer =
        `${nome}, da turma ${turma}${disc}, ainda não possui volume suficiente de notas e/ou presenças para um parecer quantitativo robusto. ` +
        `Recomenda-se consolidar o lançamento de avaliações e o registro de frequência para qualificar a análise.`;
      textoOrientacoes =
        `Sugestões pedagógicas:\n` +
        `1. Garantir lançamento das avaliações previstas no período.\n` +
        `2. Completar a chamada por disciplina/tempo para obter frequência confiável.\n` +
        `3. Observar participação em sala e registrar evidências qualitativas no diário.\n` +
        `4. Gerar novo parecer assim que houver dados mínimos de desempenho.`;
  }

  const { referencias } = selecionarReferencias(snapshot.disciplina, snapshot.nivel);
  const blocoRefs = formatarReferenciasParaTexto(referencias);

  return {
    textoParecer,
    textoOrientacoes: textoOrientacoes + blocoRefs,
    fonte: 'local',
    situacao: snapshot.nivel,
    referencias
  };
}

async function gerarComOpenAI(snapshot) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;

  const { area, referencias } = selecionarReferencias(snapshot.disciplina, snapshot.nivel);
  const blocoPedagogico = formatarReferenciasParaPrompt(referencias, area);

  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const prompt = {
    role: 'user',
    content:
      `Você é um assistente pedagógico para professores do ensino fundamental/médio no Brasil.\n` +
      `Com base nos dados e nas referências curadas, produza JSON com as chaves "textoParecer" e "textoOrientacoes".\n` +
      `textoParecer: 1–2 parágrafos descritivos, linguagem profissional, sem inventar fatos além dos dados do aluno.\n` +
      `textoOrientacoes: lista numerada de sugestões práticas; incorpore 1–3 autores/ideias das referências curadas ` +
      `(ex.: Vygotsky/ZDP, Freire, BNCC), sem inventar obras ou anos. Termine com um item de verificação/acompanhamento.\n` +
      `Dados do aluno:\n${JSON.stringify(
        {
          aluno: snapshot.aluno.nome,
          turma: snapshot.turma.nome,
          disciplina: snapshot.disciplina || null,
          media: snapshot.media,
          frequenciaPercentual: snapshot.frequenciaPercentual,
          totalFaltas: snapshot.totalFaltas,
          nivel: snapshot.nivel
        },
        null,
        2
      )}\n` +
      `Referências pedagógicas curadas:\n${JSON.stringify(blocoPedagogico, null, 2)}`
  };

  const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Responda apenas JSON válido com textoParecer e textoOrientacoes em português do Brasil. ' +
            'Fundamente orientações em pedagogia reconhecida (referências fornecidas). Não invente dados do aluno.'
        },
        prompt
      ]
    })
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    console.warn('OpenAI IA pedagógica falhou:', resposta.status, corpo.slice(0, 200));
    return null;
  }

  const data = await resposta.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed.textoParecer || !parsed.textoOrientacoes) return null;

  return {
    textoParecer: String(parsed.textoParecer).trim(),
    textoOrientacoes: String(parsed.textoOrientacoes).trim(),
    fonte: 'openai',
    situacao: snapshot.nivel,
    referencias
  };
}

/**
 * Gera parecer + orientações (OpenAI se houver chave; senão motor local).
 */
async function gerarParecerPedagogico(opts) {
  const snapshot = await montarSnapshot(opts);
  let gerado = await gerarComOpenAI(snapshot);
  if (!gerado) {
    gerado = gerarTextoLocal(snapshot);
  }

  return {
    snapshot: {
      aluno: snapshot.aluno,
      turma: snapshot.turma,
      disciplina: snapshot.disciplina,
      media: snapshot.media,
      frequenciaPercentual: snapshot.frequenciaPercentual,
      totalFaltas: snapshot.totalFaltas,
      totalAulas: snapshot.totalAulas,
      totalAvaliacoes: snapshot.totalAvaliacoes,
      nivel: snapshot.nivel
    },
    textoParecer: gerado.textoParecer,
    textoOrientacoes: gerado.textoOrientacoes,
    fonte: gerado.fonte,
    situacao: gerado.situacao,
    referencias: gerado.referencias || []
  };
}

function normalizarHistoricoChat(historico) {
  if (!Array.isArray(historico)) return [];
  return historico
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content).trim().slice(0, 4000)
    }));
}

/** Extrai disciplina/tema da mensagem do professor (não só do select). */
function disciplinaDaMensagem(msg) {
  const m = String(msg || '').toLowerCase();
  if (/computa|desplugad|algoritm|programa[cç]|pensamento\s*computacional|coding|scratch/.test(m)) {
    return 'Computação';
  }
  if (/matem|fra[cç]|geometr|álgebra|algebra|n[uú]mero/.test(m)) return 'Matemática';
  if (/portugu|leitura|escrita|reda[cç]|literat/.test(m)) return 'Português';
  if (/ci[eê]ncia|biolog|f[ií]sica|qu[ií]mica/.test(m)) return 'Ciências';
  if (/hist[oó]ria/.test(m)) return 'História';
  if (/geograf/.test(m)) return 'Geografia';
  if (/educa[cç][aã]o\s*f[ií]sica|\bef\b/.test(m)) return 'Educação Física';
  if (/arte|m[uú]sica|teatro/.test(m)) return 'Artes';
  return '';
}

function quantidadeIdeiasPedidas(msg) {
  const m = String(msg || '').toLowerCase();
  const n = m.match(/\b([2-5]|duas|dois|tr[eê]s|quatro|cinco)\b/);
  if (!n) return 2;
  const mapa = { duas: 2, dois: 2, três: 3, tres: 3, quatro: 4, cinco: 5 };
  if (mapa[n[1]]) return mapa[n[1]];
  const num = parseInt(n[1], 10);
  return Number.isFinite(num) ? Math.min(5, Math.max(2, num)) : 2;
}

function ideiasComputacaoDesplugada(qtd) {
  const banco = [
    {
      titulo: 'Robô humano (algoritmo no chão)',
      texto:
        'Um aluno é o “robô” e outro dá comandos (frente, virar à esquerda/direita) para atravessar um percurso marcado com fita no chão ou em uma grade no papel. ' +
        'Depois, o grupo escreve o algoritmo em setas e testa se outro colega consegue reproduzir. Trabalha sequência, depuração e precisão da linguagem.'
    },
    {
      titulo: 'Cartões de condição (se / senão)',
      texto:
        'Com cartões coloridos (ex.: vermelho = bata palmas, azul = pule, amarelo = fique parado), os alunos seguem regras do tipo “SE a carta for vermelha ENTÃO… SENÃO…”. ' +
        'Aumente a complexidade com E/OU. Sem computador, a turma vivencia estruturas condicionais e lógica booleana.'
    },
    {
      titulo: 'Ordenação com cartas ou alunos',
      texto:
        'Distribua números (cartas ou placas) e peça para ordenar do menor ao maior usando só trocas entre vizinhos (bubble sort “vivo”). ' +
        'Conte quantas trocas foram necessárias e discuta por que algoritmos diferentes têm custos diferentes.'
    },
    {
      titulo: 'Pixel art em papel quadriculado',
      texto:
        'Cada quadradinho é um pixel (preto/branco ou cores). Os alunos “programam” um desenho com coordenadas ou com uma sequência de pintar/avançar. ' +
        'Introduz representação binária/ discreta de imagens e atenção a padrões.'
    },
    {
      titulo: 'Criptografia com cifra de César',
      texto:
        'Codifiquem mensagens deslocando letras do alfabeto (ex.: +3). Um grupo cifra, outro decifra. ' +
        'Liga algoritmo, padrão e segurança da informação de forma lúdica e totalmente desplugada.'
    }
  ];
  const n = Math.min(qtd, banco.length);
  return banco.slice(0, n).map((item, i) => `${i + 1}) ${item.titulo}\n${item.texto}`).join('\n\n');
}

function ideiasPorDisciplina(msgOuDisciplina, qtd) {
  const m = String(msgOuDisciplina || '').toLowerCase();
  let ideias;

  if (/computa|desplugad|algoritm|programa[cç]|scratch|coding/.test(m)) {
    return ideiasComputacaoDesplugada(qtd);
  }
  if (/matem|fra[cç]|geometr|álgebra|algebra|n[uú]mero/.test(m)) {
    ideias = [
      'Estação de problemas em grupos: cada trio resolve um problema diferente e ensina o método aos outros (ensino entre pares / ZDP).',
      'Manipulativos concretos (tampinhas, material dourado, geoplano) antes do registro simbólico — do concreto ao abstrato.',
      '“Erro produtivo”: coletar 2 respostas incorretas anônimas e discutir o raciocínio, sem expor o aluno.',
      'Problema do cotidiano (compra, receita, medida da sala) para ancorar o conceito (Ausubel / aprendizagem significativa).'
    ];
  } else if (/portugu|leitura|escrita|reda[cç]|literat/.test(m)) {
    ideias = [
      'Leitura compartilhada com pausas para previsão e inferência (estratégias de Solé).',
      'Produção em duplas: um dita, outro escreve; depois trocam e revisam juntos.',
      'Cantinho de gêneros textuais da vida real (bilhete, receita, notícia) alinhado ao letramento (Magda Soares).',
      'Reescrita coletiva no quadro: a turma melhora um texto anônimo (clareza, pontuação, coesão).'
    ];
  } else if (/hist[oó]ria/.test(m)) {
    ideias = [
      'Tribunal da história: a turma analisa uma fonte (imagem, carta, notícia de época) e argumenta “como sabemos?” antes de concluir.',
      'Linha do tempo viva: alunos encenam ou seguram cartazes de eventos e reordenam a sequência, discutindo causa e consequência.',
      'Passado–presente: relacione o tema a um problema atual do bairro/escola (Freire — leitura crítica do mundo).'
    ];
  } else if (/geograf/.test(m)) {
    ideias = [
      'Mapa do trajeto casa–escola: localizar pontos, distâncias e paisagens do cotidiano (Milton Santos — espaço vivido).',
      'Comparação de mapas (bairro x cidade x país): o que muda na escala? Treino de raciocínio geográfico BNCC.',
      'Saída de campo curta no pátio/entorno: observar relevo, vegetação, fluxos e registrar em croqui.'
    ];
  } else if (/ci[eê]ncia|biolog|f[ií]sica|qu[ií]mica|natureza/.test(m)) {
    ideias = [
      'Ciclo pergunta → hipótese → teste simples → conclusão com registro (Dewey / investigação escolar).',
      'Estação de evidências: objetos ou fotos para classificar, medir ou comparar antes de nomear o conceito.',
      'Modelo com material reciclável (sistema, célula, ciclo da água) + explicação oral em duplas.'
    ];
  } else if (/educa[cç][aã]o\s*f[ií]sica|\bef\b|esporte|corpo/.test(m)) {
    ideias = [
      'Circuito de estações motoras com meta clara (cooperação, ritmo, equilíbrio) e rotação a cada 5–7 min.',
      'Jogo modificado: a turma ajuda a criar 1 regra nova e discute inclusão e fair play depois.',
      'Autopercepção: ao final, cada aluno marca no cartão “consegui / quase / preciso de ajuda” sem ranqueamento público.'
    ];
  } else if (/arte|m[uú]sica|teatro|dan[cç]a/.test(m)) {
    ideias = [
      'Observação → experimentação → socialização: ver uma obra/música, experimentar técnica simples e apresentar em 1 min.',
      'Releitura criativa: reinterpretar um tema com materiais acessíveis (jornal, giz, corpo, voz).',
      'Diário estético: registrar em desenho ou frase curta “o que senti / o que descobri” (processo > produto).'
    ];
  } else if (/ingl[eê]s|espanhol|estrangeira/.test(m)) {
    ideias = [
      'Info gap em pares: cada um tem metade da informação e precisa falar para completar a tarefa.',
      'Role-play curto de situação real (cantina, apresentação, pedido de ajuda) com 6–8 falas modelo.',
      'Vocabulário em contexto: cartões de imagem + frase completa, nunca lista solta de palavras.'
    ];
  } else if (/filosof|sociolog|humanas/.test(m)) {
    ideias = [
      'Dilema ético em círculo: 1 caso curto, regras de escuta e 2 rodadas de argumento + contra-argumento.',
      'Conceito em 3 atos: definição espontânea → leitura/mini-texto → redefinição coletiva no quadro.',
      'Conexão com a vida escolar: “onde isso aparece na nossa turma?” (Freire — problematização).'
    ];
  } else {
    ideias = [
      'Rotação por estações (3 postos de 10–12 min): exploração, prática guiada e desafio — todos passam pelos três.',
      'Pergunta-problematizadora no início (Freire): parta de uma situação real da turma e só depois formalize o conteúdo.',
      'Saída com evidência rápida: ticket de saída (1 frase ou desenho) mostrando o que aprendeu hoje.'
    ];
  }

  return ideias.slice(0, qtd).map((t, i) => `${i + 1}) ${t}`).join('\n\n');
}

function responderChatLocal(mensagem, snapshot) {
  const msg = String(mensagem || '').trim();
  const msgL = msg.toLowerCase();
  const disciplinaCtx = snapshot?.disciplina || disciplinaDaMensagem(msg) || '';
  const nivelRefs = snapshot?.aluno ? (snapshot.nivel || 'sem_dados') : 'bom';
  const { referencias } = selecionarReferencias(disciplinaCtx, nivelRefs);

  const refsRelevantes = referencias
    .filter((r) => {
      if (!snapshot?.aluno && /Avaliação diagnóstica|Levantamento inicial/i.test(`${r.autor} ${r.ideia}`)) {
        return false;
      }
      return true;
    })
    .slice(0, 2);

  const pedindoIdeias = /ideia|atividade|estrat[eé]gia|proposta|como\s+(trabalhar|fazer|ensinar|abordar|aplicar)|desplugad|din[aâ]mica|oficina|sugest|exerc[ií]cio|aula\s+(de|sobre)|trabalhar/.test(msgL);
  const qtd = quantidadeIdeiasPedidas(msgL);
  const temaDetectado = disciplinaCtx || disciplinaDaMensagem(msg);

  let corpo;

  if (/desplugad|computa.*sem\s*comput|pensamento\s*computacional/.test(msgL) ||
      (/computa[cç][aã]o|algoritm|scratch|coding/.test(msgL) && (pedindoIdeias || /estudante|aluno|turma|aula/.test(msgL)))) {
    corpo =
      `Aqui vão ${qtd} ideias de computação desplugada (sem computador), prontas para sala:\n\n` +
      ideiasComputacaoDesplugada(qtd) +
      '\n\nDica: ao final, peça que a turma nomeie o conceito (algoritmo, condição, depuração) com as próprias palavras — isso fixa a metáfora.';
  } else if (pedindoIdeias || temaDetectado) {
    corpo =
      `Sugestões práticas${temaDetectado ? ` para ${temaDetectado}` : ''}:\n\n` +
      ideiasPorDisciplina(temaDetectado || msgL, qtd) +
      `\n\nSe quiser, peça o ano/série (ex.: “5º ano”) que eu ajusto o nível.`;
  } else if (/vygotsky|zdp|proximal|andaime|scaffolding/.test(msgL)) {
    corpo =
      'A Zona de Desenvolvimento Proximal (Vygotsky) é o que o aluno faz com mediação, mas ainda não sozinho.\n\n' +
      'Na prática: (1) descubra o que já faz sozinho; (2) proponha uma tarefa um pouco acima, com apoio (modelo, dica, par mais experiente); ' +
      '(3) retire o andaime aos poucos até a autonomia.';
  } else if (/freire|di[aá]logo|libertador|problematiz/.test(msgL)) {
    corpo =
      'Freire destaca o diálogo e a problematização: parta da realidade do aluno, escute hipóteses e construa o conteúdo com ele, ' +
      'em vez de apenas “depositar” informação. Uma pergunta geradora no início da aula já muda o clima.';
  } else if (/parecer|relat[oó]rio|fam[ií]lia/.test(msgL)) {
    corpo =
      'Para um parecer à família: use evidências (média, frequência, participação), linguagem clara e 2–3 combinações práticas. ' +
      'Se houver aluno selecionado, use também o botão “Gerar parecer” para um rascunho revisável.';
  } else if (/recupera|interven|dificuld|baixo rendimento|faltas?\b/.test(msgL)) {
    corpo =
      'Plano curto de intervenção:\n' +
      '1) Diagnosticar a habilidade com maior defasagem;\n' +
      '2) Metas semanais observáveis;\n' +
      '3) Andaime (Vygotsky) em tarefas graduais;\n' +
      '4) Diálogo com o aluno e a família;\n' +
      '5) Reavaliar em 2–3 semanas e ajustar.';
  } else if (/bncc|habilidade|compet[eê]ncia/.test(msgL)) {
    corpo =
      'Alinhe a atividade a habilidades BNCC da etapa/disciplina e deixe a evidência de aprendizagem observável ' +
      '(produção, resolução de problema, participação registrada). No menu BNCC do painel você busca códigos por área/ano.';
  } else if (/piaget|construtiv|ausubel|significativ|wallon/.test(msgL)) {
    corpo =
      'Esses autores ajudam a planejar: Piaget (ação e desequilíbrio), Ausubel (ancorar no que o aluno já sabe), ' +
      'Wallon (afeto e vínculo como condição de aprender). Peça uma disciplina ou uma atividade que eu detalhe o passo a passo.';
  } else {
    corpo =
      'Posso ajudar com ideias de aula por disciplina. Experimente perguntas como:\n' +
      '• “2 ideias de história com fontes”\n' +
      '• “atividades de frações para 5º ano”\n' +
      '• “como trabalhar ciências por investigação”\n' +
      '• “duas ideias de computação desplugada”';
  }

  const partes = [corpo];

  if (snapshot?.aluno) {
    partes.push(
      `\n—\nContexto do aluno selecionado: ${snapshot.aluno.nome}` +
        ` (${snapshot.turma?.nome || 'turma n/d'}` +
        `${snapshot.disciplina ? `, ${snapshot.disciplina}` : ''}). ` +
        `Média ${snapshot.media != null ? snapshot.media : 'n/d'}, ` +
        `frequência ${snapshot.frequenciaPercentual != null ? `${snapshot.frequenciaPercentual}%` : 'n/d'}.`
    );
  }

  if (refsRelevantes.length) {
    const refsTxt = refsRelevantes
      .map((r) => `• ${r.autor} (${r.ideia}): ${r.aplicacao}`)
      .join('\n');
    partes.push(`\nReferências relacionadas:\n${refsTxt}`);
  }

  return {
    resposta: partes.join('').trim(),
    fonte: 'local'
  };
}

async function responderChatOpenAI({ mensagem, historico, snapshot }) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return { ok: false, motivo: 'sem_chave' };

  const disciplinaCtx = snapshot?.disciplina || disciplinaDaMensagem(mensagem) || '';
  const { area, referencias } = selecionarReferencias(
    disciplinaCtx,
    snapshot?.aluno ? (snapshot.nivel || 'sem_dados') : 'bom'
  );
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

  const system =
    'Você é a NICE IA, assistente pedagógica da plataforma VEHO Edu, para professores no Brasil.\n' +
    'REGRAS OBRIGATÓRIAS:\n' +
    '1) Responda SEMPRE à pergunta do professor de forma direta e útil — ideias de aula, estratégias, BNCC, autores.\n' +
    '2) Turma/aluno são OPCIONAIS. Se não houver aluno selecionado, responda em termos gerais. NÃO peça para selecionar aluno e NÃO diga que não pode ajudar.\n' +
    '3) Se pedirem N ideias (ex.: “duas ideias de computação desplugada”), entregue exatamente N propostas concretas, numeradas, prontas para sala (materiais, passos, objetivo).\n' +
    '4) Não invente notas, faltas ou fatos do aluno além do contexto JSON.\n' +
    '5) Cite autores só com ideias reconhecidas (Vygotsky, Freire, Piaget, Ausubel, Wallon, BNCC, Papert, autores da área), sem inventar livros/anos.\n' +
    '6) Português do Brasil. Seja prática: prefira listas e passos a discurso genérico. O professor deve revisar antes de usar com a família.';

  const contexto = {
    aluno: snapshot?.aluno
      ? {
          nome: snapshot.aluno.nome,
          turma: snapshot.turma?.nome,
          disciplina: snapshot.disciplina || null,
          media: snapshot.media,
          frequenciaPercentual: snapshot.frequenciaPercentual,
          totalFaltas: snapshot.totalFaltas,
          nivel: snapshot.nivel
        }
      : null,
    tema_detectado: disciplinaCtx || null,
    referencias_curadas: formatarReferenciasParaPrompt(referencias, area)
  };

  const messages = [
    { role: 'system', content: system },
    {
      role: 'system',
      content: `Contexto (JSON; aluno pode ser null):\n${JSON.stringify(contexto)}`
    },
    ...normalizarHistoricoChat(historico),
    { role: 'user', content: String(mensagem).trim().slice(0, 4000) }
  ];

  try {
    const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 1100,
        messages
      })
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      console.warn('OpenAI NICE chat falhou:', resposta.status, corpo.slice(0, 200));
      let motivo = `http_${resposta.status}`;
      try {
        const j = JSON.parse(corpo);
        const code = j?.error?.code || j?.error?.type || '';
        if (/insufficient_quota|credit_balance|billing/i.test(`${code} ${j?.error?.message || ''}`)) {
          motivo = 'sem_creditos';
        } else if (resposta.status === 401) {
          motivo = 'chave_invalida';
        }
      } catch {
        /* ignore */
      }
      return { ok: false, motivo };
    }

    const data = await resposta.json();
    const texto = data.choices?.[0]?.message?.content;
    if (!texto || !String(texto).trim()) return { ok: false, motivo: 'resposta_vazia' };

    return { ok: true, resposta: String(texto).trim(), fonte: 'openai' };
  } catch (e) {
    console.warn('OpenAI NICE chat erro de rede:', e.message);
    return { ok: false, motivo: 'rede' };
  }
}

/**
 * Chat interativo NICE IA (OpenAI se houver chave; senão respostas locais).
 */
async function conversarNiceIA({
  mensagem,
  historico,
  alunoId,
  turmaId,
  disciplina,
  escolaId
}) {
  const texto = String(mensagem || '').trim();
  if (!texto) {
    const err = new Error('Mensagem vazia');
    err.status = 400;
    throw err;
  }
  if (texto.length > 4000) {
    const err = new Error('Mensagem muito longa (máx. 4000 caracteres)');
    err.status = 400;
    throw err;
  }

  let snapshot = null;
  if (alunoId && turmaId && escolaId) {
    snapshot = await montarSnapshot({
      alunoId,
      turmaId,
      disciplina: disciplina ? String(disciplina).trim() : '',
      escolaId
    });
  }

  const openai = await responderChatOpenAI({
    mensagem: texto,
    historico,
    snapshot
  });

  const gerado = openai?.ok
    ? { resposta: openai.resposta, fonte: 'openai' }
    : responderChatLocal(texto, snapshot);

  return {
    resposta: gerado.resposta,
    fonte: gerado.fonte,
    openaiMotivo: openai?.ok ? null : (openai?.motivo || null),
    snapshot: snapshot
      ? {
          aluno: snapshot.aluno,
          turma: snapshot.turma,
          disciplina: snapshot.disciplina,
          media: snapshot.media,
          frequenciaPercentual: snapshot.frequenciaPercentual,
          totalFaltas: snapshot.totalFaltas,
          nivel: snapshot.nivel
        }
      : null
  };
}

module.exports = {
  montarSnapshot,
  gerarParecerPedagogico,
  conversarNiceIA,
  classificarSituacao,
  gerarTextoLocal,
  responderChatLocal
};
