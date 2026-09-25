// backend/app.js — Express app factory (sem listen / sem connect Mongo)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const { processarWebhookStripe } = require('./routes/assinatura');

/**
 * Cria a aplicação Express.
 * Conexão Mongo e listen ficam a cargo de server.js ou do harness de teste.
 */
function createApp(options = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test' || options.isTest === true;

  app.set('query parser', 'simple');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://checkout.stripe.com', 'https://js.stripe.com', 'https://hooks.stripe.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        frameAncestors: ["'self'"],
        scriptSrcAttr: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProd
  }));

  const corsOrigin = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '*'
    ? process.env.FRONTEND_URL
    : (isProd ? false : true);

  app.use(cors({
    origin: corsOrigin === false ? false : corsOrigin,
    credentials: true
  }));

  if (!isTest) {
    app.use(morgan(isProd ? 'combined' : 'dev'));
  }

  app.post(
    '/api/assinatura/webhook',
    express.raw({ type: 'application/json' }),
    processarWebhookStripe
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(mongoSanitize({
    replaceWith: '_',
    allowDots: false
  }));

  const rotasAutenticacao = require('./routes/autenticacao');
  const rotasPresenca = require('./routes/presenca');
  const rotasAvaliacao = require('./routes/avaliacao');
  const rotasConteudo = require('./routes/conteudo');
  const rotasPainel = require('./routes/painel');
  const rotasUsuarios = require('./routes/usuarios');
  const rotasNotificacoes = require('./routes/notificacoes');
  const rotasTurmas = require('./routes/turmas');
  const rotasRelatorios = require('./routes/relatorios');
  const rotasHistorico = require('./routes/historico');
  const rotasDocumentos = require('./routes/documentos');
  const rotasPromocao = require('./routes/promocao');
  const rotasDisciplinas = require('./routes/disciplinas');
  const rotasHorarios = require('./routes/horarios');
  const rotasAssinatura = require('./routes/assinatura');
  const rotasIA = require('./routes/ia');
  const rotasPush = require('./routes/push');
  const rotasHtpc = require('./routes/htpc');
  const rotasPei = require('./routes/pei');
  const rotasBncc = require('./routes/bncc');
  const rotasSimulados = require('./routes/simulados');

  app.use('/api/auth', rotasAutenticacao);
  app.use('/api/presenca', rotasPresenca);
  app.use('/api/avaliacao', rotasAvaliacao);
  app.use('/api/conteudo', rotasConteudo);
  app.use('/api/painel', rotasPainel);
  app.use('/api/usuarios', rotasUsuarios);
  app.use('/api/notificacoes', rotasNotificacoes);
  app.use('/api/turmas', rotasTurmas);
  app.use('/api/relatorios', rotasRelatorios);
  app.use('/api/historico', rotasHistorico);
  app.use('/api/documentos', rotasDocumentos);
  app.use('/api/promocao', rotasPromocao);
  app.use('/api/disciplinas', rotasDisciplinas);
  app.use('/api/horarios', rotasHorarios);
  app.use('/api/assinatura', rotasAssinatura);
  app.use('/api/ia', rotasIA);
  app.use('/api/push', rotasPush);
  app.use('/api/htpc', rotasHtpc);
  app.use('/api/pei', rotasPei);
  app.use('/api/bncc', rotasBncc);
  app.use('/api/simulados', rotasSimulados);

  app.get('/health', (req, res) => {
    const dbOk = mongoose.connection.readyState === 1;
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'OK' : 'DEGRADED',
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date()
    });
  });

  /** Liveness — processo vivo (orquestradores / K8s). */
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive', timestamp: new Date() });
  });

  /** Readiness — aceita tráfego só com Mongo conectado. */
  app.get('/health/ready', (_req, res) => {
    const dbOk = mongoose.connection.readyState === 1;
    if (!dbOk) {
      return res.status(503).json({
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date()
      });
    }
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date()
    });
  });

  /** Métricas básicas estilo Prometheus (sem dependência extra). */
  app.get('/metrics', (_req, res) => {
    const mem = process.memoryUsage();
    const dbState = mongoose.connection.readyState;
    const lines = [
      '# HELP veho_up 1 se o processo responde',
      '# TYPE veho_up gauge',
      'veho_up 1',
      '# HELP veho_nodejs_heap_used_bytes Heap JS em uso',
      '# TYPE veho_nodejs_heap_used_bytes gauge',
      `veho_nodejs_heap_used_bytes ${mem.heapUsed}`,
      '# HELP veho_nodejs_rss_bytes Resident set size',
      '# TYPE veho_nodejs_rss_bytes gauge',
      `veho_nodejs_rss_bytes ${mem.rss}`,
      '# HELP veho_mongo_ready_state 1=connected 2=connecting 0=disconnected 3=disconnecting',
      '# TYPE veho_mongo_ready_state gauge',
      `veho_mongo_ready_state ${dbState}`,
      '# HELP veho_process_uptime_seconds Uptime do processo',
      '# TYPE veho_process_uptime_seconds gauge',
      `veho_process_uptime_seconds ${process.uptime()}`
    ];
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(`${lines.join('\n')}\n`);
  });

  if (process.env.LOAD_DIAGNOSTICS === '1') {
    const { attachLoadDiagnostics } = require('./utils/loadDiagnostics');
    attachLoadDiagnostics(app);
  }

  const frontendPath = path.join(__dirname, '../frontend');

  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendPath, 'sw.js'));
  });

  app.get('/manifest.webmanifest', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.sendFile(path.join(frontendPath, 'manifest.webmanifest'));
  });

  // Documentos escolares NÃO são públicos (download só via /api/documentos/:id/download)
  app.use('/uploads/documentos', (_req, res) => {
    res.status(404).json({
      sucesso: false,
      mensagem: 'Arquivo indisponível por URL pública. Use o download autenticado.'
    });
  });

  app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: isProd ? '7d' : 0
  }));

  app.use(express.static(frontendPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Service-Worker-Allowed', '/');
        res.setHeader('Cache-Control', 'no-cache');
      }
      if (filePath.endsWith('.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      }
    }
  }));

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Rota não encontrada'
      });
    }
    res.status(404).sendFile(path.join(frontendPath, 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (!isTest) console.error(err);
    const status = err.status || err.statusCode || 500;
    // Nunca devolver stack trace; em produção mensagem genérica
    const mensagem = isProd
      ? 'Erro interno do servidor'
      : String(err.message || 'Erro interno').slice(0, 300);
    res.status(status).json({
      sucesso: false,
      mensagem
    });
  });

  return app;
}

module.exports = { createApp };
