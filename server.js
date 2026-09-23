'use strict';
/**
 * Small local server that sits between the browser and the Argo API (which
 * sends no CORS headers, so the browser cannot call it directly) and serves
 * the static files in public/.
 * Credentials stay in memory and are never written to disk.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fullLogin, loadDashboard, refreshIfNeeded } = require('./argo');
const store = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_FILE = path.join(__dirname, 'data', 'sessions.json');
const SESSION_TTL = 180 * 24 * 3600 * 1000; // 180 days without use, then you log in again
const DATA_FRESH_FOR = 10 * 60 * 1000;      // older than 10 minutes and the data gets fetched again
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

const sessions = new Map();

// ---------------------------------------------------- sessions persisted on disk
// Tokens and Argo data (never the password) go to data/sessions.json, so a server
// restart does not log anyone out. Only the owner can read the file.

function loadSessions() {
  try {
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const now = Date.now();
    for (const [sid, session] of Object.entries(saved)) {
      if (now - (session.lastUsed || 0) > SESSION_TTL) continue;
      session.token.expireDate = new Date(session.token.expireDate);
      sessions.set(sid, session);
    }
  } catch {
    // first run or missing file, start with no sessions
  }
}

let saveTimer = null;
function saveSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
  }, 250);
}

/** Refresh token and dashboard when needed. If Argo rejects the token the session is dropped. */
async function refreshIfStale(session, force) {
  const stale = !session.updatedAt || Date.now() - new Date(session.updatedAt).getTime() > DATA_FRESH_FOR;
  if (!force && !stale) return;
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

/** Only what the frontend needs, no tokens and no credentials. */
const publicPayload = (session) => ({
  profile: {
    alunno: session.profile.alunno,
    anno: session.profile.anno,
    scheda: session.profile.scheda,
  },
  dashboard: session.dashboard,
  updatedAt: session.updatedAt,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { schoolCode, username, password } = await readBody(req);
      if (!schoolCode || !username || !password)
        return send(res, 400, { error: 'Servono codice scuola, utente e password' });
      const session = await fullLogin({ schoolCode, username, password });
      session.lastUsed = Date.now();
      const sid = crypto.randomUUID();
      sessions.set(sid, session);
      saveSessions();
      res.setHeader('set-cookie',
        `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`);
      return send(res, 200, publicPayload(session));
    }

    if (url.pathname === '/api/data' && req.method === 'GET') {
      const sid = sidOf(req);
      const session = sessions.get(sid);
      if (!session) return send(res, 401, { error: 'Non autenticato' });
      try {
        await refreshIfStale(session, Boolean(url.searchParams.get('refresh')));
      } catch (err) {
        // Argo's own wording for a dead token (scaduto, autorizzazione)
        if (/token|scadut|401|autoriz/i.test(err.message)) {
          sessions.delete(sid);
          saveSessions();
          return send(res, 401, { error: 'Sessione scaduta, rifai il login' });
        }
        // Argo unreachable, show whatever we downloaded last time
        console.error('refresh failed:', err.message);
      }
      session.lastUsed = Date.now();
      saveSessions();
      return send(res, 200, publicPayload(session));
    }

    // homework state (done flag, notes), see store.js
    if (url.pathname === '/api/homework') {
      const session = sessions.get(sidOf(req));
      if (!session) return send(res, 401, { error: 'Non autenticato' });
      if (!store.available()) return send(res, 503, { error: 'Salvataggio non configurato' });
      const pk = session.profile.alunno.pk;
      if (req.method === 'GET') return send(res, 200, { state: await store.readHomeworkState(pk) });
      if (req.method === 'PUT') {
        const { key, ...patch } = await readBody(req);
        if (!key || typeof key !== 'string' || key.length > 200)
          return send(res, 400, { error: 'Chiave compito mancante' });
        return send(res, 200, { key, value: await store.saveHomeworkState(pk, key, patch) });
      }
      return send(res, 405, { error: 'Metodo non ammesso' });
    }

    // weekly timetable, whole object in and out, see store.js
    if (url.pathname === '/api/timetable') {
      const session = sessions.get(sidOf(req));
      if (!session) return send(res, 401, { error: 'Non autenticato' });
      if (!store.available()) return send(res, 503, { error: 'Salvataggio non configurato' });
      const pk = session.profile.alunno.pk;
      if (req.method === 'GET') return send(res, 200, { timetable: await store.readTimetable(pk) });
      if (req.method === 'PUT') {
        const { timetable } = await readBody(req);
        return send(res, 200, { timetable: await store.saveTimetable(pk, timetable) });
      }
      return send(res, 405, { error: 'Metodo non ammesso' });
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      sessions.delete(sidOf(req));
      saveSessions();
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Endpoint sconosciuto' });

    const file = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Vietato' });
    const data = await fs.promises.readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'Not found' });
    // no cache, the phone has to see changes right away while developing
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

loadSessions();
// the VPS is always on, so it can also keep the Supabase project awake (Netlify has its own scheduled function)
setInterval(() => store.keepAlive().catch((err) => console.error('keep alive failed:', err.message)), 3 * 24 * 3600 * 1000);
server.listen(PORT, () => console.log(`Register running on http://localhost:${PORT} (${sessions.size} sessions restored)`));
