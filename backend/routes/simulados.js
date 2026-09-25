// backend/routes/simulados.js — Banco de itens + simulados SAEB/SARESP
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const {
  ItemAvaliacao,
  Simulado,
  RespostaSimulado,
  Turma,
  Log
} = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  assertTurmaEscola,
  assertAlunoEscola,
  responderErroTenant
} = require('../utils/tenant');
const {
  escapeRegex,
  extensaoPermitida,
  EXT_IMAGEM_OK
} = require('../utils/safePath');

const rolesDocente = ['professor', 'coordenador', 'diretor', 'admin'];
const rolesGestao = ['coordenador', 'diretor', 'admin'];

function janelaProvaAberta(simulado, agora = new Date()) {
  if (simulado.dataInicio && agora < new Date(simulado.dataInicio)) return false;
  if (simulado.dataFim && agora > new Date(simulado.dataFim)) return false;
  if (['encerrado', 'rascunho'].includes(simulado.status)) return false;
  return true;
}

function stripGabaritoItens(itens) {
  return (itens || []).map((it) => {
    const obj = typeof it.toObject === 'function' ? it.toObject() : { ...it };
    delete obj.gabarito;
    return obj;
  });
}

async function turmasDoAluno(alunoId, escolaId) {
  return Turma.find({ escola_id: escolaId, alunos: alunoId }).select('_id nome serie').lean();
}

function corrigirRespostas(itens, respostasIn) {
  const mapaGabarito = {};
  (itens || []).forEach((it) => {
    mapaGabarito[String(it._id)] = String(it.gabarito || '').toUpperCase();
  });
  const respostas = (respostasIn || []).map((r) => {
    const itemId = String(r.item_id);
    const alt = String(r.alternativa || '').toUpperCase();
    const gab = mapaGabarito[itemId];
    return {
      item_id: r.item_id,
      alternativa: alt,
      correta: gab ? alt === gab : false
    };
  });
  const total = Object.keys(mapaGabarito).length || respostas.length;
  const acertos = respostas.filter((r) => r.correta).length;
  const percentual = total ? Math.round((acertos / total) * 1000) / 10 : 0;
  return { respostas, acertos, total, percentual };
}

async function atualizarMediaSimulado(simulado) {
  const todas = await RespostaSimulado.find({
    simulado_id: simulado._id,
    statusProva: { $in: ['enviada', 'expirada'] }
  }).lean();
  const comNota = todas.filter((r) => r.corrigidoEm);
  const mediaEscola = comNota.length
    ? Math.round((comNota.reduce((s, r) => s + (r.percentual || 0), 0) / comNota.length) * 10) / 10
    : null;
  simulado.mediaEscola = mediaEscola;
  simulado.totalRespostas = comNota.length;
  simulado.dataAtualizacao = new Date();
  await simulado.save();
  return { mediaEscola, totalRespostas: comNota.length };
}

const UPLOAD_ITENS = path.join(__dirname, '../../uploads/itens');
if (!fs.existsSync(UPLOAD_ITENS)) {
  fs.mkdirSync(UPLOAD_ITENS, { recursive: true });
}

