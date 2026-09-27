// backend/services/backupEscola.js — exportação dos dados da escola (tenant)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const {
  Escola,
  Usuario,
  Turma,
  Presenca,
  Avaliacao,
  Desempenho,
  Conteudo,
  DisciplinaConfig,
  HistoricoEscolar,
  DocumentoArquivo,
  DeclaracaoCurso,
  ParecerIA,
  HorarioAula,
  HtpcReuniao,
  Pei,
  ItemAvaliacao,
  Simulado,
  RespostaSimulado,
  Responsavel,
  BackupEscola,
  Log
} = require('../database/schema');
const { extrairFolderId, uploadArquivoDrive, driveConfigurado, emailContaServico } =
  require('../utils/googleDrive');
const { assertPathInsideRoot } = require('../utils/safePath');

const BACKUP_ROOT = path.join(__dirname, '../../private/backups');

function garantirDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function coletarDadosEscola(escolaId) {
  const filtro = { escola_id: escolaId };
  const [escola, usuarios, turmas] = await Promise.all([
    Escola.findById(escolaId).lean(),
    Usuario.find(filtro).select('-senha').lean(),
    Turma.find(filtro).lean()
  ]);

  const turmaIds = turmas.map((t) => t._id);
  const alunoIds = usuarios.filter((u) => u.tipo === 'aluno').map((u) => u._id);
  const filtroTurma = { turma_id: { $in: turmaIds } };
  const filtroAluno = { aluno_id: { $in: alunoIds } };

  const [
    presencas,
    avaliacoes,
    desempenhos,
    conteudos,
    disciplinas,
    historicos,
    documentos,
    declaracoes,
    pareceres,
    horarios,
    htpc,
    peis,
    itens,
    simulados,
    respostas,
    responsaveis
  ] = await Promise.all([
    turmaIds.length ? Presenca.find(filtroTurma).lean() : [],
    turmaIds.length ? Avaliacao.find(filtroTurma).lean() : [],
    turmaIds.length ? Desempenho.find(filtroTurma).lean() : [],
    turmaIds.length ? Conteudo.find(filtroTurma).lean() : [],
    DisciplinaConfig.find(filtro).lean(),
    HistoricoEscolar.find(filtro).lean(),
    DocumentoArquivo.find(filtro).lean(),
    DeclaracaoCurso.find(filtro).lean(),
    ParecerIA.find(filtro).lean(),
    HorarioAula.find(filtro).lean(),
    HtpcReuniao.find(filtro).lean(),
    Pei.find(filtro).lean(),
    ItemAvaliacao.find({ $or: [filtro, { escola_id: null }] }).lean(),
    Simulado.find(filtro).lean(),
    RespostaSimulado.find(filtro).lean(),
    alunoIds.length ? Responsavel.find(filtroAluno).lean() : []
  ]);

  const pacote = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    escola_id: String(escolaId),
    escola,
    colecoes: {
      usuarios,
      turmas,
      presencas,
      avaliacoes,
      desempenhos,
      conteudos,
      disciplinas,
      historicos,
      documentosMeta: documentos,
      declaracoes,
      pareceres,
      horarios,
      htpc,
      peis,
      itensAvaliacao: itens,
      simulados,
      respostasSimulado: respostas,
      responsaveis
    }
  };

  const registros = Object.values(pacote.colecoes).reduce(
    (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
    escola ? 1 : 0
  );

  return {
    pacote,
    colecoes: Object.keys(pacote.colecoes).length + 1,
    registros
  };
}

