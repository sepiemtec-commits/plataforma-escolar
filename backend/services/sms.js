// backend/services/sms.js — Notificações SMS via Twilio
const twilio = require('twilio');

let client = null;

function obterCliente() {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid?.startsWith('AC') || !authToken) {
    return null;
  }

  client = twilio(accountSid, authToken);
  return client;
}

/** Normaliza para E.164 (+55…). Aceita 11999999999, 5511999999999, +5511… */
function normalizarNumero(numero) {
  if (!numero) return null;
  let digitos = String(numero).replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.startsWith('55') && digitos.length >= 12) {
    return `+${digitos}`;
  }
  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`;
  }
  if (String(numero).trim().startsWith('+')) {
    return `+${digitos}`;
  }
  return `+${digitos}`;
}

async function enviarSms(numero, mensagem) {
  const twilioClient = obterCliente();
  const from = (process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (!twilioClient || !from) {
    console.warn('⚠ SMS não configurado — mensagem não enviada');
    return false;
  }

  const to = normalizarNumero(numero);
  if (!to) {
    console.warn('⚠ SMS: número inválido', numero);
    return false;
  }

  const fromSms = from.startsWith('+') ? from : normalizarNumero(from) || from;

  const resultado = await twilioClient.messages.create({
    from: fromSms,
    to,
    body: mensagem
  });

  return resultado.sid;
}

function textoFalta(nomeAluno, data) {
  return `VEHO - Alerta de Falta\n\n${nomeAluno} teve falta registrada em ${data}. Entre em contato com a escola.`;
}

function textoBoletim(nomeAluno, desempenho) {
  const d = desempenho || {};
  return (
    `VEHO - Boletim\n\nAluno(a): ${nomeAluno}\n` +
    `Disciplina: ${d.disciplina || '—'}\n` +
    `Média: ${d.mediaGeral ?? '—'}\n` +
    `Situação: ${d.situacao || '—'}\n` +
    `Frequência: ${d.frequenciaPercentual != null ? d.frequenciaPercentual + '%' : '—'}`
  );
}

function textoGeral(titulo, mensagem) {
  return `VEHO - ${titulo}\n\n${mensagem}`;
}

function textoDesempenho(nomeAluno, disciplina, media) {
  return (
    `VEHO - Alerta de Desempenho\n\n` +
    `${nomeAluno} está com baixo desempenho em ${disciplina}.\n` +
    `Média atual: ${media}. Contate a escola.`
  );
}

const notificadorSms = {
  normalizarNumero,

  async enviarAlertaFalta(numero, nomeAluno, data) {
    try {
      const sid = await enviarSms(numero, textoFalta(nomeAluno, data));
      if (sid) console.log('✓ SMS falta enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro SMS falta:', error.message || error);
      return false;
    }
  },

  async enviarBoletim(numero, nomeAluno, desempenho) {
    try {
      const sid = await enviarSms(numero, textoBoletim(nomeAluno, desempenho));
      if (sid) console.log('✓ SMS boletim enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro SMS boletim:', error.message || error);
      return false;
    }
  },

  async enviarNotificacao(numero, titulo, mensagem) {
    try {
      const sid = await enviarSms(numero, textoGeral(titulo, mensagem));
      if (sid) console.log('✓ SMS notificação enviada:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro SMS notificação:', error.message || error);
      return false;
    }
  },

  async enviarAlertaDesempenho(numero, nomeAluno, disciplina, media) {
    try {
      const sid = await enviarSms(numero, textoDesempenho(nomeAluno, disciplina, media));
      if (sid) console.log('✓ SMS desempenho enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro SMS desempenho:', error.message || error);
      return false;
    }
  },

  async enviarTexto(numero, texto) {
    try {
      const sid = await enviarSms(numero, texto);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro SMS:', error.message || error);
      return false;
    }
  }
};

module.exports = notificadorSms;
