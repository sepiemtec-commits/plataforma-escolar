/**
 * Troca senhas iguais a padrões fracos (ex.: senha123) por SEED_DEFAULT_PASSWORD / nova senha.
 *
 * Uso (produção):
 *   NODE_ENV=production SEED_DEFAULT_PASSWORD='SuaSenhaForte12!' \
 *   node database/rotacionar-senhas-fracas.js
 *
 * Opcional: NOVA_SENHA=... (senão usa SEED_DEFAULT_PASSWORD ou gera uma)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Usuario } = require('../backend/database/schema');
const {
  obterSenhaSeed,
  gerarSenhaTemporaria,
  senhaEFraca,
  isProducao
} = require('../backend/utils/senhaPadrao');

const CANDIDATAS_FRACAS = [
  'senha123',
  'senha1234',
  '123456',
  '12345678',
  'password',
  'admin',
  'escola123'
];

async function rotacionar() {
  let novaSenha = (process.env.NOVA_SENHA || process.env.SEED_DEFAULT_PASSWORD || '').trim();

  if (isProducao()) {
    // em produção, reaproveita as regras do seed (senha forte obrigatória)
    if (!novaSenha) {
      try {
        novaSenha = obterSenhaSeed();
      } catch {
        novaSenha = '';
      }
    }
    if (!novaSenha || senhaEFraca(novaSenha) || novaSenha.length < 12) {
      throw new Error(
        'Defina NOVA_SENHA ou SEED_DEFAULT_PASSWORD forte (≥12 chars). Não use senha123.'
      );
    }
  } else {
    novaSenha = novaSenha || gerarSenhaTemporaria(14);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/plataforma_escolar');
  console.log('📌 Conectado ao MongoDB');

  const usuarios = await Usuario.find({}).select('+senha email tipo nome');
  let alterados = 0;

  for (const user of usuarios) {
    let fraca = false;
    for (const candidata of CANDIDATAS_FRACAS) {
      if (await user.compararSenha(candidata)) {
        fraca = true;
        break;
      }
    }
    if (!fraca) continue;

    user.senha = novaSenha;
    await user.save();
    alterados += 1;
    console.log(`  ✓ ${user.email} (${user.tipo})`);
  }

  console.log(`\n✅ ${alterados} usuário(s) com senha fraca atualizado(s).`);
  console.log(`🔐 Nova senha aplicada: ${novaSenha}`);
  console.log('⚠️  Oriente a troca no primeiro login e não compartilhe este log.');

  await mongoose.disconnect();
}

rotacionar().catch(async (err) => {
  console.error('❌', err.message || err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
