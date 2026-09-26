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

module.exports = {
  montarSnapshot,
  gerarParecerPedagogico,
  classificarSituacao,
  gerarTextoLocal
};
