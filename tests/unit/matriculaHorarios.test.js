const {
  chaveSlot,
  rotuloDia,
  tempoDoSlot,
  validarGradeHorarios,
  matricularAlunoUmaTurma,
  validarConflitoPresencaTempo
} = require('../../backend/utils/conflitosAgenda');

describe('matrículas / horários — conflitos (regras locais sem I/O)', () => {
  test('chaveSlot e rotuloDia', () => {
    expect(chaveSlot(1, '07:30', 'Manhã')).toBe('1|07:30|Manhã');
    expect(rotuloDia(0)).toBe('Segunda');
    expect(rotuloDia(99)).toMatch(/dia/);
  });

  test('tempoDoSlot mapeia horário do turno', () => {
    expect(tempoDoSlot('Manhã', '07:30')).toBe(1);
    expect(tempoDoSlot('Manhã', '08:20')).toBe(2);
    expect(tempoDoSlot('Manhã', '99:99')).toBeNull();
  });

  test('grade vazia ok', async () => {
    await expect(
      validarGradeHorarios({ escolaId: 'e', turmaId: 't', turno: 'Manhã', horarios: [] })
    ).resolves.toEqual({ ok: true });
  });

  test('duplicidade de slot na mesma turma', async () => {
    const r = await validarGradeHorarios({
      escolaId: 'e',
      turmaId: 't',
      turno: 'Manhã',
      horarios: [
        { diaSemana: 0, horaInicio: '07:30', professor_id: 'p1', disciplina: 'Mat' },
        { diaSemana: 0, horaInicio: '07:30', professor_id: 'p2', disciplina: 'Por' }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/Conflito na turma/);
  });

  test('duplicidade de horário: conflito de turma tem precedência no payload', async () => {
    // Mesmo dia/hora: a regra de slot da turma dispara antes da de professor.
    const r = await validarGradeHorarios({
      escolaId: 'e',
      turmaId: 't',
      turno: 'Manhã',
      horarios: [
        { diaSemana: 1, horaInicio: '08:20', professor_id: 'p1', disciplina: 'Mat' },
        { diaSemana: 1, horaInicio: '08:20', professor_id: 'p1', disciplina: 'Fis' }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/Conflito na turma/);
  });

  test('matrícula: dados ausentes', async () => {
    expect(await matricularAlunoUmaTurma({ escolaId: 'e', alunoId: null, turmaId: 't' })).toEqual({
      ok: false,
      mensagem: 'Aluno e turma são obrigatórios'
    });
    expect(await matricularAlunoUmaTurma({ escolaId: 'e', alunoId: 'a', turmaId: '' })).toMatchObject(
      { ok: false }
    );
  });

  test('presença: tempo inválido / ausente', async () => {
    expect(
      await validarConflitoPresencaTempo({
        alunoId: 'a',
        turmaId: 't',
        dataInicio: new Date(),
        dataFim: new Date(),
        tempo: 0,
        disciplinaNome: 'Matemática'
      })
    ).toMatchObject({ ok: false, mensagem: 'Informe o tempo da aula' });

    expect(
      await validarConflitoPresencaTempo({
        alunoId: 'a',
        turmaId: 't',
        dataInicio: new Date(),
        dataFim: new Date(),
        tempo: null,
        disciplinaNome: 'Matemática'
      })
    ).toMatchObject({ ok: false });
  });
});
