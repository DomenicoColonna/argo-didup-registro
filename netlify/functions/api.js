'use strict';
/**
 * Same three endpoints as server.js, as a Netlify function.
 * Functions are stateless, so the session (Argo tokens, login data, a slice of
 * the profile) travels inside an encrypted cookie instead of dati/sessioni.json.
 * The dashboard is downloaded again on every /api/data call.
 */
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { fullLogin, loadDashboard, refreshIfNeeded } = require('../../argo');

const COOKIE = 'sid';
const MAX_AGE = 180 * 24 * 3600; // seconds, same as server.js

/** 32 byte key from SESSION_SECRET (any long random string set in the Netlify env). */
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET mancante: impostala nelle variabili d\'ambiente di Netlify');
  return crypto.createHash('sha256').update(secret).digest();
}

/** Keep only what apiRequest, refreshIfNeeded, loadDashboard and the UI need, so it fits in a cookie. */
function slim(session) {
  const { access_token, refresh_token, scope, expireDate } = session.token;
  return {
    token: { access_token, refresh_token, scope, expireDate },
    login: session.login,
    profilo: { alunno: session.profilo.alunno, anno: session.profilo.anno, scheda: session.profilo.scheda },
  };
}

function seal(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const plain = zlib.gzipSync(JSON.stringify(slim(session)));
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function open(value) {
  try {
    const buf = Buffer.from(value, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(zlib.gunzipSync(plain).toString());
  } catch {
    return null;
  }
}

function cookieOf(event) {
  const raw = event.headers?.cookie || '';
  const m = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : null;
}

const setCookie = (value, maxAge = MAX_AGE) =>
  `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

const reply = (statusCode, body, cookie) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  },
  body: JSON.stringify(body),
});

const publicPayload = (session) => ({
  profilo: { alunno: session.profilo.alunno, anno: session.profilo.anno, scheda: session.profilo.scheda },
  dashboard: session.dashboard,
  aggiornato: session.aggiornato,
});

function readBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

exports.handler = async (event) => {
  const route = event.path.replace(/^.*\/api\//, '');
  const method = event.httpMethod;
  try {
    if (route === 'login' && method === 'POST') {
      const { schoolCode, username, password } = readBody(event);
      if (!schoolCode || !username || !password)
        return reply(400, { error: 'Servono codice scuola, utente e password' });
      const session = await fullLogin({ schoolCode, username, password });
      return reply(200, publicPayload(session), setCookie(seal(session)));
    }

    if (route === 'data' && method === 'GET') {
      const cookie = cookieOf(event);
      const session = cookie && open(cookie);
      if (!session) return reply(401, { error: 'Non autenticato' });
      const before = session.token.access_token;
      try {
        await refreshIfNeeded(session);
        await loadDashboard(session);
      } catch (err) {
        if (/token|scadut|401|autoriz/i.test(err.message))
          return reply(401, { error: 'Sessione scaduta, rifai il login' }, setCookie('', 0));
        throw err;
      }
      // a fresh token means a fresh cookie, otherwise the old one keeps working
      const renewed = session.token.access_token !== before ? setCookie(seal(session)) : undefined;
      return reply(200, publicPayload(session), renewed);
    }

    if (route === 'logout' && method === 'POST') return reply(200, { ok: true }, setCookie('', 0));

    return reply(404, { error: 'Endpoint sconosciuto' });
  } catch (err) {
    console.error(err);
    return reply(500, { error: err.message || 'Errore interno' });
  }
};
