// backend/routes/backup.js — backup da escola (diretor / secretaria)
const express = require('express');
const fs = require('fs');
const router = express.Router();
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  gerarBackupEscola,
  obterConfigBackup,
  salvarConfigBackup,
  listarBackups,
  obterBackupDaEscola,
  resolverCaminhoBackup
} = require('../services/backupEscola');

const rolesBackup = ['diretor', 'secretaria', 'admin'];

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
    const config = await salvarConfigBackup(req.usuario.escola_id, {
      driveFolderUrl: req.body?.driveFolderUrl
    });
    res.json({ sucesso: true, config, mensagem: 'Pasta do Drive salva' });
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
        : 'Backup gerado. Você pode baixar o arquivo agora.'
    });
  } catch (error) {
    console.error('Erro backup:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao gerar backup'
    });
  }
});

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