async function gerarBackupEscola({ escolaId, usuarioId, enviarDrive = true }) {
  const escola = await Escola.findById(escolaId);
  if (!escola) {
    const err = new Error('Escola não encontrada');
    err.status = 404;
    throw err;
  }

  const { pacote, colecoes, registros } = await coletarDadosEscola(escolaId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nomeArquivo = `veho-backup-${String(escolaId).slice(-6)}-${stamp}.json.gz`;
  const dirEscola = path.join(BACKUP_ROOT, String(escolaId));
  garantirDir(dirEscola);
  const caminhoAbs = path.join(dirEscola, nomeArquivo);
  const json = JSON.stringify(pacote);
  const gzip = zlib.gzipSync(Buffer.from(json, 'utf8'));
  fs.writeFileSync(caminhoAbs, gzip);

  const caminhoRel = path.relative(path.join(__dirname, '../..'), caminhoAbs);

  let driveResult = { enviado: false };
  const folderId =
    escola.configuracao?.backup?.driveFolderId ||
    extrairFolderId(escola.configuracao?.backup?.driveFolderUrl);

  if (enviarDrive) {
    if (!folderId) {
      driveResult = {
        enviado: false,
        erro: 'Cadastre o link da pasta do Google Drive antes de enviar.'
      };
    } else if (!driveConfigurado()) {
      driveResult = {
        enviado: false,
        erro: 'Envio ao Drive indisponível no servidor. O arquivo local foi gerado para download. Peça à VEHO para configurar a conta de serviço Google.'
      };
    } else {
      driveResult = await uploadArquivoDrive({
        folderId,
        nomeArquivo,
        buffer: gzip,
        mimeType: 'application/gzip'
      });
    }
  }

  const registro = await BackupEscola.create({
    escola_id: escolaId,
    geradoPor: usuarioId,
    nomeArquivo,
    caminho: caminhoRel,
    tamanhoBytes: gzip.length,
    colecoes,
    registros,
    drive: {
      enviado: Boolean(driveResult.enviado),
      fileId: driveResult.fileId || '',
      webViewLink: driveResult.webViewLink || '',
      erro: driveResult.erro || ''
    }
  });

  if (!escola.configuracao) escola.configuracao = {};
  if (!escola.configuracao.backup) escola.configuracao.backup = {};
  escola.configuracao.backup.ultimoBackupEm = new Date();
  escola.configuracao.backup.ultimoBackupPor = usuarioId;
  if (driveResult.enviado) {
    escola.configuracao.backup.ultimoDriveFileId = driveResult.fileId || '';
    escola.configuracao.backup.ultimoDriveWebViewLink = driveResult.webViewLink || '';
  }
  escola.markModified('configuracao');
  await escola.save();

  await Log.create({
    usuario_id: usuarioId,
    acao: 'GEROU_BACKUP',
    modulo: 'backup',
    descricao: `Backup ${nomeArquivo} (${registros} registros)` +
      (driveResult.enviado ? ' + Drive' : ''),
    ipAddress: null
  });

  return {
    backup: registro.toObject(),
    downloadPath: `/api/backup/${registro._id}/download`,
    drive: driveResult,
    drivePronto: driveConfigurado(),
    emailContaServico: emailContaServico()
  };
}

function resolverCaminhoBackup(registro) {
  const abs = path.isAbsolute(registro.caminho)
    ? registro.caminho
    : path.join(__dirname, '../..', registro.caminho);
  return assertPathInsideRoot(BACKUP_ROOT, abs);
}

async function obterConfigBackup(escolaId) {
  const escola = await Escola.findById(escolaId).select('nome configuracao.backup').lean();
  const b = escola?.configuracao?.backup || {};
  return {
    escola: escola?.nome,
    driveFolderUrl: b.driveFolderUrl || '',
    driveFolderId: b.driveFolderId || '',
    ultimoBackupEm: b.ultimoBackupEm || null,
    ultimoDriveWebViewLink: b.ultimoDriveWebViewLink || '',
    driveProntoNoServidor: driveConfigurado(),
    emailContaServico: emailContaServico()
  };
}

async function salvarConfigBackup(escolaId, { driveFolderUrl }) {
  const escola = await Escola.findById(escolaId);
  if (!escola) {
    const err = new Error('Escola não encontrada');
    err.status = 404;
    throw err;
  }
  const url = String(driveFolderUrl || '').trim();
  const folderId = extrairFolderId(url);
  if (url && !folderId) {
    const err = new Error('Link da pasta do Drive inválido. Use o link completo da pasta.');
    err.status = 400;
    throw err;
  }
  if (!escola.configuracao) escola.configuracao = {};
  if (!escola.configuracao.backup) escola.configuracao.backup = {};
  escola.configuracao.backup.driveFolderUrl = url;
  escola.configuracao.backup.driveFolderId = folderId;
  escola.markModified('configuracao');
  await escola.save();
  return obterConfigBackup(escolaId);
}

async function listarBackups(escolaId, limite = 20) {
  return BackupEscola.find({ escola_id: escolaId })
    .sort({ dataCriacao: -1 })
    .limit(limite)
    .populate('geradoPor', 'nome')
    .lean();
}

async function obterBackupDaEscola(backupId, escolaId) {
  if (!mongoose.Types.ObjectId.isValid(backupId)) return null;
  return BackupEscola.findOne({ _id: backupId, escola_id: escolaId });
}

function limparDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const out = { ...doc };
  delete out.__v;
  return out;
}

