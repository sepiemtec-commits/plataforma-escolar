// backend/services/whatsapp.js - Serviço de Notificações WhatsApp
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

async function enviarMensagem(numeroResponsavel, mensagem) {
  const twilioClient = obterCliente();

  if (!twilioClient) {
    console.warn('⚠ WhatsApp não configurado — mensagem não enviada');
    return false;
  }

  const resultado = await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${numeroResponsavel}`,
    body: mensagem
  });

  return resultado.sid;
}

const notificadorWhatsApp = {
  async enviarAlertaFalta(numeroResponsavel, nomeAluno, data) {
    try {
      const mensagem = `🚨 *Alerta de Falta*\n\nOlá! Informamos que ${nomeAluno} teve *falta registrada* no dia ${data}.\n\nPor favor, entre em contato com a escola para maiores informações.\n\nPlataforma Educacional`;
      const sid = await enviarMensagem(numeroResponsavel, mensagem);
      if (sid) console.log('✓ Alerta de falta enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro ao enviar alerta de falta:', error);
      return false;
    }
  },

  async enviarBoletim(numeroResponsavel, nomeAluno, desempenho) {
    try {
      const mensagem = `📊 *Boletim Escolar*\n\nAluno(a): ${nomeAluno}\n\nDisciplina: ${desempenho.disciplina}\nMédia: ${desempenho.mediaGeral}\nSituação: ${desempenho.situacao}\n\nFrequência: ${desempenho.frequenciaPercentual}%\n\nPlataforma Educacional`;
      const sid = await enviarMensagem(numeroResponsavel, mensagem);
      if (sid) console.log('✓ Boletim enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro ao enviar boletim:', error);
      return false;
    }
  },

  async enviarNotificacao(numeroResponsavel, titulo, mensagem) {
    try {
      const mensagemFormatada = `📢 *${titulo}*\n\n${mensagem}\n\nPlataforma Educacional`;
      const sid = await enviarMensagem(numeroResponsavel, mensagemFormatada);
      if (sid) console.log('✓ Notificação enviada:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro ao enviar notificação:', error);
      return false;
    }
  },

  async enviarAlertaDesempenho(numeroResponsavel, nomeAluno, disciplina, media) {
    try {
      const mensagem = `⚠️ *Alerta de Desempenho*\n\nO aluno(a) ${nomeAluno} está com baixo desempenho em ${disciplina}.\n\nMédia Atual: ${media}\n\nRecomendamos entrar em contato com a escola.\n\nPlataforma Educacional`;
      const sid = await enviarMensagem(numeroResponsavel, mensagem);
      if (sid) console.log('✓ Alerta de desempenho enviado:', sid);
      return Boolean(sid);
    } catch (error) {
      console.error('✗ Erro ao enviar alerta:', error);
      return false;
    }
  }
};

module.exports = notificadorWhatsApp;
