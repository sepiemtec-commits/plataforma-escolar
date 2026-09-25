/**
 * Smoke de cobertura: cada prefixo /api registrado responde
 * (401 sem token ou 200 se público) — nunca 500 silencioso.
 */
const { api } = require('./setup');

const PREFIXOS = [
  { method: 'get', path: '/api/assinatura/planos', expect: [200] },
  { method: 'post', path: '/api/auth/login', body: {}, expect: [400] },
  { method: 'get', path: '/api/usuarios', expect: [401] },
  { method: 'get', path: '/api/turmas', expect: [401] },
  { method: 'get', path: '/api/disciplinas', expect: [401] },
  { method: 'get', path: '/api/horarios/slots', expect: [401] },
  { method: 'get', path: '/api/presenca/visao-geral', expect: [401] },
  { method: 'get', path: '/api/avaliacao/aluno/x', expect: [401] },
  { method: 'get', path: '/api/conteudo/turma/x', expect: [401] },
  { method: 'get', path: '/api/painel/diretor', expect: [401] },
  { method: 'get', path: '/api/painel/secretaria', expect: [401] },
  { method: 'get', path: '/api/painel/coordenador', expect: [401] },
  { method: 'get', path: '/api/painel/professor', expect: [401] },
  { method: 'get', path: '/api/painel/aluno', expect: [401] },
  { method: 'get', path: '/api/painel/responsavel', expect: [401] },
  { method: 'post', path: '/api/notificacoes/geral', expect: [401] },
  { method: 'get', path: '/api/relatorios/gestao-boletins', expect: [401] },
  { method: 'get', path: '/api/historico/aluno/x', expect: [401] },
  { method: 'get', path: '/api/documentos/tipos/aluno', expect: [401] },
  { method: 'get', path: '/api/promocao/preview', expect: [401] },
  { method: 'get', path: '/api/push/vapid-public-key', expect: [401] },
  { method: 'get', path: '/api/htpc', expect: [401] },
  { method: 'get', path: '/api/pei', expect: [401] },
  { method: 'get', path: '/api/bncc', expect: [401] },
  { method: 'get', path: '/api/simulados', expect: [401] },
  { method: 'post', path: '/api/ia/parecer/gerar', expect: [401] },
  { method: 'post', path: '/api/assinatura/portal', expect: [401] },
  { method: 'get', path: '/health', expect: [200] }
];

describe('API — mapa de rotas (smoke HTTP)', () => {
  test.each(PREFIXOS)('$method $path → status esperado', async ({ method, path, body, expect: codes }) => {
    let req = api()[method](path);
    if (body !== undefined) req = req.send(body);
    const res = await req;
    expect(codes).toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
});
