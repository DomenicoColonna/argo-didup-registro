'use strict';

const state = {
  data: null,
  tab: 'home',
  period: '*',            // Argo's own "Intero Anno" period, see periodOptions
  month: startOfMonth(new Date()),
  selectedDay: isoDay(new Date()),
  homeworkFilter: 'upcoming', // 'upcoming' | 'all' | 'todo' | 'done'
  homeworkSubject: '*',   // subject picked in the header menu of the homework tab, '*' is all of them
  averageAllGrades: false,
  homeworkState: {},      // homework key -> { done, note }, see loadSavedState
  timetable: null,        // { mon: [{ start, end, subject }], ... fri }, see loadSavedState
  timetableDay: null,     // day shown on mobile, reset on every visit, see renderTimetable
  timetableBase: null,    // iso date of the school day timetableDay was picked for
  timetableEdit: false,   // edit mode of the timetable: rename, swap and move slots
  timetablePicked: null,  // "day:index" of the slot picked to be swapped or moved
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
  grip: '<path d="M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01" stroke-width="2.6"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2.5L14 19V5L7.5 9H5a1 1 0 0 0-1 1z"/><path d="M17.5 9a4 4 0 0 1 0 6"/><path d="M8 15l1.2 5h2.3L11 16.3"/>',
  userX: '<circle cx="10" cy="8" r="4"/><path d="M3 20.5c.8-3.6 3.6-5.5 7-5.5 1.6 0 3 .4 4.2 1.2"/><path d="m16.5 16 4 4M20.5 16l-4 4"/>',
  paperclip: '<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>',
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
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n) => Math.round(n * 100) / 100;
const fmtAverage = (n) => (n == null || !Number.isFinite(n) ? '—' : round2(n).toFixed(2));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Grade colors: green from 6 up, amber between 5 and 6, red below 5.
 * `tint` is the faint background of a subject header in the grades tab.
 */
function gradeTone(v) {
  if (!Number.isFinite(v)) return { text: 'text-ink-soft', bar: 'bg-slate-300', tint: 'bg-page' };
  if (v >= 6) return { text: 'text-emerald-700', bar: 'bg-emerald-500', tint: 'bg-emerald-50/70' };
  if (v >= 5) return { text: 'text-amber-700', bar: 'bg-amber-500', tint: 'bg-amber-50' };
  return { text: 'text-rose-700', bar: 'bg-rose-500', tint: 'bg-rose-50/80' };
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

/** Whole days from `iso` to today, negative for days still to come. */
const daysAgo = (iso, today = isoDay(new Date())) => Math.round((parseDate(today) - parseDate(iso)) / 86400000);

// only today gets a fill, the other tones just color the month
const CHIP_TONES = {
  neutral: { box: 'border border-slate-200', month: 'text-ink-faint', day: 'text-ink', wd: 'text-ink-faint' },
  today:   { box: 'bg-violet-600', month: 'text-white/80', day: 'text-white', wd: 'text-white/80' },
  past:    { box: 'border border-slate-200', month: 'text-ink-faint', day: 'text-ink-faint', wd: 'text-ink-faint' },
  soon:    { box: 'border border-slate-200', month: 'text-amber-700', day: 'text-ink', wd: 'text-ink-faint' },
  later:   { box: 'border border-slate-200', month: 'text-sky-700', day: 'text-ink', wd: 'text-ink-faint' },
};

/** Date chip in the "MAG 24 / ven" style. `tone` is a key of CHIP_TONES, `true` means today. */
function dateChip(iso, tone = 'neutral') {
  const d = parseDate(iso);
  if (!d) return '';
  const t = CHIP_TONES[tone === true ? 'today' : tone] || CHIP_TONES.neutral;
  const month = d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '').toUpperCase();
  const wd = d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  return `<div class="shrink-0 w-12 rounded-lg py-1.5 text-center leading-tight ${t.box}">
      <div class="text-[10px] font-bold tracking-wide ${t.month}">${month}</div>
      <div class="text-[17px] font-extrabold ${t.day}">${d.getDate()}</div>
      <div class="text-[10px] font-semibold ${t.wd}">${wd}</div>
    </div>`;
}

// The UI is flat: white page, thin gray outlines, small radii, no shadows.
// Color goes in text, dots and bars, fills are kept for today and done.
const PANEL = 'rounded-xl border border-slate-200';
const LIST = `px-4 ${PANEL} divide-y divide-slate-100`;

const sectionTitle = (text, action = '', extra = '') =>
  `<div class="flex items-baseline gap-3 mt-8 mb-2.5 ${extra}">
     <h2 class="text-[17px] font-extrabold tracking-tight">${esc(text)}</h2>
     ${action ? `<div class="ml-auto">${action}</div>` : ''}
   </div>`;

const actionLink = (text, tab) =>
  `<button data-goto="${tab}" class="text-sm font-semibold text-violet-600 hover:text-violet-800 rounded
     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">${esc(text)}</button>`;

const empty = (text) =>
  `<p class="px-4 py-5 text-sm text-ink-faint ${PANEL}">${esc(text)}</p>`;

/** Tabs reachable from the bottom bar, the others get a back arrow on mobile. */
const BOTTOM_TABS = ['home', 'homework', 'grades', 'timetable'];

/** Title and summary line of the page header, set by every tab when it renders. */
function setHeader(title, meta = '') {
  el('page-title').textContent = title;
  el('page-meta').textContent = meta;
  el('page-meta').classList.toggle('hidden', !meta);
  el('header-back').classList.toggle('hidden', BOTTOM_TABS.includes(state.tab));
}

/** Segmented control: a tinted track with the current choice on white. */
const segment = (attr, id, label, current) => `
  <button ${attr}="${id}" aria-pressed="${current}"
    class="py-1.5 rounded-md text-[13px] font-semibold text-center transition
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600
      ${current ? 'bg-white text-ink ring-1 ring-slate-200' : 'text-ink-soft hover:text-ink'}">${label}</button>`;

/** Outlined line for something that needs attention, `tone` colors the icon. */
const callout = (tone, html) => `
  <div class="flex items-start gap-3 px-4 py-3 text-[14px] ${PANEL}">
    ${icon('alert', `w-5 h-5 shrink-0 mt-0.5 ${tone}`)}<p>${html}</p>
  </div>`;

/** Shown when the server has no database, `what` is the thing that stays local. */
const localOnlyNote = (what) => (state.remoteStore ? '' : `<p class="mt-3 text-[13px] text-amber-800">
  ${what} solo su questo dispositivo: il server non ha un database configurato.</p>`);

const shortDate = (iso, long = false) =>
  parseDate(iso)?.toLocaleDateString('it-IT', { day: 'numeric', month: long ? 'long' : 'short' }).replace('.', '') || '';

const badge = (text, tone) =>
  `<span class="inline-flex items-center rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone}">${esc(text)}</span>`;

// ------------------------------------------------------------ derived data
// Argo field names (desMateria, datGiorno, registro...) only appear in this
// section: everything below works on the English objects built here.

const dash = () => state.data?.dashboard || {};
const active = (arr) => (arr || []).filter((x) => x && x.operazione !== 'D');

function periods() {
  const short = (iso) => parseDate(iso)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '') || '';
  return (dash().listaPeriodi || []).map((p) => {
    const start = dayOf(p.datInizio || p.dataInizio);
    const end = dayOf(p.datFine || p.dataFine);
    return { pk: p.pkPeriodo, name: p.descrizione, start, end, note: start && end ? `${short(start)} – ${short(end)}` : '' };
  });
}

/**
 * The pkPeriodo on a grade does not match the one in listaPeriodi, so a day
 * belongs to the chosen period by its dates. "Intero anno" ('*') keeps all.
 */
function inPeriod(day) {
  if (state.period === '*' || !day) return true;
  const p = periods().find((x) => x.pk === state.period);
  if (!p?.start || !p?.end) return true;
  return day >= p.start && day <= p.end;
}

