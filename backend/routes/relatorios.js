const express = require('express');
const router = express.Router();
const { Usuario, Turma, Escola, DisciplinaConfig } = require('../database/schema');
const { autenticacao, verificarRole, requerEscola } = require('../middleware/autenticacao');
const {
  montarBoletimCompleto,
  montarFichaIndividual,
  montarFichaMatricula
} = require('../services/boletim');
const { montarDiarioAula, montarDiaDiarioAula } = require('../services/diario');
const { inferirNivel, labelAno } = require('../constants/ensino');
const { gerarArquivoXlsAnoLetivo } = require('../services/arquivoAnoLetivo');
const { gerarListaFuncionariosXls } = require('../services/funcionariosXls');
const {
  disciplinasDoProfessor,
  professorTemDisciplina,
  filtrarBoletimPorProfessor,
  filtrarFichaPorProfessor
} = require('../utils/professorDisciplinas');
const {
  filtroEscola,
  assertAlunoEscola,
  assertTurmaEscola,
  responderErroTenant
} = require('../utils/tenant');

const rolesGestao = ['admin', 'diretor', 'coordenador', 'secretaria', 'professor'];
const rolesDiario = ['admin', 'diretor', 'coordenador', 'secretaria', 'professor'];

async function podeVerAluno(req, alunoId) {
  try {
    // aluno (si mesmo), responsável (filho vinculado) e equipe da escola
    await assertAlunoEscola(req, alunoId);
    return true;
  } catch {
    return false;
  }
}

router.get('/ficha-individual/:alunoId', autenticacao, async (req, res) => {
  try {
    if (!await podeVerAluno(req, req.params.alunoId)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }
    const ficha = await montarFichaIndividual(req.params.alunoId);
    if (!ficha) return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado' });
    res.json({ sucesso: true, ficha: filtrarFichaPorProfessor(ficha, req.usuario) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar ficha individual' });
  }
});

router.get('/ficha-matricula/:alunoId', autenticacao, async (req, res) => {
  try {
    if (!await podeVerAluno(req, req.params.alunoId)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }
    const ficha = await montarFichaMatricula(req.params.alunoId);
    if (!ficha) return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado' });
    res.json({ sucesso: true, ficha });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar ficha de matrícula' });
  }
});

router.get('/boletim/:alunoId', autenticacao, async (req, res) => {
  try {
    if (!await podeVerAluno(req, req.params.alunoId)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado' });
    }
    if (req.usuario.tipo === 'professor') {
      const minhas = disciplinasDoProfessor(req.usuario);
      if (!minhas.length) {
        return res.status(403).json({ sucesso: false, mensagem: 'Nenhuma disciplina vinculada ao professor' });
      }
      if (req.query.disciplina && !professorTemDisciplina(req.usuario, req.query.disciplina)) {
        return res.status(403).json({
          sucesso: false,
          mensagem: `Você só pode consultar notas de: ${minhas.join(', ')}`
        });
      }
    }

    let boletim = await montarBoletimCompleto(req.params.alunoId, req.query.disciplina);
    if (!boletim) return res.status(404).json({ sucesso: false, mensagem: 'Aluno não encontrado' });
    boletim = filtrarBoletimPorProfessor(boletim, req.usuario);
    res.json({ sucesso: true, boletim });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar boletim' });
  }
});

function nivelDaTurma(turma) {
  return turma ? inferirNivel(turma) : null;
}

router.get('/gestao-boletins', autenticacao, verificarRole('admin', 'diretor', 'coordenador', 'secretaria'), requerEscola, async (req, res) => {
  try {
    const filtro = { tipo: 'aluno', ativo: true, ...filtroEscola(req) };

    const alunos = await Usuario.find(filtro).select('nome cpf email');
    const turmas = await Turma.find(filtroEscola(req));
    const turmaPorAluno = {};
    turmas.forEach(t => {
      (t.alunos || []).forEach(aid => {
        turmaPorAluno[String(aid)] = t;
      });
    });

    const lista = [];

    for (const aluno of alunos) {
      const boletim = await montarBoletimCompleto(aluno._id);
      const turma = turmaPorAluno[String(aluno._id)];
      const medias = boletim?.disciplinas?.map(d => d.mediaFinal).filter(m => m != null) || [];
      const mediaGeral = medias.length
        ? Math.round((medias.reduce((a, b) => a + b, 0) / medias.length) * 100) / 100
        : null;

      lista.push({
        _id: aluno._id,
        nome: aluno.nome,
        cpf: aluno.cpf,
        turma: turma?.nome || boletim?.turma?.nome || '—',
        turmaId: turma?._id || null,
        ano: turma?.ano || null,
        serie: turma?.serie || null,
        nivel: nivelDaTurma(turma),
        disciplinas: boletim?.disciplinas?.length || 0,
        mediaGeral,
        situacao: mediaGeral == null ? 'Sem notas' : mediaGeral >= 6 ? 'Aprovado' : 'Recuperação'
      });
    }

    res.json({ sucesso: true, total: lista.length, alunos: lista });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro na gestão de boletins' });
  }
});

router.get('/alunos', autenticacao, verificarRole(...rolesGestao, 'aluno'), requerEscola, async (req, res) => {
  try {
    if (req.usuario.tipo === 'aluno') {
      return res.json({ sucesso: true, alunos: [{ _id: req.usuario._id, nome: req.usuario.nome, cpf: req.usuario.cpf }] });
    }

    const { turma_id } = req.query;
    const filtro = { tipo: 'aluno', ativo: true, ...filtroEscola(req) };

    if (turma_id) {
      const turma = await assertTurmaEscola(req, turma_id, {
        populate: { path: 'alunos', select: 'nome cpf email matriculaNumero' }
      });
      return res.json({ sucesso: true, alunos: turma.alunos || [] });
    }

    const alunos = await Usuario.find(filtro).select('nome cpf email matriculaNumero').sort({ nome: 1 });
    res.json({ sucesso: true, alunos });
  } catch (error) {
    if (responderErroTenant(res, error)) return;
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar alunos' });
  }
});

router.get('/turmas-filtro', autenticacao, verificarRole(...rolesGestao, 'aluno'), requerEscola, async (req, res) => {
  try {
    const filtro = filtroEscola(req);
    const turmas = await Turma.find(filtro)
      .populate('alunos', 'nome cpf email matriculaNumero')
      .sort({ ano: 1, nome: 1 });

    res.json({
      sucesso: true,
      turmas: turmas.map(t => ({
        _id: t._id,
        nome: t.nome,
        ano: t.ano,
        serie: t.serie,
        nivel: inferirNivel(t),
        anoLabel: labelAno(inferirNivel(t), t.ano),
        turno: t.turno || 'Manhã',
        alunos: (t.alunos || []).map(a => ({
          _id: a._id,
          nome: a.nome,
          cpf: a.cpf,
          email: a.email,
          matriculaNumero: a.matriculaNumero
        }))
      }))
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar turmas' });
  }
});

router.get('/arquivo-ano-letivo/:anoLetivo', autenticacao, verificarRole(...rolesGestao), async (req, res) => {
  try {
    const anoLetivo = parseInt(req.params.anoLetivo, 10);
    if (!anoLetivo || anoLetivo < 2000) {
      return res.status(400).json({ sucesso: false, mensagem: 'Ano letivo inválido' });
    }

    const escola = await Escola.findById(req.usuario.escola_id);
    const anoVigente = escola?.configuracao?.anoLetivo || new Date().getFullYear();

    if (anoLetivo >= anoVigente) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Somente anos anteriores ao vigente podem ser exportados em arquivo'
      });
    }

    const arquivo = await gerarArquivoXlsAnoLetivo(req.usuario.escola_id, anoLetivo);

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
    res.send('\ufeff' + arquivo.conteudo);
  } catch (error) {
    console.error('Erro ao gerar arquivo do ano letivo:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar arquivo XLS' });
  }
});

