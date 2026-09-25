// backend/routes/htpc.js — Reuniões pedagógicas (público: pais / professores / todos)
const express = require('express');
const router = express.Router();
const { HtpcReuniao, Usuario, Responsavel, Log } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');

const rolesGestao = ['coordenador', 'diretor', 'admin'];
const rolesLeitura = ['coordenador', 'diretor', 'admin', 'professor', 'responsavel'];

function idParticipante(p) {
  return String(p.usuario_id || p.professor_id || '');
}

function normalizarParticipante(p) {
  const uid = p.usuario_id || p.professor_id;
  return {
    usuario_id: uid,
    professor_id: p.professor_id || (p.tipo === 'professor' ? uid : undefined),
    tipo: p.tipo || 'professor',
    presente: Boolean(p.presente),
    observacao: p.observacao || ''
  };
}

async function montarParticipantes(escolaId, publico) {
  const mapa = new Map();

  async function addTipo(tipo) {
    const users = await Usuario.find({
      escola_id: escolaId,
      tipo,
      ativo: { $ne: false }
    }).select('_id');
    users.forEach((u) => {
      mapa.set(String(u._id), {
        usuario_id: u._id,
        professor_id: tipo === 'professor' ? u._id : undefined,
        tipo,
        presente: false,
        observacao: ''
      });
    });
  }

  if (publico === 'professores' || publico === 'todos') {
    await addTipo('professor');
  }

  if (publico === 'pais' || publico === 'todos') {
    await addTipo('responsavel');
    // Incluir responsáveis vinculados mesmo se o Usuario não tiver tipo/escola alinhados
    const vins = await Responsavel.find({}).populate({
      path: 'usuario_id',
      select: '_id escola_id tipo ativo',
      match: { escola_id: escolaId }
    });
    vins.forEach((r) => {
      const u = r.usuario_id;
      if (!u || !u._id) return;
      if (!mapa.has(String(u._id))) {
        mapa.set(String(u._id), {
          usuario_id: u._id,
          tipo: 'responsavel',
          presente: false,
          observacao: ''
        });
      }
    });
  }

  return [...mapa.values()];
}

function populateReuniao(q) {
  return q
    .populate('criadoPor', 'nome')
    .populate('participantes.usuario_id', 'nome email tipo')
    .populate('participantes.professor_id', 'nome email tipo');
}

function enriquecerLean(reuniao) {
  if (!reuniao) return reuniao;
  reuniao.participantes = (reuniao.participantes || []).map((p) => {
    const user = p.usuario_id?.nome ? p.usuario_id : p.professor_id;
    return {
      ...p,
      usuario_id: p.usuario_id?._id || p.usuario_id || p.professor_id?._id || p.professor_id,
      nome: user?.nome || '—',
      tipo: p.tipo || (user?.tipo === 'responsavel' ? 'responsavel' : 'professor')
    };
  });
  return reuniao;
}

router.get('/', autenticacao, verificarRole(...rolesLeitura), requerEscola, async (req, res) => {
  try {
    const filtro = { escola_id: req.usuario.escola_id };

    // Pais e professores só veem reuniões em que estão (ou gestão vê todas)
    if (!rolesGestao.includes(req.usuario.tipo)) {
      filtro.$or = [
        { 'participantes.usuario_id': req.usuario._id },
        { 'participantes.professor_id': req.usuario._id }
      ];
    }

    const lista = await populateReuniao(
      HtpcReuniao.find(filtro).sort({ data: -1 }).limit(50)
    ).lean();

    res.json({
      sucesso: true,
      reunioes: lista.map(enriquecerLean)
    });
  } catch (error) {
    console.error('Erro ao listar reuniões:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar reuniões pedagógicas' });
  }
});

router.get('/:id', autenticacao, verificarRole(...rolesLeitura), requerEscola, async (req, res) => {
  try {
    const reuniao = await populateReuniao(
      HtpcReuniao.findOne({
        _id: req.params.id,
        escola_id: req.usuario.escola_id
      })
    ).lean();

    if (!reuniao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Reunião não encontrada' });
    }
    res.json({ sucesso: true, reuniao: enriquecerLean(reuniao) });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar reunião' });
  }
});

