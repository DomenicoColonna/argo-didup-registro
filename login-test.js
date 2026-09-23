'use strict';
/**
 * Login diagnostics, shows at which step the Argo flow fails.
 * Usage: node login-test.js            (asks for the credentials)
 *        ARGO_SCHOOL=SS12345 ARGO_USER=... ARGO_PASS=... node login-test.js
 */
const readline = require('node:readline');
const { fullLogin } = require('./argo');

const ask = (question, hidden = false) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = function (s) { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });

(async () => {
  const schoolCode = process.env.ARGO_SCHOOL || (await ask('Codice scuola: '));
  const username = process.env.ARGO_USER || (await ask('Utente: '));
  const password = process.env.ARGO_PASS || (await ask('Password: ', true));

  try {
    const session = await fullLogin({ schoolCode, username, password }, (step, info) => {
      console.log(`  [ok] ${step}`, info);
    });
    console.log('\nLogin riuscito.');
    console.log('Alunno :', session.profile.alunno?.nominativo);
    console.log('Classe :', session.profile.scheda?.classe?.desDenominazione + (session.profile.scheda?.classe?.desSezione || ''));
    console.log('Voti   :', (session.dashboard.voti || []).length);
    console.log('Lezioni:', (session.dashboard.registro || []).length);
  } catch (err) {
    console.error('\nLogin fallito:', err.message);
    process.exitCode = 1;
  }
})();
