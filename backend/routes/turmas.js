// backend/routes/turmas.js - Turmas e matrículas (secretaria)
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Turma, Usuario, Presenca, Log } = require('../database/schema');
const { montarBoletimCompleto } = require('../services/boletim');
const { disciplinasDoProfessor } = require('../utils/professorDisciplinas');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const {
  NIVEIS_LISTA,
  ANOS_POR_NIVEL,
  validarAnoNivel,
  inferirNivel,
  normalizarProfessorId,
  temProfessorTurma,
  validarTurno,
  TURNOS_LISTA
} = require('../constants/ensino');

const rolesGestao = ['secretaria', 'admin', 'diretor'];

function filtroEscola(req) {
  return req.usuario.escola_id ? { escola_id: req.usuario.escola_id } : {};
}

function enriquecerTurma(turma) {
  const obj = turma.toObject ? turma.toObject() : { ...turma };
  obj.nivel = inferirNivel(obj);
  obj.temProfessorTurma = temProfessorTurma(obj.nivel);
  return obj;
}

function slugNomeEmail(nome) {
  return String(nome || 'aluno')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'aluno';
}

async function gerarEmailAluno(nome) {
  const base = slugNomeEmail(nome);
  for (let i = 0; i < 25; i++) {
    const sufixo = i === 0 ? '' : `.${crypto.randomBytes(2).toString('hex')}`;
    const email = `${base}${sufixo}@aluno.plataforma.local`;
    const existe = await Usuario.findOne({ email }).select('_id');
    if (!existe) return email;
  }
  return `aluno.${crypto.randomBytes(4).toString('hex')}@aluno.plataforma.local`;
}

async function matricularAlunoNaTurma(alunoId, turmaId) {
  if (!turmaId) return;
  await Turma.findByIdAndUpdate(turmaId, { $addToSet: { alunos: alunoId } });
}

async function criarAlunoMatricula(dados, escolaId) {
  const {
    nome, email, whatsapp, turma_id, senha,
    dataNascimento, certidao_nascimento,
    filiacao_pai, filiacao_mae, nome_responsavel,
    cpf_responsavel, rg_responsavel, whatsapp_responsavel,
    endereco, bairro, cidade, uf, cep, turno,
    gerarEmailAutomatico
  } = dados;

  const nomeFinal = nome?.trim();
  if (!nomeFinal) {
    throw new Error('Nome é obrigatório');
  }

  let emailFinal = email?.trim();
  if (!emailFinal) {
    if (!gerarEmailAutomatico) {
      throw new Error('Email é obrigatório');
    }
    emailFinal = await gerarEmailAluno(nomeFinal);
  }

  let certidaoFinal = certidao_nascimento?.trim();
  if (!certidaoFinal) {
    certidaoFinal = `PENDENTE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  if (!whatsapp_responsavel?.trim()) {
    throw new Error('Telefone/WhatsApp do responsável é obrigatório');
  }

  const emailExistente = await Usuario.findOne({ email: emailFinal });
  if (emailExistente) {
    throw new Error(`Email já cadastrado: ${emailFinal}`);
  }

  const cpfInterno = `ALU-${crypto.randomBytes(6).toString('hex')}`;

  const aluno = await Usuario.create({
    nome: nomeFinal,
    email: emailFinal,
    senha: senha || 'senha123',
    cpf: cpfInterno,
    whatsapp: whatsapp?.trim() || undefined,
    whatsapp_responsavel: whatsapp_responsavel.trim(),
    certidao_nascimento: certidaoFinal,
    tipo: 'aluno',
    escola_id: escolaId,
    dataNascimento: dataNascimento || undefined,
    filiacao_pai,
    filiacao_mae,
    nome_responsavel: nome_responsavel?.trim() || undefined,
    cpf_responsavel: cpf_responsavel?.trim() || undefined,
    rg_responsavel: rg_responsavel?.trim() || undefined,
    endereco,
    bairro,
    cidade,
    uf,
    cep,
    turno: turno || 'Manhã',
    ativo: true
  });

  await matricularAlunoNaTurma(aluno._id, turma_id);

  return aluno;
}

// ==================== NÍVEIS DE ENSINO ====================
router.get('/niveis-ensino', autenticacao, async (req, res) => {
  res.json({
    sucesso: true,
    niveis: NIVEIS_LISTA.map(nivel => ({
      nivel,
      anos: ANOS_POR_NIVEL[nivel],
      temProfessorTurma: temProfessorTurma(nivel)
    }))
  });
});

// ==================== LISTAR TURMAS ====================
router.get('/', autenticacao, async (req, res) => {
  try {
    const turmas = await Turma.find(filtroEscola(req))
      .populate('professor_id', 'nome email')
      .populate('alunos', 'nome email cpf whatsapp')
      .sort({ nivel: 1, ano: 1, nome: 1 });

    res.json({
      sucesso: true,
      total: turmas.length,
      turmas: turmas.map(enriquecerTurma)
    });
  } catch (error) {
    console.error('Erro ao listar turmas:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar turmas' });
  }
});

// ==================== CRIAR TURMA ====================
router.post('/', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { nome, nivel, ano, serie, turno, professor_id } = req.body;

    if (!NIVEIS_LISTA.includes(nivel)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nível de ensino inválido' });
    }

    const turnoFinal = turno || 'Manhã';
    if (!validarTurno(turnoFinal)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Turno inválido' });
    }

    if (!validarAnoNivel(nivel, ano)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Ano inválido para ${nivel}. Use: ${ANOS_POR_NIVEL[nivel].join(', ')}`
      });
    }

    const turma = await Turma.create({
      nome,
      nivel,
      ano,
      serie,
      turno: turnoFinal,
      professor_id: normalizarProfessorId(nivel, professor_id),
      escola_id: req.usuario.escola_id,
      alunos: []
    });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'CRIOU_TURMA',
      modulo: 'turmas',
      descricao: `Turma ${nome} (${nivel}) criada`,
      ipAddress: req.ip
    });

    res.json({ sucesso: true, mensagem: 'Turma criada com sucesso', turma: enriquecerTurma(turma) });
  } catch (error) {
    console.error('Erro ao criar turma:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar turma' });
  }
});