router.post('/', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    const { titulo, data, turno, pauta, publico: publicoBody, professor_ids, usuario_ids } = req.body || {};
    if (!titulo?.trim() || !data) {
      return res.status(400).json({ sucesso: false, mensagem: 'Título e data são obrigatórios' });
    }

    const publico = ['pais', 'professores', 'todos'].includes(publicoBody)
      ? publicoBody
      : 'professores';

    let participantes;
    if (Array.isArray(usuario_ids) && usuario_ids.length) {
      const users = await Usuario.find({
        _id: { $in: usuario_ids },
        escola_id: req.usuario.escola_id
      }).select('_id tipo');
      participantes = users.map((u) => ({
        usuario_id: u._id,
        professor_id: u.tipo === 'professor' ? u._id : undefined,
        tipo: u.tipo === 'responsavel' ? 'responsavel' : 'professor',
        presente: false,
        observacao: ''
      }));
    } else if (Array.isArray(professor_ids) && professor_ids.length) {
      participantes = professor_ids.map((id) => ({
        usuario_id: id,
        professor_id: id,
        tipo: 'professor',
        presente: false,
        observacao: ''
      }));
    } else {
      participantes = await montarParticipantes(req.usuario.escola_id, publico);
    }

    if (!participantes.length) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nenhum participante encontrado para o público selecionado'
      });
    }

    const reuniao = await HtpcReuniao.create({
      escola_id: req.usuario.escola_id,
      titulo: titulo.trim(),
      data: new Date(data),
      turno: turno || 'Tarde',
      publico,
      pauta: pauta || '',
      criadoPor: req.usuario._id,
      participantes
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_REUNIAO_PEDAGOGICA',
      modulo: 'htpc',
      descricao: `Reunião pedagógica (${publico}): ${titulo.trim()}`,
      ipAddress: req.ip
    });

    const criada = await populateReuniao(HtpcReuniao.findById(reuniao._id)).lean();
    res.status(201).json({ sucesso: true, reuniao: enriquecerLean(criada) });
  } catch (error) {
    console.error('Erro ao criar reunião:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao agendar reunião pedagógica' });
  }
});

router.put('/:id', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    const reuniao = await HtpcReuniao.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!reuniao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Reunião não encontrada' });
    }

    const { titulo, data, turno, pauta, ata, status, publico } = req.body || {};
    if (titulo != null) reuniao.titulo = String(titulo).trim();
    if (data) reuniao.data = new Date(data);
    if (turno) reuniao.turno = turno;
    if (pauta != null) reuniao.pauta = pauta;
    if (ata != null) reuniao.ata = ata;
    if (publico && ['pais', 'professores', 'todos'].includes(publico)) {
      reuniao.publico = publico;
    }
    if (status && ['agendada', 'realizada', 'cancelada'].includes(status)) {
      reuniao.status = status;
    }
    reuniao.dataAtualizacao = new Date();
    await reuniao.save();

    const atualizada = await populateReuniao(HtpcReuniao.findById(reuniao._id)).lean();
    res.json({ sucesso: true, reuniao: enriquecerLean(atualizada) });
  } catch (error) {
    console.error('Erro ao atualizar reunião:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar reunião' });
  }
});

router.delete('/:id', autenticacao, verificarRole(...rolesGestao), requerEscola, async (req, res) => {
  try {
    const reuniao = await HtpcReuniao.findOneAndDelete({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!reuniao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Reunião não encontrada' });
    }

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'EXCLUIU_REUNIAO_PEDAGOGICA',
      modulo: 'htpc',
      descricao: reuniao.titulo,
      ipAddress: req.ip
    });

    res.json({ sucesso: true, mensagem: 'Reunião excluída' });
  } catch (error) {
    console.error('Erro ao excluir reunião:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir reunião' });
  }
});

router.post('/:id/presenca', autenticacao, verificarRole(...rolesLeitura), requerEscola, async (req, res) => {
  try {
    const reuniao = await HtpcReuniao.findOne({
      _id: req.params.id,
      escola_id: req.usuario.escola_id
    });
    if (!reuniao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Reunião não encontrada' });
    }

    const { usuario_id, professor_id, presente, observacao, lista } = req.body || {};

    if (Array.isArray(lista) && rolesGestao.includes(req.usuario.tipo)) {
      lista.forEach((item) => {
        const alvo = String(item.usuario_id || item.professor_id);
        const part = reuniao.participantes.find((p) => idParticipante(p) === alvo);
        if (part) {
          if (typeof item.presente === 'boolean') part.presente = item.presente;
          if (item.observacao != null) part.observacao = item.observacao;
        }
      });
    } else {
      const alvoId =
        rolesGestao.includes(req.usuario.tipo) && (usuario_id || professor_id)
          ? String(usuario_id || professor_id)
          : String(req.usuario._id);

      if (
        !rolesGestao.includes(req.usuario.tipo) &&
        alvoId !== String(req.usuario._id)
      ) {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Você só pode registrar a própria presença'
        });
      }

      let part = reuniao.participantes.find((p) => idParticipante(p) === alvoId);
      if (!part) {
        reuniao.participantes.push({
          usuario_id: alvoId,
          professor_id: req.usuario.tipo === 'professor' ? alvoId : undefined,
          tipo: req.usuario.tipo === 'responsavel' ? 'responsavel' : 'professor',
          presente: presente !== false,
          observacao: observacao || ''
        });
      } else {
        if (typeof presente === 'boolean') part.presente = presente;
        else part.presente = true;
        if (observacao != null) part.observacao = observacao;
        if (!part.usuario_id) part.usuario_id = part.professor_id || alvoId;
      }
    }

    reuniao.dataAtualizacao = new Date();
    await reuniao.save();

    const atualizada = await populateReuniao(HtpcReuniao.findById(reuniao._id)).lean();
    res.json({ sucesso: true, reuniao: enriquecerLean(atualizada) });
  } catch (error) {
    console.error('Erro presença reunião:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao registrar presença' });
  }
});

module.exports = router;
