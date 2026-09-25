/**
 * Utilitários de endurecimento — paths, nomes de arquivo e RegExp.
 */
const path = require('path');

function escapeRegex(texto) {
  return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove componentes de path e caracteres perigosos do nome de arquivo.
 */
function sanitizeFilename(nome, { fallback = 'arquivo', maxLen = 120 } = {}) {
  const base = path.basename(String(nome || '').replace(/\\/g, '/'));
  const limpo = base
    .replace(/[^\w.\-()\u00C0-\u024F\s]/gi, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, maxLen);
  return limpo || fallback;
}

/**
 * Garante que resolved está dentro de rootDir (anti path traversal).
 */
function assertPathInsideRoot(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(candidatePath);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) {
    const err = new Error('Caminho de arquivo inválido');
    err.status = 400;
    throw err;
  }
  return resolved;
}

const EXT_DOCUMENTO_OK = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const EXT_IMAGEM_OK = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function extensaoPermitida(nome, permitidas) {
  const ext = path.extname(String(nome || '')).toLowerCase();
  return permitidas.has(ext) ? ext : null;
}

module.exports = {
  escapeRegex,
  sanitizeFilename,
  assertPathInsideRoot,
  extensaoPermitida,
  EXT_DOCUMENTO_OK,
  EXT_IMAGEM_OK
};
