const TIPOS_ALUNO = [
  'certidao_nascimento',
  'rg_responsavel',
  'cpf_responsavel',
  'comprovante_residencia'
];

const TIPOS_FUNCIONARIO = [
  'rg',
  'diploma',
  'comprovante_endereco',
  'pis',
  'ctps',
  'cnpj'
];

const LABELS = {
  rg: 'RG',
  diploma: 'Diploma / Habilitação',
  comprovante_endereco: 'Comprovante de Endereço',
  pis: 'PIS / PASEP',
  ctps: 'Carteira de Trabalho (CTPS)',
  cnpj: 'CNPJ (PJ / MEI)',
  certidao_nascimento: 'Certidão de Nascimento',
  rg_responsavel: 'RG do Responsável',
  cpf_responsavel: 'CPF do Responsável',
  comprovante_residencia: 'Comprovante de Residência'
};

function tiposPorCategoria(categoria) {
  if (categoria === 'aluno') return TIPOS_ALUNO;
  if (categoria === 'funcionario') return TIPOS_FUNCIONARIO;
  return [...TIPOS_ALUNO, ...TIPOS_FUNCIONARIO];
}

function categoriaPorTipoUsuario(tipo) {
  if (tipo === 'aluno') return 'aluno';
  return 'funcionario';
}

module.exports = {
  TIPOS_FUNCIONARIO,
  TIPOS_ALUNO,
  LABELS,
  tiposPorCategoria,
  categoriaPorTipoUsuario
};
