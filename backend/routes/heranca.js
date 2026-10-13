// Importação de dados de outra plataforma (secretaria / direção).
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { importarHeranca } = require('../services/herancaDados');
const { obterSenhaSeed } = require('../utils/senhaPadrao');
const crypto = require('crypto');

const roles = ['diretor', 'secretaria', 'admin'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function senhaInicial() {
  try {
    return obterSenhaSeed();
  } catch (_) {
    return crypto.randomBytes(18).toString('base64url');
  }
}

router.post(
  '/importar',
  autenticacao,
  verificarRole(...roles),
  requerEscola,
  (req, res, next) => {
    upload.single('arquivo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          sucesso: false,
          mensagem: err.code === 'LIMIT_FILE_SIZE'
            ? 'O arquivo passa de 15 MB. Divida a planilha e envie de novo.'
            : (err.message || 'Não foi possível receber o arquivo.')
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ sucesso: false, mensagem: 'Escolha o arquivo exportado pela outra plataforma.' });
      }
      const resultado = await importarHeranca({
        escolaId: req.usuario.escola_id,
        buffer: req.file.buffer,
        nomeArquivo: req.file.originalname,
        senhaInicial: senhaInicial()
      });
      const mensagem = resultado.lidos
        ? `Herança concluída: ${resultado.criados} aluno(s) novo(s), ${resultado.atualizados} atualizado(s).`
        : 'O arquivo foi recebido, mas nenhuma linha de aluno foi reconhecida.';
      res.json({ ...resultado, mensagem });
    } catch (erro) {
      console.error('Erro herança:', erro);
      res.status(500).json({
        sucesso: false,
        mensagem: 'A importação parou por uma falha interna. O arquivo não foi aplicado por completo. Tente de novo ou envie em XLS/CSV.'
      });
    }
  }
);

module.exports = router;
