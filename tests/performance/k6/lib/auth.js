import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { BASE_URL, LOAD_EMAIL, LOAD_PASSWORD, REQUEST_TIMEOUT } from './config.js';

const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };

/** Pool opcional gerado pelo start-load-target (evita logout cruzado). */
const userPool = new SharedArray('load_users', () => {
  const candidates = [
    'tests/performance/results/load-users.json',
    '../results/load-users.json',
    '../../results/load-users.json'
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(open(p));
      const users = parsed.users || [];
      if (users.length) return users;
    } catch {
      /* tenta próximo */
    }
  }
  return [];
});

export function pickCredentials() {
  if (userPool.length > 0) {
    const vu = __VU > 0 ? __VU : 1;
    const idx = (vu - 1) % userPool.length;
    const u = userPool[idx];
    return { email: u.email, password: u.password || LOAD_PASSWORD };
  }
  return { email: LOAD_EMAIL, password: LOAD_PASSWORD };
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

/**
 * Login — retorna { token, usuario } ou null.
 * Em carga: o servidor deve ter DISABLE_RATE_LIMIT=1.
 */
export function login(email, password) {
  const creds = email
    ? { email, password: password || LOAD_PASSWORD }
    : pickCredentials();
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: creds.email, senha: creds.password }),
    { headers: jsonHeaders, timeout: REQUEST_TIMEOUT, tags: { op: 'login' } }
  );
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login tem token': (r) => {
      try {
        return !!JSON.parse(r.body).token;
      } catch {
        return false;
      }
    }
  });
  if (!ok || res.status !== 200) return null;
  try {
    const body = JSON.parse(res.body);
    return { token: body.token, usuario: body.usuario || body.user || null, raw: body, email: creds.email };
  } catch {
    return null;
  }
}

export function logout(token) {
  if (!token) return null;
  const res = http.post(`${BASE_URL}/api/auth/logout`, null, {
    headers: authHeaders(token),
    timeout: REQUEST_TIMEOUT,
    tags: { op: 'logout' }
  });
  check(res, { 'logout 2xx': (r) => r.status >= 200 && r.status < 300 });
  return res;
}

/**
 * Descobre IDs úteis (turma, aluno, professor) para rotas parametrizadas.
 */
export function discoverContext(token) {
  const ctx = { turmaId: null, alunoId: null, professorId: null };
  const h = authHeaders(token);

  const turmas = http.get(`${BASE_URL}/api/turmas`, {
    headers: h,
    timeout: REQUEST_TIMEOUT,
    tags: { op: 'discover_turmas' }
  });
  if (turmas.status === 200) {
    try {
      const body = JSON.parse(turmas.body);
      const lista = body.turmas || body || [];
      if (Array.isArray(lista) && lista.length) {
        ctx.turmaId = String(lista[0]._id || lista[0].id);
        const alunos = lista[0].alunos || [];
        if (alunos.length) {
          const a = alunos[0];
          ctx.alunoId = String(a._id || a.id || a);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const usuarios = http.get(`${BASE_URL}/api/usuarios?tipo=aluno`, {
    headers: h,
    timeout: REQUEST_TIMEOUT,
    tags: { op: 'discover_alunos' }
  });
  if (usuarios.status === 200 && !ctx.alunoId) {
    try {
      const body = JSON.parse(usuarios.body);
      const lista = body.usuarios || [];
      if (lista.length) ctx.alunoId = String(lista[0]._id || lista[0].id);
    } catch {
      /* ignore */
    }
  }

  const profs = http.get(`${BASE_URL}/api/usuarios?tipo=professor`, {
    headers: h,
    timeout: REQUEST_TIMEOUT,
    tags: { op: 'discover_profs' }
  });
  if (profs.status === 200) {
    try {
      const body = JSON.parse(profs.body);
      const lista = body.usuarios || [];
      if (lista.length) ctx.professorId = String(lista[0]._id || lista[0].id);
    } catch {
      /* ignore */
    }
  }

  if (!ctx.turmaId) {
    const listaProf = http.get(`${BASE_URL}/api/turmas/professores/lista`, {
      headers: h,
      timeout: REQUEST_TIMEOUT,
      tags: { op: 'discover_prof_lista' }
    });
    if (listaProf.status === 200 && !ctx.professorId) {
      try {
        const body = JSON.parse(listaProf.body);
        const lista = body.professores || body || [];
        if (Array.isArray(lista) && lista.length) {
          ctx.professorId = String(lista[0]._id || lista[0].id);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return ctx;
}