function grades() {
  return active(dash().voti)
    .filter((v) => v.datGiorno)
    .map((v) => ({
      day: dayOf(v.datGiorno),
      subject: v.desMateria || v.materiaLight?.desDescrizione || '—',
      label: v.codCodice || (Number.isFinite(v.valore) ? String(v.valore) : '—'),
      value: Number.isFinite(v.valore) && v.valore > 0 ? v.valore : null,
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

const periodGrades = () => grades().filter((g) => inPeriod(g.day));

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

/** Attendance events: absences ('A'), late entries ('I') and early exits ('U'). */
function absences() {
  return active(dash().appello)
    .map((a) => {
      const justified = a.giustificata === 'S' || a.giustificata === true;
      return {
        day: dayOf(a.data || a.datEvento),
        kind: String(a.codEvento || '').toUpperCase(),
        description: a.descrizione || '',
        teacher: a.docente || '',
        note: a.nota || '',
        justified,
        toJustify: Boolean(a.daGiustificare) && !justified,
        justifiedOn: dayOf(a.dataGiustificazione),
        reason: a.commentoGiustificazione || '',
      };
    })
    .filter((a) => a.day)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/**
 * Class noticeboard and the student's own documents, newest first. Attachments
 * go through /api/attachment, which redirects to Argo's short lived link.
 */
function notices() {
  const attachment = (pk, name, personal) =>
    ({ name, href: `/api/attachment?uid=${encodeURIComponent(pk)}${personal ? '&personal=1' : ''}` });
  const classNotices = active(dash().bacheca).map((b) => ({
    day: dayOf(b.data || b.datEvento),
    text: b.messaggio || '',
    category: b.categoria || '',
    author: b.autore || '',
    link: /^https?:\/\//.test(b.url || '') ? b.url : '',
    attachments: (b.listaAllegati || []).filter((f) => f?.pk)
      .map((f) => attachment(f.pk, f.descrizioneFile || f.nomeFile || 'Allegato')),
    ackRequested: Boolean(b.pvRichiesta),
    acknowledged: Boolean(b.isPresaVisione),
    joinRequested: Boolean(b.adRichiesta),
    joined: Boolean(b.isPresaAdesioneConfermata),
    deadline: dayOf(b.dataScadAdesione || b.dataScadenza),
    personal: false,
  }));
  const personal = active(dash().bachecaAlunno).map((b) => ({
    day: dayOf(b.data || b.datEvento),
    text: b.messaggio || '',
    category: 'Per te',
    author: '',
    link: '',
    attachments: b.pk && b.nomeFile ? [attachment(b.pk, b.nomeFile, true)] : [],
    ackRequested: false,
    acknowledged: Boolean(b.isPresaVisione),
    joinRequested: false,
    joined: false,
    deadline: null,
    personal: true,
  }));
  return [...classNotices, ...personal]
    .filter((n) => n.day)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** A notice still waiting for the family: presa visione or adesione not given yet. */
const pendingNotice = (n) => (n.ackRequested && !n.acknowledged) || (n.joinRequested && !n.joined);

/** Subjects Argo knows about (grades and lessons), for the autocomplete. */
function knownSubjects() {
  const set = new Set();
  for (const g of grades()) set.add(g.subject);
  for (const l of active(dash().registro)) if (l.materia) set.add(l.materia);
  return [...set].filter((s) => s && s !== '—').sort((a, b) => a.localeCompare(b, 'it'));
}

/**
 * Averages recomputed from the single grades. A subject gets the mean of its
 * grades, the average is the mean of the subject averages (every subject
 * weighs the same, however many grades it has), and a month works the same way.
 */
function computeAverages() {
  const used = periodGrades().filter(countsInAverage);
  const bySubject = new Map();
  const byMonth = new Map(); // month -> subject -> grade values

  for (const g of used) {
    if (!bySubject.has(g.subject)) bySubject.set(g.subject, { all: [], written: [], oral: [] });
    const group = bySubject.get(g.subject);
    group.all.push(g.value);
    if (g.kindCode.startsWith('S')) group.written.push(g.value);
    else if (g.kindCode.startsWith('O')) group.oral.push(g.value);

    const month = (g.day || '').slice(0, 7);
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, new Map());
    const inMonth = byMonth.get(month);
    inMonth.set(g.subject, [...(inMonth.get(g.subject) || []), g.value]);
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
    average: avg(subjects.map((s) => s.average)),
    total: used.length,
    failing: subjects.filter((s) => s.average < 6).length,
    months: [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, bySubjectInMonth]) => ({ month, average: avg([...bySubjectInMonth.values()].map(avg)) })),
  };
}

// --------------------------------------------------- header menu (custom)

let headerMenuOpen = false;

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

/** Every subject that has homework, with how much of it is still to do. */
function subjectOptions() {
  const todo = new Map();
  for (const h of homework()) todo.set(h.subject, (todo.get(h.subject) || 0) + (h.done ? 0 : 1));
  const total = [...todo.values()].reduce((s, n) => s + n, 0);
  const note = (n) => (n ? `${n} da fare` : 'niente da fare');
  return [
    { pk: '*', name: 'Tutte le materie', note: note(total) },
    ...[...todo.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'it'))
      .map(([subject, n]) => ({ pk: subject, name: subject, note: note(n) })),
  ];
}

/** Tabs whose content depends on the period picked in the header. */
const PERIOD_TABS = ['home', 'grades', 'average', 'absences'];

/**
 * The dropdown in the header picks the period, except in the homework tab,
 * where periods change nothing and it picks the subject instead. Tabs where
 * neither means anything (calendar, timetable...) get no dropdown at all.
 */
function headerMenu() {
  if (state.tab === 'homework') {
    return {
      label: 'Materia',
      options: subjectOptions(),
      value: state.homeworkSubject,
      choose: (pk) => { state.homeworkSubject = pk; },
    };
  }
  if (!PERIOD_TABS.includes(state.tab)) return null;
  return {
    label: 'Periodo',
    options: periodOptions(),
    value: state.period,
    choose: (pk) => { state.period = pk; },
  };
}

function renderHeaderMenu() {
  const menu = headerMenu();
  el('header-menu-row').classList.toggle('hidden', !menu);
  if (!menu) return closeHeaderMenu();
  const list = el('header-menu-list');
  const { label, options, value, choose } = menu;
  const current = options.find((o) => o.pk === value) || options.find((o) => o.pk === '*') || options[0];
  el('header-menu-label').textContent = current.name;
  list.setAttribute('aria-label', label);

  list.innerHTML = options.map((o) => {
    const chosen = o === current;
    return `
      <button type="button" role="option" data-option="${esc(o.pk)}" aria-selected="${chosen}"
        class="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg transition
               ${chosen ? '' : 'hover:bg-page'}
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-[14px] ${chosen ? 'text-violet-700' : ''}">${esc(o.name)}</span>
          ${o.note ? `<span class="block text-xs text-ink-faint">${esc(o.note)}</span>` : ''}
        </span>
        ${chosen ? icon('check2', 'w-5 h-5 shrink-0 text-violet-600') : ''}
      </button>`;
  }).join('');

  for (const b of list.querySelectorAll('[data-option]')) {
    b.onclick = (e) => {
      choose(b.dataset.option);
      // focus goes back to the button only when the choice came from the keyboard (detail 0)
      closeHeaderMenu(e.detail === 0);
      render();
    };
  }
}

function openHeaderMenu() {
  const menu = el('header-menu-list');
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.remove('opacity-0', 'scale-95', '-translate-y-1'));
  el('header-menu-btn').setAttribute('aria-expanded', 'true');
  el('header-menu-chevron').classList.add('rotate-180');
  headerMenuOpen = true;
}

function closeHeaderMenu(refocus = false) {
  if (!headerMenuOpen) return;
  const menu = el('header-menu-list');
  menu.classList.add('opacity-0', 'scale-95', '-translate-y-1');
  el('header-menu-btn').setAttribute('aria-expanded', 'false');
  el('header-menu-chevron').classList.remove('rotate-180');
  headerMenuOpen = false;
  setTimeout(() => { if (!headerMenuOpen) menu.hidden = true; }, 160);
  if (refocus) el('header-menu-btn').focus();
}

/** Arrows move between items, enter picks one, esc closes the menu. */
function headerMenuKeys(e) {
  const items = [...el('header-menu-list').querySelectorAll('[data-option]')];
  if (e.key === 'Escape') return closeHeaderMenu(true);
  if (e.key === 'Tab') return closeHeaderMenu();
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  if (!headerMenuOpen) openHeaderMenu();
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
  // only the arrow turns, the button and its hover background stay still
  btn.querySelector('svg')?.classList.add('animate-spin');
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
    btn.querySelector('svg')?.classList.remove('animate-spin');
  }
}

