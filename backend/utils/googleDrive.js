// backend/utils/googleDrive.js — upload opcional via Service Account
const crypto = require('crypto');

function getServiceAccount() {
  const raw = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const email = (process.env.GOOGLE_DRIVE_CLIENT_EMAIL || '').trim();
  let key = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || '').trim();
  if (!email || !key) return null;
  key = key.replace(/\\n/g, '\n');
  return { client_email: email, private_key: key };
}

function driveConfigurado() {
  return Boolean(getServiceAccount());
}

function emailContaServico() {
  return getServiceAccount()?.client_email || null;
}

function extrairFolderId(urlOuId) {
  const s = String(urlOuId || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && !s.includes('/')) return s;
  const m =
    s.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function obterAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign
    .sign(sa.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${unsigned}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao autenticar no Google Drive');
  }
  return data.access_token;
}

/**
 * Envia arquivo JSON/gzip para a pasta do Drive (precisa estar compartilhada com a service account).
 */
async function uploadArquivoDrive({ folderId, nomeArquivo, buffer, mimeType }) {
  const sa = getServiceAccount();
  if (!sa) {
    return { enviado: false, erro: 'Google Drive não configurado no servidor (service account).' };
  }
  if (!folderId) {
    return { enviado: false, erro: 'Pasta do Drive não cadastrada na escola.' };
  }

  try {
    const token = await obterAccessToken(sa);
    const metadata = {
      name: nomeArquivo,
      parents: [folderId]
    };
    const boundary = `veho_${Date.now()}`;
    const metaPart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`;
    const fileHeader =
      `--${boundary}\r\nContent-Type: ${mimeType || 'application/gzip'}\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;

    const body = Buffer.concat([
      Buffer.from(metaPart, 'utf8'),
      Buffer.from(fileHeader, 'utf8'),
      buffer,
      Buffer.from(footer, 'utf8')
    ]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(body.length)
        },
        body
      }
    );
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `Drive HTTP ${res.status}`;
      return { enviado: false, erro: msg };
    }
    return {
      enviado: true,
      fileId: data.id,
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
    };
  } catch (e) {
    return { enviado: false, erro: e.message || 'Erro ao enviar ao Drive' };
  }
}

module.exports = {
  driveConfigurado,
  emailContaServico,
  extrairFolderId,
  uploadArquivoDrive
};
