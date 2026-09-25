// backend/utils/senhaPadrao.js — Senhas padrão / seed (bloqueia fracas em produção)
const crypto = require('crypto');

const SENHAS_FRACAS = new Set([
  'senha123',
  'senha1234',
  '123456',
  '12345678',
  'password',
  'password123',
  'admin',
  'admin123',
  'escola',
  'escola123',
  'qwerty',
  'abc123',
  'changeme'
]);

function isProducao() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function senhaEFraca(senha) {
  const s = String(senha || '').trim();
  if (!s || s.length < 8) return true;
  if (SENHAS_FRACAS.has(s.toLowerCase())) return true;
  // só números ou senha igual ao e-mail comum de seed
  if (/^\d+$/.test(s)) return true;
  return false;
}

function gerarSenhaTemporaria(tamanho = 14) {
  // base64url: letras, números, - e _ (sem caracteres ambíguos demais)
  return crypto.randomBytes(Math.ceil(tamanho * 1.2)).toString('base64url').slice(0, tamanho);
}

/**
 * Senha usada pelos scripts de seed.
 * Produção: exige ALLOW_SEED_IN_PRODUCTION=true e SEED_DEFAULT_PASSWORD forte (≥12).
 * Desenvolvimento: SEED_DEFAULT_PASSWORD / DEFAULT_USER_PASSWORD ou senha123.
 */
function obterSenhaSeed() {
  const fromEnv = (process.env.SEED_DEFAULT_PASSWORD || process.env.DEFAULT_USER_PASSWORD || '').trim();

  if (isProducao()) {
    if (process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
      throw new Error(
        'Seed bloqueado em produção. ' +
        'Defina ALLOW_SEED_IN_PRODUCTION=true e SEED_DEFAULT_PASSWORD (mín. 12 chars, não use senha123).'
      );
    }
    if (!fromEnv || fromEnv.length < 12 || senhaEFraca(fromEnv)) {
      throw new Error(
        'Em produção, SEED_DEFAULT_PASSWORD deve ter no mínimo 12 caracteres e não pode ser senha fraca (ex.: senha123).'
      );
    }
    return fromEnv;
  }

  return fromEnv || 'senha123';
}

/**
 * Senha inicial no cadastro (secretaria/turmas).
 * Produção sem senha informada → gera temporária aleatória.
 * Produção com senha fraca → rejeita.
 */
function obterSenhaCadastro(senhaInformada) {
  const informada = String(senhaInformada || '').trim();

  if (informada) {
    if (informada.length < 6) {
      const err = new Error('A senha deve ter no mínimo 6 caracteres');
      err.status = 400;
      throw err;
    }
    if (isProducao() && senhaEFraca(informada)) {
      const err = new Error(
        'Senha fraca demais para produção. Use no mínimo 8 caracteres e evite padrões como senha123.'
      );
      err.status = 400;
      throw err;
    }
    return { senha: informada, gerada: false };
  }

  if (isProducao()) {
    return { senha: gerarSenhaTemporaria(14), gerada: true };
  }

  const padrao = (process.env.DEFAULT_USER_PASSWORD || '').trim() || 'senha123';
  return { senha: padrao, gerada: false };
}

function assertSeedPermitido() {
  // só valida as regras de produção; desenvolvimento sempre ok
  obterSenhaSeed();
}

module.exports = {
  isProducao,
  senhaEFraca,
  gerarSenhaTemporaria,
  obterSenhaSeed,
  obterSenhaCadastro,
  assertSeedPermitido,
  SENHAS_FRACAS
};
