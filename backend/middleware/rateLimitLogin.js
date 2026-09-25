// backend/middleware/rateLimitLogin.js — Anti força-bruta no login
const rateLimit = require('express-rate-limit');

/**
 * Limite por IP + e-mail (padrão: 5 falhas / 15 min).
 * max é função para permitir ajuste via env em testes sem reiniciar o processo.
 */
const rateLimitLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => Number(process.env.RATE_LIMIT_LOGIN_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () =>
    process.env.DISABLE_RATE_LIMIT === '1' ||
    process.env.DISABLE_RATE_LIMIT === 'true',
  keyGenerator: (req) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `${ip}:${email || 'sem-email'}`;
  },
  handler: (req, res) => {
    const retryAfter = req.rateLimit?.resetTime
      ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
      : 900;

    res.status(429).json({
      sucesso: false,
      mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
      retryAfterSegundos: retryAfter
    });
  },
  validate: { keyGeneratorIpFallback: false }
});

module.exports = { rateLimitLogin };
