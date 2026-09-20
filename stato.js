'use strict';
/**
 * Per student homework state (done flag and notes), shared by server.js and
 * the Netlify function. Two backends:
 *  - Supabase, when SUPABASE_URL and SUPABASE_SERVICE_KEY are set (REST API,
 *    no client library). Table layout in supabase/schema.sql.
 *  - a JSON file in dati/, only for the VPS. Netlify functions have no disk,
 *    so without Supabase the frontend keeps the state in localStorage only.
 * The student is identified by a hash of the Argo pk, the raw pk never leaves
 * the session.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(__dirname, 'dati', 'compiti.json');
const TABELLA = 'compiti';

const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
};

const idAlunno = (pk) => crypto.createHash('sha256').update(String(pk)).digest('hex').slice(0, 32);

/** Only the fields the client is allowed to set, in a bounded size. */
function pulisci({ fatto, note }) {
  return {
    fatto: Boolean(fatto),
    note: String(note ?? '').slice(0, 2000),
  };
}

// ------------------------------------------------------------------ supabase

async function chiamaSupabase(cfg, metodo, query, body, prefer) {
  const res = await fetch(`${cfg.url}/rest/v1/${TABELLA}${query}`, {
    method: metodo,
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

async function leggiSupabase(cfg, alunno) {
  const righe = await chiamaSupabase(cfg, 'GET',
    `?alunno=eq.${alunno}&select=chiave,fatto,note,aggiornato`);
  const stato = {};
  for (const r of righe) stato[r.chiave] = { fatto: r.fatto, note: r.note || '', aggiornato: r.aggiornato };
  return stato;
}

async function salvaSupabase(cfg, alunno, chiave, valori) {
  const riga = { alunno, chiave, ...valori, aggiornato: new Date().toISOString() };
  if (!riga.fatto && !riga.note) {
    await chiamaSupabase(cfg, 'DELETE', `?alunno=eq.${alunno}&chiave=eq.${encodeURIComponent(chiave)}`);
    return null;
  }
  const [salvata] = await chiamaSupabase(cfg, 'POST', '', riga,
    'resolution=merge-duplicates,return=representation');
  return { fatto: salvata.fatto, note: salvata.note || '', aggiornato: salvata.aggiornato };
}

/**
 * A small write keeps a free Supabase project from being paused after a week
 * of inactivity. Same trick as the workout project: the keepalive_ping()
 * function in supabase/schema.sql just touches a timestamp.
 */
async function keepAlive() {
  const cfg = supabase();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/rest/v1/rpc/keepalive_ping`, {
    method: 'POST',
    headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// ---------------------------------------------------------------- json file

function leggiFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function scriviFile(tutto) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(FILE, JSON.stringify(tutto), { mode: 0o600 });
}

// ------------------------------------------------------------------- public

/** Without Supabase the state can only live on disk, which Netlify does not have. */
const disponibile = () => Boolean(supabase()) || !process.env.NETLIFY;

/** All the saved items of one student: { chiave: { fatto, note, aggiornato } }. */
async function leggiStato(pk) {
  const alunno = idAlunno(pk);
  const cfg = supabase();
  if (cfg) return leggiSupabase(cfg, alunno);
  return leggiFile()[alunno] || {};
}

/** Saves one item and returns it, or null when it went back to the default (not done, no note). */
async function salvaStato(pk, chiave, patch) {
  const alunno = idAlunno(pk);
  const valori = pulisci(patch);
  const cfg = supabase();
  if (cfg) return salvaSupabase(cfg, alunno, chiave, valori);

  const tutto = leggiFile();
  const mio = tutto[alunno] || (tutto[alunno] = {});
  if (!valori.fatto && !valori.note) delete mio[chiave];
  else mio[chiave] = { ...valori, aggiornato: new Date().toISOString() };
  scriviFile(tutto);
  return mio[chiave] || null;
}

module.exports = { leggiStato, salvaStato, keepAlive, disponibile, idAlunno };