function mesmoTenant(docEscolaId, escolaId) {
  if (docEscolaId == null) return true; // coleções sem escola_id (notas/presença) validadas por IDs
  return String(docEscolaId) === String(escolaId);
}

async function upsertPorId(Model, docs, { escolaId, exigirEscolaId = false } = {}) {
  let upserts = 0;
  let ignorados = 0;
  const ops = [];
  for (const raw of docs || []) {
    const doc = limparDoc(raw);
    if (!doc?._id) {
      ignorados += 1;
      continue;
    }
    if (exigirEscolaId && !mesmoTenant(doc.escola_id, escolaId)) {
      ignorados += 1;
      continue;
    }
    if (doc.escola_id != null) doc.escola_id = escolaId;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true
      }
    });
  }
  if (ops.length) {
    const res = await Model.bulkWrite(ops, { ordered: false });
    upserts = (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0);
  }
  return { upserts, ignorados, total: (docs || []).length };
}

async function restaurarUsuarios(docs, escolaId) {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const raw of docs || []) {
    const doc = limparDoc(raw);
    if (!doc?._id || !mesmoTenant(doc.escola_id, escolaId)) {
      ignorados += 1;
      continue;
    }
    doc.escola_id = escolaId;
    delete doc.senha;

    const existente = await Usuario.findById(doc._id).select('_id');
    if (existente) {
      await Usuario.updateOne({ _id: doc._id }, { $set: doc });
      atualizados += 1;
    } else {
      const senhaTemp = crypto.randomBytes(9).toString('base64url');
      doc.senha = await bcrypt.hash(senhaTemp, 10);
      await Usuario.create(doc);
      criados += 1;
    }
  }
  return { criados, atualizados, ignorados, total: (docs || []).length };
}

function parsePacoteBackup(buffer, nomeArquivo = '') {
  let raw = buffer;
  const nome = String(nomeArquivo || '').toLowerCase();
  const isGzip =
    nome.endsWith('.gz') ||
    (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);

  if (isGzip) {
    raw = zlib.gunzipSync(buffer);
  }
  const texto = raw.toString('utf8').trim();
  let pacote;
  try {
    pacote = JSON.parse(texto);
  } catch {
    const err = new Error(
      'Arquivo inválido. Use o .json.gz gerado pelo VEHO (não é CSV).'
    );
    err.status = 400;
    throw err;
  }
  if (!pacote || pacote.versao == null || !pacote.colecoes) {
    const err = new Error('Este arquivo não é um backup VEHO válido.');
    err.status = 400;
    throw err;
  }
  return pacote;
}

/**
 * Restaura dados do pacote na escola logada (mesmo escola_id).
 * Não altera senhas de usuários existentes; usuários novos recebem senha temporária.
 */
