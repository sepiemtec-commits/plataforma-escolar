/**
 * Tokens de autenticação — access JWT + refresh opaco.
 * Atualizações de refresh usam update atômico (evita VersionError sob login concorrente).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { obterJwtSecret } = require('./jwtSecret');

const ACCESS_EXPIRE = () => process.env.JWT_EXPIRE || '2h';
const REFRESH_DAYS = () => Number(process.env.JWT_REFRESH_DAYS || 14);

function hashOpaco(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

function gerarTokenOpaco() {
  return crypto.randomBytes(48).toString('base64url');
}

function emitirAccessToken(usuario) {
  return jwt.sign(
    {
      id: String(usuario._id),
      v: Number(usuario.tokenVersion || 0)
    },
    obterJwtSecret(),
    { expiresIn: ACCESS_EXPIRE(), algorithm: 'HS256' }
  );
}

function criarRefreshTokenDoc() {
  const token = gerarTokenOpaco();
  const dias = REFRESH_DAYS();
  const expira = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return {
    token,
    hash: hashOpaco(token),
    expira
  };
}

function limparRefreshExpirados(usuario) {
  const agora = new Date();
  usuario.refreshTokens = (usuario.refreshTokens || []).filter((t) => t.expira > agora);
}

function modelUsuario() {
  // require lazy — evita ciclo com schema
  return require('../database/schema').Usuario;
}

async function anexarRefreshToken(usuario) {
  const MAX = Number(process.env.JWT_REFRESH_MAX || 10);
  const doc = criarRefreshTokenDoc();
  const Usuario = modelUsuario();
  // Atômico: sem documento mongoose versionado → sem VersionError no spike
  await Usuario.updateOne(
    { _id: usuario._id },
    {
      $push: {
        refreshTokens: {
          $each: [{ hash: doc.hash, expira: doc.expira }],
          $slice: -MAX
        }
      }
    }
  );
  return doc.token;
}

async function revogarRefreshToken(usuario, refreshToken) {
  if (!refreshToken) return;
  const h = hashOpaco(refreshToken);
  const Usuario = modelUsuario();
  await Usuario.updateOne({ _id: usuario._id }, { $pull: { refreshTokens: { hash: h } } });
}

async function revogarTodosRefresh(usuario) {
  const Usuario = modelUsuario();
  await Usuario.updateOne({ _id: usuario._id }, { $set: { refreshTokens: [] } });
}

async function incrementarTokenVersion(usuario) {
  const Usuario = modelUsuario();
  const updated = await Usuario.findOneAndUpdate(
    { _id: usuario._id },
    {
      $inc: { tokenVersion: 1 },
      $set: {
        refreshTokens: [],
        resetSenhaHash: undefined,
        resetSenhaExpira: undefined
      },
      $unset: { resetSenhaHash: 1, resetSenhaExpira: 1 }
    },
    { new: true }
  );
  const v = Number((updated && updated.tokenVersion) || Number(usuario.tokenVersion || 0) + 1);
  usuario.tokenVersion = v;
  usuario.refreshTokens = [];
  return v;
}

function verificarAccessToken(token) {
  return jwt.verify(token, obterJwtSecret(), { algorithms: ['HS256'] });
}

module.exports = {
  hashOpaco,
  gerarTokenOpaco,
  emitirAccessToken,
  criarRefreshTokenDoc,
  anexarRefreshToken,
  revogarRefreshToken,
  revogarTodosRefresh,
  incrementarTokenVersion,
  verificarAccessToken,
  limparRefreshExpirados
};
