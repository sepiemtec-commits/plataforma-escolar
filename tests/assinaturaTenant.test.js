const {
  assinaturaPermiteAcesso,
  mensagemBloqueioAssinatura,
  listarPlanosPublicos,
  obterPlano
} = require('../backend/constants/planos');
const { filtroEscola } = require('../backend/utils/tenant');

describe('planos e assinatura', () => {
  test('lista 3 planos', () => {
    expect(listarPlanosPublicos()).toHaveLength(3);
    expect(obterPlano('profissional').nome).toBe('Profissional');
  });

  test('seed sem status libera acesso', () => {
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: {} })).toBe(true);
    expect(assinaturaPermiteAcesso({ ativo: true })).toBe(true);
  });

  test('bloqueia canceled/unpaid/incomplete', () => {
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'canceled' } })).toBe(false);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'active' } })).toBe(true);
    expect(assinaturaPermiteAcesso({ ativo: true, assinatura: { status: 'past_due' } })).toBe(true);
    expect(mensagemBloqueioAssinatura({ assinatura: { status: 'canceled' } })).toMatch(/Assinatura/);
  });
});

describe('filtroEscola', () => {
  test('filtra por escola_id do usuário', () => {
    expect(filtroEscola({ usuario: { escola_id: 'abc' } })).toEqual({ escola_id: 'abc' });
  });

  test('admin global sem escola vê tudo', () => {
    expect(filtroEscola({ usuario: { tipo: 'admin' } })).toEqual({});
  });

  test('usuário sem escola não vaza dados', () => {
    expect(filtroEscola({ usuario: { tipo: 'diretor' } }).escola_id).toBe('__sem_escola__');
  });
});
