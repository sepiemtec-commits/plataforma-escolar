const { verificarRole, requerEscola } = require('../../backend/middleware/autenticacao');
const {
  papelPodeGerenciarMatricula,
  papelPodeLancarNota,
  papelFamilia,
  TIPOS_USUARIO_GESTAO
} = require('../../backend/utils/validacoesAcademicas');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function run(mw, req) {
  const res = mockRes();
  let next = false;
  mw(req, res, () => {
    next = true;
  });
  return { res, next };
}

describe('autenticação / permissões — roles', () => {
  test('secretaria e diretor gerenciam matrícula; aluno não', () => {
    expect(papelPodeGerenciarMatricula('secretaria')).toBe(true);
    expect(papelPodeGerenciarMatricula('diretor')).toBe(true);
    expect(papelPodeGerenciarMatricula('aluno')).toBe(false);
    expect(papelPodeGerenciarMatricula('responsavel')).toBe(false);
    expect(TIPOS_USUARIO_GESTAO).toContain('admin');
  });

  test('professor lança nota; responsável não', () => {
    expect(papelPodeLancarNota('professor')).toBe(true);
    expect(papelPodeLancarNota('coordenador')).toBe(true);
    expect(papelPodeLancarNota('responsavel')).toBe(false);
  });

  test('papéis de família', () => {
    expect(papelFamilia('aluno')).toBe(true);
    expect(papelFamilia('responsavel')).toBe(true);
    expect(papelFamilia('professor')).toBe(false);
  });

  test('verificarRole: aluno bloqueado em rota de secretaria', () => {
    const { res, next } = run(verificarRole('secretaria'), { usuario: { tipo: 'aluno' } });
    expect(next).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('verificarRole: secretaria autorizada', () => {
    const { next } = run(verificarRole('secretaria', 'diretor'), {
      usuario: { tipo: 'secretaria' }
    });
    expect(next).toBe(true);
  });

  test('verificarRole: sem usuário → 401', () => {
    const { res } = run(verificarRole('admin'), {});
    expect(res.statusCode).toBe(401);
  });
});

describe('autenticação — requerEscola (multi-tenant)', () => {
  test('admin global passa sem escola', () => {
    const { next } = run(requerEscola, { usuario: { tipo: 'admin' } });
    expect(next).toBe(true);
  });

  test('diretor com escola passa', () => {
    const { next } = run(requerEscola, {
      usuario: { tipo: 'diretor', escola_id: 'e1' }
    });
    expect(next).toBe(true);
  });

  test('professor sem escola → 403', () => {
    const { res, next } = run(requerEscola, { usuario: { tipo: 'professor' } });
    expect(next).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.mensagem).toMatch(/escola/i);
  });

  test('não autenticado → 401', () => {
    const { res } = run(requerEscola, {});
    expect(res.statusCode).toBe(401);
  });
});

describe('usuários / alunos / professores / responsáveis — matriz de acesso', () => {
  const matriz = [
    { tipo: 'aluno', matricula: false, nota: false, familia: true },
    { tipo: 'responsavel', matricula: false, nota: false, familia: true },
    { tipo: 'professor', matricula: false, nota: true, familia: false },
    { tipo: 'secretaria', matricula: true, nota: true, familia: false },
    { tipo: 'diretor', matricula: true, nota: true, familia: false }
  ];

  test.each(matriz)('$tipo — matrícula=$matricula nota=$nota família=$familia', (row) => {
    expect(papelPodeGerenciarMatricula(row.tipo)).toBe(row.matricula);
    expect(papelPodeLancarNota(row.tipo)).toBe(row.nota);
    expect(papelFamilia(row.tipo)).toBe(row.familia);
  });
});
