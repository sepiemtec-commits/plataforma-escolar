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
      'servente', 'porteiro', 'estagiario', 'orientador_pedagogico', 'agente_inclusao',
      'bibliotecaria', 'copeira', 'auxiliar_coordenacao'
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
  cargaHorariaSemanal: { type: Number, min: 0 },
  /** Incrementado no logout / troca de senha — invalida JWTs anteriores. */
  tokenVersion: { type: Number, default: 0 },
  resetSenhaHash: { type: String },
  resetSenhaExpira: { type: Date },
  refreshTokens: [{
    hash: { type: String, required: true },
    expira: { type: Date, required: true },
    criadoEm: { type: Date, default: Date.now }
  }],
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
    alertasSms: { type: Boolean, default: false },
    alertasPush: { type: Boolean, default: false },
    avaliacaoComportamental: { type: Boolean, default: false },
    assinaturaInstituicao: {
      representante: { type: String, default: 'Diretor(a) Escolar' },
      cargo: { type: String, default: 'Direção' }
    }
  },
  // Assinatura SaaS (Stripe). Escolas de seed sem Stripe são tratadas como ativas.
  assinatura: {
    plano: {
      type: String,
      enum: ['essencial', 'profissional', 'completo']
    },
    status: {
      type: String,
      enum: ['incomplete', 'active', 'past_due', 'canceled', 'unpaid']
    },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    stripePriceId: { type: String },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false }
  },
  ativo: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== ASSINATURA PENDENTE (checkout pré-pagamento) ====================
const assinaturaPendenteSchema = new mongoose.Schema({
  nomeEscola: { type: String, required: true },
  cnpj: { type: String, required: true },
  telefone: { type: String },
  emailEscola: { type: String, required: true },
  endereco: { type: String },
  adminNome: { type: String, required: true },
  adminEmail: { type: String, required: true },
  adminSenhaHash: { type: String, required: true },
  plano: {
    type: String,
    enum: ['essencial', 'profissional', 'completo'],
    required: true
  },
  stripeSessionId: { type: String },
  stripeCustomerId: { type: String },
  status: {
    type: String,
    enum: ['pendente', 'concluida', 'expirada'],
    default: 'pendente'
  },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola' },
  dataCriacao: { type: Date, default: Date.now },
  dataConclusao: { type: Date }
});

assinaturaPendenteSchema.index({ cnpj: 1, status: 1 });
assinaturaPendenteSchema.index({ adminEmail: 1, status: 1 });
assinaturaPendenteSchema.index({ stripeSessionId: 1 }, { sparse: true });
// Evita dois checkouts pendentes simultâneos para o mesmo CNPJ / email
assinaturaPendenteSchema.index(
  { cnpj: 1 },
  { unique: true, partialFilterExpression: { status: 'pendente' } }
);
assinaturaPendenteSchema.index(
  { adminEmail: 1 },
  { unique: true, partialFilterExpression: { status: 'pendente' } }
);

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

