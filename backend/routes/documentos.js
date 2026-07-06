const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { DocumentoArquivo, Usuario, Log } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const {
  LABELS,
  tiposPorCategoria,
  categoriaPorTipoUsuario
} = require('../constants/documentos');

const rolesGestao = ['secretaria', 'diretor', 'admin'];
const UPLOAD_ROOT = path.join(__dirname, '../../uploads/documentos');
const MAX_SIZE = 5 * 1024 * 1024;
const TIPOS_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, String(req.usuario.escola_id || 'geral'), String(req.params.usuarioId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = `${req.body.tipo}_${Date.now()}${ext}`;
    cb(null, base);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter(req, file, cb) {
    if (TIPOS_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato não permitido. Use PDF, JPG ou PNG.'));
    }
  }
});

async function obterUsuarioEscola(usuarioId, escolaId) {
  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) return null;
  if (escolaId && usuario.escola_id && String(usuario.escola_id) !== String(escolaId)) {
    return null;
  }
  return usuario;
}

router.get('/tipos/:categoria', autenticacao, verificarRole(...rolesGestao), (req, res) => {
  const tipos = tiposPorCategoria(req.params.categoria);
  res.json({
    sucesso: true,
    tipos: tipos.map(t => ({ id: t, label: LABELS[t] || t }))
  });
});

router.get('/usuario/:usuarioId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const usuario = await obterUsuarioEscola(req.params.usuarioId, req.usuario.escola_id);
    if (!usuario) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    const documentos = await DocumentoArquivo.find({ usuario_id: usuario._id })
      .sort({ tipo: 1, dataUpload: -1 });

    const categoria = categoriaPorTipoUsuario(usuario.tipo);
    const tiposEsperados = tiposPorCategoria(categoria);

    res.json({
      sucesso: true,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        tipo: usuario.tipo,
        categoria
      },
      documentos: documentos.map(d => ({
        _id: d._id,
        tipo: d.tipo,
        label: LABELS[d.tipo] || d.tipo,
        nomeOriginal: d.nomeOriginal,
        tamanho: d.tamanho,
        dataUpload: d.dataUpload
      })),
      tiposEsperados: tiposEsperados.map(t => ({ id: t, label: LABELS[t] || t }))
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar documentos' });
  }
});

router.post('/usuario/:usuarioId', autenticacao, verificarRole(...rolesGestao), upload.single('arquivo'), async (req, res) => {
  try {
    const usuario = await obterUsuarioEscola(req.params.usuarioId, req.usuario.escola_id);
    if (!usuario) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado' });
    }

    const { tipo } = req.body;
    const categoria = categoriaPorTipoUsuario(usuario.tipo);
    const tiposValidos = tiposPorCategoria(categoria);

    if (!tipo || !tiposValidos.includes(tipo)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ sucesso: false, mensagem: 'Tipo de documento inválido' });
    }

    if (!req.file) {
      return res.status(400).json({ sucesso: false, mensagem: 'Arquivo não enviado' });
    }

    const anterior = await DocumentoArquivo.findOne({ usuario_id: usuario._id, tipo });
    if (anterior && fs.existsSync(anterior.caminho)) {
      fs.unlinkSync(anterior.caminho);
      await DocumentoArquivo.findByIdAndDelete(anterior._id);
    }

    const documento = await DocumentoArquivo.create({
      usuario_id: usuario._id,
      escola_id: req.usuario.escola_id,
      categoria,
      tipo,
      nomeOriginal: req.file.originalname,
      nomeArquivo: req.file.filename,
      mimeType: req.file.mimetype,
      tamanho: req.file.size,
      caminho: req.file.path,
      enviadoPor: req.usuario._id
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'UPLOAD_DOCUMENTO',
      modulo: 'documentos',
      descricao: `${LABELS[tipo] || tipo} — ${usuario.nome}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Documento arquivado com sucesso',
      documento: {
        _id: documento._id,
        tipo: documento.tipo,
        label: LABELS[documento.tipo],
        nomeOriginal: documento.nomeOriginal,
        dataUpload: documento.dataUpload
      }
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ sucesso: false, mensagem: error.message || 'Erro ao enviar documento' });
  }
});

router.get('/:documentoId/download', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const documento = await DocumentoArquivo.findById(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ sucesso: false, mensagem: 'Documento não encontrado' });
    }

    if (req.usuario.escola_id && documento.escola_id &&
        String(documento.escola_id) !== String(req.usuario.escola_id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }

    if (!fs.existsSync(documento.caminho)) {
      return res.status(404).json({ sucesso: false, mensagem: 'Arquivo não encontrado no servidor' });
    }

    res.download(documento.caminho, documento.nomeOriginal);
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao baixar documento' });
  }
});

router.delete('/:documentoId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const documento = await DocumentoArquivo.findById(req.params.documentoId);
    if (!documento) {
      return res.status(404).json({ sucesso: false, mensagem: 'Documento não encontrado' });
    }

    if (req.usuario.escola_id && documento.escola_id &&
        String(documento.escola_id) !== String(req.usuario.escola_id)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }

    if (fs.existsSync(documento.caminho)) fs.unlinkSync(documento.caminho);
    await DocumentoArquivo.findByIdAndDelete(documento._id);

    res.json({ sucesso: true, mensagem: 'Documento removido' });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover documento' });
  }
});

// Error handler for multer in documentos router
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ sucesso: false, mensagem: 'Arquivo muito grande. Máximo 5 MB.' });
    }
  }
  if (err) {
    return res.status(400).json({ sucesso: false, mensagem: err.message });
  }
  next();
});

module.exports = router;
