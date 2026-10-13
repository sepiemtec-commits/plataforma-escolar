/**
 * Cache curto com uma única execução por chave.
 * Várias requisições iguais ao mesmo tempo esperam o mesmo cálculo,
 * em vez de repetir a consulta no banco.
 */
function criarCache({ ttlMs = 3000, max = 500 } = {}) {
  const store = new Map();
  const inflight = new Map();

  function ler(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > ttlMs) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function gravar(key, value) {
    if (store.size >= max && !store.has(key)) {
      const antigo = store.keys().next().value;
      store.delete(antigo);
    }
    store.set(key, { at: Date.now(), value });
  }

  function obter(key, fn) {
    const hit = ler(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending;
    const job = Promise.resolve()
      .then(fn)
      .then((value) => {
        gravar(key, value);
        inflight.delete(key);
        return value;
      }, (err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, job);
    return job;
  }

  function invalidarPrefixo(prefix) {
    for (const key of store.keys()) {
      if (String(key).startsWith(prefix)) store.delete(key);
    }
  }

  return { obter, invalidarPrefixo };
}

module.exports = { criarCache };
