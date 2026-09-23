'use strict';

const state = {
  data: null,
  tab: 'home',
  period: '*',            // Argo's own "Intero Anno" period, see periodOptions
  month: startOfMonth(new Date()),
  selectedDay: isoDay(new Date()),
  homeworkFilter: 'upcoming', // 'upcoming' | 'all' | 'todo' | 'done'
  averageAllGrades: false,
  homeworkState: {},      // homework key -> { done, note }, see loadSavedState
  timetable: null,        // { mon: [{ start, end, subject }], ... fri }, see loadSavedState
  timetableDay: null,     // day shown on mobile, reset on every visit, see renderTimetable
  timetableBase: null,    // iso date of the school day timetableDay was picked for
  remoteStore: true,      // false when the server cannot store it (Netlify without Supabase)
  homeworkSlide: null,    // 'forward' | 'back' right after a swipe, for the animation
  monthSlide: null,
  timetableSlide: null,
};

// -------------------------------------------------------------------- icons

const ICON_PATHS = {
  home: '<path d="M3.5 10.6 12 3.8l8.5 6.8V19a1.5 1.5 0 0 1-1.5 1.5h-4.2V15H9.2v5.5H5A1.5 1.5 0 0 1 3.5 19z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  check: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><path d="M9.5 3.5h5v3h-5z"/><path d="M9 13l2 2 4-4"/>',
  award: '<circle cx="12" cy="9" r="5.2"/><path d="M8.4 13.4 7.2 21l4.8-2.4L16.8 21l-1.2-7.6"/>',
  chart: '<path d="M4 19.5V12M10 19.5V5M16 19.5v-5.5"/><path d="M2.5 21.5h19"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V10H14"/>',
  logout: '<path d="M9.5 21H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3h3.5"/><path d="M16 16.5 20.5 12 16 7.5"/><path d="M20.5 12H9.5"/>',
  book: '<path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z"/><path d="M4 17.5h16"/>',
  chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 7.5-2.5 7.5h17S18 15 18 8.5"/><path d="M13.8 19.5a2.2 2.2 0 0 1-3.6 0"/>',
  chevronDown: '<path d="M5.5 9 12 15.5 18.5 9"/>',
  check2: '<path d="M5 12.5 10 17.5 19 7"/>',
  arrowLeft: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  arrowRight: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  pencil: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
};

function icon(name, cls = 'w-5 h-5') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}
function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]:not([data-icon-done])')) {
    node.insertAdjacentHTML('afterbegin', icon(node.dataset.icon, node.dataset.iconSize || 'w-5 h-5'));
    node.setAttribute('data-icon-done', '');
  }
}

// ----------------------------------------------------------------- helpers

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Lessons run from September to June, so the calendar only moves inside that range.
 * The current school year comes from today's date (from September on it is the new
 * one), not from the Argo profile, which early in the year may still hold the old one.
 */