// ==================== LISTAR PROFESSORES (para select) ====================
router.get('/professores/lista', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const professores = await Usuario.find({
      ...filtroEscola(req),
      tipo: 'professor',
      ativo: true
    }).select('nome email cpf whatsapp disciplina disciplinas').sort({ nome: 1 });

    res.json({ sucesso: true, professores });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar professores' });
  }
});

// ==================== CRIAR ALUNO E MATRICULAR ====================
router.post('/alunos', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const aluno = await criarAlunoMatricula(req.body, req.usuario.escola_id);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'MATRICULOU_ALUNO',
      modulo: 'turmas',
      descricao: `Aluno ${aluno.nome} matriculado`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: 'Aluno cadastrado e matriculado',
      aluno: { id: aluno._id, nome: aluno.nome, email: aluno.email, certidao_nascimento: aluno.certidao_nascimento }
    });
  } catch (error) {
    const status = error.message.includes('obrigatório') || error.message.includes('Informe') || error.message.includes('cadastrado')
      ? 400 : 500;
    res.status(status).json({ sucesso: false, mensagem: error.message || 'Erro ao cadastrar aluno' });
  }
});

// ==================== TRANSFERIR ALUNO DE TURMA ====================
router.post('/transferir-aluno', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { aluno_id, turma_destino_id } = req.body;

    if (!aluno_id || !turma_destino_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'Aluno e turma de destino são obrigatórios' });
    }

    const aluno = await Usuario.findOne({
      _id: aluno_id,
      tipo: 'aluno',
      ...filtroEscola(req)
    });
    if (!aluno) {
      return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado' });
    }

    const turmaDestino = await Turma.findOne({ _id: turma_destino_id, ...filtroEscola(req) });
    if (!turmaDestino) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma de destino não encontrada' });
    }

    await Turma.updateMany(
      { escola_id: req.usuario.escola_id, alunos: aluno_id },
      { $pull: { alunos: aluno_id } }
    );

    await Turma.findByIdAndUpdate(turmaDestino._id, {
      $addToSet: { alunos: aluno_id }
    });

    await Usuario.findByIdAndUpdate(aluno_id, { turno: turmaDestino.turno || aluno.turno });

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'TRANSFERIU_ALUNO',
      modulo: 'turmas',
      descricao: `${aluno.nome} transferido para ${turmaDestino.nome}`,
      ipAddress: req.ip
    });

    res.json({
      sucesso: true,
      mensagem: `Aluno transferido para ${turmaDestino.nome}`,
      turma: turmaDestino.nome
    });
  } catch (error) {
    console.error('Erro ao transferir aluno:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao transferir aluno' });
  }
});

