#!/usr/bin/env node
// Gera chaves VAPID para Web Push. Cole no .env.
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('# Cole no .env do VEHO Edu:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@escola.local');
