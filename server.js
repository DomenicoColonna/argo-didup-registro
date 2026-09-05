'use strict';
/**
 * Mini registro elettronico: server locale che fa da ponte verso l'API Argo
 * (che non manda header CORS, quindi il browser non puo' chiamarla da sola)
 * e serve i file statici di public/.
 * Le credenziali restano in RAM, non vengono mai scritte su disco.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fullLogin, loadDashboard, refreshIfNeeded } = require('./argo');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_FILE = path.join(__dirname, 'dati', 'sessioni.json');
const DURATA_SESSIONE = 180 * 24 * 3600 * 1000; // 180 giorni senza uso, poi si rifà il login
const DATI_FRESCHI_PER = 10 * 60 * 1000;         // oltre 10 minuti i dati vengono riscaricati
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

const sessions = new Map();

// ------------------------------------------------- sessioni persistenti su disco
// Si salvano token e dati Argo (mai la password) in dati/sessioni.json, cosi' un
// riavvio del server non butta fuori nessuno. Il file e' leggibile solo dall'utente.

function caricaSessioni() {
  try {
    const salvate = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const ora = Date.now();
    for (const [sid, sessione] of Object.entries(salvate)) {
      if (ora - (sessione.ultimoUso || 0) > DURATA_SESSIONE) continue;
      sessione.token.expireDate = new Date(sessione.token.expireDate);
      sessions.set(sid, sessione);
    }
  } catch {
    // primo avvio o file assente: si parte senza sessioni
  }
}

let salvataggio = null;
function salvaSessioni() {
  clearTimeout(salvataggio);
  salvataggio = setTimeout(() => {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
  }, 250);
}

/** Aggiorna token e dashboard se servono; se Argo rifiuta il token la sessione muore. */
async function aggiornaSeServe(session, forza) {
  const vecchi = !session.aggiornato || Date.now() - new Date(session.aggiornato).getTime() > DATI_FRESCHI_PER;
  if (!forza && !vecchi) return;
  await refreshIfNeeded(session);
  await loadDashboard(session);
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body troppo grande'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });

const send = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

const sidOf = (req) => (req.headers.cookie || '').match(/(?:^|;\s*)sid=([^;]+)/)?.[1];

/** Solo i dati che servono al frontend: niente token, niente credenziali. */
const publicPayload = (session) => ({
  profilo: {
    alunno: session.profilo.alunno,
    anno: session.profilo.anno,
    scheda: session.profilo.scheda,
  },
  dashboard: session.dashboard,
  aggiornato: session.aggiornato,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { schoolCode, username, password } = await readBody(req);
      if (!schoolCode || !username || !password)
        return send(res, 400, { error: 'Servono codice scuola, utente e password' });
      const session = await fullLogin({ schoolCode, username, password });
      session.ultimoUso = Date.now();
      const sid = crypto.randomUUID();
      sessions.set(sid, session);
      salvaSessioni();
      res.setHeader('set-cookie',
        `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURATA_SESSIONE / 1000}`);
      return send(res, 200, publicPayload(session));
    }

    if (url.pathname === '/api/data' && req.method === 'GET') {
      const sid = sidOf(req);
      const session = sessions.get(sid);
      if (!session) return send(res, 401, { error: 'Non autenticato' });
      try {
        await aggiornaSeServe(session, Boolean(url.searchParams.get('refresh')));
      } catch (err) {
        if (/token|scadut|401|autoriz/i.test(err.message)) {
          sessions.delete(sid);
          salvaSessioni();
          return send(res, 401, { error: 'Sessione scaduta, rifai il login' });
        }
        // Argo irraggiungibile: si mostrano gli ultimi dati scaricati
        console.error('aggiornamento fallito:', err.message);
      }
      session.ultimoUso = Date.now();
      salvaSessioni();
      return send(res, 200, publicPayload(session));
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      sessions.delete(sidOf(req));
      salvaSessioni();
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Endpoint sconosciuto' });

    const file = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Vietato' });
    const data = await fs.promises.readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'Not found' });
    // niente cache: durante lo sviluppo il telefono deve vedere subito le modifiche
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message || 'Errore interno' });
  }
});

caricaSessioni();
server.listen(PORT, () => console.log(`Registro pronto su http://localhost:${PORT} (${sessions.size} sessioni riprese)`));
