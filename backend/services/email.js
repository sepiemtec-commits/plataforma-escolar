/* E-mail transacional (recuperação de senha). Sem SMTP configurado, não envia. */
const nodemailer = require('nodemailer');

let transporte;

function smtpConfigurado() {
  return Boolean(String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_FROM || '').trim());
}

function obterTransporte() {
  if (transporte) return transporte;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass: process.env.SMTP_PASS || '' } : undefined
  });
  return transporte;
}

async function enviarEmail({ para, assunto, texto }) {
  if (!smtpConfigurado()) return false;
  await obterTransporte().sendMail({
    from: process.env.SMTP_FROM,
    to: para,
    subject: assunto,
    text: texto
  });
  return true;
}

function textoRecuperacaoSenha(link) {
  return (
    'Recebemos um pedido para redefinir a senha da sua conta no VEHO Edu.\n\n' +
    'Abra o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez:\n' +
    link + '\n\n' +
    'Se você não pediu isso, ignore esta mensagem. A senha atual continua valendo.\n'
  );
}

async function enviarRecuperacaoSenha(email, link) {
  return enviarEmail({
    para: email,
    assunto: 'VEHO Edu — redefinir senha',
    texto: textoRecuperacaoSenha(link)
  });
}

module.exports = {
  smtpConfigurado,
  enviarEmail,
  enviarRecuperacaoSenha,
  textoRecuperacaoSenha
};
