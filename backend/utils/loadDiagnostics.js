/**
 * Diagnóstico de gargalo para spike/carga.
 * Expõe /health/diag quando LOAD_DIAGNOSTICS=1 (load target).
 */
const mongoose = require('mongoose');
const { monitorEventLoopDelay } = require('perf_hooks');

function attachLoadDiagnostics(app) {
  if (process.env.LOAD_DIAGNOSTICS !== '1') return { getSnapshot: () => null };

  const el = monitorEventLoopDelay({ resolution: 20 });
  el.enable();

  let inFlight = 0;
  let reqTotal = 0;
  let req5xx = 0;
  const startedAt = Date.now();

  app.use((req, res, next) => {
    if (req.path.startsWith('/health')) return next();
    inFlight += 1;
    reqTotal += 1;
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      inFlight = Math.max(0, inFlight - 1);
      if (res.statusCode >= 500) req5xx += 1;
      // hrtime disponível se precisar depois
      void start;
    });
    next();
  });

  function poolInfo() {
    const info = {
      maxPoolSize: 100,
      minPoolSize: 0,
      note: 'mongoose default'
    };
    try {
      const client = mongoose.connection.getClient && mongoose.connection.getClient();
      if (client && client.options) {
        info.maxPoolSize = client.options.maxPoolSize || info.maxPoolSize;
        info.minPoolSize = client.options.minPoolSize || 0;
      }
      // Driver pode expor contadores internos conforme versão
      const topo = client && (client.topology || client.s?.topology);
      if (topo && topo.s && topo.s.servers) {
        const servers = [...topo.s.servers.values()];
        let checkedOut = 0;
        let totalConnections = 0;
        let waitQueue = 0;
        servers.forEach((srv) => {
          const pool = srv.s?.pool || srv.pool;
          if (!pool) return;
          checkedOut += pool.currentCheckedOutCount || pool.totalConnectionCount - (pool.availableConnectionCount || 0) || 0;
          totalConnections += pool.totalConnectionCount || 0;
          waitQueue += pool.waitQueueSize || pool.waitingCount || 0;
        });
        info.checkedOut = checkedOut;
        info.totalConnections = totalConnections;
        info.waitQueueSize = waitQueue;
        info.poolUtilization =
          info.maxPoolSize > 0 ? Number((checkedOut / info.maxPoolSize).toFixed(3)) : null;
      }
    } catch (e) {
      info.error = String(e.message || e);
    }
    return info;
  }

  function getSnapshot() {
    const mem = process.memoryUsage();
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    let sessions = { refreshTokenDocs: null, totalRefreshTokens: null };
    try {
      // contagem assíncrona não bloqueia o snapshot síncrono — valores do último poll
      sessions = lastSessionStats;
    } catch {
      /* ignore */
    }

    let tmp = { bytes: 0, files: 0 };
    try {
      const dirs = [
        path.join(__dirname, '../../private/documentos'),
        path.join(__dirname, '../../uploads'),
        path.join(os.tmpdir(), 'veho')
      ];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const walk = (d) => {
          for (const name of fs.readdirSync(d)) {
            const p = path.join(d, name);
            let st;
            try {
              st = fs.statSync(p);
            } catch {
              continue;
            }
            if (st.isDirectory()) walk(p);
            else {
              tmp.files += 1;
              tmp.bytes += st.size;
            }
          }
        };
        walk(dir);
      }
    } catch {
      /* ignore */
    }

    return {
      ts: new Date().toISOString(),
      uptimeSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      node: {
        pid: process.pid,
        inFlight,
        reqTotal,
        req5xx,
        rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
        heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
        heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(1)),
        externalMb: Number((mem.external / 1024 / 1024).toFixed(1)),
        eventLoopDelayP95Ms: Number((el.percentile(95) / 1e6).toFixed(2)),
        eventLoopDelayMaxMs: Number((el.max / 1e6).toFixed(2))
      },
      mongo: {
        readyState: mongoose.connection.readyState,
        pool: poolInfo()
      },
      sessions,
      tempFiles: {
        files: tmp.files,
        mb: Number((tmp.bytes / 1024 / 1024).toFixed(3))
      },
      cache: { available: false, note: 'Sem cache Redis/in-memory de aplicação além do JWT' },
      redis: { available: false, note: 'VEHO Edu não usa Redis' },
      queues: { available: false, note: 'Sem filas (Bull/Rabbit/SQS) no código' }
    };
  }

  let lastSessionStats = { refreshTokenDocs: null, totalRefreshTokens: null, error: null };
  async function pollSessions() {
    try {
      const { Usuario } = require('../database/schema');
      const docs = await Usuario.countDocuments({ 'refreshTokens.0': { $exists: true } });
      const agg = await Usuario.aggregate([
        { $project: { n: { $size: { $ifNull: ['$refreshTokens', []] } } } },
        { $group: { _id: null, total: { $sum: '$n' } } }
      ]);
      lastSessionStats = {
        refreshTokenDocs: docs,
        totalRefreshTokens: (agg[0] && agg[0].total) || 0,
        error: null
      };
    } catch (e) {
      lastSessionStats = { ...lastSessionStats, error: String(e.message || e) };
    }
  }
  setInterval(pollSessions, 15000);
  pollSessions();

  app.get('/health/diag', (req, res) => {
    res.json({ sucesso: true, diag: getSnapshot() });
  });

  return { getSnapshot };
}

module.exports = { attachLoadDiagnostics };
