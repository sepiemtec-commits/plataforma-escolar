/**
 * Relatórios unitários: agregações usadas em boletins/frequência
 * (sem I/O de banco — cobertura das regras de cálculo).
 */
const { calcularMedia, contarFaltasDisciplina } = require('../../backend/services/boletim');
const { montarResumoFrequencia } = require('../../backend/utils/validacoesAcademicas');
const { avaliarAprovacao } = require('../../backend/services/promocao');

describe('relatórios — agregações acadêmicas', () => {
  test('relatório de desempenho: média + faltas + aprovação', () => {
    const media = calcularMedia({ prova: 7, teste: 7, comportamental: 8 });
    const faltas = contarFaltasDisciplina(
      [
        { turma_id: 't1', status: 'falta', disciplina: 'História' },
        { turma_id: 't1', status: 'falta', disciplina: 'História' }
      ],
      't1',
      'História'
    );
    const freq = montarResumoFrequencia(['presente', 'presente', 'falta', 'falta']);
    const aprov = avaliarAprovacao({
      disciplinas: [{ disciplina: 'História', mediaFinal: media }]
    });

    expect(media).toBeGreaterThanOrEqual(6);
    expect(faltas).toBe(2);
    expect(freq.taxaFalta).toBe(50);
    expect(aprov.aprovado).toBe(true);
  });

  test('relatório vazio não mascara ausência de dados', () => {
    expect(calcularMedia({})).toBeNull();
    expect(montarResumoFrequencia([]).taxaPresenca).toBeNull();
    expect(avaliarAprovacao({ disciplinas: [] }).aprovado).toBe(false);
  });
});
