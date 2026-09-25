const {
  Usuario,
  Turma,
  Escola,
  HistoricoEscolar,
  Avaliacao,
  Presenca,
  DeclaracaoCurso
} = require('../database/schema');

function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function celula(valor, tipo = 'String') {
  const v = valor === null || valor === undefined ? '' : valor;
  if (tipo === 'Number' && v !== '' && !isNaN(Number(v))) {
    return `<Cell><Data ss:Type="Number">${Number(v)}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escaparXml(v)}</Data></Cell>`;
}

function linha(celulas) {
  return `<Row>${celulas.map(c => celula(c.valor, c.tipo)).join('')}</Row>`;
}

function planilha(nome, cabecalhos, dados) {
  const nomeSafe = escaparXml(nome).slice(0, 31);
  const rows = [
    linha(cabecalhos.map(h => ({ valor: h }))),
    ...dados.map(row => linha(row.map(valor => (
      typeof valor === 'object' && valor !== null ? valor : { valor }
    ))))
  ];
  return `
    <Worksheet ss:Name="${nomeSafe}">
      <Table>
        ${rows.join('\n')}
      </Table>
    </Worksheet>`;
}

function intervaloAno(anoLetivo) {
  const inicio = new Date(anoLetivo, 0, 1);
  const fim = new Date(anoLetivo + 1, 0, 1);
  return { inicio, fim };
}

async function montarDadosArquivoAnoLetivo(escolaId, anoLetivo) {
  const escola = await Escola.findById(escolaId);
  const { inicio, fim } = intervaloAno(anoLetivo);

  const turmas = await Turma.find({ escola_id: escolaId })
    .populate('professor_id', 'nome email cpf disciplina')
    .populate('alunos', 'nome cpf email whatsapp turno dataNascimento filiacao_pai filiacao_mae');

  const alunosIds = new Set();
  turmas.forEach(t => (t.alunos || []).forEach(a => alunosIds.add(String(a._id))));

  const alunosDb = await Usuario.find({
    escola_id: escolaId,
    tipo: 'aluno',
    ativo: true
  }).select('nome cpf email whatsapp turno dataNascimento filiacao_pai filiacao_mae rg endereco cidade uf');

  const historicos = await HistoricoEscolar.find({
    escola_id: escolaId,
    anoLetivo
  }).populate('aluno_id', 'nome cpf');

  const avaliacoes = await Avaliacao.find({
    turma_id: { $in: turmas.map(t => t._id) },
    dataAplicacao: { $gte: inicio, $lt: fim }
  }).populate('aluno_id', 'nome cpf').populate('professor_id', 'nome');

  const presencas = await Presenca.find({
    turma_id: { $in: turmas.map(t => t._id) },
    data: { $gte: inicio, $lt: fim }
  }).populate('aluno_id', 'nome cpf').populate('professor_id', 'nome');

  const declaracoes = await DeclaracaoCurso.find({
    escola_id: escolaId,
    anoLetivo
  }).populate('aluno_id', 'nome cpf');

  const professores = await Usuario.find({
    escola_id: escolaId,
    tipo: 'professor',
    ativo: true
  }).select('nome cpf email whatsapp telefone disciplina pis ctps');

  const equipe = await Usuario.find({
    escola_id: escolaId,
    tipo: { $in: ['secretaria', 'coordenador', 'diretor'] },
    ativo: true
  }).select('nome cpf email whatsapp telefone tipo pis ctps');

  const turmaPorAluno = {};
  turmas.forEach(t => {
    (t.alunos || []).forEach(a => {
      turmaPorAluno[String(a._id)] = t;
    });
  });

  const alunosLinhas = alunosDb.map(a => {
    const turma = turmaPorAluno[String(a._id)];
    const hist = historicos.find(h => String(h.aluno_id?._id || h.aluno_id) === String(a._id));
    return [
      a.nome,
      a.cpf,
      a.email,
      a.whatsapp,
      turma?.nome || hist?.turma || '—',
      hist?.serie || turma?.serie || '—',
      hist?.turno || turma?.turno || a.turno || '—',
      hist?.resultado || '—',
      a.filiacao_pai || '—',
      a.filiacao_mae || '—',
      a.endereco || '—',
      a.cidade || '—',
      a.uf || '—'
    ];
  });

  const notasLinhas = [];
  historicos.forEach(h => {
    (h.notas || []).forEach(n => {
      notasLinhas.push([
        h.aluno_id?.nome || '—',
        h.aluno_id?.cpf || '—',
        h.anoLetivo,
        h.serie,
        n.disciplina,
        { valor: n.nota, tipo: n.nota != null ? 'Number' : 'String' },
        { valor: n.faltas, tipo: 'Number' },
        { valor: n.cargaHoraria, tipo: 'Number' },
        h.resultado,
        'Histórico',
        '—'
      ]);
    });
  });

  avaliacoes.forEach(av => {
    notasLinhas.push([
      av.aluno_id?.nome || '—',
      av.aluno_id?.cpf || '—',
      anoLetivo,
      '—',
      av.disciplina,
      { valor: av.nota, tipo: 'Number' },
      '—',
      '—',
      av.periodo,
      av.tipo,
      av.professor_id?.nome || '—'
    ]);
  });

  const presencaLinhas = presencas.map(p => [
    p.aluno_id?.nome || '—',
    p.aluno_id?.cpf || '—',
    p.disciplina || 'Geral',
    { valor: p.tempo || 1, tipo: 'Number' },
    p.status,
    p.data ? new Date(p.data).toLocaleDateString('pt-BR') : '—',
    p.professor_id?.nome || '—'
  ]);

  const professorLinhas = professores.map(p => [
    p.nome,
    p.cpf,
    p.email,
    p.whatsapp,
    p.telefone || '—',
    p.disciplina || '—',
    p.pis || '—',
    p.ctps || '—'
  ]);

  const equipeLinhas = equipe.map(u => [
    u.nome,
    u.tipo,
    u.cpf,
    u.email,
    u.whatsapp,
    u.telefone || '—',
    u.pis || '—',
    u.ctps || '—'
  ]);

  const turmaLinhas = turmas.map(t => [
    t.nome,
    t.nivel || '—',
    { valor: t.ano, tipo: 'Number' },
    t.serie || '—',
    t.turno || '—',
    t.professor_id?.nome || '—',
    { valor: (t.alunos || []).length, tipo: 'Number' }
  ]);

  const declaracaoLinhas = declaracoes.map(d => [
    d.aluno_id?.nome || '—',
    d.aluno_id?.cpf || '—',
    { valor: d.anoLetivo, tipo: 'Number' },
    d.serieCursada,
    d.seriePromovida || '—',
    d.resultado,
    { valor: d.mediaGeral, tipo: d.mediaGeral != null ? 'Number' : 'String' },
    d.codigoVerificacao
  ]);

  return {
    escola: escola?.nome || 'Escola',
    anoLetivo,
    planilhas: [
      {
        nome: 'Alunos',
        cabecalhos: ['Nome', 'CPF', 'Email', 'WhatsApp', 'Turma', 'Serie', 'Turno', 'Resultado', 'Pai', 'Mae', 'Endereco', 'Cidade', 'UF'],
        dados: alunosLinhas
      },
      {
        nome: 'Notas',
        cabecalhos: ['Aluno', 'CPF', 'Ano', 'Serie', 'Disciplina', 'Nota', 'Faltas', 'CH', 'Resultado_Periodo', 'Tipo', 'Professor'],
        dados: notasLinhas
      },
      {
        nome: 'Presencas',
        cabecalhos: ['Aluno', 'CPF', 'Disciplina', 'Tempo', 'Status', 'Data', 'Professor'],
        dados: presencaLinhas
      },
      {
        nome: 'Professores',
        cabecalhos: ['Nome', 'CPF', 'Email', 'WhatsApp', 'Telefone', 'Disciplina', 'PIS', 'CTPS'],
        dados: professorLinhas
      },
      {
        nome: 'Equipe Escolar',
        cabecalhos: ['Nome', 'Cargo', 'CPF', 'Email', 'WhatsApp', 'Telefone', 'PIS', 'CTPS'],
        dados: equipeLinhas
      },
      {
        nome: 'Turmas',
        cabecalhos: ['Nome', 'Nivel', 'Ano', 'Serie', 'Turno', 'Professor', 'Qtd Alunos'],
        dados: turmaLinhas
      },
      {
        nome: 'Declaracoes',
        cabecalhos: ['Aluno', 'CPF', 'Ano', 'Serie Cursada', 'Serie Promovida', 'Resultado', 'Media', 'Codigo'],
        dados: declaracaoLinhas
      }
    ]
  };
}

function gerarXls(dados) {
  const worksheets = dados.planilhas
    .map(p => planilha(p.nome, p.cabecalhos, p.dados))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>Arquivo ${dados.anoLetivo} - ${escaparXml(dados.escola)}</Title>
    <Author>VEHO</Author>
  </DocumentProperties>
  ${worksheets}
</Workbook>`;
}

async function gerarArquivoXlsAnoLetivo(escolaId, anoLetivo) {
  const dados = await montarDadosArquivoAnoLetivo(escolaId, anoLetivo);
  const xml = gerarXls(dados);
  return {
    conteudo: xml,
    nomeArquivo: `arquivo-ano-letivo-${anoLetivo}-${dados.escola.replace(/[^\w-]+/g, '_')}.xls`,
    escola: dados.escola,
    anoLetivo
  };
}

module.exports = {
  montarDadosArquivoAnoLetivo,
  gerarArquivoXlsAnoLetivo
};
