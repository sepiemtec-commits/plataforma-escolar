// backend/utils/jwtSecret.js — Exige JWT_SECRET forte (sem fallback)
const PLACEHOLDERS = [
  'sua_chave',
  'mude_para_producao',
  'mude_em_producao',
  'substitua',
  'change_me',
  'changeme',
  'secret',
  'jwt_secret',
  'edplus-assinatura',
  'example',
  'password',
  '123456'
];

const MIN_LENGTH = 32;

/**
 * Valida JWT_SECRET. Lança Error se ausente ou fraco.
 * @returns {string} segredo validado
 */
function obterJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error(
      'JWT_SECRET não definida. Defina no .env uma chave aleatória com no mínimo 32 caracteres.'
    );
  }

  const valor = secret.trim();

  if (valor.length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET fraca: mínimo ${MIN_LENGTH} caracteres (atual: ${valor.length}). Gere com: openssl rand -hex 32`
    );
  }

  const lower = valor.toLowerCase();
  const isPlaceholder = PLACEHOLDERS.some(p => lower.includes(p));
  if (isPlaceholder) {
    throw new Error(
      'JWT_SECRET parece um placeholder de exemplo. Substitua por uma chave aleatória forte (openssl rand -hex 32).'
    );
  }

  return valor;
}

module.exports = { obterJwtSecret, MIN_LENGTH };
