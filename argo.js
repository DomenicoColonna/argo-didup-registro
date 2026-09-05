'use strict';
/**
 * Client for the didUP Famiglia API (the same one the official app uses).
 * Flow: OAuth2 + PKCE on auth.portaleargo.it, then token, then appfamiglia endpoints.
 */
const crypto = require('node:crypto');

const CLIENT_ID = '72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c';
const REDIRECT_URI = 'it.argosoft.didup.famiglia.new://login-callback';
const SCOPES = 'openid offline profile user.roles argo';
const CLIENT_VERSION = process.env.ARGO_VERSION || '1.27.0';
const API_BASE = 'https://www.portaleargo.it/appfamiglia/api/rest';

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const randomString = (n) =>
  Array.from({ length: n }, () => ALPHANUM[crypto.randomInt(ALPHANUM.length)]).join('');
const sha256url = (s) => crypto.createHash('sha256').update(s).digest('base64url');

/** Date format the API expects, e.g. 2026-09-05 14:30:00.000 */
const formatDate = (d) => {
  const date = new Date(d);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`
  );
};

/** Minimal cookie jar, enough for the SSO flow on *.portaleargo.it */
class Jar {
  constructor() { this.cookies = new Map(); }
  store(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
}

/**
 * fetch with cookies and redirects handled by hand. The last hop of the login
 * points to a custom scheme (it.argosoft...://) that fetch cannot follow.
 */
async function hop(url, { method = 'GET', body, headers = {}, jar, maxRedirects = 0 } = {}) {
  let current = url;
  let curMethod = method;
  let curBody = body;
  let curHeaders = { ...headers };
  for (let i = 0; ; i++) {
    const cookie = jar.header();
    const res = await fetch(current, {
      method: curMethod,
      body: curBody,
      headers: cookie ? { ...curHeaders, cookie } : curHeaders,
      redirect: 'manual',
    });
    jar.store(res);
    const location = res.headers.get('location');
    const isRedirect = res.status >= 300 && res.status < 400 && location;
    if (!isRedirect || i >= maxRedirects) return { res, location, url: current };
    const next = new URL(location, current).toString();
    if (!next.startsWith('http')) return { res, location: next, url: current };
    current = next;
    curMethod = 'GET';
    curBody = undefined;
    curHeaders = { ...headers };
    delete curHeaders['content-type'];
  }
}

/**
 * SSO login, returns the authorization code.
 * @param onStep optional callback, called at every step (useful for debugging)
 */
async function getAuthCode({ schoolCode, username, password }, onStep = () => {}) {
  const jar = new Jar();
  const codeVerifier = randomString(43);
  const authUrl =
    'https://auth.portaleargo.it/oauth2/auth?' +
    new URLSearchParams({
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      response_type: 'code',
      prompt: 'login',
      state: randomString(22),
      nonce: randomString(22),
      scope: SCOPES,
      code_challenge: sha256url(codeVerifier),
      code_challenge_method: 'S256',
    });

  const first = await hop(authUrl, { jar });
  onStep('oauth2/auth', { status: first.res.status, location: first.location });
  if (!first.location) throw new Error('Argo non ha restituito la pagina di login');
  const challenge = new URL(first.location, authUrl).searchParams.get('login_challenge');
  if (!challenge) throw new Error('login_challenge non trovato nella risposta di Argo');

  const second = await hop('https://www.portaleargo.it/auth/sso/login', {
    method: 'POST',
    jar,
    maxRedirects: 5,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      challenge,
      client_id: CLIENT_ID,
      famiglia_customer_code: schoolCode,
      login: 'true',
      password,
      username,
    }).toString(),
  });
  onStep('sso/login', { status: second.res.status, location: second.location, url: second.url });

  if (!second.location) {
    const html = await second.res.text().catch(() => '');
    const err = (html.match(/class="[^"]*(?:error|alert)[^"]*"[^>]*>\s*([^<]{3,200})/i) || [])[1];
    throw new Error(err ? `Argo risponde: ${err.trim()}` : 'Login rifiutato da Argo (nessun redirect)');
  }
  const finale = new URL(second.location);
  const code = finale.searchParams.get('code');
  if (!code) {
    const argoError = finale.searchParams.get('error_description') || finale.searchParams.get('error');
    throw new Error(argoError ? `Argo: ${argoError}` : 'Credenziali o codice scuola non validi');
  }
  return { code, codeVerifier };
}

async function exchangeToken({ code, codeVerifier }) {
  const res = await fetch('https://auth.portaleargo.it/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
    }).toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${data.error}: ${data.error_description || ''}`);
  const expireDate = new Date(res.headers.get('date') || Date.now());
  expireDate.setSeconds(expireDate.getSeconds() + data.expires_in);
  return { ...data, expireDate };
}

