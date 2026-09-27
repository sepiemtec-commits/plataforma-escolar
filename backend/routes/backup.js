// backend/routes/backup.js — backup da escola (diretor / secretaria)
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  gerarBackupEscola,
  obterConfigBackup,
  salvarConfigBackup,
  listarBackups,
  obterBackupDaEscola,
  resolverCaminhoBackup,
  restaurarBackupArquivo,
  restaurarBackupRegistro
} = require('../services/backupEscola');

const rolesBackup = ['diretor', 'secretaria', 'admin'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const nome = String(file.originalname || '').toLowerCase();
    if (nome.endsWith('.json') || nome.endsWith('.json.gz') || nome.endsWith('.gz')) {
      cb(null, true);
      return;
    }
    cb(new Error('Envie o arquivo .json.gz gerado pelo VEHO'));
  }
});

router.get('/config', autenticacao, verificarRole(...rolesBackup), requerEscola, async (req, res) => {
  try {
    const config = await obterConfigBackup(req.usuario.escola_id);
    res.json({ sucesso: true, config });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar config de backup' });
  }
});

router.put('/config', autenticacao, verificarRole(...rolesBackup), requerEscola, async (req, res) => {
  try {
    const config = await salvarConfigBackup(req.usuario.escola_id, req.body || {});
    res.json({ sucesso: true, config, mensagem: 'Configuração de backup salva' });
  } catch (error) {
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao salvar config de backup'
    });
  }
});

router.get('/lista', autenticacao, verificarRole(...rolesBackup), requerEscola, async (req, res) => {
  try {
    const backups = await listarBackups(req.usuario.escola_id);
    res.json({ sucesso: true, backups });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar backups' });
  }
});

router.post('/gerar', autenticacao, verificarRole(...rolesBackup), requerEscola, async (req, res) => {
  try {
    const enviarDrive = req.body?.enviarDrive !== false;
    const resultado = await gerarBackupEscola({
      escolaId: req.usuario.escola_id,
      usuarioId: req.usuario._id,
      enviarDrive
    });
    res.status(201).json({
      sucesso: true,
      ...resultado,
      mensagem: resultado.drive?.enviado
        ? 'Backup gerado e enviado ao Google Drive.'
        : 'Backup gerado (arquivo .json.gz). Você pode baixar agora.'
    });
  } catch (error) {
    console.error('Erro backup:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao gerar backup'
    });
  }
});

router.post(
  '/restaurar',
  autenticacao,
  verificarRole(...rolesBackup),
  requerEscola,
  (req, res, next) => {
    upload.single('arquivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ sucesso: false, mensagem: err.message || 'Upload inválido' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ sucesso: false, mensagem: 'Envie o arquivo de backup (.json.gz)' });
      }
      const resultado = await restaurarBackupArquivo({
        escolaId: req.usuario.escola_id,
        usuarioId: req.usuario._id,
        buffer: req.file.buffer,
        nomeArquivo: req.file.originalname
      });
      res.json({
        sucesso: true,
        ...resultado,
        mensagem:
          'Backup restaurado nesta escola. Usuários novos receberam senha temporária (peça redefinição).'
      });
    } catch (error) {
      console.error('Erro restaurar backup:', error);
      res.status(error.status || 500).json({
        sucesso: false,
        mensagem: error.message || 'Erro ao restaurar backup'
      });
    }
  }
);

router.post(
  '/:id/restaurar',
  autenticacao,
  verificarRole(...rolesBackup),
  requerEscola,
  async (req, res) => {
    try {
      const resultado = await restaurarBackupRegistro({
        escolaId: req.usuario.escola_id,
        usuarioId: req.usuario._id,
        backupId: req.params.id
      });
      res.json({
        sucesso: true,
        ...resultado,
        mensagem: 'Backup do servidor restaurado nesta escola.'
      });
    } catch (error) {
      console.error('Erro restaurar backup id:', error);
      res.status(error.status || 500).json({
        sucesso: false,
        mensagem: error.message || 'Erro ao restaurar backup'
      });
    }
  }
);

router.get('/:id/download', autenticacao, verificarRole(...rolesBackup), requerEscola, async (req, res) => {
  try {
    const registro = await obterBackupDaEscola(req.params.id, req.usuario.escola_id);
    if (!registro) {
      return res.status(404).json({ sucesso: false, mensagem: 'Backup não encontrado' });
    }
    const caminho = resolverCaminhoBackup(registro);
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ sucesso: false, mensagem: 'Arquivo de backup não encontrado no servidor' });
    }
    res.download(caminho, registro.nomeArquivo);
  } catch (error) {
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro no download do backup'
    });
  }
});

module.exports = router;