// ------------------------------------------------------------------ render

const TABS = [
  { id: 'home', icon: 'home', name: 'Home' },
  { id: 'homework', icon: 'check', name: 'Compiti' },
  { id: 'grades', icon: 'award', name: 'Voti' },
  { id: 'timetable', icon: 'clock', name: 'Orario' },
  { id: 'calendar', icon: 'calendar', name: 'Calendario' },
  { id: 'average', icon: 'chart', name: 'Media' },
  { id: 'absences', icon: 'userX', name: 'Assenze' },
  { id: 'reminders', icon: 'bell', name: 'Promemoria' },
  { id: 'noticeboard', icon: 'megaphone', name: 'Bacheca' },
];

/** Sidebar entries (desktop only): the bottom bar tabs first, then the others. */
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

/** Who the register belongs to: first name, full name and "class · school year". */
function student() {
  const p = state.data.profile;
  return {
    name: p.alunno?.nome || p.alunno?.nominativo || '',
    fullName: p.alunno?.nominativo || '',
    meta: [
      (p.scheda?.classe?.desDenominazione || '') + (p.scheda?.classe?.desSezione || ''),
      p.anno?.anno,
    ].filter(Boolean).join(' · '),
  };
}

/** `animate: false` swaps the content in place, used when fresh data replaces the saved one. */
function render({ animate = true } = {}) {
  renderHeaderMenu();
  const who = student();
  el('updated-at').textContent = state.data.updatedAt
    ? `Dati aggiornati il ${new Date(state.data.updatedAt).toLocaleString('it-IT')}`
    : '';

  for (const btn of document.querySelectorAll('.tab')) {
    const current = btn.dataset.tab === state.tab;
    btn.className = `tab group flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold transition
      focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600
      ${current ? 'text-violet-700' : 'text-ink-faint'}`;
    btn.setAttribute('aria-current', current ? 'page' : 'false');
    btn.innerHTML = `<span class="w-14 h-8 grid place-items-center rounded-full transition-colors
        ${current ? 'bg-violet-50' : 'group-active:bg-page'}">${icon(btn.dataset.icon, 'w-[22px] h-[22px]')}</span>
      <span>${btn.dataset.label}</span>`;
  }
  for (const btn of document.querySelectorAll('.tab-side')) {
    const current = btn.dataset.tab === state.tab;
    btn.className = `tab-side flex items-center gap-3 px-3 py-2 rounded-r-lg border-l-2 text-sm font-semibold transition
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600
      ${current ? 'bg-page text-violet-700 border-violet-600'
        : 'border-transparent text-ink-soft hover:text-ink hover:bg-page'}`;
    btn.setAttribute('aria-current', current ? 'page' : 'false');
    btn.innerHTML = `${icon(btn.dataset.iconName, 'w-5 h-5 shrink-0')}<span>${btn.dataset.label}</span>`;
  }
  el('side-name').textContent = who.fullName;
  el('side-meta').textContent = who.meta;

  // leaving the timetable forgets the day you swiped to, so it opens on the right one next time
  if (state.tab !== 'timetable') {
    state.timetableDay = null;
    state.timetableEdit = false;
    state.timetablePicked = null;
  }

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
    absences: renderAbsences,
    reminders: renderReminders,
    noticeboard: renderNoticeboard,
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
  const tone = gradeTone(m.average);
  const periodAbsences = absences().filter((a) => inPeriod(a.day));
  const toJustify = absences().filter((a) => a.toJustify);
  const upcoming = reminders().filter((r) => r.day >= today);
  const allNotices = notices();
  const pending = allNotices.filter(pendingNotice);
  const fresh = allNotices.filter((n) => daysAgo(n.day) <= 7);

  const who = student();
  setHeader(who.name ? `Ciao, ${who.name}` : 'Il tuo registro', who.meta);

  const shortcut = (tab, name, value, ic) => `
    <li><button data-goto="${tab}" class="group w-full flex items-center gap-3.5 py-3.5 text-left rounded
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
      ${icon(ic, 'w-5 h-5 shrink-0 text-ink-soft')}
      <span class="font-bold text-[15px]">${esc(name)}</span>
      <span class="ml-auto min-w-0 truncate text-[13px] text-ink-soft">${esc(value)}</span>
      ${icon('chevron', 'w-4 h-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5')}
    </button></li>`;

  // things that need doing, only shown when there are some
  const alerts = [
    toJustify.length && ['absences', 'bg-rose-500',
      plural(toJustify.length, 'assenza da giustificare', 'assenze da giustificare')],
    pending.length && ['noticeboard', 'bg-amber-500',
      plural(pending.length, 'comunicazione da confermare', 'comunicazioni da confermare')],
    upcoming[0] && daysAgo(upcoming[0].day) >= -1 && ['reminders', 'bg-sky-500',
      `${upcoming[0].day === today ? 'Oggi' : 'Domani'}: ${upcoming[0].text}`],
  ].filter(Boolean);

  const standing = !m.subjects.length ? ''
    : m.failing
      ? `<span class="font-semibold text-rose-700">${plural(m.failing, 'materia sotto il 6', 'materie sotto il 6')}</span>`
      : '<span class="font-semibold text-emerald-700">nessuna insufficienza</span>';

  el('tab-home').innerHTML = `
    <div class="lg:grid lg:grid-cols-2 lg:gap-x-4 lg:items-start">
    <div>
    <button data-goto="average" aria-label="Apri il dettaglio della media"
      class="group w-full flex items-end gap-4 px-4 py-5 text-left transition-colors hover:bg-page ${PANEL}
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
      <span class="text-[64px] leading-[.85] font-extrabold tracking-tight
        ${m.average == null ? 'text-ink-faint' : tone.text}">${fmtAverage(m.average)}</span>
      <span class="min-w-0 flex-1 pb-0.5">
        <span class="block font-bold text-[15px]">
          ${m.subjects.length ? `Media di ${plural(m.subjects.length, 'materia', 'materie')}` : 'Media'}</span>
        <span class="block text-[13px] text-ink-soft">
          ${m.subjects.length ? `${plural(m.total, 'voto', 'voti')} · ${standing}` : 'ancora nessun voto'}</span>
      </span>
      ${icon('chevron', 'w-4 h-4 shrink-0 mb-1.5 text-ink-faint transition-transform group-hover:translate-x-0.5')}
    </button>

    ${alerts.length ? `<div class="mt-3 ${PANEL} divide-y divide-slate-100">
      ${alerts.map(([tab, dot, text]) => `
        <button data-goto="${tab}" class="group w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] font-semibold
            first:rounded-t-xl last:rounded-b-xl transition-colors hover:bg-page
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
          <span class="w-2 h-2 shrink-0 rounded-full ${dot}"></span>
          <span class="min-w-0 flex-1 truncate">${esc(text)}</span>
          ${icon('chevron', 'w-4 h-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5')}
        </button>`).join('')}
    </div>` : ''}

    <ul class="mt-3 ${LIST}">
      ${shortcut('calendar', 'Calendario', capitalize(new Date().toLocaleDateString('it-IT', { month: 'long' })), 'calendar')}
      ${shortcut('absences', 'Assenze', toJustify.length ? `${toJustify.length} da giustificare`
        : plural(periodAbsences.filter((a) => a.kind === 'A').length, 'assenza', 'assenze'), 'userX')}
      ${shortcut('reminders', 'Promemoria', upcoming.length ? plural(upcoming.length, 'in arrivo', 'in arrivo') : 'niente in arrivo', 'bell')}
      ${shortcut('noticeboard', 'Bacheca', fresh.length ? plural(fresh.length, 'nuova', 'nuove')
        : plural(allNotices.length, 'comunicazione', 'comunicazioni'), 'megaphone')}
    </ul>

    </div>
    <div>
    ${sectionTitle('Prossimi compiti', actionLink(todo.length > next.length ? `Vedi tutti e ${todo.length}` : 'Vedi tutti', 'homework'), 'mt-8 lg:mt-0')}
    ${next.length ? `<ul class="${LIST}">
      ${next.map((h) => `
        <li class="py-3.5 flex gap-3.5 items-start">
          ${dateChip(h.day, dayDistance(h.day, today))}
          <div class="min-w-0">
            <p class="font-bold text-[15px]">${esc(h.subject)}</p>
            <p class="text-sm text-ink-soft line-clamp-2">${esc(h.text)}</p>
          </div>
        </li>`).join('')}
      </ul>` : empty('Nessun compito in programma.')}

    ${sectionTitle('Ultimi voti', actionLink('Vedi tutti', 'grades'))}
    ${latest.length ? `<ul class="${LIST}">
      ${latest.map((g) => gradeRow(g)).join('')}
      </ul>` : empty('Ancora nessun voto in questo periodo.')}
    </div>
    </div>`;
}