/** Generic call to the appfamiglia API (POST when there is a body, GET otherwise). */
async function apiRequest(session, endpoint, body) {
  const headers = {
    accept: 'application/json',
    'argo-client-version': CLIENT_VERSION,
    authorization: `Bearer ${session.token?.access_token || ''}`,
  };
  if (body != null) headers['content-type'] = 'application/json';
  if (session.login) {
    headers['x-auth-token'] = session.login.token;
    headers['x-cod-min'] = session.login.codMin;
  }
  if (session.token) headers['x-date-exp-auth'] = formatDate(session.token.expireDate);

  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: body != null ? 'POST' : 'GET',
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Risposta non valida da /${endpoint} (HTTP ${res.status}): ${text.slice(0, 120)}`);
  }
  if (json.success === false) throw new Error(json.msg || `Errore su /${endpoint}`);
  return json;
}

async function refreshIfNeeded(session) {
  if (!session.token || new Date(session.token.expireDate).getTime() > Date.now() + 60_000) return;
  const now = new Date();
  const res = await fetch(`${API_BASE}/auth/refresh-token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'argo-client-version': CLIENT_VERSION,
      authorization: `Bearer ${session.token.access_token}`,
      'x-auth-token': session.login?.token || '',
      'x-cod-min': session.login?.codMin || '',
      'x-date-exp-auth': formatDate(session.token.expireDate),
    },
    body: JSON.stringify({
      'r-token': session.token.refresh_token,
      'client-id': CLIENT_ID,
      scopes: `[${session.token.scope.split(' ').join(', ')}]`,
      'old-bearer': session.token.access_token,
      'primo-accesso': 'false',
      'ripeti-login': 'false',
      'exp-bearer': formatDate(session.token.expireDate),
      'ts-app': formatDate(now),
      proc: 'initState_global_random_12345',
      username: session.login?.username,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Sessione scaduta, rifai il login');
  const expireDate = new Date(res.headers.get('date') || now);
  expireDate.setSeconds(expireDate.getSeconds() + data.expires_in);
  session.token = { ...session.token, ...data, expireDate };
}

async function loadDashboard(session) {
  const opzioni = Object.fromEntries((session.login.opzioni || []).map((o) => [o.chiave, o.valore]));
  const dashboard = await apiRequest(session, 'dashboard/dashboard', {
    dataultimoaggiornamento: formatDate(session.profilo.anno.dataInizio),
    opzioni: JSON.stringify(opzioni),
  });
  session.dashboard = dashboard.data.dati[0];
  session.aggiornato = new Date().toISOString();
  return session.dashboard;
}

/** Full login: token, then login, profilo and dashboard. */
async function fullLogin(credentials, onStep = () => {}) {
  const session = {};
  session.token = await exchangeToken(await getAuthCode(credentials, onStep));
  onStep('token', { scadenza: session.token.expireDate });

  const login = await apiRequest(session, 'login', {
    'lista-opzioni-notifiche': '{}',
    'lista-x-auth-token': '[]',
    clientID: randomString(163),
  });
  session.login = login.data[0];
  onStep('login', { codMin: session.login.codMin, username: session.login.username });

  session.profilo = (await apiRequest(session, 'profilo')).data;
  onStep('profilo', { alunno: session.profilo.alunno?.nominativo });

  await loadDashboard(session);
  onStep('dashboard', {
    voti: (session.dashboard.voti || []).length,
    lezioni: (session.dashboard.registro || []).length,
  });
  return session;
}

module.exports = { fullLogin, loadDashboard, refreshIfNeeded, apiRequest, formatDate, CLIENT_VERSION };
