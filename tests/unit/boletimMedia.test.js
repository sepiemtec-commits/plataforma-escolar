const {
  calcularMedia,
  mapaAvaliacoes,
  contarFaltasDisciplina,
  pesoTipo,
  BIMESTRES
} = require('../../backend/services/boletim');

describe('boletim — notas e médias', () => {
  test('comportamento normal: média ponderada prova+teste+comportamental', () => {
    // (8*1 + 6*1 + 10*0.5) / 2.5 = 7.6
    expect(calcularMedia({ prova: 8, teste: 6, comportamental: 10 })).toBe(7.6);
  });

  test('dados ausentes: sem notas → null', () => {
    expect(calcularMedia({})).toBeNull();
    expect(calcularMedia({ prova: null, teste: null })).toBeNull();
  });

  test('dados parciais: só prova', () => {
    expect(calcularMedia({ prova: 9 })).toBe(9);
  });

  test('pesoTipo comportamental é metade', () => {
    expect(pesoTipo('comportamental')).toBe(0.5);
    expect(pesoTipo('prova_bimestral')).toBe(1);
  });

  test('mapaAvaliacoes agrupa por disciplina e período', () => {
    const mapa = mapaAvaliacoes([
      { disciplina: 'Matemática', periodo: '1º Bimestre', tipo: 'prova_bimestral', nota: 7 },
      { disciplina: 'Matemática', periodo: '1º Bimestre', tipo: 'teste_bimestral', nota: 8 },
      { disciplina: 'Português', periodo: '1º Bimestre', tipo: 'comportamental', nota: 9 }
    ]);
    expect(mapa['Matemática_1º Bimestre']).toEqual({ prova: 7, teste: 8 });
    expect(mapa['Português_1º Bimestre'].comportamental).toBe(9);
  });

  test('mapaAvaliacoes com lista vazia', () => {
    expect(mapaAvaliacoes([])).toEqual({});
  });

  test('BIMESTRES tem 4 períodos', () => {
    expect(BIMESTRES).toHaveLength(4);
  });
});

describe('boletim — frequência por disciplina', () => {
  const turmaId = 't1';

  test('conta faltas da disciplina na turma', () => {
    const presencas = [
      { turma_id: 't1', status: 'falta', disciplina: 'Matemática' },
      { turma_id: 't1', status: 'falta', disciplina: 'Matemática' },
      { turma_id: 't1', status: 'presente', disciplina: 'Matemática' },
      { turma_id: 't1', status: 'falta', disciplina: 'Português' },
      { turma_id: 't2', status: 'falta', disciplina: 'Matemática' }
    ];
    expect(contarFaltasDisciplina(presencas, turmaId, 'Matemática')).toBe(2);
  });

  test('disciplina Geral conta faltas sem disciplina', () => {
    const presencas = [
      { turma_id: 't1', status: 'falta' },
      { turma_id: 't1', status: 'falta', disciplina: 'Matemática' }
    ];
    expect(contarFaltasDisciplina(presencas, turmaId, 'Geral')).toBe(1);
  });

  test('lista vazia → 0 faltas', () => {
    expect(contarFaltasDisciplina([], turmaId, 'Matemática')).toBe(0);
  });
});
