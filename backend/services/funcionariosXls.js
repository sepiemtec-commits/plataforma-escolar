const { Usuario } = require('../database/schema');
const { LABEL_TIPO_FUNCIONARIO, TIPOS_FUNCIONARIO_ESCOLA } = require('../constants/funcionarios');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');

function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function celula(valor) {
  return `<Cell><Data ss:Type="String">${escaparXml(valor)}</Data></Cell>`;
}

function linha(valores) {
  return `<Row>${valores.map(celula).join('')}</Row>`;
}

async function gerarListaFuncionariosXls(escolaId) {
  const funcionarios = await Usuario.find({
    escola_id: escolaId,
    tipo: { $in: TIPOS_FUNCIONARIO_ESCOLA },
    ativo: true
  }).select('nome tipo disciplina disciplinas cpf rg email whatsapp telefone pis ctps cnpj endereco cidade uf')
    .sort({ tipo: 1, nome: 1 });

  const cabecalhos = [
    'Nome', 'Cargo', 'Disciplina', 'CPF', 'RG', 'Email',
    'WhatsApp', 'Telefone', 'PIS/PASEP', 'CTPS', 'CNPJ', 'Endereço', 'Cidade', 'UF'
  ];

  const rows = funcionarios.map(f => [
    f.nome,
    LABEL_TIPO_FUNCIONARIO[f.tipo] || f.tipo,
    f.tipo === 'professor' ? disciplinasDoProfessor(f).join(', ') : '',
    f.cpf || '',
    f.rg || '',
    f.email || '',
    f.whatsapp || '',
    f.telefone || '',
    f.pis || '',
    f.ctps || '',
    f.cnpj || '',
    f.endereco || '',
    f.cidade || '',
    f.uf || ''
  ]);

  const conteudo = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Funcionarios">
    <Table>
      ${linha(cabecalhos)}
      ${rows.map(linha).join('\n')}
    </Table>
  </Worksheet>
</Workbook>`;

  const data = new Date().toISOString().slice(0, 10);
  return {
    nomeArquivo: `funcionarios-${data}.xls`,
    conteudo
  };
}

module.exports = { gerarListaFuncionariosXls };
