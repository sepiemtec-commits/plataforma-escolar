const mongoose = require('mongoose');
require('dotenv').config();
const { formatarNomeDisciplina } = require('../backend/utils/formatarDisciplina');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cols = ['avaliacaos', 'desempenhos', 'presencas', 'horarioaulas', 'conteudos'];
  for (const col of cols) {
    const vals = await mongoose.connection.collection(col).distinct('disciplina');
    const bad = vals.filter((v) => v && formatarNomeDisciplina(v) !== v);
    for (const v of bad) {
      const novo = formatarNomeDisciplina(v);
      const r = await mongoose.connection.collection(col).updateMany(
        { disciplina: v },
        { $set: { disciplina: novo } }
      );
      if (r.modifiedCount) {
        console.log(col, JSON.stringify(v), '->', JSON.stringify(novo), r.modifiedCount);
      }
    }
  }
  const names = (await mongoose.connection.collection('turmas').find({}).project({ nome: 1 }).toArray()).map((t) => t.nome);
  const dups = names.filter((n, i) => names.indexOf(n) !== i);
  console.log('dup names left', [...new Set(dups)]);
  console.log('turmas B', names.filter((n) => / B$/.test(n)));
  console.log('format Espanhol', formatarNomeDisciplina('Espanhol'));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
