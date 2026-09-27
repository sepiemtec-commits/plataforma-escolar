// backend/utils/backupAgenda.js — cálculo de próxima execução (horário de Brasília)
const FUSO_OFFSET_MIN = -3 * 60; // America/Sao_Paulo sem horário de verão desde 2019

function agoraBrasilia() {
  const agora = new Date();
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
  return new Date(utc + FUSO_OFFSET_MIN * 60000);
}

function parseHora(horaStr) {
  const m = String(horaStr || '03:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h: 3, min: 0 };
  return {
    h: Math.min(23, Math.max(0, parseInt(m[1], 10))),
    min: Math.min(59, Math.max(0, parseInt(m[2], 10)))
  };
}

function montarDataBrasilia(ano, mes, dia, h, min) {
  // Cria instante UTC correspondente ao horário de Brasília
  return new Date(Date.UTC(ano, mes, dia, h - FUSO_OFFSET_MIN / 60, min, 0, 0));
}

/**
 * Calcula a próxima execução a partir de agora (ou de `aPartirDe`).
 * frequencia: diaria | semanal
 * diaSemana: 0–6 (Dom–Sáb), só para semanal
 * hora: "HH:mm" em Brasília
 */
function calcularProximaExecucao({ frequencia, diaSemana, hora, aPartirDe }) {
  const base = aPartirDe ? new Date(aPartirDe) : new Date();
  const br = (() => {
    const utc = base.getTime() + base.getTimezoneOffset() * 60000;
    return new Date(utc + FUSO_OFFSET_MIN * 60000);
  })();
  const { h, min } = parseHora(hora);
  const freq = frequencia === 'diaria' ? 'diaria' : 'semanal';
  const alvoDia = Number.isFinite(Number(diaSemana)) ? Number(diaSemana) : 0;

  let candidato = montarDataBrasilia(
    br.getFullYear(),
    br.getMonth(),
    br.getDate(),
    h,
    min
  );

  if (freq === 'diaria') {
    if (candidato.getTime() <= base.getTime()) {
      const amanha = new Date(br);
      amanha.setDate(amanha.getDate() + 1);
      candidato = montarDataBrasilia(
        amanha.getFullYear(),
        amanha.getMonth(),
        amanha.getDate(),
        h,
        min
      );
    }
    return candidato;
  }

  // semanal
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(br);
    d.setDate(d.getDate() + i);
    if (d.getDay() !== alvoDia) continue;
    candidato = montarDataBrasilia(d.getFullYear(), d.getMonth(), d.getDate(), h, min);
    if (candidato.getTime() > base.getTime()) return candidato;
  }
  // fallback +7 dias
  const d = new Date(br);
  d.setDate(d.getDate() + 7);
  return montarDataBrasilia(d.getFullYear(), d.getMonth(), d.getDate(), h, min);
}

function montarAlertaBackup(backupCfg = {}) {
  const dias = Math.min(90, Math.max(1, Number(backupCfg.alertaDias) || 7));
  const ultimo = backupCfg.ultimoBackupEm ? new Date(backupCfg.ultimoBackupEm) : null;
  const agora = Date.now();
  if (!ultimo) {
    return {
      ativo: true,
      nivel: 'alto',
      mensagem: `Alerta de backup: nenhum backup registrado. Recomendado a cada ${dias} dia(s).`,
      diasSemBackup: null,
      alertaDias: dias
    };
  }
  const diasSem = Math.floor((agora - ultimo.getTime()) / (24 * 60 * 60 * 1000));
  if (diasSem >= dias) {
    return {
      ativo: true,
      nivel: diasSem >= dias * 2 ? 'alto' : 'medio',
      mensagem: `Alerta de backup: último há ${diasSem} dia(s) (limite ${dias}). Gere ou agende um backup.`,
      diasSemBackup: diasSem,
      alertaDias: dias
    };
  }
  return {
    ativo: false,
    nivel: 'ok',
    mensagem: `Backup em dia (último há ${diasSem} dia(s); alerta após ${dias}).`,
    diasSemBackup: diasSem,
    alertaDias: dias
  };
}

module.exports = {
  agoraBrasilia,
  calcularProximaExecucao,
  montarAlertaBackup,
  parseHora
};