router.get('/diario-aula', autenticacao, verificarRole(...rolesDiario), async (req, res) => {
  try {
    const diario = await montarDiarioAula(req.usuario, req.query);
    res.json({ sucesso: true, diario });
  } catch (error) {
    console.error('Erro ao gerar diário de aula:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao gerar diário de aula'
    });
  }
});

router.get('/diario-aula/dia', autenticacao, verificarRole(...rolesDiario), async (req, res) => {
  try {
    const dia = await montarDiaDiarioAula(req.usuario, req.query);
    res.json({ sucesso: true, dia });
  } catch (error) {
    console.error('Erro ao carregar diário do dia:', error);
    res.status(error.status || 500).json({
      sucesso: false,
      mensagem: error.message || 'Erro ao carregar diário do dia'
    });
  }
});

router.get('/diario-aula/opcoes', autenticacao, verificarRole(...rolesDiario), async (req, res) => {
  try {
    const filtroTurma = req.usuario.escola_id ? { escola_id: req.usuario.escola_id } : {};
    const turmas = await Turma.find(filtroTurma).sort({ ano: 1, nome: 1 });

    let disciplinas = [];
    if (req.usuario.tipo === 'professor') {
      disciplinas = disciplinasDoProfessor(req.usuario);
    } else if (req.usuario.escola_id) {
      const configs = await DisciplinaConfig.find({
        escola_id: req.usuario.escola_id,
        ativo: true
      }).sort({ nome: 1 });
      disciplinas = configs.map(d => d.nome);
    }

    let professores = [];
    if (['admin', 'diretor', 'coordenador', 'secretaria'].includes(req.usuario.tipo)) {
      professores = await Usuario.find({
        escola_id: req.usuario.escola_id,
        tipo: 'professor',
        ativo: { $ne: false }
      }).select('nome disciplinas disciplina').sort({ nome: 1 });
    }

    const escola = await Escola.findById(req.usuario.escola_id).select('configuracao.anoLetivo nome');

    res.json({
      sucesso: true,
      anoLetivo: escola?.configuracao?.anoLetivo || new Date().getFullYear(),
      escola: escola?.nome || '',
      turmas: turmas.map(t => ({
        _id: t._id,
        nome: t.nome,
        nivel: t.nivel,
        ano: t.ano,
        serie: t.serie,
        turno: t.turno || 'Manhã'
      })),
      disciplinas,
      professores: professores.map(p => ({
        _id: p._id,
        nome: p.nome,
        disciplinas: Array.isArray(p.disciplinas) && p.disciplinas.length
          ? p.disciplinas
          : (p.disciplina ? [p.disciplina] : [])
      }))
    });
  } catch (error) {
    console.error('Erro ao carregar opções do diário:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao carregar opções do diário' });
  }
});

router.get('/funcionarios-xls', autenticacao, verificarRole('secretaria', 'diretor', 'coordenador', 'admin'), async (req, res) => {
  try {
    if (!req.usuario.escola_id) {
      return res.status(400).json({ sucesso: false, mensagem: 'Escola não identificada' });
    }

    const arquivo = await gerarListaFuncionariosXls(req.usuario.escola_id);

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
    res.send('\ufeff' + arquivo.conteudo);
  } catch (error) {
    console.error('Erro ao exportar funcionários:', error);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gerar arquivo XLS' });
  }
});

module.exports = router;
