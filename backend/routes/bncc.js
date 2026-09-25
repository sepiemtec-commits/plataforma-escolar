// backend/routes/bncc.js — catálogo BNCC embarcado
const express = require('express');
const router = express.Router();
const { BnccItem } = require('../database/schema');
const { autenticacao } = require('../middleware/autenticacao');
const { escapeRegex } = require('../utils/safePath');

router.get('/', autenticacao, async (req, res) => {
  try {
    const { q, area, ano, eixo, fonte, limit } = req.query;
    const filtro = {};

    if (area) filtro.area = String(area).toLowerCase();
    if (ano) filtro.ano = String(ano);
    if (eixo) filtro.eixo = new RegExp(escapeRegex(String(eixo)), 'i');
    if (fonte) filtro.fonte = fonte;

    if (q && String(q).trim()) {
      const termo = escapeRegex(String(q).trim());
      filtro.$or = [
        { codigo: new RegExp(termo, 'i') },
        { descricao: new RegExp(termo, 'i') },
        { eixo: new RegExp(termo, 'i') }
      ];
    }

    const lim = Math.min(Number(limit) || 80, 200);
    const itens = await BnccItem.find(filtro)
      .sort({ area: 1, ano: 1, codigo: 1 })
      .limit(lim)
      .lean();

    res.json({ sucesso: true, total: itens.length, itens });
  } catch (error) {
    console.error('Erro busca BNCC:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar BNCC' });
  }
});

router.get('/:codigo', autenticacao, async (req, res) => {
  try {
    const item = await BnccItem.findOne({
      codigo: String(req.params.codigo).toUpperCase()
    }).lean();

    if (!item) {
      return res.status(404).json({ sucesso: false, mensagem: 'Código BNCC não encontrado' });
    }
    res.json({ sucesso: true, item });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar código BNCC' });
  }
});

module.exports = router;
