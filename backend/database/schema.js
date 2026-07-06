// database/schema.js - Esquemas MongoDB
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==================== USUÁRIO ====================
const usuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  cpf: { type: String, unique: true, sparse: true },
  telefone: { type: String },
  whatsapp: { type: String },
  certidao_nascimento: { type: String },
  whatsapp_responsavel: { type: String },
  cpf_responsavel: { type: String },
  rg_responsavel: { type: String },
  tipo: { 
    type: String, 
    enum: [
      'admin', 'diretor', 'coordenador', 'secretaria', 'professor', 'aluno', 'responsavel',
      'servente', 'porteiro', 'estagiario', 'orientador_pedagogico', 'agente_inclusao'
    ],
    required: true 
  },
  ativo: { type: Boolean, default: true },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola' },
  matriculaNumero: { type: Number },
  dataNascimento: { type: Date },
  sexo: { type: String, enum: ['masculino', 'feminino', 'outro'] },
  nacionalidade: { type: String },
  naturalidade: { type: String },
  religiao: { type: String },
  endereco: { type: String },
  bairro: { type: String },
  cidade: { type: String },
  uf: { type: String },
  cep: { type: String },
  turno: { type: String, default: 'Manhã' },
  filiacao_pai: { type: String },
  filiacao_mae: { type: String },
  nome_responsavel: { type: String },
  rg: { type: String },
  cpf_pai: { type: String },
  cpf_mae: { type: String },
  rg_pai: { type: String },
  rg_mae: { type: String },
  endereco_pais: { type: String },
  pis: { type: String },
  ctps: { type: String },
  cnpj: { type: String },
  disciplina: { type: String },
  disciplinas: [{ type: String }],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

