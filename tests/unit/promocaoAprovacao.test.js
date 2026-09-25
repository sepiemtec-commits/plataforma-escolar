const { avaliarAprovacao } = require('../../backend/services/promocao');
const { proximaSerie, NIVEL_ENSINO } = require('../../backend/constants/ensino');

function boletimCom(medias) {
  return {
    disciplinas: Object.entries(medias).map(([disciplina, mediaFinal]) => ({
      disciplina,
      mediaFinal
    }))
  };
}

describe('promoção — regras de aprovação', () => {
  test('comportamento normal: todas ≥ 6 → aprovado', () => {
    const r = avaliarAprovacao(boletimCom({ Matemática: 7, Português: 6, História: 8 }));
    expect(r.aprovado).toBe(true);
    expect(r.mediaGeral).toBeCloseTo(7, 5);
    expect(r.motivo).toBe('Aprovado');
  });

  test('dados ausentes: sem notas → retido', () => {
    expect(avaliarAprovacao(null)).toMatchObject({ aprovado: false, motivo: 'Sem notas lançadas' });
    expect(avaliarAprovacao({ disciplinas: [] })).toMatchObject({ aprovado: false });
    expect(avaliarAprovacao({ disciplinas: [{ disciplina: 'X', mediaFinal: null }] })).toMatchObject({
      aprovado: false,
      motivo: 'Sem notas lançadas'
    });
  });

  test('regra de negócio: uma disciplina < 6 reprova mesmo com média geral alta', () => {
    const r = avaliarAprovacao(boletimCom({ Matemática: 9, Português: 9, Física: 5 }));
    expect(r.aprovado).toBe(false);
    expect(r.motivo).toMatch(/Física/);
  });

  test('regra de negócio: todas as médias < 6 reprova listando disciplinas', () => {
    const r = avaliarAprovacao(boletimCom({ Matemática: 5, Português: 5 }));
    expect(r.aprovado).toBe(false);
    expect(r.mediaGeral).toBe(5);
    // Com disciplinas individuais < 6, o motivo lista as disciplinas (não só a média geral).
    expect(r.motivo).toMatch(/Média abaixo de 6/);
    expect(r.motivo).toMatch(/Matemática/);
  });

  test('limite exato 6,0 aprova', () => {
    expect(avaliarAprovacao(boletimCom({ Matemática: 6, Português: 6 })).aprovado).toBe(true);
  });
});

describe('promoção — progressão de série', () => {
  test('5º → 6º Fundamental II', () => {
    expect(proximaSerie(NIVEL_ENSINO.FUNDAMENTAL_I, 5)).toEqual({
      nivel: NIVEL_ENSINO.FUNDAMENTAL_II,
      ano: 6
    });
  });

  test('3º EM → concluinte (null)', () => {
    expect(proximaSerie(NIVEL_ENSINO.ENSINO_MEDIO, 3)).toBeNull();
  });

  test('duplicidade de caminho inválido não inventa série', () => {
    expect(proximaSerie(NIVEL_ENSINO.ENSINO_MEDIO, 99)).toBeNull();
  });
});
