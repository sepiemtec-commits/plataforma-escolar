const {
  escapeRegex,
  sanitizeFilename,
  assertPathInsideRoot,
  extensaoPermitida,
  EXT_DOCUMENTO_OK
} = require('../../backend/utils/safePath');
const path = require('path');
const os = require('os');

describe('safePath', () => {
  test('escapeRegex neutraliza metacaracteres', () => {
    expect(escapeRegex('a.b*(c)')).toBe('a\\.b\\*\\(c\\)');
    expect(new RegExp(escapeRegex('(a+)+$')).test('(a+)+$')).toBe(true);
  });

  test('sanitizeFilename remove path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('relatório (1).pdf')).toMatch(/relat/i);
    expect(sanitizeFilename('../../../x.php')).toBe('x.php');
  });

  test('assertPathInsideRoot bloqueia escape', () => {
    const root = path.join(os.tmpdir(), 'veho-root-test');
    expect(() => assertPathInsideRoot(root, path.join(root, 'ok.pdf'))).not.toThrow();
    expect(() => assertPathInsideRoot(root, path.join(root, '..', 'outside.pdf'))).toThrow(
      /inválido/i
    );
  });

  test('extensaoPermitida só aceita whitelist', () => {
    expect(extensaoPermitida('a.PDF', EXT_DOCUMENTO_OK)).toBe('.pdf');
    expect(extensaoPermitida('shell.php', EXT_DOCUMENTO_OK)).toBeNull();
    expect(extensaoPermitida('x.jpg.php', EXT_DOCUMENTO_OK)).toBeNull();
  });
});