function gradeRow(g, showSubject = true) {
  const t = gradeTone(g.value);
  const description = g.description || 'Valutazione';
  const title = showSubject ? g.subject : description;
  const below = showSubject ? description : [g.kind, g.teacher].filter(Boolean).join(' · ');
  return `
    <li class="py-3 flex items-center gap-3.5">
      <span class="shrink-0 w-11 h-11 grid place-items-center rounded-lg border border-slate-200 text-[17px] font-extrabold ${t.text}">
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
      ? 'bg-violet-600 text-white'
      : key === today
        ? 'text-violet-700 ring-1 ring-inset ring-slate-300 hover:bg-page'
        : weekend
          ? 'text-ink-faint hover:bg-page'
          : 'text-ink hover:bg-page';

    return `
      <button data-day="${key}" aria-label="${esc(fmtDay(key))}"
        class="day-cell aspect-square lg:aspect-auto lg:h-16 rounded-lg flex flex-col items-center justify-center gap-1
               transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600
               ${outside ? 'opacity-40' : ''} ${background}">
        <span class="text-sm ${selected || key === today ? 'font-extrabold' : 'font-semibold'}">
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
        <span class="shrink-0 w-11 h-11 grid place-items-center rounded-lg border border-slate-200 font-extrabold ${t.text}">${esc(g.label)}</span>
        <div class="min-w-0">
          <p class="font-bold text-[15px]">${esc(g.subject)}</p>
          <p class="text-[13px] text-ink-soft truncate">${esc(g.description || 'Valutazione')}</p>
        </div></div>`;
    }],
    ['Compiti', events.homework.get(sel), (h) => `
      <div class="flex gap-3 items-start">
        <div class="min-w-0 flex-1">
          <p class="font-bold text-[15px] ${h.done ? 'text-ink-faint line-through decoration-1' : ''}">${esc(h.subject)}</p>
          <p class="text-sm whitespace-pre-wrap ${h.done ? 'text-ink-faint' : 'text-ink-soft'}">${esc(h.text)}</p>
          ${h.note ? `
            <button type="button" data-note="${esc(h.key)}"
              class="mt-2 w-full text-left rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-ink-soft
                whitespace-pre-wrap hover:bg-page transition">${esc(h.note)}</button>` : ''}
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

  const monthName = month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  setHeader('Calendario', capitalize(monthName));
  const navButton = `w-9 h-9 grid place-items-center rounded-lg border border-slate-200 text-ink-soft hover:bg-page transition
    disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600`;
  const legend = (color, name) =>
    `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${color}"></span>${name}</span>`;

  el('tab-calendar').innerHTML = `
    <div class="lg:grid lg:grid-cols-[1fr_20rem] lg:gap-x-10 lg:items-start">
    <div id="calendar-month" class="${slideClass(state.monthSlide)}">
      <div class="flex items-center gap-1.5 mb-4">
        <button id="month-prev" aria-label="Mese precedente" data-icon="arrowLeft" ${atFirst ? 'disabled' : ''}
          class="${navButton}"></button>
        <button id="month-next" aria-label="Mese successivo" data-icon="arrowRight" ${atLast ? 'disabled' : ''}
          class="${navButton}"></button>
        <button id="month-today" class="ml-auto h-9 px-3 text-sm font-semibold rounded-lg border border-slate-200
          hover:bg-page transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">Oggi</button>
      </div>
      <div class="grid grid-cols-7 mb-1">
        ${['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((label) =>
          `<div class="text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">${label}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1">${cells}</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 text-xs text-ink-soft">
        ${legend('bg-violet-500', 'voti')}${legend('bg-amber-500', 'compiti')}
        ${legend('bg-emerald-500', 'compiti fatti')}${legend('bg-sky-500', 'promemoria')}
      </div>
    </div>
    <div>
    ${sectionTitle(capitalize(fmtDay(sel)) || 'Nessun giorno selezionato', '', 'lg:mt-1.5')}
    ${sections.length ? sections.map(([name, items, tpl]) => `
      <div class="pt-4">
        <h3 class="text-[13px] font-semibold text-ink-faint mb-2.5">${name}</h3>
        <div class="space-y-3.5">${items.map(tpl).join('')}</div>
      </div>`).join('') : empty('Niente in programma per questo giorno.')}
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
    class="w-8 h-8 grid place-items-center rounded-full border transition
      ${h.done
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500'}
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
    ${icon('check2', 'w-[18px] h-[18px]')}
  </button>`;

const noteButton = (h) => `
  <button type="button" data-note="${esc(h.key)}"
    aria-label="${h.note ? 'Modifica la nota' : 'Aggiungi una nota'}"
    class="w-8 h-8 grid place-items-center rounded-lg transition
      ${h.note ? 'text-violet-600 hover:bg-page' : 'text-ink-faint hover:bg-page hover:text-ink-soft'}
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
  // a subject that no longer has homework (after a refresh) counts as all of them
  const subject = all.some((h) => h.subject === state.homeworkSubject) ? state.homeworkSubject : '*';
  const list = all.filter((h) => (subject === '*' || h.subject === subject) && current.keeps(h));
  const byDay = new Map();
  for (const h of list) byDay.set(h.day, [...(byDay.get(h.day) || []), h]);
  const doneCount = list.filter((h) => h.done).length;

  const summary = list.length
    ? `${plural(list.length - doneCount, 'da fare', 'da fare')} · ${plural(doneCount, 'fatto', 'fatti')}`
    : '';
  setHeader('Compiti', summary);

  el('tab-homework').innerHTML = `
    <div class="grid grid-cols-4 gap-1 bg-page rounded-lg p-1 lg:max-w-md">
      ${Object.entries(filters).map(([id, f]) => segment('data-filter', id, f.name, current === f)).join('')}
    </div>
    ${localOnlyNote('Fatti e note restano')}
    <div id="homework-list" class="mt-4 lg:columns-2 lg:gap-x-4
        ${slideClass(state.homeworkSlide)}">
      ${byDay.size === 0 ? empty(current.empty) : ''}
      ${[...byDay.entries()].map(([day, items]) => `
        <ul class="mb-3 ${LIST} break-inside-avoid">
          ${items.map((h, i) => `
            <li class="py-3.5 flex gap-3.5 items-start">
              ${i === 0 ? dateChip(day, dayDistance(day, today)) : '<div class="w-12 shrink-0"></div>'}
              <div class="min-w-0 flex-1">
                <p class="font-bold text-[15px] ${h.done ? 'text-ink-faint line-through decoration-1' : ''}">${esc(h.subject)}</p>
                <p class="text-sm whitespace-pre-wrap ${h.done ? 'text-ink-faint' : 'text-ink-soft'}">${esc(h.text)}</p>
                ${h.note ? `
                  <button type="button" data-note="${esc(h.key)}"
                    class="mt-2 w-full text-left rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-ink-soft
                      whitespace-pre-wrap hover:bg-page transition">${esc(h.note)}</button>` : ''}
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
        </ul>`).join('')}
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

  const dayLabel = (d) => `${d.short}${d.id === baseDay
    ? '<span class="block mx-auto mt-0.5 w-1 h-1 rounded-full bg-violet-500"></span>' : ''}`;

  const edit = state.timetableEdit;
  const picked = state.timetablePicked;
  const pickedDay = picked?.split(':')[0];

  // edit mode: a handle to pick or drag the slot, the name in a text field, the pencil for times
  const editRow = (d, s, i) => {
    const ref = `${d.id}:${i}`;
    const isPicked = ref === picked;
    return `
      <li data-slot="${ref}" class="px-2 py-2 flex items-center gap-1 lg:flex-wrap lg:p-1.5 lg:rounded-lg lg:border transition-colors
          ${isPicked ? 'bg-page lg:border-violet-500' : 'lg:border-slate-200'}">
        <button type="button" data-pick-slot="${ref}" draggable="true" aria-pressed="${isPicked}"
          aria-label="${isPicked ? 'Annulla lo spostamento' : picked ? `Scambia con ${esc(s.subject)}` : `Sposta ${esc(s.subject)}`}"
          class="shrink-0 w-8 h-9 grid place-items-center rounded-md cursor-grab active:cursor-grabbing transition
            lg:w-6 lg:h-7 ${isPicked ? 'text-violet-600' : 'text-ink-faint hover:text-ink'}
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
          ${icon('grip', 'w-5 h-5')}
        </button>
        <div class="min-w-0 flex-1 lg:contents">
          <p class="text-[11px] font-semibold tabular-nums text-ink-faint lg:flex-1">${esc(s.start)}–${esc(s.end)}</p>
          <input data-rename-slot="${ref}" value="${esc(s.subject)}" list="subjects-list" maxlength="60"
            autocomplete="off" aria-label="Nome della materia"
            class="mt-0.5 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[15px] font-bold
              outline-none transition-colors hover:border-slate-300 focus:border-violet-600
              lg:order-last lg:basis-full lg:mt-0 lg:text-[13px]">
        </div>
        <button type="button" data-edit-slot="${ref}" aria-label="Orari di ${esc(s.subject)}, o elimina"
          class="shrink-0 w-8 h-9 grid place-items-center rounded-md text-ink-faint hover:text-ink transition lg:w-6 lg:h-7
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
          ${icon('clock', 'w-[18px] h-[18px] lg:w-4 lg:h-4')}
        </button>
      </li>`;
  };

  const slotRow = (d, s, i, bySubject) => {
    if (edit) return editRow(d, s, i);
    const running = d.id === todayId && s.start <= now && now < s.end;
    const due = bySubject.get(s.subject) || [];
    const nowBadge = (extra) => (running
      ? `<span class="shrink-0 text-[11px] font-bold text-violet-700 ${extra}">ora</span>` : '');
    return `
      <li class="px-4 py-3 flex items-center gap-3.5 lg:px-3 lg:py-2.5 lg:items-start lg:rounded-lg lg:border
          ${running ? 'lg:border-violet-500' : 'lg:border-slate-200'}">
        <div class="shrink-0 w-11 leading-tight lg:hidden">
          <p class="text-sm font-extrabold tabular-nums ${running ? 'text-violet-700' : 'text-ink'}">${esc(s.start)}</p>
          <p class="text-xs font-semibold tabular-nums text-ink-faint">${esc(s.end)}</p>
        </div>
        <div class="min-w-0 flex-1">
          <p class="hidden lg:flex items-baseline gap-1.5 text-[11px] font-semibold tabular-nums
            ${running ? 'text-violet-700' : 'text-ink-faint'}">${esc(s.start)}–${esc(s.end)}${nowBadge('')}</p>
          <p class="font-bold text-[15px] leading-snug line-clamp-2 break-words lg:text-[13px] lg:mt-0.5">${esc(s.subject)}</p>
          ${due.length ? `
            <button type="button" data-open-homework
              class="mt-0.5 w-full flex items-center gap-1.5 text-left text-[12px] text-amber-800
                hover:text-amber-900 transition rounded focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-amber-600">
              ${icon('check', 'w-3.5 h-3.5 shrink-0')}
              <span class="min-w-0 flex-1 truncate">${esc(due[0].text)}</span>
              ${due.length > 1 ? `<span class="shrink-0 font-bold">+${due.length - 1}</span>` : ''}
            </button>` : ''}
        </div>
        ${nowBadge('lg:hidden')}
      </li>`;
  };

  const column = (d) => {
    const slots = slotsOf(d.id);
    // homework due on the next date falling on this weekday, still to be done
    const date = dateOfWeekday(d.id, base);
    const todo = allHomework.filter((h) => h.day === date && !h.done);
    const bySubject = homeworkBySubject(todo, [...new Set(slots.map((s) => s.subject))]);
    return `
      <div data-column="${d.id}" class="relative ${state.timetableDay === d.id
        ? slideClass(state.timetableSlide) : 'hidden'} lg:block">
        <div class="hidden lg:flex items-baseline gap-2 mb-2.5 px-1">
          <h3 class="font-extrabold text-[15px] ${d.id === baseDay ? 'text-violet-700' : ''}">${d.name}</h3>
          <span class="ml-auto text-xs text-ink-faint">${slots.length ? plural(slots.length, 'ora', 'ore') : ''}</span>
        </div>
        ${slots.length
          ? `<ul class="${PANEL} max-lg:divide-y max-lg:divide-slate-100 lg:border-0 lg:space-y-1.5">${slots.map((s, i) => slotRow(d, s, i, bySubject)).join('')}</ul>`
          : `<p class="px-4 py-3 text-sm text-ink-faint ${PANEL} lg:px-3">Nessuna ora inserita.</p>`}
        ${edit && picked && pickedDay !== d.id ? `
          <button type="button" data-move-here="${d.id}"
            class="mt-2 w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-violet-700 rounded-lg
              border border-dashed border-violet-400 hover:bg-page transition
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
            Sposta qui
          </button>` : ''}
        ${edit ? `
          <button type="button" data-add-slot="${d.id}"
            class="mt-2 w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold text-ink-soft rounded-lg
              border border-dashed border-slate-300 hover:text-ink hover:border-slate-400 transition
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
            ${icon('plus', 'w-4 h-4')} Aggiungi ora
          </button>` : ''}
      </div>`;
  };

  setHeader('Orario', total ? plural(total, 'ora a settimana', 'ore a settimana') : 'Da lunedì a venerdì');

  const pickedHint = 'Ora scegli un\'altra ora per scambiarle, oppure «Sposta qui» in un altro giorno.';
  const hint = !edit ? '' : picked ? pickedHint
    : 'Scrivi sul nome per cambiarlo. Tocca i puntini di due ore per scambiarle, l\'orologio cambia gli orari.';
  const desktopHint = !edit ? '' : picked ? pickedHint
    : 'Scrivi sul nome per cambiarlo. Trascina i puntini per spostare una materia: la barra viola mostra dove finisce.';

  el('tab-timetable').innerHTML = `
    <div class="flex items-center gap-2">
      <div class="flex-1 grid grid-cols-5 gap-1 bg-page rounded-lg p-1 lg:hidden">
        ${WEEKDAYS.map((d) => segment('data-weekday', d.id, dayLabel(d), state.timetableDay === d.id)).join('')}
      </div>
      <p class="hidden lg:block flex-1 text-sm text-ink-soft" aria-live="polite">${desktopHint}</p>
      <button type="button" id="timetable-edit" aria-pressed="${edit}"
        class="shrink-0 h-10 lg:h-9 px-3 flex items-center gap-2 rounded-lg border text-sm font-semibold transition
          ${edit ? 'bg-violet-600 border-violet-600 text-white hover:bg-violet-700'
            : 'border-slate-200 hover:bg-page'}
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
        ${icon(edit ? 'check2' : 'pencil', 'w-4 h-4')}<span>${edit ? 'Fine' : 'Modifica'}</span>
      </button>
    </div>
    ${hint ? `<p class="mt-3 text-[13px] text-ink-soft lg:hidden">${hint}</p>` : ''}
    ${localOnlyNote("L'orario resta")}
    <div id="timetable-days" class="mt-4 lg:grid lg:grid-cols-5 lg:gap-4 lg:items-start">
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
  el('timetable-edit').onclick = () => {
    state.timetableEdit = !state.timetableEdit;
    state.timetablePicked = null;
    render({ animate: false });
  };
  if (edit) wireTimetableEdit(panel);
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
      state.homeworkSubject = '*'; // whatever was picked before must not hide it
      state.tab = 'homework';
      window.scrollTo({ top: 0 });
      render();
    };
  }
}

