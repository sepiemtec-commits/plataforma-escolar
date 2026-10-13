/**
 * Senhas novas usam scrypt no threadpool do Node (não trava o event loop).
 * Hashes bcrypt antigos ($2) continuam válidos e são conferidos em worker threads.
 */
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

function tamanhoPool() {
  const cpus = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  const pedido = Number(process.env.BCRYPT_WORKERS || 0);
  const n = pedido > 0 ? pedido : Math.max(2, cpus - 1);
  return Math.max(1, Math.min(n, 12));
}

let workers = null;
let seq = 0;
let rr = 0;
const pending = new Map();

function encerrar(worker) {
  for (const [id, job] of pending) {
    if (job.worker !== worker) continue;
    pending.delete(id);
    job.reject(new Error('worker bcrypt encerrou'));
  }
}

function iniciar() {
  if (workers) return;
  workers = [];
  const script = path.join(__dirname, 'bcryptWorker.js');
  for (let i = 0; i < tamanhoPool(); i++) {
    const worker = new Worker(script);
    worker.unref();
    worker.on('message', (msg) => {
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      if (msg.error) job.reject(new Error(msg.error));
      else job.resolve(msg.result);
    });
    worker.on('error', (err) => {
      encerrar(worker);
      console.error('bcrypt worker:', err.message);
    });
    worker.on('exit', (code) => {
      if (code !== 0) encerrar(worker);
    });
    workers.push(worker);
  }
}

function dispatch(op, payload) {
  iniciar();
  const id = ++seq;
  const worker = workers[rr++ % workers.length];
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, worker });
    worker.postMessage({ id, op, ...payload });
  });
}

function compare(senha, stored) {
  if (!stored) return Promise.resolve(false);
  const hash = String(stored);
  if (hash.startsWith('$2')) {
    return dispatch('compare', { senha: String(senha ?? ''), hash });
  }
  if (hash.startsWith('scrypt$')) return compareScrypt(senha, hash);
  return Promise.resolve(false);
}

const SCRYPT_N = 16384;

function hash(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(senha ?? ''), salt, 32, {
      N: SCRYPT_N,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    }, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${SCRYPT_N}$${salt}$${key.toString('hex')}`);
    });
  });
}

function compareScrypt(senha, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return Promise.resolve(false);
  const N = Number(parts[1]);
  const salt = parts[2];
  let expected;
  try {
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return Promise.resolve(false);
  }
  if (!N || !salt || expected.length === 0) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(senha ?? ''), salt, expected.length, {
      N, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    }, (err, key) => {
      if (err) reject(err);
      else resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

module.exports = { compare, hash, tamanhoPool };