// Um aluno só pode ter UMA disciplina por tempo/dia (impede conflito de horário)
presencaSchema.index(
  { aluno_id: 1, data: 1, tempo: 1 },
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
  observacoes: { type: String },
  topicos: [String],
  recursos: [String], // URLs de recursos
  codigosBncc: [{ type: String, trim: true }],
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

// Uma célula de nota (aluno/turma/disciplina/tipo/período) — impede duplicidade sob concorrência
avaliacaoSchema.index(
  { aluno_id: 1, turma_id: 1, disciplina: 1, tipo: 1, periodo: 1 },
  { unique: true }
);

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

desempenhoSchema.index(
  { aluno_id: 1, disciplina: 1, periodo: 1 },
  { unique: true }
);

// ==================== LOCKS / IDEMPOTÊNCIA (TOKEN 14) ====================
const concurrencyLockSchema = new mongoose.Schema({
  _id: { type: String },
  expiresAt: { type: Date, required: true }
});
concurrencyLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const idempotencyRecordSchema = new mongoose.Schema({
  _id: { type: String },
  status: { type: Number, required: true },
  body: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
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
  recebeSms: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

// ==================== WEB PUSH SUBSCRIPTION ====================
const pushSubscriptionSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userAgent: { type: String, default: '' },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ escola_id: 1, usuario_id: 1 });

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

// ==================== PARECER IA PEDAGÓGICA ====================
const parecerIASchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma', required: true },
  disciplina: { type: String, trim: true, default: '' },
  textoParecer: { type: String, required: true },
  textoOrientacoes: { type: String, required: true },
  geradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  editado: { type: Boolean, default: false },
  fonte: { type: String, enum: ['local', 'openai'], default: 'local' },
  snapshot: {
    media: { type: Number },
    frequenciaPercentual: { type: Number },
    totalFaltas: { type: Number },
    situacao: { type: String }
  },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

parecerIASchema.index({ escola_id: 1, aluno_id: 1, dataCriacao: -1 });
parecerIASchema.index({ geradoPor: 1, dataCriacao: -1 });

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

// Um professor não pode estar em duas turmas no mesmo horário
horarioAulaSchema.index(
  { professor_id: 1, diaSemana: 1, horaInicio: 1, turno: 1 },
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

// ==================== REUNIÃO PEDAGÓGICA (API /htpc) ====================
const htpcReuniaoSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  titulo: { type: String, required: true, trim: true },
  data: { type: Date, required: true },
  turno: {
    type: String,
    enum: ['Manhã', 'Tarde', 'Noite', 'Integral'],
    default: 'Tarde'
  },
  publico: {
    type: String,
    enum: ['pais', 'professores', 'todos'],
    default: 'professores'
  },
  pauta: { type: String, default: '' },
  ata: { type: String, default: '' },
  status: {
    type: String,
    enum: ['agendada', 'realizada', 'cancelada'],
    default: 'agendada'
  },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  participantes: [{
    usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    // legado: reuniões antigas usavam só professor_id
    professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    tipo: {
      type: String,
      enum: ['professor', 'responsavel'],
      default: 'professor'
    },
    presente: { type: Boolean, default: false },
    observacao: { type: String, default: '' }
  }],
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

htpcReuniaoSchema.index({ escola_id: 1, data: -1 });

// ==================== PEI ====================
const peiSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma' },
  responsavelPedagogico: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  diagnostico: { type: String, default: '' },
  necessidades: { type: String, default: '' },
  metas: [{
    descricao: { type: String, required: true },
    prazo: { type: Date },
    status: {
      type: String,
      enum: ['pendente', 'em_andamento', 'atingida', 'revisada'],
      default: 'pendente'
    }
  }],
  estrategias: { type: String, default: '' },
  recursos: { type: String, default: '' },
  acompanhamentos: [{
    data: { type: Date, default: Date.now },
    texto: { type: String, required: true },
    autor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
  }],
  status: {
    type: String,
    enum: ['rascunho', 'ativo', 'revisao', 'encerrado'],
    default: 'rascunho'
  },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

peiSchema.index({ escola_id: 1, aluno_id: 1 });
peiSchema.index({ escola_id: 1, status: 1 });

// ==================== BNCC (catálogo global) ====================
const bnccItemSchema = new mongoose.Schema({
  codigo: { type: String, required: true, trim: true, uppercase: true },
  area: {
    type: String,
    enum: ['computacao', 'lingua_portuguesa', 'matematica', 'ciencias', 'outra'],
    required: true
  },
  eixo: { type: String, default: '', trim: true },
  ano: { type: String, default: '', trim: true },
  descricao: { type: String, required: true },
  fonte: {
    type: String,
    enum: ['bncc_computacao', 'bncc_amostra'],
    default: 'bncc_amostra'
  },
  dataCriacao: { type: Date, default: Date.now }
});

bnccItemSchema.index({ codigo: 1 }, { unique: true });
bnccItemSchema.index({ area: 1, ano: 1 });

// ==================== BANCO DE ITENS (SAEB / SARESP) ====================
const itemAvaliacaoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, trim: true, uppercase: true },
  fonte: {
    type: String,
    enum: ['saeb', 'saresp', 'escola'],
    default: 'escola'
  },
  area: {
    type: String,
    enum: ['lingua_portuguesa', 'matematica', 'ciencias', 'outra'],
    required: true
  },
  ano: { type: String, default: '', trim: true },
  dificuldade: {
    type: String,
    enum: ['facil', 'medio', 'dificil'],
    default: 'medio'
  },
  enunciado: { type: String, required: true },
  imagemUrl: { type: String, default: '' },
  alternativas: [{
    letra: { type: String, required: true },
    texto: { type: String, required: true },
    imagemUrl: { type: String, default: '' }
  }],
  gabarito: { type: String, required: true }, // A, B, C, D...
  habilidadeBncc: { type: String, default: '' },
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola' }, // null = catálogo global
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  ativo: { type: Boolean, default: true },
  dataCriacao: { type: Date, default: Date.now }
});

