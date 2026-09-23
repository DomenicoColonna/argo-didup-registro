'use strict';
/**
 * Per student data the app keeps on its own: homework state (done flag and
 * notes) and the weekly timetable. Shared by server.js and the Netlify
 * function. Two backends:
 *  - Supabase, when SUPABASE_URL and SUPABASE_SERVICE_KEY are set (REST API,
 *    no client library). Table layout in supabase/schema.sql.
 *  - a JSON file in data/, only for the VPS. Netlify functions have no disk,
 *    so without Supabase the frontend keeps the state in localStorage only.
 * The student is identified by a hash of the Argo pk, the raw pk never leaves
 * the session.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOMEWORK_FILE = path.join(__dirname, 'data', 'homework.json');
const TIMETABLE_FILE = path.join(__dirname, 'data', 'timetable.json');
const HOMEWORK_TABLE = 'homework';
const TIMETABLE_TABLE = 'timetable';
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
};

const studentId = (pk) => crypto.createHash('sha256').update(String(pk)).digest('hex').slice(0, 32);

/** Only the fields the client is allowed to set, in a bounded size. */
function cleanHomework({ done, note }) {
  return {
    done: Boolean(done),
    note: String(note ?? '').slice(0, 2000),
  };
}

/**
 * Timetable: { mon: [{ start: 'HH:MM', end: 'HH:MM', subject }], ... fri }.
 * Anything malformed is dropped, each day is capped and sorted by start time.
 */
function cleanTimetable(timetable) {
  const out = {};
  for (const day of WEEKDAYS) {
    const slots = Array.isArray(timetable?.[day]) ? timetable[day] : [];
    out[day] = slots.slice(0, 20)
      .map((s) => ({
        start: String(s?.start ?? ''),
        end: String(s?.end ?? ''),
        subject: String(s?.subject ?? '').trim().slice(0, 60),
      }))
      .filter((s) => TIME.test(s.start) && TIME.test(s.end) && s.end > s.start && s.subject)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }
  return out;
}

// ------------------------------------------------------------------ supabase

async function callSupabase(cfg, method, table, query, body, prefer) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text(); // 204 and return=minimal come back empty
  return text ? JSON.parse(text) : null;
}

async function readHomeworkSupabase(cfg, student) {
  const rows = await callSupabase(cfg, 'GET', HOMEWORK_TABLE,
    `?student=eq.${student}&select=key,done,note,updated_at`);
  const state = {};
  for (const r of rows) state[r.key] = { done: r.done, note: r.note || '', updatedAt: r.updated_at };
  return state;
}

async function saveHomeworkSupabase(cfg, student, key, values) {
  const row = { student, key, ...values, updated_at: new Date().toISOString() };
  if (!row.done && !row.note) {
    await callSupabase(cfg, 'DELETE', HOMEWORK_TABLE, `?student=eq.${student}&key=eq.${encodeURIComponent(key)}`);
    return null;
  }
  const [saved] = await callSupabase(cfg, 'POST', HOMEWORK_TABLE, '', row,
    'resolution=merge-duplicates,return=representation');
  return { done: saved.done, note: saved.note || '', updatedAt: saved.updated_at };
}

async function readTimetableSupabase(cfg, student) {
  const rows = await callSupabase(cfg, 'GET', TIMETABLE_TABLE, `?student=eq.${student}&select=data`);
  return cleanTimetable(rows[0]?.data);
}

async function saveTimetableSupabase(cfg, student, timetable) {
  const row = { student, data: timetable, updated_at: new Date().toISOString() };
  await callSupabase(cfg, 'POST', TIMETABLE_TABLE, '', row, 'resolution=merge-duplicates,return=minimal');
  return timetable;
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

function readFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(file, all) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
}

// ------------------------------------------------------------------- public

/** Without Supabase the state can only live on disk, which Netlify does not have. */
const available = () => Boolean(supabase()) || !process.env.NETLIFY;

/** All the saved items of one student: { key: { done, note, updatedAt } }. */
async function readHomeworkState(pk) {
  const student = studentId(pk);
  const cfg = supabase();
  if (cfg) return readHomeworkSupabase(cfg, student);
  return readFile(HOMEWORK_FILE)[student] || {};
}

/** Saves one item and returns it, or null when it went back to the default (not done, no note). */
async function saveHomeworkState(pk, key, patch) {
  const student = studentId(pk);
  const values = cleanHomework(patch);
  const cfg = supabase();
  if (cfg) return saveHomeworkSupabase(cfg, student, key, values);

  const all = readFile(HOMEWORK_FILE);
  const mine = all[student] || (all[student] = {});
  if (!values.done && !values.note) delete mine[key];
  else mine[key] = { ...values, updatedAt: new Date().toISOString() };
  writeFile(HOMEWORK_FILE, all);
  return mine[key] || null;
}

/** The weekly timetable of one student, always with the five keys mon..fri. */
async function readTimetable(pk) {
  const student = studentId(pk);
  const cfg = supabase();
  if (cfg) return readTimetableSupabase(cfg, student);
  return cleanTimetable(readFile(TIMETABLE_FILE)[student]);
}

/** Replaces the whole timetable and returns the cleaned version. */
async function saveTimetable(pk, timetable) {
  const student = studentId(pk);
  const clean = cleanTimetable(timetable);
  const cfg = supabase();
  if (cfg) return saveTimetableSupabase(cfg, student, clean);
  const all = readFile(TIMETABLE_FILE);
  all[student] = clean;
  writeFile(TIMETABLE_FILE, all);
  return clean;
}

module.exports = {
  readHomeworkState, saveHomeworkState, readTimetable, saveTimetable, cleanTimetable, keepAlive, available, studentId,
};