async function restaurarBackupEscola({ escolaId, usuarioId, pacote }) {
  if (String(pacote.escola_id) !== String(escolaId)) {
    const err = new Error(
      'Este backup pertence a outra escola e não pode ser restaurado aqui.'
    );
    err.status = 403;
    throw err;
  }

  const c = pacote.colecoes || {};
  const resumo = {};

  resumo.usuarios = await restaurarUsuarios(c.usuarios, escolaId);
  resumo.turmas = await upsertPorId(Turma, c.turmas, { escolaId, exigirEscolaId: true });
  resumo.disciplinas = await upsertPorId(DisciplinaConfig, c.disciplinas, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.presencas = await upsertPorId(Presenca, c.presencas, { escolaId });
  resumo.avaliacoes = await upsertPorId(Avaliacao, c.avaliacoes, { escolaId });
  resumo.desempenhos = await upsertPorId(Desempenho, c.desempenhos, { escolaId });
  resumo.conteudos = await upsertPorId(Conteudo, c.conteudos, { escolaId });
  resumo.historicos = await upsertPorId(HistoricoEscolar, c.historicos, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.documentosMeta = await upsertPorId(DocumentoArquivo, c.documentosMeta, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.declaracoes = await upsertPorId(DeclaracaoCurso, c.declaracoes, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.pareceres = await upsertPorId(ParecerIA, c.pareceres, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.horarios = await upsertPorId(HorarioAula, c.horarios, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.htpc = await upsertPorId(HtpcReuniao, c.htpc, { escolaId, exigirEscolaId: true });
  resumo.peis = await upsertPorId(Pei, c.peis, { escolaId, exigirEscolaId: true });
  resumo.itensAvaliacao = await upsertPorId(ItemAvaliacao, c.itensAvaliacao, { escolaId });
  resumo.simulados = await upsertPorId(Simulado, c.simulados, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.respostasSimulado = await upsertPorId(RespostaSimulado, c.respostasSimulado, {
    escolaId,
    exigirEscolaId: true
  });
  resumo.responsaveis = await upsertPorId(Responsavel, c.responsaveis, { escolaId });

  // Metadados da escola (nome/contato) — não sobrescreve assinatura Stripe
  if (pacote.escola && String(pacote.escola._id) === String(escolaId)) {
    const e = limparDoc(pacote.escola);
    delete e.assinatura;
    delete e._id;
    await Escola.updateOne(
      { _id: escolaId },
      {
        $set: {
          ...(e.nome ? { nome: e.nome } : {}),
          ...(e.cnpj ? { cnpj: e.cnpj } : {}),
          ...(e.endereco != null ? { endereco: e.endereco } : {}),
          ...(e.telefone != null ? { telefone: e.telefone } : {}),
          ...(e.email != null ? { email: e.email } : {}),
          ...(e.configuracao ? { configuracao: e.configuracao } : {})
        }
      }
    );
    resumo.escola = { atualizada: true };
  }

  await Log.create({
    usuario_id: usuarioId,
    acao: 'RESTAUROU_BACKUP',
    modulo: 'backup',
    descricao: `Restauração do backup gerado em ${pacote.geradoEm || 'n/d'}`,
    ipAddress: null
  });

  return {
    geradoEm: pacote.geradoEm || null,
    versao: pacote.versao,
    resumo
  };
}

async function restaurarBackupArquivo({ escolaId, usuarioId, buffer, nomeArquivo }) {
  const pacote = parsePacoteBackup(buffer, nomeArquivo);
  return restaurarBackupEscola({ escolaId, usuarioId, pacote });
}

async function restaurarBackupRegistro({ escolaId, usuarioId, backupId }) {
  const registro = await obterBackupDaEscola(backupId, escolaId);
  if (!registro) {
    const err = new Error('Backup não encontrado');
    err.status = 404;
    throw err;
  }
  const caminho = resolverCaminhoBackup(registro);
  if (!fs.existsSync(caminho)) {
    const err = new Error('Arquivo de backup não encontrado no servidor');
    err.status = 404;
    throw err;
  }
  const buffer = fs.readFileSync(caminho);
  return restaurarBackupArquivo({
    escolaId,
    usuarioId,
    buffer,
    nomeArquivo: registro.nomeArquivo
  });
}

module.exports = {
  BACKUP_ROOT,
  gerarBackupEscola,
  obterConfigBackup,
  salvarConfigBackup,
  listarBackups,
  obterBackupDaEscola,
  resolverCaminhoBackup,
  parsePacoteBackup,
  restaurarBackupEscola,
  restaurarBackupArquivo,
  restaurarBackupRegistro
};
