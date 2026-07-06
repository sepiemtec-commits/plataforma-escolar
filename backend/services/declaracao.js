const crypto = require('crypto');
const { DeclaracaoCurso } = require('../database/schema');
const { labelAno } = require('../constants/ensino');

function gerarCodigoVerificacao() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function gerarHashDocumento(conteudo, escolaId, alunoId, anoLetivo) {
  const segredo = process.env.JWT_SECRET || 'edplus-assinatura';
  return crypto
    .createHash('sha256')
    .update(`${conteudo}|${escolaId}|${alunoId}|${anoLetivo}|${segredo}`)
    .digest('hex')
    .substring(0, 32)
    .toUpperCase();
}

function montarTextoDeclaracao(dados) {
  const {
    alunoNome, escolaNome, escolaEndereco, anoLetivo,
    serieCursada, seriePromovida, turno, resultado, mediaGeral
  } = dados;

  if (resultado === 'Retido') {
    return `Declaramos, para os devidos fins, que o(a) aluno(a) ${alunoNome}, regularmente matriculado(a) nesta instituição, cursou o ${serieCursada} no ano letivo de ${anoLetivo}, turno ${turno || 'Manhã'}, obtendo média geral ${mediaGeral != null ? mediaGeral.toFixed(2).replace('.', ',') : '—'}, encontrando-se com situação de RETENÇÃO na série, conforme registros escolares da ${escolaNome}.`;
  }

  if (resultado === 'Concluinte') {
    return `Declaramos, para os devidos fins, que o(a) aluno(a) ${alunoNome}, regularmente matriculado(a) nesta instituição, concluiu o ${serieCursada} no ano letivo de ${anoLetivo}, turno ${turno || 'Manhã'}, com média geral ${mediaGeral != null ? mediaGeral.toFixed(2).replace('.', ',') : '—'}, tendo concluído o Ensino Médio na ${escolaNome}.`;
  }

  const proxima = seriePromovida
    ? `, sendo promovido(a) para o ${seriePromovida}`
    : '';

  return `Declaramos, para os devidos fins, que o(a) aluno(a) ${alunoNome}, regularmente matriculado(a) nesta instituição, cursou e foi APROVADO(A) no ${serieCursada} no ano letivo de ${anoLetivo}, turno ${turno || 'Manhã'}, com média geral ${mediaGeral != null ? mediaGeral.toFixed(2).replace('.', ',') : '—'}${proxima}, conforme registros escolares da ${escolaNome}${escolaEndereco ? `, ${escolaEndereco}` : ''}.`;
}

async function emitirDeclaracao(dados) {
  const {
    aluno, escola, diretor, turmaOrigem, turmaDestino,
    anoLetivo, nivel, serieCursada, seriePromovida,
    resultado, mediaGeral, promovidoAutomaticamente
  } = dados;

  const textoDeclaracao = montarTextoDeclaracao({
    alunoNome: aluno.nome,
    escolaNome: escola.nome,
    escolaEndereco: escola.endereco,
    anoLetivo,
    serieCursada,
    seriePromovida,
    turno: turmaOrigem?.turno || aluno.turno,
    resultado,
    mediaGeral
  });

  const codigoVerificacao = gerarCodigoVerificacao();
  const dataAssinatura = new Date();
  const hashDocumento = gerarHashDocumento(
    textoDeclaracao,
    escola._id,
    aluno._id,
    anoLetivo
  );

  const assinatura = {
    instituicao: escola.nome,
    cnpj: escola.cnpj,
    representante: diretor?.nome || escola.configuracao?.assinaturaInstituicao?.representante || 'Diretor(a) Escolar',
    cargo: escola.configuracao?.assinaturaInstituicao?.cargo || 'Direção',
    dataAssinatura,
    hashDocumento
  };

  const existente = await DeclaracaoCurso.findOne({
    aluno_id: aluno._id,
    anoLetivo,
    resultado
  });

  const payload = {
    aluno_id: aluno._id,
    escola_id: escola._id,
    anoLetivo,
    nivel,
    serieCursada,
    seriePromovida: seriePromovida || null,
    turmaOrigem: turmaOrigem?.nome || null,
    turmaDestino: turmaDestino?.nome || null,
    resultado,
    mediaGeral,
    textoDeclaracao,
    codigoVerificacao,
    assinatura,
    promovidoAutomaticamente: Boolean(promovidoAutomaticamente),
    dataEmissao: dataAssinatura
  };

  if (existente) {
    Object.assign(existente, payload);
    await existente.save();
    return existente;
  }

  return DeclaracaoCurso.create(payload);
}

function formatarDeclaracaoHtml(decl) {
  const dataBR = new Date(decl.assinatura.dataAssinatura).toLocaleString('pt-BR');
  const dataEmissao = new Date(decl.dataEmissao).toLocaleDateString('pt-BR');

  return `
    <div class="rel-declaracao">
      <p class="rel-escola-nome">${decl.assinatura.instituicao}</p>
      <h2 class="rel-declaracao-titulo">Declaração de Curso</h2>
      <p class="rel-declaracao-meta">Ano letivo ${decl.anoLetivo} · Emitida em ${dataEmissao}</p>
      <div class="rel-declaracao-corpo">
        <p>${decl.textoDeclaracao}</p>
      </div>
      <div class="rel-assinatura-eletronica">
        <p><strong>Assinatura eletrônica da instituição</strong></p>
        <p>${decl.assinatura.instituicao}</p>
        <p>CNPJ: ${decl.assinatura.cnpj || '—'}</p>
        <p>${decl.assinatura.representante} — ${decl.assinatura.cargo}</p>
        <p>Assinado eletronicamente em ${dataBR}</p>
        <p class="rel-codigo-verificacao">Código de verificação: <strong>${decl.codigoVerificacao}</strong></p>
        <p class="rel-hash">Hash do documento: ${decl.assinatura.hashDocumento}</p>
        <p class="rel-aviso-assinatura">Este documento foi gerado eletronicamente pelo sistema EdPlus e possui validade administrativa interna da instituição de ensino.</p>
      </div>
    </div>`;
}

module.exports = {
  emitirDeclaracao,
  formatarDeclaracaoHtml,
  montarTextoDeclaracao,
  gerarCodigoVerificacao,
  labelAno
};