// Hash de senha antes de salvar
usuarioSchema.pre('save', async function(next) {
  if (!this.isModified('senha')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.senha = await bcrypt.hash(this.senha, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar senhas
usuarioSchema.methods.compararSenha = async function(senhaDigitada) {
  return await bcrypt.compare(senhaDigitada, this.senha);
};

// ==================== ESCOLA ====================
const escolaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  cnpj: { type: String, required: true, unique: true },
  endereco: { type: String },
  telefone: { type: String },
  email: { type: String },
  diretor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  coordenador_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  configuracao: {
    tipoAvaliacao: { 
      type: String, 
      enum: ['bimestral', 'trimestral'],
      default: 'bimestral'
    },
    anoLetivo: { type: Number },
    alertasWhatsapp: { type: Boolean, default: true },
    avaliacaoComportamental: { type: Boolean, default: false },
    assinaturaInstituicao: {
      representante: { type: String, default: 'Diretor(a) Escolar' },
      cargo: { type: String, default: 'Direção' }
    }
  },
  ativo: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== TURMA ====================
const turmaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  nivel: {
    type: String,
    enum: ['Fundamental I', 'Fundamental II', 'Ensino Médio'],
    required: true,
    default: 'Fundamental I'
  },
  ano: { type: Number, required: true },
  serie: { type: String },
  turno: {
    type: String,
    enum: ['Manhã', 'Tarde', 'Noite', 'Integral'],
    default: 'Manhã'
  },
  professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  alunos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== PRESENÇA ====================
const presencaSchema = new mongoose.Schema({
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  disciplina: { type: String, required: true, default: 'Geral' },
  tempo: { type: Number, required: true, min: 1, default: 1 },
  data: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['presente', 'falta', 'justificada', 'atraso'],
    required: true 
  },
  observacoes: { type: String },
  notificadoWhatsapp: { type: Boolean, default: false },
  dataCriacao: { type: Date, default: Date.now }
});

presencaSchema.index(
  { aluno_id: 1, turma_id: 1, data: 1, disciplina: 1, tempo: 1 },
  { unique: true }
);

// ==================== DISCIPLINA (tempos de aula) ====================
const disciplinaConfigSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  nome: { type: String, required: true, trim: true },
  quantidadeTempos: { type: Number, required: true, min: 1, max: 12, default: 1 },
  ativo: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

disciplinaConfigSchema.index({ escola_id: 1, nome: 1 }, { unique: true });

// ==================== CONTEÚDO PROGRAMÁTICO ====================
const conteudoSchema = new mongoose.Schema({
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  disciplina: { type: String, required: true },
  data: { type: Date, required: true },
  titulo: { type: String, required: true },
  descricao: { type: String },
  topicos: [String],
  recursos: [String], // URLs de recursos
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== AVALIAÇÃO ====================
const avaliacaoSchema = new mongoose.Schema({
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  disciplina: { type: String, required: true },
  tipo: {
    type: String,
    enum: ['prova_bimestral', 'teste_bimestral', 'comportamental', 'atividade', 'trabalho', 'prova_final', 'recuperacao'],
    required: true
  },
  periodo: { 
    type: String, 
    enum: ['1º Bimestre', '2º Bimestre', '3º Bimestre', '4º Bimestre', 'Anual'],
    required: true 
  },
  nota: { type: Number, required: true },
  peso: { type: Number, default: 1 },
  dataAplicacao: { type: Date, required: true },
  observacoes: { type: String },
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== DESEMPENHO DO ALUNO ====================
const desempenhoSchema = new mongoose.Schema({
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  disciplina: { type: String, required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  periodo: { type: String, required: true },
  mediaGeral: { type: Number },
  frequenciaPercentual: { type: Number },
  totalFaltas: { type: Number, default: 0 },
  totalAulas: { type: Number, default: 0 },
  situacao: { 
    type: String, 
    enum: ['aprovado', 'recuperacao', 'reprovado', 'excelente']
  },
  diagnostico: { type: String }, // Texto para o professor
  avisoEnviado: { type: Boolean, default: false },
  dataAtualizacao: { type: Date, default: Date.now }
});

// ==================== RESPONSÁVEL ====================
const responsavelSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  grau_parentesco: { 
    type: String, 
    enum: ['pai', 'mae', 'avô', 'avó', 'tio', 'tia', 'outro']
  },
  whatsapp: { type: String, required: true },
  recebeNotificacoes: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== HISTÓRICO ESCOLAR ====================
const historicoEscolarSchema = new mongoose.Schema({
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola' },
  anoLetivo: { type: Number, required: true },
  serie: { type: String, required: true },
  turma: { type: String },
  turno: { type: String },
  resultado: {
    type: String,
    enum: ['Progressão Plena', 'Progressão Parcial', 'Retido', 'Transferido'],
    default: 'Progressão Plena'
  },
  instituicao: { type: String, required: true },
  notas: [{
    disciplina: { type: String, required: true },
    cargaHoraria: { type: Number, default: 40 },
    nota: { type: Number },
    faltas: { type: Number, default: 0 }
  }],
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== DOCUMENTOS ARQUIVADOS ====================
const documentoArquivoSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola' },
  categoria: { type: String, enum: ['aluno', 'funcionario'], required: true },
  tipo: { type: String, required: true },
  nomeOriginal: { type: String, required: true },
  nomeArquivo: { type: String, required: true },
  mimeType: { type: String },
  tamanho: { type: Number },
  caminho: { type: String, required: true },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  dataUpload: { type: Date, default: Date.now }
});

documentoArquivoSchema.index({ usuario_id: 1, tipo: 1 });

// ==================== DECLARAÇÃO DE CURSO ====================
const declaracaoCursoSchema = new mongoose.Schema({
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  anoLetivo: { type: Number, required: true },
  nivel: { type: String },
  serieCursada: { type: String, required: true },
  seriePromovida: { type: String },
  turmaOrigem: { type: String },
  turmaDestino: { type: String },
  resultado: {
    type: String,
    enum: ['Aprovado', 'Retido', 'Concluinte'],
    required: true
  },
  mediaGeral: { type: Number },
  textoDeclaracao: { type: String, required: true },
  codigoVerificacao: { type: String, required: true, unique: true },
  assinatura: {
    instituicao: { type: String, required: true },
    cnpj: { type: String },
    representante: { type: String },
    cargo: { type: String },
    dataAssinatura: { type: Date, required: true },
    hashDocumento: { type: String, required: true }
  },
  promovidoAutomaticamente: { type: Boolean, default: false },
  dataEmissao: { type: Date, default: Date.now }
});

declaracaoCursoSchema.index({ aluno_id: 1, anoLetivo: 1 });

// ==================== HORÁRIO DE AULAS ====================
const horarioAulaSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  disciplina: { type: String, required: true, trim: true },
  diaSemana: { type: Number, required: true, min: 0, max: 5 },
  horaInicio: { type: String, required: true },
  turno: {
    type: String,
    enum: ['Manhã', 'Tarde', 'Noite', 'Integral'],
    required: true
  },
  dataCriacao: { type: Date, default: Date.now }
});

horarioAulaSchema.index(
  { turma_id: 1, diaSemana: 1, horaInicio: 1, turno: 1 },
  { unique: true }
);

// ==================== LOG DE ATIVIDADES ====================
const logSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  acao: { type: String, required: true },
  modulo: { type: String }, // presença, avaliação, conteúdo
  descricao: { type: String },
  ipAddress: { type: String },
  dataCriacao: { type: Date, default: Date.now }
});

// Exportar modelos
module.exports = {
  Usuario: mongoose.model('Usuario', usuarioSchema),
  Escola: mongoose.model('Escola', escolaSchema),
  Turma: mongoose.model('Turma', turmaSchema),
  Presenca: mongoose.model('Presenca', presencaSchema),
  DisciplinaConfig: mongoose.model('DisciplinaConfig', disciplinaConfigSchema),
  Conteudo: mongoose.model('Conteudo', conteudoSchema),
  Avaliacao: mongoose.model('Avaliacao', avaliacaoSchema),
  Desempenho: mongoose.model('Desempenho', desempenhoSchema),
  Responsavel: mongoose.model('Responsavel', responsavelSchema),
  HistoricoEscolar: mongoose.model('HistoricoEscolar', historicoEscolarSchema),
  DocumentoArquivo: mongoose.model('DocumentoArquivo', documentoArquivoSchema),
  DeclaracaoCurso: mongoose.model('DeclaracaoCurso', declaracaoCursoSchema),
  HorarioAula: mongoose.model('HorarioAula', horarioAulaSchema),
  Log: mongoose.model('Log', logSchema)
};
