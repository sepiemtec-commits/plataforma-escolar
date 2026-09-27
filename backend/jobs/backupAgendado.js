// backend/jobs/backupAgendado.js — executa backups agendados pelas escolas
const mongoose = require('mongoose');
const { Escola, Usuario } = require('../database/schema');
const { gerarBackupEscola } = require('../services/backupEscola');
const { calcularProximaExecucao } = require('../utils/backupAgenda');

const INTERVALO_MS = Number(process.env.BACKUP_SCHEDULER_MS || 60 * 1000); // 1 min
let timer = null;
let rodando = false;

async function usuarioParaAgendamento(escola) {
  if (escola.diretor_id) return escola.diretor_id;
  const u = await Usuario.findOne({
    escola_id: escola._id,
    tipo: { $in: ['diretor', 'secretaria', 'admin'] },
    ativo: { $ne: false }
  })
    .select('_id')
    .lean();
  return u?._id || null;
}

async function processarEscola(escola) {
  const b = escola.configuracao?.backup || {};
  if (!b.agendaAtivo) return null;

  const usuarioId = await usuarioParaAgendamento(escola);
  if (!usuarioId) {
    await Escola.updateOne(
      { _id: escola._id },
      {
        $set: {
          'configuracao.backup.ultimaFalhaAgendada':
            'Sem diretor/secretaria ativo para registrar o backup agendado'
        }
      }
    );
    return { escolaId: escola._id, ok: false, motivo: 'sem_usuario' };
  }

  try {
    await gerarBackupEscola({
      escolaId: escola._id,
      usuarioId,
      enviarDrive: true
    });

    const proxima = calcularProximaExecucao({
      frequencia: b.frequencia || 'semanal',
      diaSemana: b.diaSemana ?? 0,
      hora: b.hora || '03:00',
      aPartirDe: new Date()
    });

    await Escola.updateOne(
      { _id: escola._id },
      {
        $set: {
          'configuracao.backup.ultimoAgendadoEm': new Date(),
          'configuracao.backup.proximaExecucao': proxima,
          'configuracao.backup.ultimaFalhaAgendada': ''
        }
      }
    );
    return { escolaId: escola._id, ok: true, proxima };
  } catch (e) {
    const proxima = calcularProximaExecucao({
      frequencia: b.frequencia || 'semanal',
      diaSemana: b.diaSemana ?? 0,
      hora: b.hora || '03:00',
      aPartirDe: new Date(Date.now() + 60 * 60 * 1000)
    });
    await Escola.updateOne(
      { _id: escola._id },
      {
        $set: {
          'configuracao.backup.ultimaFalhaAgendada': e.message || 'Falha no backup agendado',
          'configuracao.backup.proximaExecucao': proxima
        }
      }
    );
    return { escolaId: escola._id, ok: false, motivo: e.message };
  }
}

async function tickBackupAgendado() {
  if (rodando) return;
  if (mongoose.connection.readyState !== 1) return;
  rodando = true;
  try {
    const agora = new Date();
    const escolas = await Escola.find({
      ativo: { $ne: false },
      'configuracao.backup.agendaAtivo': true,
      $or: [
        { 'configuracao.backup.proximaExecucao': { $lte: agora } },
        { 'configuracao.backup.proximaExecucao': { $exists: false } },
        { 'configuracao.backup.proximaExecucao': null }
      ]
    })
      .select('diretor_id configuracao.backup')
      .limit(20)
      .lean();

    for (const escola of escolas) {
      const b = escola.configuracao?.backup || {};
      // Se nunca calculou próxima, só agenda; não dispara na hora do save
      if (!b.proximaExecucao) {
        const proxima = calcularProximaExecucao({
          frequencia: b.frequencia || 'semanal',
          diaSemana: b.diaSemana ?? 0,
          hora: b.hora || '03:00'
        });
        await Escola.updateOne(
          { _id: escola._id },
          { $set: { 'configuracao.backup.proximaExecucao': proxima } }
        );
        continue;
      }
      await processarEscola(escola);
    }
  } catch (e) {
    console.warn('Scheduler backup:', e.message);
  } finally {
    rodando = false;
  }
}

function iniciarBackupAgendado() {
  if (timer) return;
  if (process.env.BACKUP_SCHEDULER_DISABLED === '1') {
    console.log('⏭ Scheduler de backup desativado (BACKUP_SCHEDULER_DISABLED=1)');
    return;
  }
  console.log(`⏱ Scheduler de backup a cada ${Math.round(INTERVALO_MS / 1000)}s`);
  // primeira checagem após 20s (espera Mongo)
  setTimeout(() => {
    tickBackupAgendado();
    timer = setInterval(tickBackupAgendado, INTERVALO_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }, 20000);
}

function pararBackupAgendado() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  iniciarBackupAgendado,
  pararBackupAgendado,
  tickBackupAgendado,
  processarEscola
};
