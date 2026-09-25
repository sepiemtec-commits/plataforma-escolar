const { escapeHtml } = require('../../backend/utils/escapeHtml');

describe('escapeHtml', () => {
  test('escapa tags e aspas (XSS)', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml("O'Reilly & Co")).toBe('O&#39;Reilly &amp; Co');
  });

  test('nulos e vazios viram string vazia', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  test('números são convertidos sem alterar dígitos', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
