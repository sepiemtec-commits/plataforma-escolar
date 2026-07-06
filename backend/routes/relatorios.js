const express = require('express');
const router = express.Router();
const { Usuario, Turma, Escola } = require('../database/schema');
const { autenticacao, verificarRole } = require('../middleware/autenticacao');
const {
  montarBoletimCompleto,
  montarFichaIndividual,
  montarFichaMatricula
} = require('../services/boletim');
const { inferirNivel, labelAno } = require('../constants/ensino');
const { gerarArquivoXlsAnoLetivo } = require('../services/arquivoAnoLetivo');
const { gerarListaFuncionariosXls } = require('../services/funcionariosXls');
const {
  disciplinasDoProfessor,
  professorTemDisciplina,
  filtrarBoletimPorProfessor,
  filtrarFichaPorProfessor
} = require('../utils/professorDisciplinas');

const rolesGestao = ['admin', 'diretor', 'coordenador', 'secretaria', 'professor'];

async function podeVerAluno(req, alunoId) {
  if (['admin', 'diretor', 'coordenador', 'secretaria', 'professor'].includes(req.usuario.tipo)) {
    return true;
  }
  if (req.usuario.tipo === 'aluno') {
    return String(req.usuario._id) === String(alunoId);
  }
  return false;
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

router.get('/gestao-boletins', autenticacao, verificarRole('admin', 'diretor', 'coordenador', 'secretaria'), async (req, res) => {
  try {
    const filtro = { tipo: 'aluno', ativo: true };
    if (req.usuario.escola_id) filtro.escola_id = req.usuario.escola_id;

    const alunos = await Usuario.find(filtro).select('nome cpf email');
    const turmas = await Turma.find(
      req.usuario.escola_id ? { escola_id: req.usuario.escola_id } : {}
    );
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

router.get('/alunos', autenticacao, verificarRole(...rolesGestao, 'aluno'), async (req, res) => {
  try {
    if (req.usuario.tipo === 'aluno') {
      return res.json({ sucesso: true, alunos: [{ _id: req.usuario._id, nome: req.usuario.nome, cpf: req.usuario.cpf }] });
    }

    const { turma_id } = req.query;
    const filtro = { tipo: 'aluno', ativo: true };
    if (req.usuario.escola_id) filtro.escola_id = req.usuario.escola_id;

    if (turma_id) {
      const turma = await Turma.findById(turma_id).populate('alunos', 'nome cpf email matriculaNumero');
      if (!turma) return res.status(404).json({ sucesso: false, mensagem: 'Turma não encontrada' });
      return res.json({ sucesso: true, alunos: turma.alunos || [] });
    }

    const alunos = await Usuario.find(filtro).select('nome cpf email matriculaNumero').sort({ nome: 1 });
    res.json({ sucesso: true, alunos });
  } catch (error) {
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar alunos' });
  }
});

router.get('/turmas-filtro', autenticacao, verificarRole(...rolesGestao, 'aluno'), async (req, res) => {
  try {
    const filtro = req.usuario.escola_id ? { escola_id: req.usuario.escola_id } : {};
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