function schoolYearBounds() {
  const today = new Date();
  const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return { first: new Date(startYear, 8, 1), last: new Date(startYear + 1, 5, 1) };
}
function clampMonth(d) {
  const { first, last } = schoolYearBounds();
  if (d < first) return first;
  if (d > last) return last;
  return d;
}
function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Argo dates come as YYYY-MM-DD (sometimes with a time) or DD/MM/YYYY. */
function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
const dayOf = (value) => { const d = parseDate(value); return d ? isoDay(d) : null; };
const fmtDay = (iso) => {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
};
const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const fmtAverage = (n) => (n == null || !Number.isFinite(n) ? '—' : round2(n).toFixed(2));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Grade colors: green from 6 up, amber between 5 and 6, red below 5. */
function gradeTone(v) {
  if (!Number.isFinite(v)) return { text: 'text-ink-soft', chip: 'bg-slate-100 text-ink-soft', bar: 'bg-slate-300' };
  if (v >= 6) return { text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' };
  if (v >= 5) return { text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' };
  return { text: 'text-rose-700', chip: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' };
}

/**
 * How far a day is from today: 'past', 'today', 'soon' (the next three days)
 * or 'later'. Used to color the day chip in the homework list.
 */
function dayDistance(iso, today = isoDay(new Date())) {
  if (iso < today) return 'past';
  if (iso === today) return 'today';
  const days = Math.round((parseDate(iso) - parseDate(today)) / 86400000);
  return days <= 3 ? 'soon' : 'later';
}

const CHIP_TONES = {
  neutral: { box: 'bg-page text-ink-soft', month: 'text-ink-faint', day: 'text-ink', wd: 'text-ink-faint' },
  today:   { box: 'bg-violet-600 text-white', month: 'text-white/80', day: 'text-white', wd: 'text-white/80' },
  past:    { box: 'bg-slate-200/70 text-ink-faint', month: 'text-ink-faint', day: 'text-ink-faint', wd: 'text-ink-faint' },
  soon:    { box: 'bg-amber-100 text-amber-800', month: 'text-amber-700/80', day: 'text-amber-900', wd: 'text-amber-700/80' },
  later:   { box: 'bg-sky-100 text-sky-800', month: 'text-sky-700/80', day: 'text-sky-900', wd: 'text-sky-700/80' },
};

/** Date chip in the "MAG 24 / ven" style. `tone` is a key of CHIP_TONES, `true` means today. */
function dateChip(iso, tone = 'neutral') {
  const d = parseDate(iso);
  if (!d) return '';
  const t = CHIP_TONES[tone === true ? 'today' : tone] || CHIP_TONES.neutral;
  const month = d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '').toUpperCase();
  const wd = d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  return `<div class="shrink-0 w-14 rounded-2xl px-2 py-1.5 text-center leading-tight ${t.box}">
      <div class="text-[10px] font-bold tracking-wide ${t.month}">${month}</div>
      <div class="text-lg font-extrabold ${t.day}">${d.getDate()}</div>
      <div class="text-[10px] font-semibold ${t.wd}">${wd}</div>
    </div>`;
}

const card = (content, extra = '') =>
  `<div class="bg-white rounded-3xl shadow-card ${extra}">${content}</div>`;

const sectionTitle = (text, action = '', extra = '') =>
  `<div class="flex items-baseline gap-3 mt-7 mb-3 ${extra}">
     <h2 class="text-[17px] font-extrabold tracking-tight">${esc(text)}</h2>
     ${action ? `<div class="ml-auto">${action}</div>` : ''}
   </div>`;

const actionLink = (text, tab) =>
  `<button data-goto="${tab}" class="text-sm font-semibold text-violet-600 hover:text-violet-700">${esc(text)}</button>`;

const empty = (text) =>
  `<p class="px-5 py-8 text-center text-sm text-ink-faint">${esc(text)}</p>`;

// ------------------------------------------------------------ derived data
// Argo field names (desMateria, datGiorno, registro...) only appear in this
// section: everything below works on the English objects built here.

const dash = () => state.data?.dashboard || {};
const active = (arr) => (arr || []).filter((x) => x && x.operazione !== 'D');

function periods() {
  const short = (d) => parseDate(d)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '') || '';
  return (dash().listaPeriodi || []).map((p) => {
    const from = short(p.dataInizio || p.datInizio);
    const to = short(p.dataFine || p.datFine);
    return { pk: p.pkPeriodo, name: p.descrizione, note: from && to ? `${from} – ${to}` : '' };
  });
}

function grades() {
  return active(dash().voti)
    .filter((v) => v.datGiorno)
    .map((v) => ({
      day: dayOf(v.datGiorno),
      subject: v.desMateria || v.materiaLight?.desDescrizione || '—',
      label: v.codCodice || (Number.isFinite(v.valore) ? String(v.valore) : '—'),
      value: Number.isFinite(v.valore) && v.valore > 0 ? v.valore : null,
      periodPk: v.pkPeriodo,
      kind: v.tipoValutazione || '',
      kindCode: String(v.tipoValutazione || v.codVotoPratico || '').toUpperCase(),
      description: v.descrizioneProva || v.desCommento || '',
      teacher: v.docente || '',
      // Argo leaves a grade out of the average with numMedia 0 or faMenoMedia 'S'
      excluded: v.numMedia === 0 || v.faMenoMedia === 'S' || v.faMenoMedia === true,
    }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** A grade counts towards the average unless Argo excludes it (numMedia / faMenoMedia). */
function countsInAverage(g) {
  if (g.value == null) return false;
  if (state.averageAllGrades) return true;
  return !g.excluded;
}

function periodGrades() {
  const all = grades();
  return state.period === '*' ? all : all.filter((g) => g.periodPk === state.period);
}

/** Short djb2 hash, enough to tell two homework texts apart. */
function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Argo gives homework no id, so the key is built from due day, subject and
 * text: it stays the same across refreshes unless the teacher edits the text.
 */
const homeworkKey = (day, subject, text) =>
  `${day}|${subject.slice(0, 40)}|${shortHash(text.trim())}`;

function homework() {
  const out = [];
  for (const lesson of active(dash().registro)) {
    for (const h of lesson.compiti || []) {
      if (!h.compito) continue;
      const subject = lesson.materia || '—';
      const day = dayOf(h.dataConsegna) || dayOf(lesson.datGiorno);
      const key = homeworkKey(day, subject, h.compito);
      const saved = state.homeworkState[key] || {};
      out.push({
        key,
        text: h.compito,
        subject,
        teacher: lesson.docente || '',
        assigned: dayOf(lesson.datGiorno),
        day,
        done: Boolean(saved.done),
        note: saved.note || '',
      });
    }
  }
  return out.sort((a, b) => (a.day > b.day ? 1 : -1));
}

function reminders() {
  return active(dash().promemoria)
    .map((p) => ({
      text: p.desAnnotazioni || '',
      teacher: p.docente || '',
      time: [p.oraInizio, p.oraFine].filter(Boolean).join('–'),
      day: dayOf(p.datGiorno),
    }))
    .sort((a, b) => (a.day > b.day ? 1 : -1));
}

/** Subjects Argo knows about (grades and lessons), for the autocomplete. */
function knownSubjects() {
  const set = new Set();
  for (const g of grades()) set.add(g.subject);
  for (const l of active(dash().registro)) if (l.materia) set.add(l.materia);
  return [...set].filter((s) => s && s !== '—').sort((a, b) => a.localeCompare(b, 'it'));
}

/** Average recomputed from the single grades, per subject, overall and per month. */
function computeAverages() {
  const used = periodGrades().filter(countsInAverage);
  const bySubject = new Map();
  const byMonth = new Map();

  for (const g of used) {
    if (!bySubject.has(g.subject)) bySubject.set(g.subject, { all: [], written: [], oral: [] });
    const group = bySubject.get(g.subject);
    group.all.push(g.value);
    if (g.kindCode.startsWith('S')) group.written.push(g.value);
    else if (g.kindCode.startsWith('O')) group.oral.push(g.value);

    const month = (g.day || '').slice(0, 7);
    if (month) byMonth.set(month, [...(byMonth.get(month) || []), g.value]);
  }

  const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
  const subjects = [...bySubject.entries()]
    .map(([subject, group]) => ({
      subject,
      average: avg(group.all),
      written: avg(group.written),
      oral: avg(group.oral),
      count: group.all.length,
    }))
    .sort((a, b) => b.average - a.average);

  return {
    subjects,
    overall: avg(used.map((g) => g.value)),
    averageOfAverages: avg(subjects.map((s) => s.average)),
    total: used.length,
    failing: subjects.filter((s) => s.average < 6).length,
    months: [...byMonth.entries()].sort().map(([month, values]) => ({ month, average: avg(values) })),
  };
}

// ------------------------------------------------ period selector (custom)

let periodMenuOpen = false;

/**
 * Argo already lists an "Intero Anno" period with pk "*", so no option of our
 * own. If a school does not send it, one gets added at the top.
 */
function periodOptions() {
  const list = periods();
  if (list.some((p) => p.pk === '*')) return list;
  const year = state.data?.profile?.anno?.anno;
  return [{ pk: '*', name: 'Intero anno', note: year ? `Anno scolastico ${year}` : '' }, ...list];
}

function renderPeriod() {
  const menu = el('period-menu');
  const options = periodOptions();
  const current = options.find((o) => o.pk === state.period) || options.find((o) => o.pk === '*') || options[0];
  el('period-label').textContent = current.name;

  menu.innerHTML = options.map((o) => {
    const chosen = o.pk === state.period;
    return `
      <button type="button" role="option" data-pk="${esc(o.pk)}" aria-selected="${chosen}"
        class="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition
               ${chosen ? 'bg-violet-50' : 'hover:bg-page'}
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-[14px] ${chosen ? 'text-violet-700' : ''}">${esc(o.name)}</span>
          ${o.note ? `<span class="block text-xs text-ink-faint">${esc(o.note)}</span>` : ''}
        </span>
        ${chosen ? icon('check2', 'w-5 h-5 shrink-0 text-violet-600') : ''}
      </button>`;
  }).join('');

  for (const b of menu.querySelectorAll('[data-pk]')) {
    b.onclick = (e) => {
      state.period = b.dataset.pk;
      // focus goes back to the button only when the choice came from the keyboard (detail 0)
      closePeriodMenu(e.detail === 0);
      renderPeriod();
      render();
    };
  }
}

function openPeriodMenu() {
  const menu = el('period-menu');
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.remove('opacity-0', 'scale-95', '-translate-y-1'));
  el('period-btn').setAttribute('aria-expanded', 'true');
  el('period-chevron').classList.add('rotate-180');
  periodMenuOpen = true;
}

function closePeriodMenu(refocus = false) {
  if (!periodMenuOpen) return;
  const menu = el('period-menu');
  menu.classList.add('opacity-0', 'scale-95', '-translate-y-1');
  el('period-btn').setAttribute('aria-expanded', 'false');
  el('period-chevron').classList.remove('rotate-180');
  periodMenuOpen = false;
  setTimeout(() => { if (!periodMenuOpen) menu.hidden = true; }, 160);
  if (refocus) el('period-btn').focus();
}

/** Arrows move between items, enter picks one, esc closes the menu. */
function periodMenuKeys(e) {
  const items = [...el('period-menu').querySelectorAll('[data-pk]')];
  if (e.key === 'Escape') return closePeriodMenu(true);
  if (e.key === 'Tab') return closePeriodMenu();
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  if (!periodMenuOpen) openPeriodMenu();
  const i = items.indexOf(document.activeElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  items[i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length]?.focus();
}

// ----------------------------------------------------------------- network

/** fetch wrapper, a failed call throws an Error carrying the HTTP status. */
async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const json = await res.json().catch(() => ({ error: 'Risposta non valida dal server' }));
  if (!res.ok) throw Object.assign(new Error(json.error || `Errore ${res.status}`), { status: res.status });
  return json;
}

async function login(e) {
  e.preventDefault();
  const btn = el('login-btn');
  const err = el('login-error');
  btn.disabled = true;
  btn.textContent = 'Accesso in corso…';
  err.classList.add('hidden');
  try {
    state.data = await api('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    cacheData(state.data);
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accedi';
  }
}

async function refresh() {
  const btn = el('refresh-btn');
  btn.disabled = true;
  btn.classList.add('animate-spin');
  try {
    state.data = await api('/api/data?refresh=1');
    cacheData(state.data);
    render();
  } catch (ex) {
    if (sessionEnded(ex)) {
      forgetCachedData();
      return location.reload();
    }
    alert(ex.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('animate-spin');
  }
}

// ------------------------------------------------------------------ render

const TABS = [
  { id: 'home', icon: 'home', name: 'Home' },
  { id: 'calendar', icon: 'calendar', name: 'Calendario' },
  { id: 'homework', icon: 'check', name: 'Compiti' },
  { id: 'timetable', icon: 'clock', name: 'Orario' },
  { id: 'grades', icon: 'award', name: 'Voti' },
  { id: 'average', icon: 'chart', name: 'Media' },
];

/** Sidebar entries (desktop only), same tabs as the bottom bar. */
function buildSideNav() {
  el('side-nav').innerHTML = TABS.map((t) => `
    <button class="tab-side" data-tab="${t.id}" data-icon-name="${t.icon}" data-label="${t.name}"></button>`).join('');
  for (const b of document.querySelectorAll('.tab-side')) {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; window.scrollTo({ top: 0 }); render(); });
  }
}

let started = false;
function showApp({ animate = true } = {}) {
  for (const id of ['boot-view', 'login-view']) {
    el(id).hidden = true;
    el(id).classList.add('hidden');
  }
  el('app-view').classList.remove('hidden');
  renderPeriod();
  render({ animate });
  // the saved homework state and timetable only need loading once
  if (!started) {
    started = true;
    loadSavedState();
  }
}

function showLogin() {
  el('boot-view').hidden = true;
  el('boot-view').classList.add('hidden');
  el('app-view').classList.add('hidden');
  el('login-view').hidden = false;
  el('login-view').classList.remove('hidden');
}

// ----------------------------------------------------------- session cache

const DATA_CACHE_KEY = 'register-data';
const HOMEWORK_CACHE_PREFIX = 'homework-state:';
// keys written before the code moved to English names, cleared on sight
const LEGACY_CACHE_KEY = /^(registro-dati|compiti-stato:)/;

/**
 * Last /api/data payload, kept in this browser only. Reopening the app shows
 * it straight away while fresh data comes from Argo (2 or 3 seconds on
 * Netlify), instead of a login form for someone who is already signed in.
 */
function readCachedData() {
  try {
    const data = JSON.parse(localStorage.getItem(DATA_CACHE_KEY));
    return data?.profile && data?.dashboard ? data : null;
  } catch {
    return null;
  }
}
function cacheData(data) {
  try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data)); } catch { /* full or blocked, skip */ }
}
/** On logout or an expired session nothing of the register stays behind. */
function forgetCachedData() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k === DATA_CACHE_KEY || k.startsWith(HOMEWORK_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}
function dropLegacyCache() {
  try {
    for (const k of Object.keys(localStorage)) if (LEGACY_CACHE_KEY.test(k)) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}
const sessionEnded = (ex) => ex?.status === 401;

/** `animate: false` swaps the content in place, used when fresh data replaces the saved one. */
function render({ animate = true } = {}) {
  const p = state.data.profile;
  const name = p.alunno?.nome || p.alunno?.nominativo || '';
  el('student-name').textContent = name ? `Ciao, ${name}` : 'Il tuo registro';
  el('student-meta').textContent = [
    (p.scheda?.classe?.desDenominazione || '') + (p.scheda?.classe?.desSezione || ''),
    p.anno?.anno,
  ].filter(Boolean).join(' · ');
  el('updated-at').textContent = state.data.updatedAt
    ? `Dati aggiornati il ${new Date(state.data.updatedAt).toLocaleString('it-IT')}`
    : '';

  for (const btn of document.querySelectorAll('.tab')) {
    const current = btn.dataset.tab === state.tab;
    btn.className = `tab flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition
      ${current ? 'text-violet-600 bg-violet-50' : 'text-ink-faint hover:text-ink-soft'}`;
    btn.setAttribute('aria-current', current ? 'page' : 'false');
    btn.innerHTML = `${icon(btn.dataset.icon, 'w-[22px] h-[22px]')}<span>${btn.dataset.label}</span>`;
  }
  for (const btn of document.querySelectorAll('.tab-side')) {
    const current = btn.dataset.tab === state.tab;
    btn.className = `tab-side flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition
      ${current ? 'bg-violet-50 text-violet-700' : 'text-ink-soft hover:bg-page'}`;
    btn.setAttribute('aria-current', current ? 'page' : 'false');
    btn.innerHTML = `${icon(btn.dataset.iconName, 'w-5 h-5 shrink-0')}<span>${btn.dataset.label}</span>`;
  }
  el('side-name').textContent = p.alunno?.nominativo || '';
  el('side-meta').textContent = el('student-meta').textContent;

  // leaving the timetable forgets the day you swiped to, so it opens on the right one next time
  if (state.tab !== 'timetable') state.timetableDay = null;

  for (const panel of document.querySelectorAll('.tab-panel')) panel.classList.add('hidden');
  const panel = el(`tab-${state.tab}`);
  panel.classList.remove('hidden');

  ({
    home: renderHome,
    calendar: renderCalendar,
    homework: renderHomework,
    timetable: renderTimetable,
    grades: renderGrades,
    average: renderAverage,
  })[state.tab]();

  if (animate) {
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
  }
  hydrateIcons(panel);
  for (const b of panel.querySelectorAll('[data-goto]')) {
    b.onclick = () => { state.tab = b.dataset.goto; window.scrollTo({ top: 0 }); render(); };
  }
}

// --- home

function renderHome() {
  const m = computeAverages();
  const today = isoDay(new Date());
  const todo = homework().filter((h) => h.day >= today && !h.done);
  const next = todo.slice(0, 3);
  const latest = periodGrades().slice(0, 4);
  const tone = gradeTone(m.overall);
  const argoAverage = dash().mediaGenerale;

  const shortcut = (tab, name, value, ic, color) => `
    <button data-goto="${tab}" class="text-left bg-white rounded-3xl shadow-card p-4 transition
        hover:shadow-lift hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
      <div class="w-10 h-10 rounded-2xl grid place-items-center ${color}" data-icon="${ic}"></div>
      <div class="mt-3 font-bold text-[15px]">${esc(name)}</div>
      <div class="text-[13px] text-ink-soft">${esc(value)}</div>
    </button>`;

  el('tab-home').innerHTML = `
    <div class="lg:grid lg:grid-cols-2 lg:gap-7 lg:items-start">
    <div>
    ${card(`
      <div class="p-5 flex items-center gap-5">
        <div>
          <p class="text-xs font-bold tracking-wide text-ink-faint uppercase">Media generale</p>
          <p class="text-5xl font-extrabold tracking-tight ${tone.text} mt-1">${fmtAverage(m.overall)}</p>
          <p class="text-[13px] text-ink-soft mt-1">
            calcolata su ${plural(m.total, 'voto', 'voti')} in ${plural(m.subjects.length, 'materia', 'materie')}
          </p>
        </div>
        <div class="ml-auto text-right flex flex-col items-end gap-2 shrink-0">
          ${m.failing
            ? `<p class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 whitespace-nowrap">
                 ${plural(m.failing, 'materia sotto il 6', 'materie sotto il 6')}</p>`
            : m.subjects.length
              ? `<p class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">
                   nessuna insufficienza</p>`
              : ''}
          <div>${actionLink('Dettaglio →', 'average')}</div>
        </div>
      </div>
      ${Number.isFinite(argoAverage) && argoAverage > 0 ? `
        <p class="px-5 pb-4 -mt-1 text-xs text-ink-faint">Argo dichiara ${fmtAverage(argoAverage)}</p>` : ''}
    `)}

    ${sectionTitle('Accesso rapido')}
    <div class="grid grid-cols-2 gap-3">
      ${shortcut('grades', 'Voti', plural(periodGrades().length, 'voto registrato', 'voti registrati'), 'award', 'bg-violet-100 text-violet-700')}
      ${shortcut('homework', 'Compiti', todo.length ? plural(todo.length, 'da fare', 'da fare') : 'niente in sospeso', 'check', 'bg-amber-100 text-amber-700')}
      ${shortcut('calendar', 'Calendario', new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }), 'calendar', 'bg-sky-100 text-sky-700')}
      ${shortcut('average', 'Andamento', m.months.length ? plural(m.months.length, 'mese', 'mesi') + ' di dati' : 'nessun dato', 'chart', 'bg-emerald-100 text-emerald-700')}
    </div>

    </div>
    <div>
    ${sectionTitle('Prossimi compiti', actionLink('Vedi tutti', 'homework'), 'lg:mt-0')}
    ${card(next.length ? `<ul class="divide-y divide-slate-100">
      ${next.map((h) => `
        <li class="p-4 flex gap-3.5 items-start">
          ${dateChip(h.day, dayDistance(h.day, today))}
          <div class="min-w-0">
            <p class="font-bold text-[15px]">${esc(h.subject)}</p>
            <p class="text-sm text-ink-soft line-clamp-2">${esc(h.text)}</p>
          </div>
        </li>`).join('')}
      </ul>` : empty('Nessun compito in programma.'))}

    ${sectionTitle('Ultimi voti', actionLink('Vedi tutti', 'grades'))}
    ${card(latest.length ? `<ul class="divide-y divide-slate-100">
      ${latest.map((g) => gradeRow(g)).join('')}
      </ul>` : empty('Ancora nessun voto in questo periodo.'))}
    </div>
    </div>`;
}

function gradeRow(g, showSubject = true) {
  const t = gradeTone(g.value);
  const description = g.description || 'Valutazione';
  const title = showSubject ? g.subject : description;
  const below = showSubject ? description : [g.kind, g.teacher].filter(Boolean).join(' · ');
  return `
    <li class="p-4 flex items-center gap-3.5">
      <span class="shrink-0 w-12 h-12 grid place-items-center rounded-2xl text-lg font-extrabold ${t.chip}">
        ${esc(g.label)}
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-bold text-[15px] truncate">${esc(title)}</p>
        <p class="text-[13px] text-ink-soft truncate">${esc(below)}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-[13px] text-ink-faint">${esc(parseDate(g.day)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) || '')}</p>
        ${countsInAverage(g) ? '' : '<p class="text-[11px] font-semibold text-ink-faint">non in media</p>'}
      </div>
    </li>`;
}

// --- calendar

function renderCalendar() {
  const events = { grades: new Map(), homework: new Map(), reminders: new Map() };
  const push = (map, key, val) => key && map.set(key, [...(map.get(key) || []), val]);
  for (const g of grades()) push(events.grades, g.day, g);
  const allHomework = homework();
  for (const h of allHomework) push(events.homework, h.day, h);
  for (const r of reminders()) push(events.reminders, r.day, r);

  state.month = clampMonth(state.month);
  const month = state.month;
  const bounds = schoolYearBounds();
  const atFirst = month.getTime() === bounds.first.getTime();
  const atLast = month.getTime() === bounds.last.getTime();
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // weeks start on monday
  const today = isoDay(new Date());

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
    const key = isoDay(d);
    const outside = d.getMonth() !== month.getMonth();
    const weekend = d.getDay() === 0 || d.getDay() === 6; // no school on saturday and sunday
    const selected = key === state.selectedDay;
    const dots = [
      events.grades.get(key)?.length ? 'bg-violet-500' : null,
      // amber while something is still to do, green once every homework of the day is done
      events.homework.get(key)?.length
        ? (events.homework.get(key).every((h) => h.done) ? 'bg-emerald-500' : 'bg-amber-500') : null,
      events.reminders.get(key)?.length ? 'bg-sky-500' : null,
    ].filter(Boolean);

    const background = selected
      ? 'bg-violet-600 text-white shadow-card'
      : weekend
        ? 'bg-page text-ink-faint hover:bg-slate-100'
        : 'text-ink hover:bg-page';

    return `
      <button data-day="${key}" aria-label="${esc(fmtDay(key))}"
        class="day-cell aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition
               ${outside ? 'opacity-30' : ''} ${background}
               ${key === today && !selected ? 'ring-2 ring-violet-300' : ''}">
        <span class="text-sm ${selected ? 'font-extrabold' : key === today ? 'font-extrabold text-violet-700' : 'font-semibold'}">
          ${d.getDate()}
        </span>
        <span class="flex gap-0.5 h-1.5">
          ${dots.map((c) => `<span class="w-1.5 h-1.5 rounded-full ${selected ? 'bg-white/80' : c}"></span>`).join('')}
        </span>
      </button>`;
  }).join('');

  const sel = state.selectedDay;
  const sections = [
    ['Voti', events.grades.get(sel), (g) => {
      const t = gradeTone(g.value);
      return `<div class="flex items-center gap-3">
        <span class="shrink-0 w-11 h-11 grid place-items-center rounded-2xl font-extrabold ${t.chip}">${esc(g.label)}</span>
        <div class="min-w-0">
          <p class="font-bold text-[15px]">${esc(g.subject)}</p>
          <p class="text-[13px] text-ink-soft truncate">${esc(g.description || 'Valutazione')}</p>
        </div></div>`;
    }],
    ['Compiti', events.homework.get(sel), (h) => `
      <div class="flex gap-3 items-start rounded-2xl -mx-2 px-2 py-1.5 transition-colors ${h.done ? 'bg-emerald-50/80' : ''}">
        <div class="min-w-0 flex-1">
          <p class="font-bold text-[15px]">${esc(h.subject)}</p>
          <p class="text-sm whitespace-pre-wrap text-ink-soft">${esc(h.text)}</p>
          ${h.note ? `
            <button type="button" data-note="${esc(h.key)}"
              class="mt-2 w-full text-left rounded-xl bg-violet-50 px-3 py-2 text-[13px] text-violet-900
                whitespace-pre-wrap hover:bg-violet-100 transition">${esc(h.note)}</button>` : ''}
        </div>
        <div class="shrink-0 flex flex-col items-center gap-1 -mr-1">
          ${doneButton(h)}
          ${noteButton(h)}
        </div>
      </div>`],
    ['Promemoria', events.reminders.get(sel), (r) => `
      <div><p class="text-sm text-ink whitespace-pre-wrap">${esc(r.text)}</p>
      <p class="text-xs text-ink-faint mt-0.5">${esc([r.teacher, r.time].filter(Boolean).join(' · '))}</p></div>`],
  ].filter(([, items]) => items && items.length);

  el('tab-calendar').innerHTML = `
    <div class="lg:grid lg:grid-cols-[1fr_21rem] lg:gap-6 lg:items-start">
    <div>
    ${card(`
      <div id="calendar-month" class="p-4 ${slideClass(state.monthSlide)}">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-[17px] font-extrabold tracking-tight capitalize mr-auto">
            ${month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </h2>
          <button id="month-today" class="text-sm font-semibold text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">Oggi</button>
          <button id="month-prev" aria-label="Mese precedente" data-icon="arrowLeft" ${atFirst ? 'disabled' : ''}
            class="w-9 h-9 grid place-items-center rounded-xl bg-page text-ink-soft hover:bg-slate-200 transition
                   disabled:opacity-30 disabled:hover:bg-page disabled:cursor-not-allowed"></button>
          <button id="month-next" aria-label="Mese successivo" data-icon="arrowRight" ${atLast ? 'disabled' : ''}
            class="w-9 h-9 grid place-items-center rounded-xl bg-page text-ink-soft hover:bg-slate-200 transition
                   disabled:opacity-30 disabled:hover:bg-page disabled:cursor-not-allowed"></button>
        </div>
        <div class="grid grid-cols-7 mb-1">
          ${['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((label, i) =>
            `<div class="text-center text-[11px] font-bold uppercase tracking-wide
              ${i >= 5 ? 'text-ink-faint/60' : 'text-ink-faint'}">${label}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-1">${cells}</div>
        <div class="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-ink-soft">
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-violet-500"></span>voti</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500"></span>compiti</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>compiti fatti</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-sky-500"></span>promemoria</span>
        </div>
      </div>`)}

    </div>
    <div>
    ${sectionTitle(fmtDay(sel) || 'Nessun giorno selezionato', '', 'lg:mt-0')}
    ${card(sections.length ? sections.map(([name, items, tpl]) => `
      <div class="p-4 border-b border-slate-100 last:border-0">
        <p class="text-xs font-bold uppercase tracking-wide text-ink-faint mb-3">${name}</p>
        <div class="space-y-3">${items.map(tpl).join('')}</div>
      </div>`).join('') : empty('Niente in programma per questo giorno.'))}
    </div>
    </div>`;

  state.monthSlide = null; // the animation runs once, not on every later render
  el('month-prev').onclick = () => changeMonth(-1);
  el('month-next').onclick = () => changeMonth(1);
  onSwipe(el('calendar-month'), changeMonth);
  el('month-today').onclick = () => {
    state.month = clampMonth(startOfMonth(new Date()));
    state.selectedDay = isoDay(new Date());
    render();
  };
  for (const b of document.querySelectorAll('.day-cell')) {
    b.onclick = () => { state.selectedDay = b.dataset.day; render(); };
  }
  wireHomeworkActions(el('tab-calendar'), allHomework);
}

/** Moves `step` months, inside the september to june range. */
function changeMonth(step) {
  const next = new Date(state.month.getFullYear(), state.month.getMonth() + step, 1);
  if (clampMonth(next).getTime() !== next.getTime()) return;
  state.month = next;
  state.monthSlide = step > 0 ? 'forward' : 'back';
  render();
}

// --- homework

/** Round check button used as the "done" checkbox of a homework item. */
const doneButton = (h) => `
  <button type="button" role="checkbox" aria-checked="${h.done}" data-done="${esc(h.key)}"
    aria-label="${h.done ? 'Segna come da fare' : 'Segna come fatto'}"
    class="w-9 h-9 grid place-items-center rounded-full border-2 transition
      ${h.done
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : 'border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-400'}
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
    ${icon('check2', 'w-5 h-5')}
  </button>`;

const noteButton = (h) => `
  <button type="button" data-note="${esc(h.key)}"
    aria-label="${h.note ? 'Modifica la nota' : 'Aggiungi una nota'}"
    class="w-9 h-9 grid place-items-center rounded-full transition
      ${h.note ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'text-ink-faint hover:bg-page hover:text-ink-soft'}
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
    ${icon('pencil', 'w-[18px] h-[18px]')}
  </button>`;

const HOMEWORK_FILTERS = ['upcoming', 'all', 'todo', 'done'];

function renderHomework() {
  const today = isoDay(new Date());
  const all = homework();
  const filters = {
    upcoming: { name: 'In arrivo', keeps: (h) => h.day >= today, empty: 'Nessun compito in arrivo.' },
    all: { name: 'Tutti', keeps: () => true, empty: 'Nessun compito.' },
    todo: { name: 'Da fare', keeps: (h) => !h.done, empty: 'Niente da fare, tutto fatto.' },
    done: { name: 'Fatti', keeps: (h) => h.done, empty: 'Ancora nessun compito segnato come fatto.' },
  };
  const current = filters[state.homeworkFilter] || filters.upcoming;
  const list = all.filter(current.keeps);
  const byDay = new Map();
  for (const h of list) byDay.set(h.day, [...(byDay.get(h.day) || []), h]);
  const doneCount = list.filter((h) => h.done).length;

  const filterPill = (id, f) => `
    <button data-filter="${id}" class="py-1.5 rounded-full text-[13px] font-semibold text-center transition
      ${current === f
        ? 'bg-white text-ink ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(22,26,43,.10),0_8px_16px_-8px_rgba(22,26,43,.55)]'
        : 'text-ink-soft hover:text-ink'}">
      ${f.name}</button>`;

  const summary = list.length
    ? `${plural(list.length - doneCount, 'da fare', 'da fare')} · ${plural(doneCount, 'fatto', 'fatti')}`
    : '';

  el('tab-homework').innerHTML = `
    ${card(`<div class="p-4">
        <div class="flex items-baseline gap-3">
          <h2 class="text-[17px] font-extrabold tracking-tight">Compiti</h2>
          ${summary ? `<p class="ml-auto text-[13px] text-ink-soft truncate">${summary}</p>` : ''}
        </div>
        <div class="mt-3 grid grid-cols-4 gap-1 bg-slate-100 rounded-full p-1">
          ${Object.entries(filters).map(([id, f]) => filterPill(id, f)).join('')}
        </div>
      </div>
      ${state.remoteStore ? '' : `<p class="px-4 pb-3 -mt-1 text-xs text-amber-700">
        Fatti e note restano solo su questo dispositivo: il server non ha un database configurato.</p>`}`)}
    <div id="homework-list" class="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start
        ${slideClass(state.homeworkSlide)}">
      ${byDay.size === 0 ? card(empty(current.empty)) : ''}
      ${[...byDay.entries()].map(([day, items]) => card(`
        <ul class="divide-y divide-slate-100">
          ${items.map((h, i) => `
            <li class="p-4 flex gap-3.5 items-start first:rounded-t-3xl last:rounded-b-3xl transition-colors
                ${h.done ? 'bg-emerald-50/80' : ''}">
              ${i === 0 ? dateChip(day, dayDistance(day, today)) : '<div class="w-14 shrink-0"></div>'}
              <div class="min-w-0 flex-1">
                <p class="font-bold text-[15px]">${esc(h.subject)}</p>
                <p class="text-sm whitespace-pre-wrap text-ink-soft">${esc(h.text)}</p>
                ${h.note ? `
                  <button type="button" data-note="${esc(h.key)}"
                    class="mt-2 w-full text-left rounded-xl bg-violet-50 px-3 py-2 text-[13px] text-violet-900
                      whitespace-pre-wrap hover:bg-violet-100 transition">${esc(h.note)}</button>` : ''}
                <p class="text-xs text-ink-faint mt-1">
                  assegnato ${esc(parseDate(h.assigned)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) || '—')}
                  ${h.teacher ? '· ' + esc(h.teacher) : ''}
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-center gap-1 -mr-1">
                ${doneButton(h)}
                ${noteButton(h)}
              </div>
            </li>`).join('')}
        </ul>`)).join('')}
    </div>`;

  state.homeworkSlide = null; // the animation runs once, not on every later render
  const panel = el('tab-homework');
  for (const b of panel.querySelectorAll('[data-filter]')) {
    b.onclick = () => changeHomeworkFilter(
      HOMEWORK_FILTERS.indexOf(b.dataset.filter) - HOMEWORK_FILTERS.indexOf(state.homeworkFilter));
  }
  wireHomeworkActions(panel, all);
  onSwipe(el('homework-list'), changeHomeworkFilter);
}

/** Moves `step` filters, stopping at the first and the last one. */
function changeHomeworkFilter(step) {
  const i = HOMEWORK_FILTERS.indexOf(state.homeworkFilter);
  const next = HOMEWORK_FILTERS[Math.min(Math.max(i + step, 0), HOMEWORK_FILTERS.length - 1)];
  if (!next || next === state.homeworkFilter) return;
  state.homeworkFilter = next;
  state.homeworkSlide = step > 0 ? 'forward' : 'back';
  render();
}

/** Wires the done and note buttons of every homework row inside `panel`. */
function wireHomeworkActions(panel, all) {
  for (const b of panel.querySelectorAll('[data-done]')) {
    b.onclick = () => {
      const h = all.find((x) => x.key === b.dataset.done);
      if (h) saveHomeworkState(h.key, { done: !h.done, note: h.note });
    };
  }
  for (const b of panel.querySelectorAll('[data-note]')) {
    b.onclick = () => {
      const h = all.find((x) => x.key === b.dataset.note);
      if (h) showNoteDialog(h);
    };
  }
}

// ------------------------------------------------- homework state (done, notes)

const homeworkCacheKey = () => `${HOMEWORK_CACHE_PREFIX}${state.data?.profile?.alunno?.pk || ''}`;
const timetableCacheKey = () => `${homeworkCacheKey()}:timetable`;

/**
 * localStorage first so the list is right on the first paint, then the server,
 * which wins when both have something. Without a server store (503) the state
 * simply stays in this browser.
 */
async function loadSavedState() {
  try {
    state.homeworkState = JSON.parse(localStorage.getItem(homeworkCacheKey())) || {};
  } catch {
    state.homeworkState = {};
  }
  try {
    state.timetable = JSON.parse(localStorage.getItem(timetableCacheKey())) || emptyTimetable();
  } catch {
    state.timetable = emptyTimetable();
  }
  try {
    const [{ state: saved }, { timetable }] = await Promise.all([api('/api/homework'), api('/api/timetable')]);
    state.homeworkState = { ...state.homeworkState, ...saved };
    state.timetable = timetable;
    state.remoteStore = true;
    localStorage.setItem(homeworkCacheKey(), JSON.stringify(state.homeworkState));
    localStorage.setItem(timetableCacheKey(), JSON.stringify(state.timetable));
  } catch (ex) {
    if (ex.status === 503) state.remoteStore = false;
  }
  if (['home', 'homework', 'calendar', 'timetable'].includes(state.tab)) render();
}

/** Optimistic: the UI updates right away, the server call follows. */
function saveHomeworkState(key, values) {
  const value = { done: Boolean(values.done), note: String(values.note || '') };
  if (!value.done && !value.note) delete state.homeworkState[key];
  else state.homeworkState[key] = value;
  try { localStorage.setItem(homeworkCacheKey(), JSON.stringify(state.homeworkState)); } catch { /* storage full or blocked */ }
  render();
  if (!state.remoteStore) return;
  api('/api/homework', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, ...value }),
  }).catch((ex) => {
    if (ex.status === 503) { state.remoteStore = false; render(); }
    else console.error('saving homework failed:', ex.message);
  });
}

let noteTarget = null;
function showNoteDialog(h) {
  noteTarget = h;
  el('note-subject').textContent = h.subject;
  el('note-text').textContent = h.text;
  el('note-input').value = h.note;
  el('note-delete').classList.toggle('hidden', !h.note);
  el('note-dialog').showModal();
  el('note-input').focus();
}
function closeNoteDialog() { el('note-dialog').close(); noteTarget = null; }

// --- timetable

const WEEKDAYS = [
  { id: 'mon', name: 'Lunedì', short: 'Lun' },
  { id: 'tue', name: 'Martedì', short: 'Mar' },
  { id: 'wed', name: 'Mercoledì', short: 'Mer' },
  { id: 'thu', name: 'Giovedì', short: 'Gio' },
  { id: 'fri', name: 'Venerdì', short: 'Ven' },
];
const emptyTimetable = () => Object.fromEntries(WEEKDAYS.map((d) => [d.id, []]));

/** Weekday id of a date, null on saturday and sunday (no school). */
function weekdayOf(d) {
  return WEEKDAYS[(d.getDay() + 6) % 7]?.id || null;
}

/** First school day from `d` on, `d` included. */
function nextSchoolDate(d) {
  for (let i = 0; i < 7; i++) {
    const day = addDays(d, i);
    if (weekdayOf(day)) return day;
  }
  return d;
}

/**
 * The school day the timetable is about: today until 15:00, the next school
 * day from 15:00 on (so on a wednesday afternoon it is already thursday), and
 * monday over the weekend.
 */
function timetableDate(now = new Date()) {
  return nextSchoolDate(now.getHours() >= 15 ? addDays(now, 1) : now);
}

/** The nearest date falling on that weekday, counting from `from`. */
function dateOfWeekday(id, from) {
  const i = WEEKDAYS.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const steps = (i - ((from.getDay() + 6) % 7) + 7) % 7;
  return isoDay(addDays(from, steps));
}

/**
 * Argo and the hand typed timetable spell subjects differently ("TPS INFORM."
 * against "TPS"), so the match is loose: same text once accents, brackets and
 * punctuation are gone, or same first word.
 */
function normalizeSubject(name) {
  return String(name || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How close two subject names are, 0 when they have nothing in common. */
function subjectScore(a, b) {
  const x = normalizeSubject(a);
  const y = normalizeSubject(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const tx = x.split(' ');
  const ty = y.split(' ');
  const shared = tx.filter((t) => t.length >= 4 && ty.includes(t)).length;
  return (tx[0] === ty[0] ? 10 : 0) + shared;
}

/**
 * Groups the homework of one day under the subjects taught that day, each one
 * going to the closest name. Picking the best match instead of every match
 * keeps "Matematica" away from "Complementi Matematica".
 */
function homeworkBySubject(todo, subjects) {
  const out = new Map();
  for (const h of todo) {
    let best = null;
    let bestScore = 0;
    for (const s of subjects) {
      const score = subjectScore(h.subject, s);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (best) out.set(best, [...(out.get(best) || []), h]);
  }
  return out;
}

/** Slots sorted by start time. */
const slotsOf = (day) => [...(state.timetable?.[day] || [])]
  .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

function renderTimetable() {
  if (!state.timetable) state.timetable = emptyTimetable();
  const base = timetableDate();
  const baseIso = isoDay(base);
  const baseDay = weekdayOf(base);
  // a new school day (15:00 passed, or the app was left open overnight) starts over from it
  if (!state.timetableDay || state.timetableBase !== baseIso) {
    state.timetableDay = baseDay;
    state.timetableBase = baseIso;
  }
  const todayId = weekdayOf(new Date());
  const now = new Date().toTimeString().slice(0, 5);
  const total = WEEKDAYS.reduce((n, d) => n + (state.timetable[d.id] || []).length, 0);
  const allHomework = homework();

  const pill = (d) => `
    <button data-weekday="${d.id}" class="py-1.5 rounded-full text-[13px] font-semibold text-center transition
      ${state.timetableDay === d.id
        ? 'bg-white text-ink ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(22,26,43,.10),0_8px_16px_-8px_rgba(22,26,43,.55)]'
        : 'text-ink-soft hover:text-ink'}">
      ${d.short}${d.id === baseDay ? '<span class="block mx-auto mt-0.5 w-1 h-1 rounded-full bg-violet-500"></span>' : ''}</button>`;

  const slotRow = (d, s, i, bySubject) => {
    const running = d.id === todayId && s.start <= now && now < s.end;
    const due = bySubject.get(s.subject) || [];
    return `
      <li class="p-3.5 flex items-center gap-3 ${running ? 'bg-violet-50/70' : ''}
          lg:grid lg:grid-cols-[1fr_auto] lg:gap-x-2 lg:gap-y-0.5">
        <div class="shrink-0 w-[4.5rem] leading-tight lg:w-auto lg:flex lg:items-baseline lg:gap-1.5">
          <p class="text-sm font-extrabold tabular-nums lg:text-xs ${running ? 'text-violet-700' : 'text-ink'}">${esc(s.start)}</p>
          <p class="text-xs font-semibold tabular-nums text-ink-faint lg:before:content-['–'] lg:before:mr-1.5">${esc(s.end)}</p>
          ${running ? '<span class="hidden lg:inline text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-1.5">ora</span>' : ''}
        </div>
        <div class="w-px self-stretch lg:hidden ${running ? 'bg-violet-300' : 'bg-slate-200'}"></div>
        <div class="min-w-0 flex-1 lg:row-start-2">
          <p class="font-bold text-[15px] truncate lg:text-sm">${esc(s.subject)}</p>
          ${due.length ? `
            <button type="button" data-open-homework
              class="mt-0.5 w-full flex items-center gap-1.5 text-left text-[12px] text-amber-700
                hover:text-amber-800 transition focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-amber-600">
              ${icon('check', 'w-3.5 h-3.5 shrink-0')}
              <span class="min-w-0 flex-1 truncate">${esc(due[0].text)}</span>
              ${due.length > 1 ? `<span class="shrink-0 font-bold">+${due.length - 1}</span>` : ''}
            </button>` : ''}
        </div>
        ${running ? '<span class="shrink-0 text-[11px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5 lg:hidden">ora</span>' : ''}
        <button type="button" data-edit-slot="${d.id}:${i}" aria-label="Modifica"
          class="shrink-0 w-9 h-9 grid place-items-center rounded-full text-ink-faint hover:bg-page hover:text-ink-soft transition
            lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:w-8 lg:h-8
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
          ${icon('pencil', 'w-[18px] h-[18px]')}
        </button>
      </li>`;
  };

  const column = (d) => {
    const slots = slotsOf(d.id);
    // homework due on the next date falling on this weekday, still to be done
    const date = dateOfWeekday(d.id, base);
    const todo = allHomework.filter((h) => h.day === date && !h.done);
    const bySubject = homeworkBySubject(todo, [...new Set(slots.map((s) => s.subject))]);
    return `
      <div data-column="${d.id}" class="${state.timetableDay === d.id
        ? slideClass(state.timetableSlide) : 'hidden'} lg:block">
        <div class="hidden lg:flex items-baseline gap-2 mb-2 px-1">
          <h3 class="font-extrabold text-[15px] ${d.id === baseDay ? 'text-violet-700' : ''}">${d.name}</h3>
          <span class="ml-auto text-xs text-ink-faint">${slots.length ? plural(slots.length, 'ora', 'ore') : ''}</span>
        </div>
        ${card(`
          ${slots.length ? `<ul class="divide-y divide-slate-100">${slots.map((s, i) => slotRow(d, s, i, bySubject)).join('')}</ul>`
            : empty('Nessuna ora inserita.')}
          <button type="button" data-add-slot="${d.id}"
            class="w-full flex items-center justify-center gap-2 py-3 border-t border-slate-100 text-sm font-semibold
              text-violet-600 hover:bg-violet-50 rounded-b-3xl transition
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            ${icon('plus', 'w-4 h-4')} Aggiungi ora
          </button>`)}
      </div>`;
  };

  el('tab-timetable').innerHTML = `
    ${card(`<div class="p-4">
        <div class="flex items-baseline gap-3">
          <h2 class="text-[17px] font-extrabold tracking-tight">Orario</h2>
          <p class="ml-auto text-[13px] text-ink-soft truncate">${total ? plural(total, 'ora a settimana', 'ore a settimana') : 'da lunedì a venerdì'}</p>
        </div>
        <div class="mt-3 grid grid-cols-5 gap-1 bg-slate-100 rounded-full p-1 lg:hidden">
          ${WEEKDAYS.map(pill).join('')}
        </div>
      </div>
      ${state.remoteStore ? '' : `<p class="px-4 pb-3 -mt-1 text-xs text-amber-700">
        L'orario resta solo su questo dispositivo: il server non ha un database configurato.</p>`}`)}
    <div id="timetable-days" class="mt-3 lg:grid lg:grid-cols-5 lg:gap-3 lg:items-start">
      ${WEEKDAYS.map(column).join('')}
    </div>`;

  state.timetableSlide = null; // the animation runs once, not on every later render
  const panel = el('tab-timetable');
  for (const b of panel.querySelectorAll('[data-weekday]')) {
    b.onclick = () => {
      const i = WEEKDAYS.findIndex((d) => d.id === b.dataset.weekday);
      changeTimetableDay(i - WEEKDAYS.findIndex((d) => d.id === state.timetableDay));
    };
  }
  for (const b of panel.querySelectorAll('[data-add-slot]')) {
    b.onclick = () => showSlotDialog(b.dataset.addSlot, null);
  }
  for (const b of panel.querySelectorAll('[data-edit-slot]')) {
    b.onclick = () => {
      const [day, i] = b.dataset.editSlot.split(':');
      showSlotDialog(day, Number(i));
    };
  }
  onSwipe(el('timetable-days'), changeTimetableDay);
  for (const b of panel.querySelectorAll('[data-open-homework]')) {
    b.onclick = () => {
      state.homeworkFilter = 'todo';
      state.tab = 'homework';
      window.scrollTo({ top: 0 });
      render();
    };
  }
}

/** Moves `step` days, stopping at monday and friday. */
function changeTimetableDay(step) {
  const i = WEEKDAYS.findIndex((d) => d.id === state.timetableDay);
  const next = WEEKDAYS[Math.min(Math.max(i + step, 0), WEEKDAYS.length - 1)];
  if (!next || next.id === state.timetableDay) return;
  state.timetableDay = next.id;
  state.timetableSlide = step > 0 ? 'forward' : 'back';
  render();
}

/**
 * Horizontal swipe on `box` calls `go(1)` when dragging left and `go(-1)`
 * when dragging right. Only clearly sideways gestures count, so the page keeps
 * scrolling normally. Desktop shows everything at once and ignores this.
 */
function onSwipe(box, go) {
  if (!box) return;
  let x0 = 0;
  let y0 = 0;
  let tracking = false;
  box.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return (tracking = false);
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/** Animation class for the element that has just been swiped into view. */
const slideClass = (direction) => (direction ? `slide-${direction}` : '');

/** Mirrors the timetable in localStorage and sends the whole week to the server. */
function saveTimetable() {
  try { localStorage.setItem(timetableCacheKey(), JSON.stringify(state.timetable)); } catch { /* storage blocked */ }
  render();
  if (!state.remoteStore) return;
  api('/api/timetable', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timetable: state.timetable }),
  }).catch((ex) => {
    if (ex.status === 503) { state.remoteStore = false; render(); }
    else console.error('saving timetable failed:', ex.message);
  });
}

let editedSlot = null; // { day, index } while the dialog is open, index null for a new slot
function showSlotDialog(day, index) {
  const d = WEEKDAYS.find((x) => x.id === day);
  const slots = slotsOf(day);
  const s = index == null ? null : slots[index];
  // a new slot starts where the last one ends, one hour long
  const last = slots[slots.length - 1];
  const start = s?.start || last?.end || '08:00';
  const end = s?.end || addMinutes(start, 60);
  editedSlot = { day, index: s ? state.timetable[day].indexOf(s) : null };
  el('slot-title').textContent = s ? 'Modifica ora' : 'Nuova ora';
  el('slot-day').textContent = d?.name || '';
  el('slot-start').value = start;
  el('slot-end').value = end;
  el('slot-subject').value = s?.subject || '';
  el('slot-error').classList.add('hidden');
  el('slot-delete').classList.toggle('hidden', !s);
  el('subjects-list').innerHTML = knownSubjects().map((name) => `<option value="${esc(name)}"></option>`).join('');
  el('slot-dialog').showModal();
  el(s ? 'slot-subject' : 'slot-start').focus();
}
function closeSlotDialog() { el('slot-dialog').close(); editedSlot = null; }

/** "08:00" + 60 minutes -> "09:00", capped at 23:59. */
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function confirmSlot(e) {
  e.preventDefault();
  if (!editedSlot) return;
  const start = el('slot-start').value;
  const end = el('slot-end').value;
  const subject = el('slot-subject').value.trim();
  const error = el('slot-error');
  const problem = !start || !end ? 'Inserisci inizio e fine.'
    : end <= start ? 'La fine deve venire dopo l\'inizio.'
      : !subject ? 'Scrivi la materia.' : '';
  if (problem) {
    error.textContent = problem;
    error.classList.remove('hidden');
    return;
  }
  const slots = state.timetable[editedSlot.day] || (state.timetable[editedSlot.day] = []);
  const slot = { start, end, subject };
  if (editedSlot.index == null) slots.push(slot);
  else slots[editedSlot.index] = slot;
  closeSlotDialog();
  saveTimetable();
}

function deleteSlot() {
  if (!editedSlot || editedSlot.index == null) return;
  state.timetable[editedSlot.day].splice(editedSlot.index, 1);
  closeSlotDialog();
  saveTimetable();
}

// --- grades

function renderGrades() {
  const list = periodGrades();
  const bySubject = new Map();
  for (const g of list) bySubject.set(g.subject, [...(bySubject.get(g.subject) || []), g]);

  el('tab-grades').innerHTML = `
    ${card(`<div class="p-4 flex items-baseline gap-3">
      <h2 class="text-[17px] font-extrabold tracking-tight">Voti</h2>
      <p class="ml-auto text-sm text-ink-soft">${plural(list.length, 'valutazione', 'valutazioni')}</p>
    </div>`)}
    <div class="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
      ${list.length === 0 ? card(empty('Nessun voto nel periodo selezionato.')) : ''}
      ${[...bySubject.entries()].map(([subject, items]) => {
        const used = items.filter(countsInAverage).map((g) => g.value);
        const average = used.length ? used.reduce((s, n) => s + n, 0) / used.length : null;
        const t = gradeTone(average);
        return card(`
          <div class="p-4 flex items-center gap-3 border-b border-slate-100">
            <div class="min-w-0">
              <p class="font-extrabold text-[15px] truncate">${esc(subject)}</p>
              <p class="text-[13px] text-ink-soft">${plural(items.length, 'voto', 'voti')}</p>
            </div>
            <span class="ml-auto shrink-0 px-3 py-1.5 rounded-2xl font-extrabold ${t.chip}">${fmtAverage(average)}</span>
          </div>
          <ul class="divide-y divide-slate-100">${items.map((g) => gradeRow(g, false)).join('')}</ul>`);
      }).join('')}
    </div>`;
}

// --- average

function renderAverage() {
  const m = computeAverages();
  const argoAverage = dash().mediaGenerale;
  const scale = (v) => Math.max(0, Math.min(100, ((v - 1) / 9) * 100));

  const figure = (label, value, note) => {
    const t = gradeTone(value);
    return `<div class="bg-white rounded-3xl shadow-card p-4">
      <p class="text-xs font-bold uppercase tracking-wide text-ink-faint">${esc(label)}</p>
      <p class="text-3xl font-extrabold tracking-tight mt-1 ${value == null ? 'text-ink-faint' : t.text}">${fmtAverage(value)}</p>
      <p class="text-[13px] text-ink-soft mt-0.5">${esc(note)}</p>
    </div>`;
  };

  el('tab-average').innerHTML = `
    ${card(`<div class="p-4 flex items-center gap-3">
      <div>
        <h2 class="text-[17px] font-extrabold tracking-tight">Media</h2>
        <p class="text-[13px] text-ink-soft">Ricalcolata dai singoli voti</p>
      </div>
      <button type="button" id="count-all-toggle" role="switch" aria-checked="${state.averageAllGrades}"
        class="ml-auto flex items-center gap-2.5 text-[13px] font-semibold text-ink-soft group">
        <span>conta tutti i voti</span>
        <span class="relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0
          ${state.averageAllGrades ? 'bg-emerald-500' : 'bg-slate-400 group-hover:bg-slate-500'}">
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(22,26,43,.35)]
            transition-transform duration-200 ease-out ${state.averageAllGrades ? 'translate-x-5' : ''}"></span>
        </span>
      </button>
    </div>`)}

    <div class="grid grid-cols-2 gap-3 mt-3">
      ${figure('Generale', m.overall, `su ${plural(m.total, 'voto', 'voti')}`)}
      ${figure('Media delle materie', m.averageOfAverages, plural(m.subjects.length, 'materia', 'materie'))}
    </div>
    ${Number.isFinite(argoAverage) && argoAverage > 0
      ? `<p class="text-xs text-ink-faint mt-2 px-1">Argo dichiara ${fmtAverage(argoAverage)}.</p>`
      : `<p class="text-xs text-ink-faint mt-2 px-1">La tua scuola non espone la media: questi numeri sono calcolati qui.</p>`}

    <div class="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
    <div>
    ${sectionTitle('Per materia')}
    ${card(m.subjects.length ? `<div class="p-4 space-y-4">
      ${m.subjects.map((x) => {
        const t = gradeTone(x.average);
        return `<div>
          <div class="flex items-baseline gap-2 mb-1.5">
            <span class="font-bold text-[15px] truncate">${esc(x.subject)}</span>
            <span class="ml-auto shrink-0 text-xs text-ink-faint">
              ${x.written ? 'S ' + fmtAverage(x.written) : ''}${x.written && x.oral ? ' · ' : ''}${x.oral ? 'O ' + fmtAverage(x.oral) : ''}
              ${x.written || x.oral ? ' · ' : ''}${plural(x.count, 'voto', 'voti')}
            </span>
            <span class="shrink-0 font-extrabold tabular-nums ${t.text}">${fmtAverage(x.average)}</span>
          </div>
          <div class="h-2 rounded-full bg-page overflow-hidden">
            <div class="h-full rounded-full ${t.bar}" style="width:${scale(x.average)}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : empty('Nessun voto utile al calcolo.'))}

    </div>
    <div>
    ${sectionTitle('Andamento mensile', '', 'lg:mt-7')}
    ${card(m.months.length ? `<div class="p-4">
      <div class="flex items-end gap-2 h-44">
        ${m.months.map((x) => {
          const t = gradeTone(x.average);
          return `<div class="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
            <span class="text-xs font-bold ${t.text}">${fmtAverage(x.average)}</span>
            <div class="flex-1 w-full flex items-end">
              <div class="w-full rounded-t-xl ${t.bar}" style="height:${scale(x.average)}%"></div>
            </div>
            <span class="text-[11px] text-ink-faint">
              ${new Date(+x.month.slice(0, 4), +x.month.slice(5, 7) - 1, 1).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>` : empty('Servono voti in almeno un mese.'))}
    </div>
    </div>`;

  el('count-all-toggle').onclick = () => { state.averageAllGrades = !state.averageAllGrades; render(); };
}

// -------------------------------------------------------------------- init

hydrateIcons();
buildSideNav();
el('login-form').addEventListener('submit', login);
el('refresh-btn').addEventListener('click', refresh);
const logoutDialog = el('logout-dialog');
for (const b of document.querySelectorAll('[data-action="logout"]')) {
  b.addEventListener('click', () => {
    logoutDialog.showModal();
    el('logout-cancel').focus();
  });
}
el('logout-cancel').addEventListener('click', () => logoutDialog.close());
el('logout-confirm').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Esco…';
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  forgetCachedData();
  location.reload();
});
// click on the modal backdrop
logoutDialog.addEventListener('click', (e) => {
  if (e.target === logoutDialog) logoutDialog.close();
});
const noteDialog = el('note-dialog');
el('note-cancel').addEventListener('click', closeNoteDialog);
el('note-save').addEventListener('click', () => {
  if (noteTarget) saveHomeworkState(noteTarget.key, { done: noteTarget.done, note: el('note-input').value.trim() });
  closeNoteDialog();
});
el('note-delete').addEventListener('click', () => {
  if (noteTarget) saveHomeworkState(noteTarget.key, { done: noteTarget.done, note: '' });
  closeNoteDialog();
});
noteDialog.addEventListener('click', (e) => {
  if (e.target === noteDialog) closeNoteDialog();
});
noteDialog.addEventListener('close', () => { noteTarget = null; });
const slotDialog = el('slot-dialog');
el('slot-form').addEventListener('submit', confirmSlot);
el('slot-cancel').addEventListener('click', closeSlotDialog);
el('slot-delete').addEventListener('click', deleteSlot);
slotDialog.addEventListener('click', (e) => {
  if (e.target === slotDialog) closeSlotDialog();
});
slotDialog.addEventListener('close', () => { editedSlot = null; });
el('period-btn').addEventListener('click', () => (periodMenuOpen ? closePeriodMenu() : openPeriodMenu()));
el('period-btn').addEventListener('keydown', periodMenuKeys);
el('period-menu').addEventListener('keydown', periodMenuKeys);
document.addEventListener('click', (e) => {
  if (periodMenuOpen && !el('period').contains(e.target)) closePeriodMenu();
});
for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => { state.tab = btn.dataset.tab; window.scrollTo({ top: 0 }); render(); });
}

// An installed app can sit in the background for hours: back on screen, or a
// minute later, the timetable moves on to the right day and the running slot.
const refreshTimetableClock = () => {
  if (!document.hidden && state.data && state.tab === 'timetable') render({ animate: false });
};
document.addEventListener('visibilitychange', refreshTimetableClock);
setInterval(refreshTimetableClock, 60 * 1000);

/** ?debug=1 paints the page background red and reports what sits at the bottom edge. */
function showDiagnostics() {
  document.documentElement.style.background = '#e11d48';
  const describe = (y) => document.elementsFromPoint(Math.round(innerWidth / 2), y)
    .slice(0, 3)
    .map((e) => {
      const cls = typeof e.className === 'string' && e.className
        ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls;
    }).join(' > ') || '(niente)';

  const box = document.createElement('div');
  box.className = 'fixed left-3 right-3 bottom-32 z-50 rounded-2xl bg-ink text-white text-[11px] p-3 leading-relaxed';
  box.style.fontFamily = 'ui-monospace, monospace';
  box.textContent = [
    `innerHeight ${innerHeight} · visual ${Math.round(visualViewport?.height || 0)} · dpr ${devicePixelRatio}`,
    `safe-area-bottom: ${getComputedStyle(document.documentElement).getPropertyValue('--sai').trim() || '0px'}`,
    `y=${innerHeight - 1}: ${describe(innerHeight - 1)}`,
    `y=${innerHeight - 12}: ${describe(innerHeight - 12)}`,
    `y=${innerHeight - 30}: ${describe(innerHeight - 30)}`,
  ].join('\n');
  box.style.whiteSpace = 'pre-wrap';
  document.body.appendChild(box);
}
if (new URLSearchParams(location.search).get('debug')) addEventListener('load', showDiagnostics);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// initial tab from the query string (?tab=grades), handy for testing too
const initialTab = new URLSearchParams(location.search).get('tab');
if (TABS.some((t) => t.id === initialTab)) state.tab = initialTab;

// Signed in before: show the last data right away, then refresh it. Otherwise
// the boot screen stays until the server says whether the cookie is still good.
dropLegacyCache();
const cached = readCachedData();
if (cached) {
  state.data = cached;
  showApp();
}
api('/api/data')
  .then((data) => {
    const alreadyShown = Boolean(state.data);
    state.data = data;
    cacheData(data);
    showApp({ animate: !alreadyShown });
  })
  .catch((ex) => {
    if (sessionEnded(ex)) {
      forgetCachedData();
      state.data = null;
      return showLogin();
    }
    // Argo or the network is down: keep the saved data if there is some
    if (!state.data) showLogin();
    else console.error('refresh failed:', ex.message);
  });
