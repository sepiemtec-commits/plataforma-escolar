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

module.exports = {
  BACKUP_ROOT,
  gerarBackupEscola,
  obterConfigBackup,
  salvarConfigBackup,
  listarBackups,
  obterBackupDaEscola,
  resolverCaminhoBackup
};
