/**
 * TOKEN 04 — Isolamento multi-tenant (ESCOLA_A × ESCOLA_B)
 * Backend é a autoridade final: qualquer 200 com dados do outro tenant = falha crítica.
 */
const {
  getCtx,
  api,
  tokenOf,
  auth,
  expectBlocked
} = require('./setup');

function idsOf(list, field = '_id') {
  return (list || []).map((x) => String(x[field] || x.id || x));
}

function bodyLeak(res, forbiddenId) {
  const raw = JSON.stringify(res.body || {});
  return raw.includes(String(forbiddenId));
}

describe('TOKEN 04 — isolamento multi-tenant', () => {
  let ctx;
  let tok;

  beforeAll(async () => {
    ctx = getCtx();
    tok = {
      adminA: await tokenOf('diretor.a@api.test'),
      adminB: await tokenOf('diretor.b@api.test'),
      secretariaA: await tokenOf('secretaria.a@api.test'),
      professorA: await tokenOf('professor.a@api.test'),
      professorB: await tokenOf('professor.b@api.test'),
      alunoA: await tokenOf('aluno.a@api.test'),
      alunoB: await tokenOf('aluno.b@api.test'),
      responsavelA: await tokenOf('responsavel.a@api.test'),
      responsavelB: await tokenOf('responsavel.b@api.test')
    };
  });

  describe('sanity — mesma escola libera', () => {
    test('Admin A lê aluno A', async () => {
      const res = await api()
        .get(`/api/usuarios/${ctx.A.aluno._id}`)
        .set(auth(tok.adminA));
      expect(res.status).toBe(200);
      expect(res.body.sucesso).toBe(true);
    });

    test('listas A não incluem IDs de B', async () => {
      const res = await api().get('/api/usuarios').set(auth(tok.secretariaA));
      expect(res.status).toBe(200);
      const ids = idsOf(res.body.usuarios);
      expect(ids).toContain(String(ctx.A.aluno._id));
      expect(ids).not.toContain(String(ctx.B.aluno._id));
      expect(ids).not.toContain(String(ctx.B.admin._id));
    });
  });

  describe('leitura cross-tenant por ID', () => {
    test('Aluno A → usuário Aluno B', async () => {
      const res = await api()
        .get(`/api/usuarios/${ctx.B.aluno._id}`)
        .set(auth(tok.alunoA));
      expectBlocked(res);
      expect(bodyLeak(res, ctx.B.aluno.email)).toBe(false);
    });

    test('Professor A → turma B', async () => {
      const res = await api()
        .get(`/api/turmas/${ctx.B.turma._id}/resumo-alunos`)
        .set(auth(tok.professorA));
      expectBlocked(res);
    });

    test('Admin A → usuário Admin B / Aluno B', async () => {
      for (const id of [ctx.B.admin._id, ctx.B.aluno._id, ctx.B.professor._id]) {
        const res = await api().get(`/api/usuarios/${id}`).set(auth(tok.adminA));
        expectBlocked(res);
        expect(bodyLeak(res, id)).toBe(false);
      }
    });

    test('Admin A → boletim Aluno B (avaliacao + relatorios)', async () => {
      for (const path of [
        `/api/avaliacao/boletim/${ctx.B.aluno._id}`,
        `/api/relatorios/boletim/${ctx.B.aluno._id}`,
        `/api/relatorios/ficha-individual/${ctx.B.aluno._id}`,
        `/api/relatorios/ficha-matricula/${ctx.B.aluno._id}`
      ]) {
        const res = await api().get(path).set(auth(tok.adminA));
        expectBlocked(res);
      }
    });

    test('Responsavel A → boletim Aluno B', async () => {
      const res = await api()
        .get(`/api/relatorios/boletim/${ctx.B.aluno._id}`)
        .set(auth(tok.responsavelA));
      expectBlocked(res);
    });

    test('Admin A → histórico Aluno B e histórico por ID', async () => {
      let res = await api()
        .get(`/api/historico/aluno/${ctx.B.aluno._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);

      res = await api()
        .get(`/api/historico/${ctx.B.historico._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A → conteúdo turma B / presença turma B', async () => {
      let res = await api()
        .get(`/api/conteudo/turma/${ctx.B.turma._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);

      res = await api()
        .get(`/api/presenca/turma/${ctx.B.turma._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A → PEI / HTPC de B', async () => {
      let res = await api().get(`/api/pei/${ctx.B.pei._id}`).set(auth(tok.adminA));
      expectBlocked(res);
      res = await api().get(`/api/htpc/${ctx.B.htpc._id}`).set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A → horários turma B', async () => {
      const res = await api()
        .get(`/api/horarios/turma/${ctx.B.turma._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A → documentos do usuário B', async () => {
      const res = await api()
        .get(`/api/documentos/usuario/${ctx.B.aluno._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });
  });

  describe('alteração / exclusão cross-tenant', () => {
    test('Admin A não altera usuário B', async () => {
      const res = await api()
        .put(`/api/usuarios/${ctx.B.aluno._id}`)
        .set(auth(tok.adminA))
        .send({ nome: 'HACKED BY A' });
      expectBlocked(res);

      const check = await api()
        .get(`/api/usuarios/${ctx.B.aluno._id}`)
        .set(auth(tok.adminB));
      expect(check.status).toBe(200);
      expect(check.body.usuario.nome).toBe('Aluno B');
    });

    test('Admin A não desativa / exclui usuário B', async () => {
      let res = await api()
        .put(`/api/usuarios/${ctx.B.aluno._id}/desativar`)
        .set(auth(tok.adminA));
      expectBlocked(res);

      res = await api()
        .delete(`/api/usuarios/${ctx.B.professor._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A não altera / exclui turma B', async () => {
      let res = await api()
        .put(`/api/turmas/${ctx.B.turma._id}`)
        .set(auth(tok.adminA))
        .send({
          nome: 'Turma Hack',
          nivel: 'Fundamental II',
          ano: 6,
          serie: 'Z',
          turno: 'Manhã'
        });
      expectBlocked(res);

      res = await api()
        .delete(`/api/turmas/${ctx.B.turma._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A não altera notas do histórico B', async () => {
      const res = await api()
        .put(`/api/historico/${ctx.B.historico._id}/notas`)
        .set(auth(tok.adminA))
        .send({
          notas: [{ disciplina: 'Matemática', cargaHoraria: 40, nota: 0, faltas: 99 }]
        });
      expectBlocked(res);
    });

    test('Admin A não exclui histórico B', async () => {
      const res = await api()
        .delete(`/api/historico/${ctx.B.historico._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A não altera / exclui disciplina B', async () => {
      let res = await api()
        .put(`/api/disciplinas/${ctx.B.disciplina._id}`)
        .set(auth(tok.adminA))
        .send({ nome: 'Hack', quantidadeTempos: 1 });
      expectBlocked(res);

      res = await api()
        .delete(`/api/disciplinas/${ctx.B.disciplina._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A não exclui PEI / HTPC de B', async () => {
      let res = await api()
        .put(`/api/pei/${ctx.B.pei._id}`)
        .set(auth(tok.adminA))
        .send({ diagnostico: 'vazou' });
      expectBlocked(res);

      res = await api()
        .delete(`/api/htpc/${ctx.B.htpc._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Professor A não lança nota / presença em turma B', async () => {
      let res = await api()
        .post('/api/avaliacao/lancar')
        .set(auth(tok.professorA))
        .send({
          aluno_id: ctx.B.aluno._id,
          turma_id: ctx.B.turma._id,
          disciplina: 'Matemática',
          tipo: 'prova_bimestral',
          periodo: '2º Bimestre',
          nota: 1,
          dataAplicacao: new Date().toISOString()
        });
      expectBlocked(res);

      res = await api()
        .post('/api/presenca/registrar')
        .set(auth(tok.professorA))
        .send({
          aluno_id: ctx.B.aluno._id,
          turma_id: ctx.B.turma._id,
          status: 'falta',
          disciplina: 'Matemática',
          tempo: 2,
          data: new Date().toISOString()
        });
      expectBlocked(res);
    });
  });

  describe('download de arquivo cross-tenant', () => {
    test('Admin A não baixa documento B', async () => {
      const res = await api()
        .get(`/api/documentos/${ctx.B.documento._id}/download`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('Admin A não exclui documento B', async () => {
      const res = await api()
        .delete(`/api/documentos/${ctx.B.documento._id}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('regressão: caminho legado /uploads/documentos não serve arquivo de B', async () => {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(
        __dirname,
        '../../uploads/documentos',
        String(ctx.B.escola._id),
        String(ctx.B.aluno._id)
      );
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'secreto-b.pdf');
      fs.writeFileSync(file, 'CONTEUDO_SECRETO_TENANT_B');

      const res = await api().get(
        `/uploads/documentos/${ctx.B.escola._id}/${ctx.B.aluno._id}/secreto-b.pdf`
      );
      // Sem auth: não pode entregar o PDF (404 preferível; 200 com conteúdo = vazamento)
      if (res.status === 200) {
        expect(String(res.text || res.body || '')).not.toContain('CONTEUDO_SECRETO_TENANT_B');
      } else {
        expect([401, 403, 404]).toContain(res.status);
      }

      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    });
  });

  describe('manipulação de filtros / IDs / parâmetros', () => {
    test('query escola_id=B não muda o tenant do Admin A', async () => {
      const res = await api()
        .get(`/api/usuarios?escola_id=${ctx.B.escola._id}`)
        .set(auth(tok.adminA));
      expect(res.status).toBe(200);
      const ids = idsOf(res.body.usuarios);
      expect(ids).not.toContain(String(ctx.B.aluno._id));
    });

    test('filtro tipo + escola_id estranho não vaza B', async () => {
      const res = await api()
        .get('/api/usuarios?tipo=aluno&escola_id=' + ctx.B.escola._id)
        .set(auth(tok.secretariaA));
      expect(res.status).toBe(200);
      expect(idsOf(res.body.usuarios)).not.toContain(String(ctx.B.aluno._id));
    });

    test('NoSQL operator em query tipo é ignorado', async () => {
      const res = await api()
        .get('/api/usuarios')
        .query({ tipo: { $ne: null } })
        .set(auth(tok.secretariaA));
      // sanitize / parser: não pode listar todos os tenants
      if (res.status === 200) {
        expect(idsOf(res.body.usuarios)).not.toContain(String(ctx.B.aluno._id));
      } else {
        expectBlocked(res);
      }
    });

    test('body escola_id de B ao criar usuário não muda afiliação', async () => {
      const stamp = Date.now();
      const email = `intruso.${stamp}@api.test`;
      const res = await api()
        .post('/api/usuarios')
        .set(auth(tok.secretariaA))
        .send({
          nome: `Intruso ${stamp}`,
          email,
          cpf: `9${String(stamp).slice(-10)}`,
          whatsapp: '11970001111',
          tipo: 'aluno',
          escola_id: ctx.B.escola._id
        });
      expect([200, 201]).toContain(res.status);
      expect(res.body.sucesso).toBe(true);

      // Resposta de create não expõe escola_id — confirma via GET autenticado A
      const id = res.body.usuario.id || res.body.usuario._id;
      const check = await api().get(`/api/usuarios/${id}`).set(auth(tok.secretariaA));
      expect(check.status).toBe(200);
      const escolaCriado = String(
        check.body.usuario.escola_id?._id || check.body.usuario.escola_id
      );
      expect(escolaCriado).toBe(String(ctx.A.escola._id));
      expect(escolaCriado).not.toBe(String(ctx.B.escola._id));

      // Admin B não enxerga o usuário criado
      const leak = await api().get(`/api/usuarios/${id}`).set(auth(tok.adminB));
      expectBlocked(leak);
    });

    test('ID inexistente não revela existência cross-tenant (404/403)', async () => {
      const res = await api()
        .get(`/api/usuarios/${ctx.idInexistente}`)
        .set(auth(tok.adminA));
      expectBlocked(res);
    });

    test('listar turmas A não inclui turma B', async () => {
      const res = await api().get('/api/turmas').set(auth(tok.adminA));
      expect(res.status).toBe(200);
      expect(idsOf(res.body.turmas)).not.toContain(String(ctx.B.turma._id));
    });

    test('listar disciplinas A não inclui disciplina B', async () => {
      const res = await api().get('/api/disciplinas').set(auth(tok.adminA));
      expect(res.status).toBe(200);
      const ids = idsOf(res.body.disciplinas);
      expect(ids).not.toContain(String(ctx.B.disciplina._id));
    });

    test('gestão boletins com turma_id de B bloqueia ou lista vazia sem B', async () => {
      const res = await api()
        .get(`/api/relatorios/gestao-boletins?turma_id=${ctx.B.turma._id}`)
        .set(auth(tok.adminA));
      if (res.status === 200) {
        const raw = JSON.stringify(res.body);
        expect(raw.includes(String(ctx.B.aluno._id))).toBe(false);
      } else {
        expectBlocked(res);
      }
    });

    test('promoção preview não mistura escolas', async () => {
      const res = await api().get('/api/promocao/preview').set(auth(tok.adminA));
      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw.includes(String(ctx.B.aluno._id))).toBe(false);
    });
  });

  describe('papéis família / professor', () => {
    test('Responsavel A painel não lista Aluno B', async () => {
      const res = await api().get('/api/painel/responsavel').set(auth(tok.responsavelA));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body).includes(String(ctx.B.aluno._id))).toBe(false);
    });

    test('Professor B não acessa grade da turma A', async () => {
      const res = await api()
        .get(`/api/avaliacao/grade/${ctx.A.turma._id}`)
        .query({ disciplina: 'Matemática' })
        .set(auth(tok.professorB));
      expectBlocked(res);
    });

    test('Aluno A não lista usuários (403) e não lê Admin B', async () => {
      let res = await api().get('/api/usuarios').set(auth(tok.alunoA));
      expect(res.status).toBe(403);
      res = await api()
        .get(`/api/usuarios/${ctx.B.admin._id}`)
        .set(auth(tok.alunoA));
      expectBlocked(res);
    });
  });
});
