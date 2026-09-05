'use strict';
/**
 * Diagnostica del login: mostra a che punto del flusso Argo si blocca.
 * Uso: node login-test.js            (chiede i dati a schermo)
 *      ARGO_SCUOLA=SS12345 ARGO_USER=... ARGO_PASS=... node login-test.js
 */
const readline = require('node:readline');
const { fullLogin } = require('./argo');

const chiedi = (domanda, nascondi = false) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (nascondi) {
      rl._writeToOutput = function (s) { if (s.includes(domanda)) rl.output.write(s); };
    }
    rl.question(domanda, (risposta) => { rl.close(); if (nascondi) process.stdout.write('\n'); resolve(risposta.trim()); });
  });

(async () => {
  const schoolCode = process.env.ARGO_SCUOLA || (await chiedi('Codice scuola: '));
  const username = process.env.ARGO_USER || (await chiedi('Utente: '));
  const password = process.env.ARGO_PASS || (await chiedi('Password: ', true));

  try {
    const session = await fullLogin({ schoolCode, username, password }, (passo, info) => {
      console.log(`  [ok] ${passo}`, info);
    });
    console.log('\nLogin riuscito.');
    console.log('Alunno :', session.profilo.alunno?.nominativo);
    console.log('Classe :', session.profilo.scheda?.classe?.desDenominazione + (session.profilo.scheda?.classe?.desSezione || ''));
    console.log('Voti   :', (session.dashboard.voti || []).length);
    console.log('Lezioni:', (session.dashboard.registro || []).length);
  } catch (err) {
    console.error('\nLogin fallito:', err.message);
    process.exitCode = 1;
  }
})();
