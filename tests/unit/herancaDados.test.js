const XLSX = require('xlsx');
const { lerArquivo } = require('../../backend/services/herancaDados');

function planilha(linhas) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('herança de dados', () => {
  test('lê planilha com cabeçalho em português e ignora linha vazia', async () => {
    const buffer = planilha([
      ['Nome', 'E-mail', 'Turma', 'Nível'],
      ['Ana Silva', 'ana@escola.com', '5º Ano A', 'Fundamental I'],
      ['', '', '', ''],
      ['Bruno', '', '8º Ano A', 'Fundamental II']
    ]);
    const lido = await lerArquivo(buffer, 'turma.xlsx');
    expect(lido.linhas).toHaveLength(2);
    expect(lido.linhas[0]).toMatchObject({
      nome: 'Ana Silva',
      email: 'ana@escola.com',
      turma: '5º Ano A',
      nivel: 'Fundamental I'
    });
    expect(lido.linhas[1].nome).toBe('Bruno');
  });

  test('lê CSV com ponto e vírgula', async () => {
    const csv = 'Nome;CPF;Turma\nCarla Souza;123.456.789-00;2º Ano EM A\n';
    const lido = await lerArquivo(Buffer.from(csv), 'alunos.csv');
    expect(lido.linhas[0].nome).toBe('Carla Souza');
    expect(lido.linhas[0].cpf).toBe('123.456.789-00');
  });

  test('arquivo ilegível não lança erro', async () => {
    const lido = await lerArquivo(Buffer.from([0, 1, 2, 3, 4, 255, 0, 9]), 'foto.bin');
    expect(lido.linhas).toEqual([]);
    expect(Array.isArray(lido.avisos)).toBe(true);
  });

  test('JSON de alunos vira linhas', async () => {
    const json = JSON.stringify({
      alunos: [{ nome: 'Davi', email: 'davi@escola.com', turma: '5º Ano A' }]
    });
    const lido = await lerArquivo(Buffer.from(json), 'export.json');
    expect(lido.linhas[0].nome).toBe('Davi');
  });
});
