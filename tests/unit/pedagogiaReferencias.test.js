const {
  selecionarReferencias,
  normalizarArea,
  formatarReferenciasParaTexto
} = require('../../backend/constants/pedagogiaReferencias');
const { gerarTextoLocal } = require('../../backend/services/iaPedagogica');

describe('pedagogiaReferencias', () => {
  test('mapeia disciplina para área', () => {
    expect(normalizarArea('Matemática')).toBe('matematica');
    expect(normalizarArea('Língua Portuguesa')).toBe('linguagens');
    expect(normalizarArea('História')).toBe('historia');
  });

  test('seleciona referências por nível e disciplina', () => {
    const { area, referencias } = selecionarReferencias('Matemática', 'alerta');
    expect(area).toBe('matematica');
    expect(referencias.length).toBeGreaterThanOrEqual(2);
    expect(referencias.some((r) => /Vygotsky|Freire|Pólya|D’Ambrosio|Ambrosio|BNCC/i.test(r.autor))).toBe(
      true
    );
  });

  test('formata bloco de texto com autores', () => {
    const { referencias } = selecionarReferencias('Português', 'bom');
    const bloco = formatarReferenciasParaTexto(referencias);
    expect(bloco).toMatch(/Fundamentos e autores/);
    expect(bloco).toMatch(/\*\*/);
  });
});

describe('gerarTextoLocal com referências', () => {
  test('inclui fundamentos nas orientações', () => {
    const out = gerarTextoLocal({
      aluno: { nome: 'Ana Silva' },
      turma: { nome: '5º A' },
      disciplina: 'Matemática',
      media: 5.5,
      frequenciaPercentual: 80,
      totalFaltas: 4,
      nivel: 'alerta'
    });
    expect(out.fonte).toBe('local');
    expect(out.textoOrientacoes).toMatch(/Fundamentos e autores/);
    expect(out.referencias.length).toBeGreaterThan(0);
  });
});