const uploadItemImg = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_ITENS, String(req.usuario.escola_id || 'geral'));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = extensaoPermitida(file.originalname, EXT_IMAGEM_OK) || '.jpg';
      cb(null, `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return cb(new Error('Use imagem JPG, PNG, WEBP ou GIF'));
    }
    if (!extensaoPermitida(file.originalname, EXT_IMAGEM_OK)) {
      return cb(new Error('Extensão de arquivo não permitida'));
    }
    cb(null, true);
  }
});

// ——— BANCO DE ITENS ———

router.post(
  '/itens/imagem',
  autenticacao,
  verificarRole(...rolesDocente),
  requerEscola,
  (req, res) => {
    uploadItemImg.single('imagem')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          sucesso: false,
          mensagem: err.message || 'Erro no upload da imagem'
        });
      }
      if (!req.file) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nenhuma imagem enviada' });
      }
      const url = `/uploads/itens/${req.usuario.escola_id}/${req.file.filename}`;
      res.status(201).json({ sucesso: true, url, mensagem: 'Imagem enviada' });
    });
  }
);

router.get('/itens', autenticacao, verificarRole(...rolesDocente, 'aluno'), requerEscola, async (req, res) => {
  try {
    const { q, area, ano, fonte, limit } = req.query;
    const filtro = {
      ativo: true,
      $or: [
        { escola_id: null },
        { escola_id: { $exists: false } },
        { escola_id: req.usuario.escola_id }
      ]
    };
    if (area) filtro.area = area;
    if (ano) filtro.ano = String(ano);
    if (fonte) filtro.fonte = fonte;
    if (q?.trim()) {
      const termo = escapeRegex(q.trim());
      filtro.$and = [
        {
          $or: [
            { codigo: new RegExp(termo, 'i') },
            { enunciado: new RegExp(termo, 'i') },
            { habilidadeBncc: new RegExp(termo, 'i') }
          ]
        }
      ];
    }

    const lim = Math.min(Number(limit) || 60, 150);
    const itens = await ItemAvaliacao.find(filtro)
      .sort({ fonte: 1, area: 1, codigo: 1 })
      .limit(lim)
      .lean();

    // Aluno não vê gabarito
    const limpos =
      req.usuario.tipo === 'aluno'
        ? itens.map(({ gabarito, ...rest }) => rest)
        : itens;

    res.json({ sucesso: true, total: limpos.length, itens: limpos });
  } catch (error) {
    console.error('Erro listar itens:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar itens' });
  }
});

router.post('/itens', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const {
      codigo,
      fonte,
      area,
      ano,
      dificuldade,
      enunciado,
      alternativas,
      gabarito,
      habilidadeBncc,
      imagemUrl
    } = req.body || {};

    if (!codigo?.trim() || !area || !enunciado?.trim() || !gabarito?.trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'codigo, area, enunciado e gabarito são obrigatórios'
      });
    }
    if (!Array.isArray(alternativas) || alternativas.length < 2) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe ao menos 2 alternativas'
      });
    }

    const alts = alternativas.map((a) => ({
      letra: String(a.letra || '').trim().toUpperCase(),
      texto: String(a.texto || '').trim(),
      imagemUrl: a.imagemUrl ? String(a.imagemUrl).trim() : ''
    }));

    if (alts.some((a) => !a.letra || !a.texto)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Cada alternativa precisa de letra e texto'
      });
    }

    const item = await ItemAvaliacao.create({
      codigo: codigo.trim().toUpperCase(),
      fonte: fonte || 'escola',
      area,
      ano: ano || '',
      dificuldade: dificuldade || 'medio',
      enunciado: enunciado.trim(),
      imagemUrl: imagemUrl ? String(imagemUrl).trim() : '',
      alternativas: alts,
      gabarito: String(gabarito).trim().toUpperCase(),
      habilidadeBncc: habilidadeBncc || '',
      escola_id: req.usuario.escola_id,
      criadoPor: req.usuario._id
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_ITEM_AVALIACAO',
      modulo: 'simulados',
      descricao: item.codigo,
      ipAddress: req.ip
    });

    res.status(201).json({ sucesso: true, item, mensagem: 'Item salvo no banco da escola' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ sucesso: false, mensagem: 'Código de item já existe' });
    }
    console.error('Erro criar item:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar item' });
  }
});

router.delete('/itens/:id', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const item = await ItemAvaliacao.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!item) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Item da escola não encontrado (itens SAEB/SARESP globais não podem ser excluídos)'
      });
    }
    if (
      req.usuario.tipo === 'professor' &&
      item.criadoPor &&
      String(item.criadoPor) !== String(req.usuario._id)
    ) {
      return res.status(403).json({ sucesso: false, mensagem: 'Só o autor pode excluir este item' });
    }
    item.ativo = false;
    await item.save();
    res.json({ sucesso: true, mensagem: 'Item removido do banco da escola' });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir item' });
  }
});

// ——— SIMULADOS ———

router.get('/', autenticacao, verificarRole(...rolesDocente, 'aluno'), requerEscola, async (req, res) => {
  try {
    // Aluno: só provas online da(s) turma(s)
    if (req.usuario.tipo === 'aluno') {
      const turmas = await turmasDoAluno(req.usuario._id, req.usuario.escola_id);
      const turmaIds = turmas.map((t) => t._id);
      const filtroAluno = {
        escola_id: req.usuario.escola_id,
        modoOnline: true,
        status: { $nin: ['rascunho'] },
        $or: [{ turma_id: { $in: turmaIds } }, { turma_id: null }, { turma_id: { $exists: false } }]
      };
      const lista = await Simulado.find(filtroAluno)
        .sort({ dataInicio: -1 })
        .limit(40)
        .select('titulo descricao fonte area dataInicio dataFim status modoOnline duracaoMinutos turma_id totalRespostas mediaEscola')
        .populate('turma_id', 'nome serie')
        .lean();
      const ids = lista.map((s) => s._id);
      const minhas = await RespostaSimulado.find({
        simulado_id: { $in: ids },
        aluno_id: req.usuario._id
      }).lean();
      const mapa = {};
      minhas.forEach((r) => {
        mapa[String(r.simulado_id)] = r;
      });
      const enriquecida = lista.map((s) => {
        const resp = mapa[String(s._id)];
        return {
          ...s,
          minhaSituacao: resp?.statusProva || 'nao_iniciada',
          meuPercentual: resp?.percentual,
          aberto: janelaProvaAberta(s)
        };
      });
      return res.json({ sucesso: true, simulados: enriquecida });
    }

    const filtro = { escola_id: req.usuario.escola_id };
    if (req.query.status) filtro.status = req.query.status;
    if (req.query.turma_id) filtro.turma_id = req.query.turma_id;

    if (req.usuario.tipo === 'professor') {
      filtro.criadoPor = req.usuario._id;
    }

    const lista = await Simulado.find(filtro)
      .sort({ dataInicio: -1 })
      .limit(80)
      .populate('turma_id', 'nome serie')
      .populate('criadoPor', 'nome')
      .lean();

    res.json({ sucesso: true, simulados: lista });
  } catch (error) {
    console.error('Erro listar simulados:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar simulados' });
  }
});

/** Lista dedicada de provas online do aluno */
router.get('/meus', autenticacao, verificarRole('aluno'), requerEscola, async (req, res) => {
  try {
    const turmas = await turmasDoAluno(req.usuario._id, req.usuario.escola_id);
    const turmaIds = turmas.map((t) => t._id);
    const lista = await Simulado.find({
      escola_id: req.usuario.escola_id,
      modoOnline: true,
      status: { $nin: ['rascunho'] },
      $or: [{ turma_id: { $in: turmaIds } }, { turma_id: null }, { turma_id: { $exists: false } }]
    })
      .sort({ dataInicio: -1 })
      .limit(40)
      .select(
        'titulo descricao fonte area dataInicio dataFim status modoOnline duracaoMinutos mostrarResultadoImediato turma_id itens'
      )
      .populate('turma_id', 'nome serie')
      .lean();

    const minhas = await RespostaSimulado.find({
      simulado_id: { $in: lista.map((s) => s._id) },
      aluno_id: req.usuario._id
    }).lean();
    const mapa = {};
    minhas.forEach((r) => {
      mapa[String(r.simulado_id)] = r;
    });

    res.json({
      sucesso: true,
      provas: lista.map((s) => {
        const resp = mapa[String(s._id)];
        const enviada = resp?.statusProva === 'enviada' || resp?.statusProva === 'expirada';
        return {
          _id: s._id,
          titulo: s.titulo,
          descricao: s.descricao,
          fonte: s.fonte,
          area: s.area,
          dataInicio: s.dataInicio,
          dataFim: s.dataFim,
          status: s.status,
          modoOnline: s.modoOnline,
          duracaoMinutos: s.duracaoMinutos,
          mostrarResultadoImediato: s.mostrarResultadoImediato,
          turma_id: s.turma_id,
          totalItens: (s.itens || []).length,
          minhaSituacao: resp?.statusProva || 'nao_iniciada',
          meuPercentual: enviada ? resp?.percentual : undefined,
          iniciadoEm: resp?.iniciadoEm,
          expiraEm: resp?.expiraEm,
          enviadoEm: resp?.enviadoEm,
          aberto: janelaProvaAberta(s)
        };
      })
    });
  } catch (error) {
    console.error('Erro meus simulados:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar provas' });
  }
});
router.get('/historico', autenticacao, verificarRole(...rolesGestao, 'professor'), requerEscola, async (req, res) => {
  try {
    const escolaId = req.usuario.escola_id;
    const simulados = await Simulado.find({
      escola_id: escolaId,
      status: { $in: ['encerrado', 'corrigido', 'em_andamento', 'agendado'] }
    })
      .sort({ dataInicio: 1 })
      .select('titulo fonte area dataInicio mediaEscola totalRespostas status anoReferencia')
      .lean();

    // Série por área (média ao longo do tempo)
    const porArea = {};
    simulados.forEach((s) => {
      const key = s.area || 'outra';
      if (!porArea[key]) porArea[key] = [];
      if (s.mediaEscola != null) {
        porArea[key].push({
          simulado_id: s._id,
          titulo: s.titulo,
          data: s.dataInicio,
          media: s.mediaEscola,
          totalRespostas: s.totalRespostas || 0,
          fonte: s.fonte
        });
      }
    });

    const mediaGeral =
      simulados.filter((s) => s.mediaEscola != null).length
        ? Math.round(
            (simulados
              .filter((s) => s.mediaEscola != null)
              .reduce((a, s) => a + s.mediaEscola, 0) /
              simulados.filter((s) => s.mediaEscola != null).length) *
              10
          ) / 10
        : null;

    res.json({
      sucesso: true,
      escola_id: escolaId,
      mediaGeral,
      totalSimulados: simulados.length,
      serie: simulados.map((s) => ({
        _id: s._id,
        titulo: s.titulo,
        fonte: s.fonte,
        area: s.area,
        dataInicio: s.dataInicio,
        mediaEscola: s.mediaEscola,
        totalRespostas: s.totalRespostas,
        status: s.status,
        anoReferencia: s.anoReferencia
      })),
      porArea
    });
  } catch (error) {
    console.error('Erro histórico simulados:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar série histórica' });
  }
});

router.get('/:id', autenticacao, verificarRole(...rolesDocente, 'aluno'), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    })
      .populate('turma_id', 'nome serie alunos')
      .populate('criadoPor', 'nome')
      .populate('itens')
      .lean();

    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Simulado não encontrado' });
    }

    if (req.usuario.tipo === 'aluno') {
      if (!simulado.modoOnline) {
        return res.status(403).json({ sucesso: false, mensagem: 'Esta prova não está disponível online' });
      }
      const turmas = await turmasDoAluno(req.usuario._id, req.usuario.escola_id);
      const turmaIds = new Set(turmas.map((t) => String(t._id)));
      const tid = simulado.turma_id?._id || simulado.turma_id;
      if (tid && !turmaIds.has(String(tid))) {
        return res.status(403).json({ sucesso: false, mensagem: 'Prova de outra turma' });
      }
      simulado.itens = stripGabaritoItens(simulado.itens);
      const resp = await RespostaSimulado.findOne({
        simulado_id: simulado._id,
        aluno_id: req.usuario._id
      }).lean();
      return res.json({
        sucesso: true,
        simulado,
        minhaResposta: resp
          ? {
              statusProva: resp.statusProva,
              iniciadoEm: resp.iniciadoEm,
              expiraEm: resp.expiraEm,
              enviadoEm: resp.enviadoEm,
              percentual: simulado.mostrarResultadoImediato && resp.enviadoEm ? resp.percentual : undefined,
              acertos: simulado.mostrarResultadoImediato && resp.enviadoEm ? resp.acertos : undefined,
              total: resp.total,
              respostas:
                resp.statusProva === 'em_andamento'
                  ? (resp.respostas || []).map((r) => ({
                      item_id: r.item_id,
                      alternativa: r.alternativa
                    }))
                  : undefined
            }
          : { statusProva: 'nao_iniciada' },
        aberto: janelaProvaAberta(simulado)
      });
    }

    res.json({ sucesso: true, simulado });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar simulado' });
  }
});

router.post('/', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const {
      titulo,
      descricao,
      fonte,
      area,
      turma_id,
      anoReferencia,
      dataInicio,
      dataFim,
      item_ids,
      status,
      quantidadeItens,
      modoOnline,
      duracaoMinutos,
      mostrarResultadoImediato
    } = req.body || {};

    if (!titulo?.trim() || !dataInicio) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'titulo e dataInicio são obrigatórios'
      });
    }

    if (turma_id) await assertTurmaEscola(req, turma_id);

    let itens = Array.isArray(item_ids) ? item_ids : [];
    if (!itens.length) {
      const qtd = Math.min(Number(quantidadeItens) || 5, 20);
      const filtroItens = {
        ativo: true,
        $or: [
          { escola_id: null },
          { escola_id: { $exists: false } },
          { escola_id: req.usuario.escola_id }
        ]
      };
      if (area && area !== 'mista') filtroItens.area = area;
      if (fonte && fonte !== 'misto') filtroItens.fonte = fonte;
      const pool = await ItemAvaliacao.find(filtroItens).select('_id').lean();
      // shuffle simples
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      itens = pool.slice(0, qtd).map((x) => x._id);
    }

    if (!itens.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nenhum item no banco. Rode o seed ou cadastre itens.'
      });
    }

    const simulado = await Simulado.create({
      escola_id: req.usuario.escola_id,
      titulo: titulo.trim(),
      descricao: descricao || '',
      fonte: fonte || 'saeb',
      area: area || 'matematica',
      turma_id: turma_id || undefined,
      anoReferencia: anoReferencia || '',
      dataInicio: new Date(dataInicio),
      dataFim: dataFim ? new Date(dataFim) : undefined,
      status: status || 'agendado',
      modoOnline: Boolean(modoOnline),
      duracaoMinutos:
        duracaoMinutos != null ? Math.min(Math.max(Number(duracaoMinutos) || 0, 0), 300) : 60,
      mostrarResultadoImediato:
        mostrarResultadoImediato == null ? true : Boolean(mostrarResultadoImediato),
      itens,
      criadoPor: req.usuario._id
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_SIMULADO',
      modulo: 'simulados',
      descricao: simulado.titulo,
      ipAddress: req.ip
    });

    res.status(201).json({ sucesso: true, simulado });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro criar simulado:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar simulado' });
  }
});

router.put('/:id', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Simulado não encontrado' });
    }
    if (
      req.usuario.tipo === 'professor' &&
      String(simulado.criadoPor) !== String(req.usuario._id)
    ) {
      return res.status(403).json({ sucesso: false, mensagem: 'Só o autor pode editar' });
    }

    const campos = [
      'titulo',
      'descricao',
      'fonte',
      'area',
      'anoReferencia',
      'status',
      'turma_id',
      'modoOnline',
      'mostrarResultadoImediato'
    ];
    campos.forEach((c) => {
      if (req.body[c] != null) simulado[c] = req.body[c];
    });
    if (req.body.duracaoMinutos != null) {
      simulado.duracaoMinutos = Math.min(Math.max(Number(req.body.duracaoMinutos) || 0, 0), 300);
    }
    if (req.body.dataInicio) simulado.dataInicio = new Date(req.body.dataInicio);
    if (req.body.dataFim) simulado.dataFim = new Date(req.body.dataFim);
    if (Array.isArray(req.body.item_ids)) simulado.itens = req.body.item_ids;
    simulado.dataAtualizacao = new Date();
    await simulado.save();

    res.json({ sucesso: true, simulado });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar simulado' });
  }
});

/** Aluno inicia a prova online (marca timer) */
router.post('/:id/iniciar', autenticacao, verificarRole('aluno'), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).populate('itens');

    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Prova não encontrada' });
    }
    if (!simulado.modoOnline) {
      return res.status(400).json({ sucesso: false, mensagem: 'Prova não liberada online' });
    }
    if (!janelaProvaAberta(simulado)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Fora do período da prova' });
    }

    const turmas = await turmasDoAluno(req.usuario._id, req.usuario.escola_id);
    const turmaIds = new Set(turmas.map((t) => String(t._id)));
    if (simulado.turma_id && !turmaIds.has(String(simulado.turma_id))) {
      return res.status(403).json({ sucesso: false, mensagem: 'Prova de outra turma' });
    }

    let doc = await RespostaSimulado.findOne({
      simulado_id: simulado._id,
      aluno_id: req.usuario._id
    });

    if (doc && ['enviada', 'expirada'].includes(doc.statusProva)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Você já encerrou esta prova',
        resposta: {
          statusProva: doc.statusProva,
          percentual: simulado.mostrarResultadoImediato ? doc.percentual : undefined,
          enviadoEm: doc.enviadoEm
        }
      });
    }

    const agora = new Date();
    if (!doc || !doc.iniciadoEm) {
      const dur = Number(simulado.duracaoMinutos) || 0;
      const expiraEm = dur > 0 ? new Date(agora.getTime() + dur * 60 * 1000) : undefined;
      doc = await RespostaSimulado.findOneAndUpdate(
        { simulado_id: simulado._id, aluno_id: req.usuario._id },
        {
          $set: {
            escola_id: req.usuario.escola_id,
            statusProva: 'em_andamento',
            iniciadoEm: agora,
            expiraEm: expiraEm || null,
            total: (simulado.itens || []).length,
            dataAtualizacao: agora
          },
          $setOnInsert: {
            simulado_id: simulado._id,
            aluno_id: req.usuario._id,
            respostas: [],
            dataCriacao: agora
          }
        },
        { upsert: true, new: true }
      );
    }

    if (simulado.status === 'agendado') {
      simulado.status = 'em_andamento';
      simulado.dataAtualizacao = agora;
      await simulado.save();
    }

    res.json({
      sucesso: true,
      mensagem: 'Prova iniciada',
      iniciadoEm: doc.iniciadoEm,
      expiraEm: doc.expiraEm,
      duracaoMinutos: simulado.duracaoMinutos,
      itens: stripGabaritoItens(simulado.itens),
      respostasSalvas: (doc.respostas || []).map((r) => ({
        item_id: r.item_id,
        alternativa: r.alternativa
      })),
      titulo: simulado.titulo
    });
  } catch (error) {
    console.error('Erro iniciar prova:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao iniciar prova' });
  }
});

/** Aluno envia a prova online (correção automática) */
router.post('/:id/enviar', autenticacao, verificarRole('aluno'), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).populate('itens');

    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Prova não encontrada' });
    }
    if (!simulado.modoOnline) {
      return res.status(400).json({ sucesso: false, mensagem: 'Prova não liberada online' });
    }

    let doc = await RespostaSimulado.findOne({
      simulado_id: simulado._id,
      aluno_id: req.usuario._id
    });

    if (!doc || !doc.iniciadoEm) {
      return res.status(400).json({ sucesso: false, mensagem: 'Inicie a prova antes de enviar' });
    }
    if (['enviada', 'expirada'].includes(doc.statusProva)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Prova já enviada',
        correcao: simulado.mostrarResultadoImediato
          ? { acertos: doc.acertos, total: doc.total, percentual: doc.percentual }
          : undefined
      });
    }

    const agora = new Date();
    const expirou = doc.expiraEm && agora > new Date(doc.expiraEm);
    const { respostas, acertos, total, percentual } = corrigirRespostas(
      simulado.itens,
      req.body.respostas
    );

    doc.respostas = respostas;
    doc.acertos = acertos;
    doc.total = total;
    doc.percentual = percentual;
    doc.corrigidoEm = agora;
    doc.enviadoEm = agora;
    doc.statusProva = expirou ? 'expirada' : 'enviada';
    doc.dataAtualizacao = agora;
    await doc.save();

    await atualizarMediaSimulado(simulado);

    res.json({
      sucesso: true,
      mensagem: expirou ? 'Tempo esgotado — respostas registradas' : 'Prova enviada',
      statusProva: doc.statusProva,
      correcao: simulado.mostrarResultadoImediato
        ? { acertos, total, percentual }
        : undefined
    });
  } catch (error) {
    console.error('Erro enviar prova:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao enviar prova' });
  }
});

router.get('/:id/meu-resultado', autenticacao, verificarRole('aluno'), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).lean();
    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Prova não encontrada' });
    }
    const doc = await RespostaSimulado.findOne({
      simulado_id: simulado._id,
      aluno_id: req.usuario._id
    }).lean();
    if (!doc || !['enviada', 'expirada'].includes(doc.statusProva)) {
      return res.status(404).json({ sucesso: false, mensagem: 'Resultado ainda não disponível' });
    }
    if (!simulado.mostrarResultadoImediato && simulado.status !== 'corrigido') {
      return res.json({
        sucesso: true,
        liberado: false,
        mensagem: 'Resultado será liberado pelo professor'
      });
    }
    res.json({
      sucesso: true,
      liberado: true,
      titulo: simulado.titulo,
      acertos: doc.acertos,
      total: doc.total,
      percentual: doc.percentual,
      enviadoEm: doc.enviadoEm,
      statusProva: doc.statusProva
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar resultado' });
  }
});

// Lançar respostas (professor em nome da turma ou aluno legado)
router.post('/:id/respostas', autenticacao, verificarRole(...rolesDocente, 'aluno'), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).populate('itens');

    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Simulado não encontrado' });
    }

    // Aluno em prova online deve usar /enviar
    if (req.usuario.tipo === 'aluno' && simulado.modoOnline) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Use POST /:id/enviar para concluir a prova online'
      });
    }

    let alunoId = req.body.aluno_id;
    if (req.usuario.tipo === 'aluno') {
      alunoId = req.usuario._id;
    }
    if (!alunoId) {
      return res.status(400).json({ sucesso: false, mensagem: 'aluno_id obrigatório' });
    }
    await assertAlunoEscola(req, alunoId);

    const { respostas, acertos, total, percentual } = corrigirRespostas(
      simulado.itens,
      req.body.respostas
    );

    const doc = await RespostaSimulado.findOneAndUpdate(
      { simulado_id: simulado._id, aluno_id: alunoId },
      {
        $set: {
          escola_id: req.usuario.escola_id,
          simulado_id: simulado._id,
          aluno_id: alunoId,
          respostas,
          acertos,
          total,
          percentual,
          statusProva: 'enviada',
          enviadoEm: new Date(),
          corrigidoEm: new Date(),
          dataAtualizacao: new Date()
        },
        $setOnInsert: { dataCriacao: new Date() }
      },
      { upsert: true, new: true }
    );

    res.json({
      sucesso: true,
      resposta: doc,
      correcao: { acertos, total, percentual }
    });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro respostas simulado:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar respostas' });
  }
});

// Corrigir lote / recalcular médias da escola
router.post('/:id/corrigir', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).populate('itens');

    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Simulado não encontrado' });
    }

    const mapaGabarito = {};
    (simulado.itens || []).forEach((it) => {
      mapaGabarito[String(it._id)] = String(it.gabarito || '').toUpperCase();
    });

    const respostas = await RespostaSimulado.find({ simulado_id: simulado._id });
    for (const doc of respostas) {
      let acertos = 0;
      doc.respostas.forEach((r) => {
        const gab = mapaGabarito[String(r.item_id)];
        r.correta = gab ? String(r.alternativa || '').toUpperCase() === gab : false;
        if (r.correta) acertos++;
      });
      const total = Object.keys(mapaGabarito).length || doc.respostas.length;
      doc.acertos = acertos;
      doc.total = total;
      doc.percentual = total ? Math.round((acertos / total) * 1000) / 10 : 0;
      doc.corrigidoEm = new Date();
      doc.dataAtualizacao = new Date();
      await doc.save();
    }

    // Lançamento em lote opcional: { lancamentos: [{ aluno_id, respostas: [{item_id, alternativa}] }] }
    if (Array.isArray(req.body.lancamentos)) {
      for (const lanc of req.body.lancamentos) {
        if (!lanc.aluno_id) continue;
        await assertAlunoEscola(req, lanc.aluno_id);
        const respostasArr = (lanc.respostas || []).map((r) => {
          const gab = mapaGabarito[String(r.item_id)];
          const alt = String(r.alternativa || '').toUpperCase();
          return {
            item_id: r.item_id,
            alternativa: alt,
            correta: gab ? alt === gab : false
          };
        });
        const total = Object.keys(mapaGabarito).length || respostasArr.length;
        const acertos = respostasArr.filter((r) => r.correta).length;
        await RespostaSimulado.findOneAndUpdate(
          { simulado_id: simulado._id, aluno_id: lanc.aluno_id },
          {
            $set: {
              escola_id: req.usuario.escola_id,
              respostas: respostasArr,
              acertos,
              total,
              percentual: total ? Math.round((acertos / total) * 1000) / 10 : 0,
              corrigidoEm: new Date(),
              dataAtualizacao: new Date()
            },
            $setOnInsert: {
              simulado_id: simulado._id,
              aluno_id: lanc.aluno_id,
              dataCriacao: new Date()
            }
          },
          { upsert: true }
        );
      }
    }

    const todas = await RespostaSimulado.find({ simulado_id: simulado._id }).lean();
    const mediaEscola = todas.length
      ? Math.round((todas.reduce((s, r) => s + (r.percentual || 0), 0) / todas.length) * 10) / 10
      : null;

    simulado.mediaEscola = mediaEscola;
    simulado.totalRespostas = todas.length;
    simulado.status = 'corrigido';
    simulado.dataAtualizacao = new Date();
    await simulado.save();

    res.json({
      sucesso: true,
      mensagem: `Correção concluída — ${todas.length} resposta(s), média ${mediaEscola ?? '—'}%`,
      mediaEscola,
      totalRespostas: todas.length,
      respostas: todas
    });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    console.error('Erro corrigir simulado:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro na correção' });
  }
});

router.get('/:id/resultados', autenticacao, verificarRole(...rolesDocente), requerEscola, async (req, res) => {
  try {
    const simulado = await Simulado.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    }).lean();
    if (!simulado) {
      return res.status(404).json({ sucesso: false, mensagem: 'Simulado não encontrado' });
    }

    const respostas = await RespostaSimulado.find({ simulado_id: simulado._id })
      .populate('aluno_id', 'nome')
      .sort({ percentual: -1 })
      .lean();

    res.json({
      sucesso: true,
      mediaEscola: simulado.mediaEscola,
      totalRespostas: simulado.totalRespostas,
      respostas
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar resultados' });
  }
});

module.exports = router;