/** The slot behind a "day:index" reference, index counted in start time order. */
function slotAt(ref) {
  const [day, i] = String(ref || '').split(':');
  return { day, slot: slotsOf(day)[Number(i)] };
}

/** Two slots trade their subjects, each keeps its own times. */
function swapSlots(a, b) {
  const x = slotAt(a).slot;
  const y = slotAt(b).slot;
  state.timetablePicked = null;
  if (!x || !y || x === y) return render({ animate: false });
  [x.subject, y.subject] = [y.subject, x.subject];
  saveTimetable();
}

/** A slot goes to another day with the times it had. */
function moveSlotToDay(ref, day) {
  const { day: from, slot } = slotAt(ref);
  state.timetablePicked = null;
  if (!slot || from === day || !WEEKDAYS.some((d) => d.id === day)) return render({ animate: false });
  const list = state.timetable[from];
  list.splice(list.indexOf(slot), 1);
  (state.timetable[day] || (state.timetable[day] = [])).push(slot);
  state.timetableDay = day; // on mobile, follow the slot to its new day
  saveTimetable();
}

/**
 * Edit mode of the timetable. The name is a text field saved when left. The
 * handle works by tap (pick one slot, then another to swap, or "Sposta qui"
 * on another day) and, with a mouse, by dragging onto a slot or a day.
 */
