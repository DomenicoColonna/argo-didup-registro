'use strict';
/**
 * Per student data the app keeps on its own: homework state (done flag and
 * notes) and the weekly timetable. Shared by server.js and the Netlify
 * function. Two backends:
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
const FILE_ORARIO = path.join(__dirname, 'dati', 'orario.json');
const TABELLA = 'compiti';
const TABELLA_ORARIO = 'orario';
const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven'];
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/**
 * Timetable: { lun: [{ inizio: 'HH:MM', fine: 'HH:MM', materia }], ... ven }.
 * Anything malformed is dropped, each day is capped and sorted by start time.
 */
function pulisciOrario(orario) {
  const out = {};
  for (const g of GIORNI) {
    const lista = Array.isArray(orario?.[g]) ? orario[g] : [];
    out[g] = lista.slice(0, 20)
      .map((x) => ({
        inizio: String(x?.inizio ?? ''),
        fine: String(x?.fine ?? ''),
        materia: String(x?.materia ?? '').trim().slice(0, 60),
      }))
      .filter((x) => ORA.test(x.inizio) && ORA.test(x.fine) && x.fine > x.inizio && x.materia)
      .sort((a, b) => (a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : 0));
  }
  return out;
}

// ------------------------------------------------------------------ supabase

async function chiamaSupabase(cfg, metodo, query, body, prefer, tabella = TABELLA) {
  const res = await fetch(`${cfg.url}/rest/v1/${tabella}${query}`, {
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
  const testo = await res.text(); // 204 and return=minimal come back empty
  return testo ? JSON.parse(testo) : null;
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

async function leggiOrarioSupabase(cfg, alunno) {
  const righe = await chiamaSupabase(cfg, 'GET', `?alunno=eq.${alunno}&select=dati`, null, null, TABELLA_ORARIO);
  return pulisciOrario(righe[0]?.dati);
}

async function salvaOrarioSupabase(cfg, alunno, orario) {
  const riga = { alunno, dati: orario, aggiornato: new Date().toISOString() };
  await chiamaSupabase(cfg, 'POST', '', riga, 'resolution=merge-duplicates,return=minimal', TABELLA_ORARIO);
  return orario;
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

function leggiFile(file = FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function scriviFile(tutto, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(tutto), { mode: 0o600 });
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

/** The weekly timetable of one student, always with the five keys lun..ven. */
async function leggiOrario(pk) {
  const alunno = idAlunno(pk);
  const cfg = supabase();
  if (cfg) return leggiOrarioSupabase(cfg, alunno);
  return pulisciOrario(leggiFile(FILE_ORARIO)[alunno]);
}

/** Replaces the whole timetable and returns the cleaned version. */
async function salvaOrario(pk, orario) {
  const alunno = idAlunno(pk);
  const pulito = pulisciOrario(orario);
  const cfg = supabase();
  if (cfg) return salvaOrarioSupabase(cfg, alunno, pulito);
  const tutto = leggiFile(FILE_ORARIO);
  tutto[alunno] = pulito;
  scriviFile(tutto, FILE_ORARIO);
  return pulito;
}

module.exports = { leggiStato, salvaStato, leggiOrario, salvaOrario, pulisciOrario, keepAlive, disponibile, idAlunno };
