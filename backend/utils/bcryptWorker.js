const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', async (msg) => {
  try {
    let result;
    if (msg.op === 'compare') {
      result = await bcrypt.compare(String(msg.senha ?? ''), String(msg.hash ?? ''));
    } else if (msg.op === 'hash') {
      result = await bcrypt.hash(String(msg.senha ?? ''), Number(msg.rounds) || 10);
    } else {
      parentPort.postMessage({ id: msg.id, error: 'operação bcrypt inválida' });
      return;
    }
    parentPort.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, error: err.message || 'falha bcrypt' });
  }
});