function wireTimetableEdit(panel) {
  el('subjects-list').innerHTML = knownSubjects().map((name) => `<option value="${esc(name)}"></option>`).join('');

  for (const input of panel.querySelectorAll('[data-rename-slot]')) {
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    input.onchange = () => {
      const { slot } = slotAt(input.dataset.renameSlot);
      const name = input.value.trim();
      if (!slot || !name || name === slot.subject) { input.value = slot?.subject || ''; return; }
      slot.subject = name;
      saveTimetable();
    };
  }

  for (const b of panel.querySelectorAll('[data-pick-slot]')) {
    const ref = b.dataset.pickSlot;
    b.onclick = () => {
      if (state.timetablePicked && state.timetablePicked !== ref) return swapSlots(state.timetablePicked, ref);
      state.timetablePicked = state.timetablePicked === ref ? null : ref;
      render({ animate: false });
    };
    b.ondragstart = (e) => {
      dragged = ref;
      const row = b.closest('li');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ref);
      e.dataTransfer.setDragImage(dragChip(slotAt(ref).slot?.subject || ''), 14, 18);
      setTimeout(() => row.classList.add('opacity-40'), 0); // after the browser took the drag image
    };
    b.ondragend = () => {
      dragged = null;
      dropBar.hide();
      b.closest('li')?.classList.remove('opacity-40');
    };
  }
  for (const b of panel.querySelectorAll('[data-move-here]')) {
    b.onclick = () => moveSlotToDay(state.timetablePicked, b.dataset.moveHere);
  }

  // while dragging nothing is rendered, only the bar moves to where the subject would land
  for (const column of panel.querySelectorAll('[data-column]')) {
    column.ondragover = (e) => {
      if (!dragged) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const index = dropIndex(column, e.clientY);
      if (isSamePlace(dragged, column.dataset.column, index)) dropBar.hide();
      else dropBar.show(column, index);
    };
    column.ondrop = (e) => {
      if (!dragged) return;
      e.preventDefault();
      const ref = dragged;
      const index = dropIndex(column, e.clientY);
      dragged = null;
      dropBar.hide();
      dropSlot(ref, column.dataset.column, index);
    };
  }
  const days = el('timetable-days');
  days.ondragleave = (e) => { if (!days.contains(e.relatedTarget)) dropBar.hide(); };
}

/**
 * A small label that follows the pointer instead of the whole row, which the
 * browser would draw half transparent on top of the original one.
 */
function dragChip(name) {
  let chip = el('drag-chip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'drag-chip';
    chip.className = 'fixed -top-24 left-0 px-3 py-2 rounded-lg border border-violet-600 bg-white '
      + 'text-[13px] font-bold text-violet-700 whitespace-nowrap';
    document.body.append(chip);
  }
  chip.textContent = name;
  return chip;
}