itemAvaliacaoSchema.index({ codigo: 1, fonte: 1 });
itemAvaliacaoSchema.index({ area: 1, ano: 1, fonte: 1 });
itemAvaliacaoSchema.index({ escola_id: 1, ativo: 1 });

// ==================== SIMULADO (sessão agendada) ====================
const simuladoSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  titulo: { type: String, required: true, trim: true },
  descricao: { type: String, default: '' },
  fonte: {
    type: String,
    enum: ['saeb', 'saresp', 'misto', 'escola'],
    default: 'saeb'
  },
  area: {
    type: String,
    enum: ['lingua_portuguesa', 'matematica', 'ciencias', 'mista', 'outra'],
    default: 'matematica'
  },
  turma_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Turma' },
  anoReferencia: { type: String, default: '' },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date },
  status: {
    type: String,
    enum: ['rascunho', 'agendado', 'em_andamento', 'encerrado', 'corrigido'],
    default: 'agendado'
  },
  /** Disponibiliza a prova no painel do aluno */
  modoOnline: { type: Boolean, default: false },
  /** Tempo máximo após o aluno iniciar (minutos). 0 = sem limite. */
  duracaoMinutos: { type: Number, default: 60, min: 0, max: 300 },
  mostrarResultadoImediato: { type: Boolean, default: true },
  itens: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ItemAvaliacao' }],
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  mediaEscola: { type: Number },
  totalRespostas: { type: Number, default: 0 },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

simuladoSchema.index({ escola_id: 1, dataInicio: -1 });
simuladoSchema.index({ escola_id: 1, status: 1 });

// ==================== RESPOSTA DE SIMULADO ====================
const respostaSimuladoSchema = new mongoose.Schema({
  escola_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  simulado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Simulado', required: true },
  aluno_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  respostas: [{
    item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ItemAvaliacao' },
    alternativa: { type: String },
    correta: { type: Boolean }
  }],
  acertos: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  percentual: { type: Number, default: 0 },
  statusProva: {
    type: String,
    enum: ['nao_iniciada', 'em_andamento', 'enviada', 'expirada'],
    default: 'nao_iniciada'
  },
  iniciadoEm: { type: Date },
  enviadoEm: { type: Date },
  expiraEm: { type: Date },
  corrigidoEm: { type: Date },
  dataCriacao: { type: Date, default: Date.now },
  dataAtualizacao: { type: Date, default: Date.now }
});

respostaSimuladoSchema.index({ simulado_id: 1, aluno_id: 1 }, { unique: true });
respostaSimuladoSchema.index({ escola_id: 1, simulado_id: 1 });

// Exportar modelos
module.exports = {
  Usuario: mongoose.model('Usuario', usuarioSchema),
  Escola: mongoose.model('Escola', escolaSchema),
  AssinaturaPendente: mongoose.model('AssinaturaPendente', assinaturaPendenteSchema),
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
  ParecerIA: mongoose.model('ParecerIA', parecerIASchema),
  HorarioAula: mongoose.model('HorarioAula', horarioAulaSchema),
  PushSubscription: mongoose.model('PushSubscription', pushSubscriptionSchema),
  HtpcReuniao: mongoose.model('HtpcReuniao', htpcReuniaoSchema),
  Pei: mongoose.model('Pei', peiSchema),
  BnccItem: mongoose.model('BnccItem', bnccItemSchema),
  ItemAvaliacao: mongoose.model('ItemAvaliacao', itemAvaliacaoSchema),
  Simulado: mongoose.model('Simulado', simuladoSchema),
  RespostaSimulado: mongoose.model('RespostaSimulado', respostaSimuladoSchema),
  ConcurrencyLock: mongoose.model('ConcurrencyLock', concurrencyLockSchema),
  IdempotencyRecord: mongoose.model('IdempotencyRecord', idempotencyRecordSchema),
  Log: mongoose.model('Log', logSchema)
};