// ==================== RESUMO DE ALUNOS (presença + notas) ====================
router.get('/:turmaId/resumo-alunos', autenticacao, async (req, res) => {
  try {
    const { turmaId } = req.params;
    const turma = await Turma.findOne({ _id: turmaId, ...filtroEscola(req) })
      .populate('professor_id', 'nome')
      .populate('alunos', 'nome email cpf whatsapp');

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    if (!['secretaria', 'admin', 'diretor', 'coordenador', 'professor'].includes(req.usuario.tipo)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }

    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Nenhuma disciplina vinculada ao professor' });
      }
      if (String(turma.escola_id) !== String(req.usuario.escola_id)) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado a esta turma' });
      }
    }

    const alunosTurma = turma.alunos || [];
    const alunoIds = alunosTurma.map(a => a._id);
    const minhasDisciplinas = req.usuario.tipo === 'professor'
      ? disciplinasDoProfessor(req.usuario)
      : null;

    let presencas = alunoIds.length
      ? await Presenca.find({ turma_id: turmaId, aluno_id: { $in: alunoIds } })
      : [];

    if (minhasDisciplinas) {
      presencas = presencas.filter(p => minhasDisciplinas.includes(p.disciplina));
    }

    const presencaPorAluno = {};
    presencas.forEach(p => {
      const id = String(p.aluno_id);
      if (!presencaPorAluno[id]) {
        presencaPorAluno[id] = { presente: 0, falta: 0, justificada: 0, atraso: 0, total: 0 };
      }
      presencaPorAluno[id].total++;
      if (presencaPorAluno[id][p.status] != null) {
        presencaPorAluno[id][p.status]++;
      }
    });

    const alunos = [];

    for (const aluno of alunosTurma) {
      const boletim = await montarBoletimCompleto(aluno._id);
      let notasDisciplinas = (boletim?.disciplinas || []).map(d => ({
        disciplina: d.disciplina,
        mediaFinal: d.mediaFinal,
        faltas: d.faltas
      }));

      if (minhasDisciplinas) {
        notasDisciplinas = notasDisciplinas.filter(n => minhasDisciplinas.includes(n.disciplina));
      }

      const medias = notasDisciplinas.map(d => d.mediaFinal).filter(m => m != null);
      const mediaGeral = medias.length
        ? Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 100) / 100
        : null;

      const pres = presencaPorAluno[String(aluno._id)] || {
        presente: 0, falta: 0, justificada: 0, atraso: 0, total: 0
      };
      const frequencia = pres.total > 0
        ? Math.round((pres.presente / pres.total) * 10000) / 100
        : null;

      alunos.push({
        _id: aluno._id,
        nome: aluno.nome,
        cpf: aluno.cpf,
        email: aluno.email,
        whatsapp: aluno.whatsapp,
        presenca: {
          ...pres,
          frequenciaPercentual: frequencia
        },
        mediaGeral,
        notas: notasDisciplinas
      });
    }

    alunos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    res.json({
      sucesso: true,
      turma: enriquecerTurma(turma),
      totalAlunos: alunos.length,
      alunos
    });
  } catch (error) {
    console.error('Erro ao carregar resumo da turma:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar alunos da turma' });
  }
});

// ==================== ATUALIZAR TURMA ====================
router.put('/:turmaId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { turmaId } = req.params;
    const existente = await Turma.findOne({ _id: turmaId, ...filtroEscola(req) });
    if (!existente) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    const { nome, nivel, ano, serie, turno, professor_id } = req.body;

    const nivelFinal = nivel || inferirNivel({ ano });
    const turnoFinal = turno || 'Manhã';

    if (nivel && !NIVEIS_LISTA.includes(nivel)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nível de ensino inválido' });
    }

    if (!validarTurno(turnoFinal)) {
      return res.status(400).json({ sucesso: false, mensagem: 'Turno inválido' });
    }

    if (!validarAnoNivel(nivelFinal, ano)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Ano inválido para ${nivelFinal}. Use: ${ANOS_POR_NIVEL[nivelFinal].join(', ')}`
      });
    }

    const turma = await Turma.findByIdAndUpdate(
      turmaId,
      {
        nome,
        nivel: nivelFinal,
        ano,
        serie,
        turno: turnoFinal,
        professor_id: normalizarProfessorId(nivelFinal, professor_id)
      },
      { new: true }
    ).populate('professor_id', 'nome').populate('alunos', 'nome email cpf whatsapp');

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    res.json({ sucesso: true, mensagem: 'Turma atualizada', turma: enriquecerTurma(turma) });
  } catch (error) {
    console.error('Erro ao atualizar turma:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar turma' });
  }
});

// ==================== EXCLUIR TURMA ====================
router.delete('/:turmaId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { turmaId } = req.params;
    const turma = await Turma.findOne({ _id: turmaId, ...filtroEscola(req) });

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    if ((turma.alunos || []).length > 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Não é possível excluir turma com alunos matriculados. Transfira ou remova os alunos primeiro.'
      });
    }

    await Turma.findByIdAndDelete(turmaId);

    await Log.create({
      usuario_id: req.usuario._id,
      acao: 'EXCLUIU_TURMA',
      modulo: 'turmas',
      descricao: `Turma ${turma.nome} excluída`,
      ipAddress: req.ip
    });

    res.json({ sucesso: true, mensagem: 'Turma excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir turma:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir turma' });
  }
});

// ==================== MATRICULAR ALUNO EXISTENTE ====================
router.post('/:turmaId/alunos/:alunoId', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const { turmaId, alunoId } = req.params;

    const turma = await Turma.findByIdAndUpdate(
      turmaId,
      { $addToSet: { alunos: alunoId } },
      { new: true }
    ).populate('alunos', 'nome email cpf');

    if (!turma) {
      return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
    }

    res.json({ sucesso: true, mensagem: 'Aluno matriculado na turma', turma: enriquecerTurma(turma) });
  } catch (error) {
    console.error('Erro ao matricular aluno:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao matricular aluno' });
  }
});

module.exports = router;
