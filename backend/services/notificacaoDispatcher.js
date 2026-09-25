// backend/services/notificacaoDispatcher.js — dispara WhatsApp / SMS / Push
const notificadorWhatsApp = require('./whatsapp');
const notificadorSms = require('./sms');
const webPush = require('./webPush');

/**
 * Normaliza canais a partir do body. Default: só WhatsApp (compatibilidade).
 */
function resolverCanais(canais) {
  if (!canais || typeof canais !== 'object') {
    return { whatsapp: true, sms: false, push: false };
  }
  return {
    whatsapp: Boolean(canais.whatsapp),
    sms: Boolean(canais.sms),
    push: Boolean(canais.push)
  };
}

/**
 * @param {object} opts
 * @param {{ whatsapp?: boolean, sms?: boolean, push?: boolean }} opts.canais
 * @param {string[]} opts.numeros — telefones para WA/SMS
 * @param {string[]} [opts.userIds] — usuários para Web Push
 * @param {string} [opts.escolaId]
 * @param {string} opts.titulo
 * @param {string} opts.corpo — texto plano (SMS/Push)
 * @param {string} [opts.corpoWhatsapp] — se omitido, usa corpo
 * @param {string} [opts.url]
 * @param {'geral'|'falta'|'boletim'|'desempenho'} [opts.tipo]
 * @param {object} [opts.meta] — dados extras (nomeAluno, data, desempenho, disciplina, media)
 */
async function despachar(opts) {
  const canais = resolverCanais(opts.canais);
  const numeros = [...new Set((opts.numeros || []).filter(Boolean))];
  const userIds = [...new Set((opts.userIds || []).map((id) => String(id)).filter(Boolean))];
  const titulo = opts.titulo || 'VEHO Edu';
  const corpo = opts.corpo || '';
  const corpoWa = opts.corpoWhatsapp || corpo;

  const enviados = { whatsapp: 0, sms: 0, push: 0 };

  if (canais.whatsapp && numeros.length) {
    for (const numero of numeros) {
      let ok = false;
      if (opts.tipo === 'falta' && opts.meta) {
        ok = await notificadorWhatsApp.enviarAlertaFalta(
          numero,
          opts.meta.nomeAluno,
          opts.meta.data
        );
      } else if (opts.tipo === 'boletim' && opts.meta) {
        ok = await notificadorWhatsApp.enviarBoletim(
          numero,
          opts.meta.nomeAluno,
          opts.meta.desempenho
        );
      } else if (opts.tipo === 'desempenho' && opts.meta) {
        ok = await notificadorWhatsApp.enviarAlertaDesempenho(
          numero,
          opts.meta.nomeAluno,
          opts.meta.disciplina,
          opts.meta.media
        );
      } else {
        ok = await notificadorWhatsApp.enviarNotificacao(numero, titulo, corpoWa);
      }
      if (ok) enviados.whatsapp++;
    }
  }

  if (canais.sms && numeros.length) {
    for (const numero of numeros) {
      let ok = false;
      if (opts.tipo === 'falta' && opts.meta) {
        ok = await notificadorSms.enviarAlertaFalta(
          numero,
          opts.meta.nomeAluno,
          opts.meta.data
        );
      } else if (opts.tipo === 'boletim' && opts.meta) {
        ok = await notificadorSms.enviarBoletim(
          numero,
          opts.meta.nomeAluno,
          opts.meta.desempenho
        );
      } else if (opts.tipo === 'desempenho' && opts.meta) {
        ok = await notificadorSms.enviarAlertaDesempenho(
          numero,
          opts.meta.nomeAluno,
          opts.meta.disciplina,
          opts.meta.media
        );
      } else {
        ok = await notificadorSms.enviarNotificacao(numero, titulo, corpo);
      }
      if (ok) enviados.sms++;
    }
  }

  if (canais.push && userIds.length) {
    enviados.push = await webPush.enviarParaUsuarios({
      escolaId: opts.escolaId,
      userIds,
      titulo,
      corpo,
      url: opts.url
    });
  }

  return {
    canais,
    enviados,
    total:
      enviados.whatsapp + enviados.sms + enviados.push
  };
}

module.exports = {
  resolverCanais,
  despachar
};
