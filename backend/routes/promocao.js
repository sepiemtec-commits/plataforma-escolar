const express = require('express');
const router = express.Router();
const { DeclaracaoCurso } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const { previewPromocao, executarPromocao } = require('../services/promocao');
const { formatarDeclaracaoHtml } = require('../services/declaracao');
const {
  filtroEscola,
  assertAlunoEscola,
  responderErroTenant
} = require('../utils/tenant');

const rolesGestao = ['admin', 'diretor', 'coordenador', 'secretaria'];

router.get('/preview', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    if (!req.usuario.escola_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'Escola não identificada' });
    }
    const preview = await previewPromocao(req.usuario.escola_id, req.query.turma_id || null);
    res.json({ sucesso: true, preview });
  } catch (error) {
    console.error(error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao simular promoção' });
  }
});

router.post('/executar', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    if (!req.usuario.escola_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'Escola não identificada' });
    }
    const resultado = await executarPromocao(
      req.usuario.escola_id,
      req.body.turma_id || null,
      req.usuario._id,
      req.ip
    );
    res.json({
      sucesso: true,
      mensagem: `Promoção concluída: ${resultado.promovidos} aluno(s) promovido(s)`,
      resultado
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao executar promoção' });
  }
});

router.get('/declaracoes/aluno/:alunoId', autenticacao, async (req, res) => {
  try {
    await assertAlunoEscola(req, req.params.alunoId);
    const declaracoes = await DeclaracaoCurso.find({
      aluno_id: req.params.alunoId,
      ...filtroEscola(req)
    }).sort({ anoLetivo: -1 });
    res.json({ sucesso: true, declaracoes });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar declarações' });
  }
});

router.get('/declaracao/:declaracaoId', autenticacao, async (req, res) => {
  try {
    const decl = await DeclaracaoCurso.findOne({
      _id: req.params.declaracaoId,
      ...filtroEscola(req)
    }).populate('aluno_id', 'nome cpf');
    if (!decl) {
      return res.status(404).json({ sucesso: false, mensagem: 'Declaração não encontrada' });
    }
    res.json({
      sucesso: true,
      declaracao: decl,
      html: formatarDeclaracaoHtml(decl)
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar declaração' });
  }
});

router.get('/verificar/:codigo', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    const decl = await DeclaracaoCurso.findOne({
      codigoVerificacao: req.params.codigo.toUpperCase(),
      ...filtroEscola(req)
    }).populate('aluno_id', 'nome');
    if (!decl) {
      return res.status(404).json({ sucesso: false, mensagem: 'Código de verificação inválido' });
    }
    res.json({
      sucesso: true,
      valido: true,
      aluno: decl.aluno_id?.nome,
      anoLetivo: decl.anoLetivo,
      resultado: decl.resultado,
      instituicao: decl.assinatura.instituicao,
      dataEmissao: decl.dataEmissao,
      hashDocumento: decl.assinatura.hashDocumento
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro na verificação' });
  }
});

module.exports = router;