/** Position among the rows of a day the pointer is closest to, from 0 to the number of rows. */
function dropIndex(column, y) {
  const rows = [...column.querySelectorAll('[data-slot]')];
  const i = rows.findIndex((row) => {
    const r = row.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return i === -1 ? rows.length : i;
}

/** Dropping a slot right above or below itself changes nothing. */
function isSamePlace(ref, day, index) {
  const [from, i] = ref.split(':');
  return from === day && (index === Number(i) || index === Number(i) + 1);
}

/** The violet line shown between two rows while a subject is dragged. */
const dropBar = {
  node: null,
  show(column, index) {
    if (!this.node) {
      this.node = document.createElement('div');
      this.node.setAttribute('aria-hidden', 'true');
      this.node.className = 'absolute z-10 h-[3px] -mt-[1.5px] rounded-full bg-violet-600 pointer-events-none '
        + 'before:absolute before:-left-1 before:-top-[3px] before:w-[9px] before:h-[9px] before:rounded-full '
        + 'before:border-2 before:border-violet-600 before:bg-white';
    }
    const rows = [...column.querySelectorAll('[data-slot]')];
    const anchor = rows[0] || column.querySelector('ul, p');
    let y;
    if (!rows.length) y = anchor ? anchor.offsetTop + anchor.offsetHeight / 2 : 40;
    else if (index === 0) y = rows[0].offsetTop - 4;
    else if (index === rows.length) y = rows.at(-1).offsetTop + rows.at(-1).offsetHeight + 4;
    else y = (rows[index - 1].offsetTop + rows[index - 1].offsetHeight + rows[index].offsetTop) / 2;
    const box = rows[0] || anchor;
    this.node.style.top = `${y}px`;
    this.node.style.left = `${box ? box.offsetLeft : 0}px`;
    this.node.style.width = `${box ? box.offsetWidth : column.offsetWidth}px`;
    if (this.node.parentNode !== column) column.append(this.node);
  },
  hide() { this.node?.remove(); },
};

/**
 * Drops a dragged slot at a position of a day. In the same day the subjects
 * move along the hours and every hour keeps its times. In another day the
 * subject goes in at that position, the following ones move one hour down
 * into a new last hour as long as the moved one, and the old hour is removed.
 */
function dropSlot(ref, day, index) {
  const { day: from, slot } = slotAt(ref);
  state.timetablePicked = null;
  if (!slot || isSamePlace(ref, day, index)) return render({ animate: false });
  if (from === day) {
    const slots = slotsOf(day);
    const names = slots.map((s) => s.subject);
    const [name] = names.splice(slots.indexOf(slot), 1);
    names.splice(index > slots.indexOf(slot) ? index - 1 : index, 0, name);
    slots.forEach((s, i) => { s.subject = names[i]; });
    return saveTimetable();
  }
  const source = state.timetable[from];
  source.splice(source.indexOf(slot), 1);
  const target = state.timetable[day] || (state.timetable[day] = []);
  const slots = slotsOf(day);
  const length = Math.max(toMinutes(slot.end) - toMinutes(slot.start), 30);
  const start = slots.at(-1)?.end || slot.start;
  const added = { ...slot, start, end: addMinutes(start, length) };
  target.push(added);
  const names = slots.map((s) => s.subject);
  names.splice(index, 0, slot.subject);
  [...slots, added].forEach((s, i) => { s.subject = names[i]; });
  state.timetableDay = day;
  saveTimetable();
}
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
let dragged = null; // "day:index" of the slot being dragged with the mouse

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
  render({ animate: false });
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

  setHeader('Voti', plural(list.length, 'valutazione', 'valutazioni'));

  el('tab-grades').innerHTML = `
    <div class="lg:columns-2 lg:gap-x-4">
      ${list.length === 0 ? empty('Nessun voto nel periodo selezionato.') : ''}
      ${[...bySubject.entries()].map(([subject, items]) => {
        const used = items.filter(countsInAverage).map((g) => g.value);
        const average = used.length ? used.reduce((s, n) => s + n, 0) / used.length : null;
        const t = gradeTone(average);
        return `<div class="mb-4 ${PANEL} break-inside-avoid">
          <div class="flex items-baseline gap-3 px-4 py-3 rounded-t-xl border-b border-slate-200 ${t.tint}">
            <h2 class="min-w-0 font-extrabold text-[15px] leading-snug">${esc(subject)}</h2>
            <p class="ml-auto shrink-0 text-[13px] text-ink-soft">media
              <span class="ml-1 text-[17px] font-extrabold tabular-nums ${t.text}">${fmtAverage(average)}</span></p>
          </div>
          <ul class="px-4 divide-y divide-slate-100">${items.map((g) => gradeRow(g, false)).join('')}</ul>
        </div>`;
      }).join('')}
    </div>`;
}

// --- average

function renderAverage() {
  const m = computeAverages();
  const scale = (v) => Math.max(0, Math.min(100, ((v - 1) / 9) * 100));
  const tone = gradeTone(m.average);
  const best = m.subjects[0];

  setHeader('Media', m.subjects.length
    ? `${plural(m.subjects.length, 'materia', 'materie')} · ${plural(m.total, 'voto', 'voti')}` : '');

  el('tab-average').innerHTML = `
    <div class="lg:grid lg:grid-cols-2 lg:gap-x-4 lg:items-start">
    <div>
    <div class="px-4 py-5 ${PANEL}">
    <div class="flex items-end gap-4">
      <p class="text-[64px] leading-[.85] font-extrabold tracking-tight
        ${m.average == null ? 'text-ink-faint' : tone.text}">${fmtAverage(m.average)}</p>
      <div class="min-w-0 pb-0.5">
        <p class="font-bold text-[15px] ${!m.subjects.length ? '' : m.failing ? 'text-rose-700' : 'text-emerald-700'}">
          ${!m.subjects.length ? 'Ancora nessun voto'
            : m.failing ? plural(m.failing, 'materia sotto il 6', 'materie sotto il 6') : 'Nessuna insufficienza'}</p>
        ${best ? `<p class="text-[13px] text-ink-soft">migliore ${fmtAverage(best.average)}</p>` : ''}
      </div>
    </div>
    <p class="mt-4 text-[13px] text-ink-soft">Ogni materia pesa uguale, qualunque sia il numero di voti.</p>
    <button type="button" id="count-all-toggle" role="switch" aria-checked="${state.averageAllGrades}"
      class="mt-4 pt-4 w-full flex items-center gap-3 border-t border-slate-100 text-left text-sm font-semibold
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600">
      <span class="mr-auto">Conta anche i voti esclusi dalla media</span>
      <span class="relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0
        ${state.averageAllGrades ? 'bg-violet-600' : 'bg-slate-300'}">
        <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
          transition-transform duration-200 ease-out ${state.averageAllGrades ? 'translate-x-5' : ''}"></span>
      </span>
    </button>
    </div>

    ${sectionTitle('Andamento mensile')}
    ${m.months.length ? `<div class="px-4 py-4 ${PANEL}">
      <div class="flex items-end gap-2 h-40">
        ${m.months.map((x) => {
          const t = gradeTone(x.average);
          // the bar grows in the space left by the two labels, the value sits right on top of it
          return `<div class="flex-1 h-full flex flex-col justify-end items-center gap-1.5 min-w-0 max-w-14">
            <span class="text-xs font-bold ${t.text}">${fmtAverage(x.average)}</span>
            <div class="w-full rounded ${t.bar}" style="height:calc((100% - 3rem) * ${scale(x.average) / 100})"></div>
            <span class="text-[11px] text-ink-faint">
              ${new Date(+x.month.slice(0, 4), +x.month.slice(5, 7) - 1, 1).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}
            </span>
          </div>`;
        }).join('')}
      </div>
      <p class="text-xs text-ink-faint mt-3">Per ogni mese, la media delle materie con voti in quel mese.</p></div>`
      : empty('Servono voti in almeno un mese.')}
    </div>

    <div>
    ${sectionTitle('Per materia', '', 'lg:mt-0')}
    ${m.subjects.length ? `<div class="px-4 py-4 space-y-5 ${PANEL}">
      ${m.subjects.map((x) => {
        const t = gradeTone(x.average);
        const detail = [
          x.written ? 'scritto ' + fmtAverage(x.written) : '',
          x.oral ? 'orale ' + fmtAverage(x.oral) : '',
          plural(x.count, 'voto', 'voti'),
        ].filter(Boolean).join(' · ');
        return `<div>
          <div class="flex items-start gap-3 mb-2">
            <div class="min-w-0 flex-1">
              <p class="font-bold text-[15px] leading-snug">${esc(x.subject)}</p>
              <p class="text-xs text-ink-faint mt-0.5">${detail}</p>
            </div>
            <span class="shrink-0 text-[17px] font-extrabold tabular-nums leading-tight ${t.text}">${fmtAverage(x.average)}</span>
          </div>
          <div class="h-1.5 rounded-full bg-page overflow-hidden">
            <div class="h-full rounded-full ${t.bar}" style="width:${scale(x.average)}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : empty('Nessun voto utile al calcolo.')}
    </div>
    </div>`;

  el('count-all-toggle').onclick = () => { state.averageAllGrades = !state.averageAllGrades; render(); };
}

// --- absences

const ABSENCE_KINDS = {
  A: { name: 'Assenza', plural: 'Assenze' },
  I: { name: 'Ingresso in ritardo', plural: 'Ritardi' },
  U: { name: 'Uscita anticipata', plural: 'Uscite' },
};

function renderAbsences() {
  const list = absences().filter((a) => inPeriod(a.day));
  const toJustify = absences().filter((a) => a.toJustify);
  const count = (kind) => list.filter((a) => a.kind === kind).length;

  const stat = (kind) => `
    <div class="px-4 py-3.5">
      <p class="text-[28px] font-extrabold leading-none ${count(kind) ? '' : 'text-ink-faint'}">${count(kind)}</p>
      <p class="mt-1 text-[13px] text-ink-soft">${ABSENCE_KINDS[kind].plural}</p>
    </div>`;

  const row = (a) => {
    const kind = ABSENCE_KINDS[a.kind];
    const title = kind?.name || a.description || 'Evento';
    const details = [
      a.teacher,
      a.justified && a.justifiedOn ? `giustificata il ${shortDate(a.justifiedOn, true)}` : '',
    ].filter(Boolean).join(' · ');
    return `
      <li class="py-3.5 flex gap-3.5 items-start">
        ${dateChip(a.day)}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="font-bold text-[15px]">${esc(title)}</p>
            ${a.toJustify ? badge('da giustificare', 'text-rose-700')
              : a.justified ? badge('giustificata', 'text-emerald-700') : ''}
          </div>
          ${a.description && a.description !== title ? `<p class="text-sm text-ink-soft mt-0.5">${esc(a.description)}</p>` : ''}
          ${a.reason ? `<p class="text-sm text-ink-soft mt-0.5">Motivo: ${esc(a.reason)}</p>` : ''}
          ${a.note ? `<p class="text-sm text-ink-soft mt-0.5 whitespace-pre-wrap">${esc(a.note)}</p>` : ''}
          ${details ? `<p class="text-xs text-ink-faint mt-1">${esc(details)}</p>` : ''}
        </div>
      </li>`;
  };

  setHeader('Assenze', list.length ? plural(list.length, 'evento', 'eventi') : '');

  el('tab-absences').innerHTML = `
    <div class="lg:max-w-2xl">
    <div class="grid grid-cols-3 divide-x divide-slate-200 ${PANEL}">${stat('A')}${stat('I')}${stat('U')}</div>
    ${toJustify.length ? `<div class="mt-3">${callout('text-rose-600',
      `<span class="font-bold">${plural(toJustify.length, 'evento da giustificare', 'eventi da giustificare')}.</span>
       Si giustifica dall'app Argo didUP Famiglia.`)}</div>` : ''}
    <div class="mt-3">
      ${list.length ? `<ul class="${LIST}">${list.map(row).join('')}</ul>`
        : empty('Nessuna assenza, ritardo o uscita in questo periodo.')}
    </div>
    </div>`;
}

// --- reminders

function renderReminders() {
  const today = isoDay(new Date());
  const all = reminders();
  const upcoming = all.filter((r) => r.day >= today);
  const past = all.filter((r) => r.day < today).reverse();

  const row = (r) => `
    <li class="py-3.5 flex gap-3.5 items-start">
      ${dateChip(r.day, dayDistance(r.day, today))}
      <div class="min-w-0 flex-1">
        <p class="text-[15px] text-ink whitespace-pre-wrap break-words">${esc(r.text)}</p>
        ${r.teacher || r.time ? `<p class="text-xs text-ink-faint mt-1">${esc([r.teacher, r.time].filter(Boolean).join(' · '))}</p>` : ''}
      </div>
    </li>`;

  setHeader('Promemoria', upcoming.length ? plural(upcoming.length, 'in arrivo', 'in arrivo') : '');

  el('tab-reminders').innerHTML = `
    <div class="lg:grid lg:grid-cols-2 lg:gap-x-4 lg:items-start">
      <div>
        ${sectionTitle('In arrivo', '', 'mt-0')}
        ${upcoming.length ? `<ul class="${LIST}">${upcoming.map(row).join('')}</ul>`
          : empty('Nessun promemoria in arrivo.')}
      </div>
      <div>
        ${sectionTitle('Passati', '', 'lg:mt-0')}
        ${past.length ? `<ul class="${LIST}">${past.map(row).join('')}</ul>`
          : empty('Ancora nessun promemoria passato.')}
      </div>
    </div>`;
}

// --- noticeboard

function renderNoticeboard() {
  const all = notices();
  const pending = all.filter(pendingNotice);
  const longText = (t) => t.length > 220 || t.split('\n').length > 4;

  const status = (n) => [
    n.ackRequested && (n.acknowledged
      ? badge('presa visione confermata', 'text-emerald-700')
      : badge('presa visione da confermare', 'text-amber-800')),
    n.joinRequested && (n.joined
      ? badge('adesione confermata', 'text-emerald-700')
      : badge(n.deadline ? `adesione entro il ${shortDate(n.deadline, true)}` : 'adesione da confermare', 'text-amber-800')),
  ].filter(Boolean).join('');

  const item = (n) => `
    <li class="py-4 flex gap-3.5 items-start">
      ${dateChip(n.day, daysAgo(n.day) <= 7 ? 'later' : 'neutral')}
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          ${n.category ? `<p class="text-[13px] font-semibold ${n.personal ? 'text-violet-700' : 'text-ink-faint'}">${esc(n.category)}</p>` : ''}
          ${daysAgo(n.day) <= 7 ? badge('nuova', 'text-sky-800') : ''}
        </div>
        <p class="notice-text mt-1 text-[15px] text-ink whitespace-pre-wrap break-words ${longText(n.text) ? 'line-clamp-4' : ''}">${esc(n.text)}</p>
        ${longText(n.text) ? `<button type="button" data-expand class="mt-1 text-[13px] font-semibold text-violet-600 hover:text-violet-800">Leggi tutto</button>` : ''}
        ${n.attachments.length || n.link ? `<div class="mt-2.5 flex flex-col items-start gap-1.5">
          ${n.attachments.map((f) => `
            <a href="${esc(f.href)}" target="_blank" rel="noopener"
              class="max-w-full flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-ink-soft
                hover:bg-page hover:text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
              ${icon('paperclip', 'w-4 h-4 shrink-0 text-ink-faint')}<span class="min-w-0 truncate">${esc(f.name)}</span>
            </a>`).join('')}
          ${n.link ? `
            <a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer"
              class="max-w-full flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-ink-soft
                hover:bg-page hover:text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
              ${icon('external', 'w-4 h-4 shrink-0 text-ink-faint')}<span class="min-w-0 truncate">Apri il link</span>
            </a>` : ''}
        </div>` : ''}
        ${status(n) ? `<div class="mt-2.5 flex flex-wrap gap-1.5">${status(n)}</div>` : ''}
        ${n.author ? `<p class="text-xs text-ink-faint mt-2">${esc(n.author)}</p>` : ''}
      </div>
    </li>`;

  setHeader('Bacheca', all.length ? plural(all.length, 'comunicazione', 'comunicazioni') : '');

  // one column on desktop too, capped to a comfortable reading width
  el('tab-noticeboard').innerHTML = `
    <div class="lg:max-w-2xl">
      ${pending.length ? `<div class="mb-3">${callout('text-amber-600',
        `<span class="font-bold">${plural(pending.length, 'comunicazione da confermare', 'comunicazioni da confermare')}.</span>
         La conferma si dà dall'app Argo didUP Famiglia.`)}</div>` : ''}
      ${all.length ? `<ul class="${LIST}">${all.map(item).join('')}</ul>`
        : empty('Nessuna comunicazione in bacheca.')}
    </div>`;

  for (const b of el('tab-noticeboard').querySelectorAll('[data-expand]')) {
    b.onclick = () => {
      const text = b.previousElementSibling;
      const open = text.classList.toggle('line-clamp-4');
      b.textContent = open ? 'Leggi tutto' : 'Mostra meno';
    };
  }
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
el('header-back').addEventListener('click', () => { state.tab = 'home'; window.scrollTo({ top: 0 }); render(); });
el('header-menu-btn').addEventListener('click', () => (headerMenuOpen ? closeHeaderMenu() : openHeaderMenu()));
el('header-menu-btn').addEventListener('keydown', headerMenuKeys);
el('header-menu-list').addEventListener('keydown', headerMenuKeys);
document.addEventListener('click', (e) => {
  if (headerMenuOpen && !el('header-menu').contains(e.target)) closeHeaderMenu();
});
for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => { state.tab = btn.dataset.tab; window.scrollTo({ top: 0 }); render(); });
}

// An installed app can sit in the background for hours: back on screen, or a
// minute later, the timetable moves on to the right day and the running slot.
const refreshTimetableClock = () => {
  if (!document.hidden && state.data && state.tab === 'timetable' && !state.timetableEdit) render({ animate: false });
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
  box.className = 'fixed left-3 right-3 bottom-24 z-50 rounded-2xl bg-ink text-white text-[11px] p-3 leading-relaxed';
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
