// backend/utils/tenant.js — Isolamento multi-escola (escola_id)
const { Turma, Usuario } = require('../database/schema');

class TenantError extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
    this.mensagem = mensagem;
  }
}

function idsIguais(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function escolaIdDoUsuario(req) {
  return req.usuario?.escola_id || null;
}

/**
 * Filtro Mongo por escola.
 * - Usuário com escola_id: { escola_id }
 * - Admin sem escola_id: {} (visão global da plataforma)
 * - Demais sem escola_id: filtro impossível (não vaza dados)
 */
function filtroEscola(req) {
  const escolaId = escolaIdDoUsuario(req);
  if (escolaId) return { escola_id: escolaId };
  if (req.usuario?.tipo === 'admin') return {};
  return { escola_id: '__sem_escola__' };
}

/** true se o recurso pertence à escola do usuário (admin global liberado). */
function mesmaEscola(req, resourceEscolaId) {
  if (!escolaIdDoUsuario(req)) {
    return req.usuario?.tipo === 'admin';
  }
  return idsIguais(resourceEscolaId, req.usuario.escola_id);
}

function negarSeOutraEscola(req, resourceEscolaId) {
  if (!mesmaEscola(req, resourceEscolaId)) {
    throw new TenantError(403, 'Acesso negado a dados de outra escola');
  }
}

/** Carrega turma da escola do usuário (ou 404). */
async function assertTurmaEscola(req, turmaId, options = {}) {
  if (!turmaId) throw new TenantError(400, 'Turma não informada');

  let query = Turma.findOne({ _id: turmaId, ...filtroEscola(req) });
  if (options.populate) query = query.populate(options.populate);
  if (options.select) query = query.select(options.select);

  const turma = await query;
  if (!turma) throw new TenantError(404, 'Turma não encontrada');
  return turma;
}

/**
 * Carrega usuário da mesma escola.
 * Acesso ao próprio perfil sempre permitido.
 */
async function assertUsuarioEscola(req, usuarioId, options = {}) {
  if (!usuarioId) throw new TenantError(400, 'Usuário não informado');

  if (idsIguais(req.usuario._id, usuarioId)) {
    let q = Usuario.findById(usuarioId);
    if (options.select) q = q.select(options.select);
    if (options.populate) q = q.populate(options.populate);
    const self = await q;
    if (!self) throw new TenantError(404, 'Usuário não encontrado');
    return self;
  }

  let query = Usuario.findOne({ _id: usuarioId, ...filtroEscola(req) });
  if (options.select) query = query.select(options.select);
  if (options.populate) query = query.populate(options.populate);

  const usuario = await query;
  if (!usuario) throw new TenantError(404, 'Usuário não encontrado');
  return usuario;
}

/** Aluno da mesma escola; aluno só acessa a si mesmo; responsável só filhos vinculados. */
async function assertAlunoEscola(req, alunoId, options = {}) {
  if (req.usuario.tipo === 'aluno' && !idsIguais(req.usuario._id, alunoId)) {
    throw new TenantError(403, 'Acesso negado');
  }

  if (req.usuario.tipo === 'responsavel') {
    const { Responsavel } = require('../database/schema');
    const vinculo = await Responsavel.findOne({
      usuario_id: req.usuario._id,
      aluno_id: alunoId
    }).select('_id');
    if (!vinculo) {
      throw new TenantError(403, 'Acesso negado a este aluno');
    }
  }

  // Garante que `tipo` venha no documento mesmo com select customizado
  const opts = { ...options };
  if (opts.select && !String(opts.select).includes('tipo')) {
    opts.select = `${opts.select} tipo`.trim();
  }

  const aluno = await assertUsuarioEscola(req, alunoId, opts);
  if (aluno.tipo !== 'aluno' && !idsIguais(req.usuario._id, alunoId)) {
    throw new TenantError(404, 'Aluno não encontrado');
  }
  return aluno;
}

/** Valida que aluno_id está na turma e a turma é da escola. */
async function assertAlunoNaTurma(req, turmaId, alunoId) {
  const turma = await assertTurmaEscola(req, turmaId);
  const ids = (turma.alunos || []).map(a => String(a._id || a));
  if (!ids.includes(String(alunoId))) {
    throw new TenantError(400, 'Aluno não pertence a esta turma');
  }
  await assertAlunoEscola(req, alunoId);
  return turma;
}

/** Responde 403/404 de TenantError; retorna true se tratou. */
function responderErroTenant(res, error) {
  if (error instanceof TenantError || error?.status) {
    res.status(error.status || 403).json({
      sucesso: false,
      mensagem: error.mensagem || error.message || 'Acesso negado'
    });
    return true;
  }
  return false;
}

/** IDs das turmas da escola do usuário (para filtrar Presenca/Avaliacao/Desempenho). */
async function idsTurmasDaEscola(req) {
  const turmas = await Turma.find(filtroEscola(req)).select('_id');
  return turmas.map(t => t._id);
}

module.exports = {
  TenantError,
  idsIguais,
  escolaIdDoUsuario,
  filtroEscola,
  mesmaEscola,
  negarSeOutraEscola,
  assertTurmaEscola,
  assertUsuarioEscola,
  assertAlunoEscola,
  assertAlunoNaTurma,
  responderErroTenant,
  idsTurmasDaEscola
};
