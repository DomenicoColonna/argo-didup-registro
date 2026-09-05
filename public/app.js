'use strict';

const state = {
  data: null,
  tab: 'home',
  periodo: 'tutti',
  mese: startOfMonth(new Date()),
  giornoSelezionato: isoDay(new Date()),
  compitiPassati: false,
  mediaTuttiVoti: false,
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

/**
 * Lessons run from September to June, so the calendar only moves inside that range.
 * The current school year comes from today's date (from September on it is the new
 * one), not from the Argo profile, which early in the year may still hold the old one.
 */
function limitiAnnoScolastico() {
  const oggi = new Date();
  const annoInizio = oggi.getMonth() >= 8 ? oggi.getFullYear() : oggi.getFullYear() - 1;
  return { primo: new Date(annoInizio, 8, 1), ultimo: new Date(annoInizio + 1, 5, 1) };
}
function meseNeiLimiti(d) {
  const { primo, ultimo } = limitiAnnoScolastico();
  if (d < primo) return primo;
  if (d > ultimo) return ultimo;
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
const fmtGiorno = (iso) => {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
};
const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const fmtMedia = (n) => (n == null || !Number.isFinite(n) ? '—' : round2(n).toFixed(2));
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

/** Grade colors: green from 6 up, amber between 5 and 6, red below 5. */
function tonoVoto(v) {
  if (!Number.isFinite(v)) return { testo: 'text-ink-soft', chip: 'bg-slate-100 text-ink-soft', barra: 'bg-slate-300' };
  if (v >= 6) return { testo: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700', barra: 'bg-emerald-500' };
  if (v >= 5) return { testo: 'text-amber-700', chip: 'bg-amber-50 text-amber-700', barra: 'bg-amber-500' };
  return { testo: 'text-rose-700', chip: 'bg-rose-50 text-rose-700', barra: 'bg-rose-500' };
}

/** Date chip in the "MAG 24 / ven" style. */
function chipData(iso, evidenzia = false) {
  const d = parseDate(iso);
  if (!d) return '';
  const mese = d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '').toUpperCase();
  const wd = d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  return `<div class="shrink-0 w-14 rounded-2xl px-2 py-1.5 text-center leading-tight
      ${evidenzia ? 'bg-violet-600 text-white' : 'bg-page text-ink-soft'}">
      <div class="text-[10px] font-bold tracking-wide ${evidenzia ? 'text-white/80' : 'text-ink-faint'}">${mese}</div>
      <div class="text-lg font-extrabold ${evidenzia ? 'text-white' : 'text-ink'}">${d.getDate()}</div>
      <div class="text-[10px] font-semibold ${evidenzia ? 'text-white/80' : 'text-ink-faint'}">${wd}</div>
    </div>`;
}

const card = (contenuto, extra = '') =>
  `<div class="bg-white rounded-3xl shadow-card ${extra}">${contenuto}</div>`;

const titoloSezione = (testo, azione = '', extra = '') =>
  `<div class="flex items-baseline gap-3 mt-7 mb-3 ${extra}">
     <h2 class="text-[17px] font-extrabold tracking-tight">${esc(testo)}</h2>
     ${azione ? `<div class="ml-auto">${azione}</div>` : ''}
   </div>`;

const linkAzione = (testo, tab) =>
  `<button data-goto="${tab}" class="text-sm font-semibold text-violet-600 hover:text-violet-700">${esc(testo)}</button>`;

const vuoto = (testo) =>
  `<p class="px-5 py-8 text-center text-sm text-ink-faint">${esc(testo)}</p>`;

// ------------------------------------------------------------ derived data

const dash = () => state.data?.dashboard || {};
const attivi = (arr) => (arr || []).filter((x) => x && x.operazione !== 'D');

function periodi() {
  const breve = (d) => parseDate(d)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '') || '';
  return (dash().listaPeriodi || []).map((p) => {
    const da = breve(p.dataInizio || p.datInizio);
    const a = breve(p.dataFine || p.datFine);
    return { pk: p.pkPeriodo, nome: p.descrizione, nota: da && a ? `${da} – ${a}` : '' };
  });
}

function voti() {
  return attivi(dash().voti)
    .filter((v) => v.datGiorno)
    .map((v) => ({
      ...v,
      giorno: dayOf(v.datGiorno),
      materia: v.desMateria || v.materiaLight?.desDescrizione || '—',
      etichetta: v.codCodice || (Number.isFinite(v.valore) ? String(v.valore) : '—'),
      numerico: Number.isFinite(v.valore) && v.valore > 0 ? v.valore : null,
    }))
    .sort((a, b) => (a.giorno < b.giorno ? 1 : -1));
}

/** A grade counts towards the average unless Argo excludes it (numMedia / faMenoMedia). */
function contaNellaMedia(v) {
  if (v.numerico == null) return false;
  if (state.mediaTuttiVoti) return true;
  if (v.numMedia === 0) return false;
  if (v.faMenoMedia === 'S' || v.faMenoMedia === true) return false;
  return true;
}

function votiPeriodo() {
  const all = voti();
  return state.periodo === 'tutti' ? all : all.filter((v) => v.pkPeriodo === state.periodo);
}

function compiti() {
  const out = [];
  for (const lezione of attivi(dash().registro)) {
    for (const c of lezione.compiti || []) {
      if (!c.compito) continue;
      out.push({
        testo: c.compito,
        materia: lezione.materia || '—',
        docente: lezione.docente || '',
        assegnato: dayOf(lezione.datGiorno),
        giorno: dayOf(c.dataConsegna) || dayOf(lezione.datGiorno),
      });
    }
  }
  return out.sort((a, b) => (a.giorno > b.giorno ? 1 : -1));
}

function promemoria() {
  return attivi(dash().promemoria)
    .map((p) => ({
      testo: p.desAnnotazioni || '',
      docente: p.docente || '',
      ora: [p.oraInizio, p.oraFine].filter(Boolean).join('–'),
      giorno: dayOf(p.datGiorno),
    }))
    .sort((a, b) => (a.giorno > b.giorno ? 1 : -1));
}

/** Average recomputed from the single grades, per subject, overall and per month. */
function calcolaMedie() {
  const usati = votiPeriodo().filter(contaNellaMedia);
  const perMateria = new Map();
  const perMese = new Map();

  for (const v of usati) {
    if (!perMateria.has(v.materia)) perMateria.set(v.materia, { voti: [], scritto: [], orale: [] });
    const gruppo = perMateria.get(v.materia);
    gruppo.voti.push(v.numerico);
    const tipo = (v.tipoValutazione || v.codVotoPratico || '').toString().toUpperCase();
    if (tipo.startsWith('S')) gruppo.scritto.push(v.numerico);
    else if (tipo.startsWith('O')) gruppo.orale.push(v.numerico);

    const mese = (v.giorno || '').slice(0, 7);
    if (mese) perMese.set(mese, [...(perMese.get(mese) || []), v.numerico]);
  }

  const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
  const materie = [...perMateria.entries()]
    .map(([nome, g]) => ({
      materia: nome,
      media: avg(g.voti),
      scritto: avg(g.scritto),
      orale: avg(g.orale),
      numero: g.voti.length,
    }))
    .sort((a, b) => b.media - a.media);

  return {
    materie,
    generale: avg(usati.map((v) => v.numerico)),
    mediaDelleMedie: avg(materie.map((m) => m.media)),
    totale: usati.length,
    insufficienze: materie.filter((m) => m.media < 6).length,
    mesi: [...perMese.entries()].sort().map(([mese, val]) => ({ mese, media: avg(val) })),
  };
}

// ------------------------------------------------ period selector (custom)

let periodoAperto = false;

function opzioniPeriodo() {
  const anno = state.data?.profilo?.anno?.anno;
  return [{ pk: 'tutti', nome: "Tutto l'anno", nota: anno ? `Anno scolastico ${anno}` : '' }, ...periodi()];
}

function renderPeriodo() {
  const menu = el('period-menu');
  const opzioni = opzioniPeriodo();
  const attiva = opzioni.find((o) => o.pk === state.periodo) || opzioni[0];
  el('period-label').textContent = attiva.nome;

  menu.innerHTML = opzioni.map((o) => {
    const scelta = o.pk === state.periodo;
    return `
      <button type="button" role="option" data-pk="${esc(o.pk)}" aria-selected="${scelta}"
        class="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition
               ${scelta ? 'bg-violet-50' : 'hover:bg-page'}
               focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-[14px] ${scelta ? 'text-violet-700' : ''}">${esc(o.nome)}</span>
          ${o.nota ? `<span class="block text-xs text-ink-faint">${esc(o.nota)}</span>` : ''}
        </span>
        ${scelta ? icon('check2', 'w-5 h-5 shrink-0 text-violet-600') : ''}
      </button>`;
  }).join('');

  for (const b of menu.querySelectorAll('[data-pk]')) {
    b.onclick = (e) => {
      state.periodo = b.dataset.pk;
      // focus goes back to the button only when the choice came from the keyboard (detail 0)
      chiudiPeriodo(e.detail === 0);
      renderPeriodo();
      render();
    };
  }
}

function apriPeriodo() {
  const menu = el('period-menu');
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.remove('opacity-0', 'scale-95', '-translate-y-1'));
  el('period-btn').setAttribute('aria-expanded', 'true');
  el('period-chevron').classList.add('rotate-180');
  periodoAperto = true;
}

function chiudiPeriodo(tornaAlBottone = false) {
  if (!periodoAperto) return;
  const menu = el('period-menu');
  menu.classList.add('opacity-0', 'scale-95', '-translate-y-1');
  el('period-btn').setAttribute('aria-expanded', 'false');
  el('period-chevron').classList.remove('rotate-180');
  periodoAperto = false;
  setTimeout(() => { if (!periodoAperto) menu.hidden = true; }, 160);
  if (tornaAlBottone) el('period-btn').focus();
}

/** Arrows move between items, enter picks one, esc closes the menu. */
function tastieraPeriodo(e) {
  const voci = [...el('period-menu').querySelectorAll('[data-pk]')];
  if (e.key === 'Escape') return chiudiPeriodo(true);
  if (e.key === 'Tab') return chiudiPeriodo();
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  if (!periodoAperto) apriPeriodo();
  const i = voci.indexOf(document.activeElement);
  const passo = e.key === 'ArrowDown' ? 1 : -1;
  voci[i < 0 ? (passo > 0 ? 0 : voci.length - 1) : (i + passo + voci.length) % voci.length]?.focus();
}

// ----------------------------------------------------------------- network

async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const json = await res.json().catch(() => ({ error: 'Risposta non valida dal server' }));
  if (!res.ok) throw new Error(json.error || `Errore ${res.status}`);
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
    mostraApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accedi';
  }
}

async function aggiorna() {
  const btn = el('refresh-btn');
  btn.disabled = true;
  btn.classList.add('animate-spin');
  try {
    state.data = await api('/api/data?refresh=1');
    render();
  } catch (ex) {
    if (/sessione scaduta/i.test(ex.message)) return location.reload();
    alert(ex.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('animate-spin');
  }
}

// ------------------------------------------------------------------ render

const SCHEDE = [
  { id: 'home', icona: 'home', nome: 'Home' },
  { id: 'calendario', icona: 'calendar', nome: 'Calendario' },
  { id: 'compiti', icona: 'check', nome: 'Compiti' },
  { id: 'voti', icona: 'award', nome: 'Voti' },
  { id: 'media', icona: 'chart', nome: 'Media' },
];

/** Sidebar entries (desktop only), same tabs as the bottom bar. */
function creaSideNav() {
  el('side-nav').innerHTML = SCHEDE.map((s) => `
    <button class="tab-side" data-tab="${s.id}" data-icon-name="${s.icona}" data-label="${s.nome}"></button>`).join('');
  for (const b of document.querySelectorAll('.tab-side')) {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; window.scrollTo({ top: 0 }); render(); });
  }
}

function mostraApp() {
  el('login-view').classList.add('hidden');
  el('app-view').classList.remove('hidden');
  renderPeriodo();
  render();
}

function render() {
  const p = state.data.profilo;
  const nome = p.alunno?.nome || p.alunno?.nominativo || '';
  el('student-name').textContent = nome ? `Ciao, ${nome}` : 'Il tuo registro';
  el('student-meta').textContent = [
    (p.scheda?.classe?.desDenominazione || '') + (p.scheda?.classe?.desSezione || ''),
    p.anno?.anno,
  ].filter(Boolean).join(' · ');
  el('updated-at').textContent = state.data.aggiornato
    ? `Dati aggiornati il ${new Date(state.data.aggiornato).toLocaleString('it-IT')}`
    : '';

  for (const btn of document.querySelectorAll('.tab')) {
    const attivo = btn.dataset.tab === state.tab;
    btn.className = `tab flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition
      ${attivo ? 'text-violet-600 bg-violet-50' : 'text-ink-faint hover:text-ink-soft'}`;
    btn.setAttribute('aria-current', attivo ? 'page' : 'false');
    btn.innerHTML = `${icon(btn.dataset.icon, 'w-[22px] h-[22px]')}<span>${btn.dataset.label}</span>`;
  }
  for (const btn of document.querySelectorAll('.tab-side')) {
    const attivo = btn.dataset.tab === state.tab;
    btn.className = `tab-side flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition
      ${attivo ? 'bg-violet-50 text-violet-700' : 'text-ink-soft hover:bg-page'}`;
    btn.setAttribute('aria-current', attivo ? 'page' : 'false');
    btn.innerHTML = `${icon(btn.dataset.iconName, 'w-5 h-5 shrink-0')}<span>${btn.dataset.label}</span>`;
  }
  el('side-name').textContent = p.alunno?.nominativo || '';
  el('side-meta').textContent = el('student-meta').textContent;

  for (const panel of document.querySelectorAll('.tab-panel')) panel.classList.add('hidden');
  const panel = el(`tab-${state.tab}`);
  panel.classList.remove('hidden');

  ({
    home: renderHome,
    calendario: renderCalendario,
    compiti: renderCompiti,
    voti: renderVoti,
    media: renderMedia,
  })[state.tab]();

  panel.classList.remove('enter');
  void panel.offsetWidth;
  panel.classList.add('enter');
  hydrateIcons(panel);
  for (const b of panel.querySelectorAll('[data-goto]')) {
    b.onclick = () => { state.tab = b.dataset.goto; window.scrollTo({ top: 0 }); render(); };
  }
}

// --- home

function renderHome() {
  const m = calcolaMedie();
  const oggi = isoDay(new Date());
  const prossimi = compiti().filter((c) => c.giorno >= oggi).slice(0, 3);
  const ultimi = votiPeriodo().slice(0, 4);
  const tono = tonoVoto(m.generale);
  const inScadenza = compiti().filter((c) => c.giorno >= oggi).length;
  const argo = dash().mediaGenerale;

  const scorciatoia = (tab, nome, valore, ic, colore) => `
    <button data-goto="${tab}" class="text-left bg-white rounded-3xl shadow-card p-4 transition
        hover:shadow-lift hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
      <div class="w-10 h-10 rounded-2xl grid place-items-center ${colore}" data-icon="${ic}"></div>
      <div class="mt-3 font-bold text-[15px]">${esc(nome)}</div>
      <div class="text-[13px] text-ink-soft">${esc(valore)}</div>
    </button>`;

  el('tab-home').innerHTML = `
    <div class="lg:grid lg:grid-cols-2 lg:gap-7 lg:items-start">
    <div>
    ${card(`
      <div class="p-5 flex items-center gap-5">
        <div>
          <p class="text-xs font-bold tracking-wide text-ink-faint uppercase">Media generale</p>
          <p class="text-5xl font-extrabold tracking-tight ${tono.testo} mt-1">${fmtMedia(m.generale)}</p>
          <p class="text-[13px] text-ink-soft mt-1">
            calcolata su ${plurale(m.totale, 'voto', 'voti')} in ${plurale(m.materie.length, 'materia', 'materie')}
          </p>
        </div>
        <div class="ml-auto text-right flex flex-col items-end gap-2 shrink-0">
          ${m.insufficienze
            ? `<p class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 whitespace-nowrap">
                 ${plurale(m.insufficienze, 'materia sotto il 6', 'materie sotto il 6')}</p>`
            : m.materie.length
              ? `<p class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">
                   nessuna insufficienza</p>`
              : ''}
          <div>${linkAzione('Dettaglio →', 'media')}</div>
        </div>
      </div>
      ${Number.isFinite(argo) && argo > 0 ? `
        <p class="px-5 pb-4 -mt-1 text-xs text-ink-faint">Argo dichiara ${fmtMedia(argo)}</p>` : ''}
    `)}

    ${titoloSezione('Accesso rapido')}
    <div class="grid grid-cols-2 gap-3">
      ${scorciatoia('voti', 'Voti', plurale(votiPeriodo().length, 'voto registrato', 'voti registrati'), 'award', 'bg-violet-100 text-violet-700')}
      ${scorciatoia('compiti', 'Compiti', inScadenza ? plurale(inScadenza, 'da fare', 'da fare') : 'niente in sospeso', 'check', 'bg-amber-100 text-amber-700')}
      ${scorciatoia('calendario', 'Calendario', new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }), 'calendar', 'bg-sky-100 text-sky-700')}
      ${scorciatoia('media', 'Andamento', m.mesi.length ? plurale(m.mesi.length, 'mese', 'mesi') + ' di dati' : 'nessun dato', 'chart', 'bg-emerald-100 text-emerald-700')}
    </div>

    </div>
    <div>
    ${titoloSezione('Prossimi compiti', linkAzione('Vedi tutti', 'compiti'), 'lg:mt-0')}
    ${card(prossimi.length ? `<ul class="divide-y divide-slate-100">
      ${prossimi.map((c) => `
        <li class="p-4 flex gap-3.5 items-start">
          ${chipData(c.giorno, c.giorno === oggi)}
          <div class="min-w-0">
            <p class="font-bold text-[15px]">${esc(c.materia)}</p>
            <p class="text-sm text-ink-soft line-clamp-2">${esc(c.testo)}</p>
          </div>
        </li>`).join('')}
      </ul>` : vuoto('Nessun compito in programma.'))}

    ${titoloSezione('Ultimi voti', linkAzione('Vedi tutti', 'voti'))}
    ${card(ultimi.length ? `<ul class="divide-y divide-slate-100">
      ${ultimi.map((v) => rigaVoto(v)).join('')}
      </ul>` : vuoto('Ancora nessun voto in questo periodo.'))}
    </div>
    </div>`;
}

function rigaVoto(v, mostraMateria = true) {
  const t = tonoVoto(v.numerico);
  const prova = v.descrizioneProva || v.desCommento || 'Valutazione';
  const titolo = mostraMateria ? v.materia : prova;
  const sotto = mostraMateria ? prova : [v.tipoValutazione, v.docente].filter(Boolean).join(' · ');
  return `
    <li class="p-4 flex items-center gap-3.5">
      <span class="shrink-0 w-12 h-12 grid place-items-center rounded-2xl text-lg font-extrabold ${t.chip}">
        ${esc(v.etichetta)}
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-bold text-[15px] truncate">${esc(titolo)}</p>
        <p class="text-[13px] text-ink-soft truncate">${esc(sotto)}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-[13px] text-ink-faint">${esc(parseDate(v.giorno)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) || '')}</p>
        ${contaNellaMedia(v) ? '' : '<p class="text-[11px] font-semibold text-ink-faint">non in media</p>'}
      </div>
    </li>`;
}

// --- calendar

function renderCalendario() {
  const eventi = { voti: new Map(), compiti: new Map(), promemoria: new Map() };
  const push = (map, key, val) => key && map.set(key, [...(map.get(key) || []), val]);
  for (const v of voti()) push(eventi.voti, v.giorno, v);
  for (const c of compiti()) push(eventi.compiti, c.giorno, c);
  for (const p of promemoria()) push(eventi.promemoria, p.giorno, p);

  state.mese = meseNeiLimiti(state.mese);
  const mese = state.mese;
  const limiti = limitiAnnoScolastico();
  const alPrimo = mese.getTime() === limiti.primo.getTime();
  const allUltimo = mese.getTime() === limiti.ultimo.getTime();
  const primo = new Date(mese.getFullYear(), mese.getMonth(), 1);
  const offset = (primo.getDay() + 6) % 7; // weeks start on monday
  const oggi = isoDay(new Date());

  const celle = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(primo.getFullYear(), primo.getMonth(), 1 - offset + i);
    const key = isoDay(d);
    const fuori = d.getMonth() !== mese.getMonth();
    const weekend = d.getDay() === 0 || d.getDay() === 6; // no school on saturday and sunday
    const selezionato = key === state.giornoSelezionato;
    const punti = [
      eventi.voti.get(key)?.length ? 'bg-violet-500' : null,
      eventi.compiti.get(key)?.length ? 'bg-amber-500' : null,
      eventi.promemoria.get(key)?.length ? 'bg-sky-500' : null,
    ].filter(Boolean);

    const sfondo = selezionato
      ? 'bg-violet-600 text-white shadow-card'
      : weekend
        ? 'bg-page text-ink-faint hover:bg-slate-100'
        : 'text-ink hover:bg-page';

    return `
      <button data-giorno="${key}" aria-label="${esc(fmtGiorno(key))}"
        class="giorno aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition
               ${fuori ? 'opacity-30' : ''} ${sfondo}
               ${key === oggi && !selezionato ? 'ring-2 ring-violet-300' : ''}">
        <span class="text-sm ${selezionato ? 'font-extrabold' : key === oggi ? 'font-extrabold text-violet-700' : 'font-semibold'}">
          ${d.getDate()}
        </span>
        <span class="flex gap-0.5 h-1.5">
          ${punti.map((c) => `<span class="w-1.5 h-1.5 rounded-full ${selezionato ? 'bg-white/80' : c}"></span>`).join('')}
        </span>
      </button>`;
  }).join('');

  const sel = state.giornoSelezionato;
  const sezioni = [
    ['Voti', eventi.voti.get(sel), (v) => {
      const t = tonoVoto(v.numerico);
      return `<div class="flex items-center gap-3">
        <span class="shrink-0 w-11 h-11 grid place-items-center rounded-2xl font-extrabold ${t.chip}">${esc(v.etichetta)}</span>
        <div class="min-w-0">
          <p class="font-bold text-[15px]">${esc(v.materia)}</p>
          <p class="text-[13px] text-ink-soft truncate">${esc(v.descrizioneProva || v.desCommento || 'Valutazione')}</p>
        </div></div>`;
    }],
    ['Compiti', eventi.compiti.get(sel), (c) => `
      <div><p class="font-bold text-[15px]">${esc(c.materia)}</p>
      <p class="text-sm text-ink-soft whitespace-pre-wrap">${esc(c.testo)}</p></div>`],
    ['Promemoria', eventi.promemoria.get(sel), (p) => `
      <div><p class="text-sm text-ink whitespace-pre-wrap">${esc(p.testo)}</p>
      <p class="text-xs text-ink-faint mt-0.5">${esc([p.docente, p.ora].filter(Boolean).join(' · '))}</p></div>`],
  ].filter(([, items]) => items && items.length);

  el('tab-calendario').innerHTML = `
    <div class="lg:grid lg:grid-cols-[1fr_21rem] lg:gap-6 lg:items-start">
    <div>
    ${card(`
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-[17px] font-extrabold tracking-tight capitalize mr-auto">
            ${mese.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </h2>
          <button id="mese-oggi" class="text-sm font-semibold text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">Oggi</button>
          <button id="mese-prev" aria-label="Mese precedente" data-icon="arrowLeft" ${alPrimo ? 'disabled' : ''}
            class="w-9 h-9 grid place-items-center rounded-xl bg-page text-ink-soft hover:bg-slate-200 transition
                   disabled:opacity-30 disabled:hover:bg-page disabled:cursor-not-allowed"></button>
          <button id="mese-next" aria-label="Mese successivo" data-icon="arrowRight" ${allUltimo ? 'disabled' : ''}
            class="w-9 h-9 grid place-items-center rounded-xl bg-page text-ink-soft hover:bg-slate-200 transition
                   disabled:opacity-30 disabled:hover:bg-page disabled:cursor-not-allowed"></button>
        </div>
        <div class="grid grid-cols-7 mb-1">
          ${['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((g, i) =>
            `<div class="text-center text-[11px] font-bold uppercase tracking-wide
              ${i >= 5 ? 'text-ink-faint/60' : 'text-ink-faint'}">${g}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-1">${celle}</div>
        <div class="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-ink-soft">
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-violet-500"></span>voti</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500"></span>compiti</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-sky-500"></span>promemoria</span>
        </div>
      </div>`)}

    </div>
    <div>
    ${titoloSezione(fmtGiorno(sel) || 'Nessun giorno selezionato', '', 'lg:mt-0')}
    ${card(sezioni.length ? sezioni.map(([nome, items, tpl]) => `
      <div class="p-4 border-b border-slate-100 last:border-0">
        <p class="text-xs font-bold uppercase tracking-wide text-ink-faint mb-3">${nome}</p>
        <div class="space-y-3">${items.map(tpl).join('')}</div>
      </div>`).join('') : vuoto('Niente in programma per questo giorno.'))}
    </div>
    </div>`;

  el('mese-prev').onclick = () => { state.mese = new Date(mese.getFullYear(), mese.getMonth() - 1, 1); render(); };
  el('mese-next').onclick = () => { state.mese = new Date(mese.getFullYear(), mese.getMonth() + 1, 1); render(); };
  el('mese-oggi').onclick = () => {
    state.mese = meseNeiLimiti(startOfMonth(new Date()));
    state.giornoSelezionato = isoDay(new Date());
    render();
  };
  for (const b of document.querySelectorAll('.giorno')) {
    b.onclick = () => { state.giornoSelezionato = b.dataset.giorno; render(); };
  }
}

// --- homework

function renderCompiti() {
  const oggi = isoDay(new Date());
  const tutti = compiti();
  const lista = state.compitiPassati ? tutti : tutti.filter((c) => c.giorno >= oggi);
  const perGiorno = new Map();
  for (const c of lista) perGiorno.set(c.giorno, [...(perGiorno.get(c.giorno) || []), c]);

  const filtro = (valore, testo) => `
    <button data-passati="${valore}" class="px-4 py-1.5 rounded-full text-sm font-semibold transition
      ${String(state.compitiPassati) === valore
        ? 'bg-white text-ink ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(22,26,43,.10),0_8px_16px_-8px_rgba(22,26,43,.55)]'
        : 'text-ink-soft hover:text-ink'}">
      ${testo}</button>`;

  el('tab-compiti').innerHTML = `
    ${card(`<div class="p-4 flex items-center gap-3">
        <h2 class="text-[17px] font-extrabold tracking-tight mr-auto">Compiti</h2>
        <div class="flex gap-1 bg-slate-100 rounded-full p-1">
          ${filtro('false', 'In arrivo')}${filtro('true', 'Tutti')}
        </div>
      </div>`)}
    <div class="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
      ${perGiorno.size === 0 ? card(vuoto('Nessun compito da fare.')) : ''}
      ${[...perGiorno.entries()].map(([giorno, items]) => card(`
        <ul class="divide-y divide-slate-100">
          ${items.map((c, i) => `
            <li class="p-4 flex gap-3.5 items-start">
              ${i === 0 ? chipData(giorno, giorno === oggi) : '<div class="w-14 shrink-0"></div>'}
              <div class="min-w-0">
                <p class="font-bold text-[15px]">${esc(c.materia)}</p>
                <p class="text-sm text-ink-soft whitespace-pre-wrap">${esc(c.testo)}</p>
                <p class="text-xs text-ink-faint mt-1">
                  assegnato ${esc(parseDate(c.assegnato)?.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) || '—')}
                  ${c.docente ? '· ' + esc(c.docente) : ''}
                </p>
              </div>
            </li>`).join('')}
        </ul>`)).join('')}
    </div>`;

  for (const b of el('tab-compiti').querySelectorAll('[data-passati]')) {
    b.onclick = () => { state.compitiPassati = b.dataset.passati === 'true'; render(); };
  }
}

// --- grades

function renderVoti() {
  const lista = votiPeriodo();
  const perMateria = new Map();
  for (const v of lista) perMateria.set(v.materia, [...(perMateria.get(v.materia) || []), v]);

  el('tab-voti').innerHTML = `
    ${card(`<div class="p-4 flex items-baseline gap-3">
      <h2 class="text-[17px] font-extrabold tracking-tight">Voti</h2>
      <p class="ml-auto text-sm text-ink-soft">${plurale(lista.length, 'valutazione', 'valutazioni')}</p>
    </div>`)}
    <div class="mt-3 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
      ${lista.length === 0 ? card(vuoto('Nessun voto nel periodo selezionato.')) : ''}
      ${[...perMateria.entries()].map(([materia, items]) => {
        const usati = items.filter(contaNellaMedia).map((v) => v.numerico);
        const media = usati.length ? usati.reduce((s, n) => s + n, 0) / usati.length : null;
        const t = tonoVoto(media);
        return card(`
          <div class="p-4 flex items-center gap-3 border-b border-slate-100">
            <div class="min-w-0">
              <p class="font-extrabold text-[15px] truncate">${esc(materia)}</p>
              <p class="text-[13px] text-ink-soft">${plurale(items.length, 'voto', 'voti')}</p>
            </div>
            <span class="ml-auto shrink-0 px-3 py-1.5 rounded-2xl font-extrabold ${t.chip}">${fmtMedia(media)}</span>
          </div>
          <ul class="divide-y divide-slate-100">${items.map((v) => rigaVoto(v, false)).join('')}</ul>`);
      }).join('')}
    </div>`;
}

// --- average

function renderMedia() {
  const m = calcolaMedie();
  const argo = dash().mediaGenerale;
  const scala = (v) => Math.max(0, Math.min(100, ((v - 1) / 9) * 100));

  const numero = (etichetta, valore, nota) => {
    const t = tonoVoto(valore);
    return `<div class="bg-white rounded-3xl shadow-card p-4">
      <p class="text-xs font-bold uppercase tracking-wide text-ink-faint">${esc(etichetta)}</p>
      <p class="text-3xl font-extrabold tracking-tight mt-1 ${valore == null ? 'text-ink-faint' : t.testo}">${fmtMedia(valore)}</p>
      <p class="text-[13px] text-ink-soft mt-0.5">${esc(nota)}</p>
    </div>`;
  };

  el('tab-media').innerHTML = `
    ${card(`<div class="p-4 flex items-center gap-3">
      <div>
        <h2 class="text-[17px] font-extrabold tracking-tight">Media</h2>
        <p class="text-[13px] text-ink-soft">Ricalcolata dai singoli voti</p>
      </div>
      <button type="button" id="chk-tutti" role="switch" aria-checked="${state.mediaTuttiVoti}"
        class="ml-auto flex items-center gap-2.5 text-[13px] font-semibold text-ink-soft group">
        <span>conta tutti i voti</span>
        <span class="relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0
          ${state.mediaTuttiVoti ? 'bg-emerald-500' : 'bg-slate-400 group-hover:bg-slate-500'}">
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_3px_rgba(22,26,43,.35)]
            transition-transform duration-200 ease-out ${state.mediaTuttiVoti ? 'translate-x-5' : ''}"></span>
        </span>
      </button>
    </div>`)}

    <div class="grid grid-cols-2 gap-3 mt-3">
      ${numero('Generale', m.generale, `su ${plurale(m.totale, 'voto', 'voti')}`)}
      ${numero('Media delle materie', m.mediaDelleMedie, plurale(m.materie.length, 'materia', 'materie'))}
    </div>
    ${Number.isFinite(argo) && argo > 0
      ? `<p class="text-xs text-ink-faint mt-2 px-1">Argo dichiara ${fmtMedia(argo)}.</p>`
      : `<p class="text-xs text-ink-faint mt-2 px-1">La tua scuola non espone la media: questi numeri sono calcolati qui.</p>`}

    <div class="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
    <div>
    ${titoloSezione('Per materia')}
    ${card(m.materie.length ? `<div class="p-4 space-y-4">
      ${m.materie.map((x) => {
        const t = tonoVoto(x.media);
        return `<div>
          <div class="flex items-baseline gap-2 mb-1.5">
            <span class="font-bold text-[15px] truncate">${esc(x.materia)}</span>
            <span class="ml-auto shrink-0 text-xs text-ink-faint">
              ${x.scritto ? 'S ' + fmtMedia(x.scritto) : ''}${x.scritto && x.orale ? ' · ' : ''}${x.orale ? 'O ' + fmtMedia(x.orale) : ''}
              ${x.scritto || x.orale ? ' · ' : ''}${plurale(x.numero, 'voto', 'voti')}
            </span>
            <span class="shrink-0 font-extrabold tabular-nums ${t.testo}">${fmtMedia(x.media)}</span>
          </div>
          <div class="h-2 rounded-full bg-page overflow-hidden">
            <div class="h-full rounded-full ${t.barra}" style="width:${scala(x.media)}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : vuoto('Nessun voto utile al calcolo.'))}

    </div>
    <div>
    ${titoloSezione('Andamento mensile', '', 'lg:mt-7')}
    ${card(m.mesi.length ? `<div class="p-4">
      <div class="flex items-end gap-2 h-44">
        ${m.mesi.map((x) => {
          const t = tonoVoto(x.media);
          return `<div class="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
            <span class="text-xs font-bold ${t.testo}">${fmtMedia(x.media)}</span>
            <div class="flex-1 w-full flex items-end">
              <div class="w-full rounded-t-xl ${t.barra}" style="height:${scala(x.media)}%"></div>
            </div>
            <span class="text-[11px] text-ink-faint">
              ${new Date(+x.mese.slice(0, 4), +x.mese.slice(5, 7) - 1, 1).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>` : vuoto('Servono voti in almeno un mese.'))}
    </div>
    </div>`;

  el('chk-tutti').onclick = () => { state.mediaTuttiVoti = !state.mediaTuttiVoti; render(); };
}

// -------------------------------------------------------------------- init

hydrateIcons();
creaSideNav();
el('login-form').addEventListener('submit', login);
el('refresh-btn').addEventListener('click', aggiorna);
const dialogoUscita = el('logout-dialog');
for (const b of document.querySelectorAll('[data-azione="logout"]')) {
  b.addEventListener('click', () => {
    dialogoUscita.showModal();
    el('logout-annulla').focus();
  });
}
el('logout-annulla').addEventListener('click', () => dialogoUscita.close());
el('logout-conferma').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Esco…';
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});
// click on the modal backdrop
dialogoUscita.addEventListener('click', (e) => {
  if (e.target === dialogoUscita) dialogoUscita.close();
});
el('period-btn').addEventListener('click', () => (periodoAperto ? chiudiPeriodo() : apriPeriodo()));
el('period-btn').addEventListener('keydown', tastieraPeriodo);
el('period-menu').addEventListener('keydown', tastieraPeriodo);
document.addEventListener('click', (e) => {
  if (periodoAperto && !el('period').contains(e.target)) chiudiPeriodo();
});
for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => { state.tab = btn.dataset.tab; window.scrollTo({ top: 0 }); render(); });
}

/** ?debug=1 paints the page background red and reports what sits at the bottom edge. */
function mostraDiagnostica() {
  document.documentElement.style.background = '#e11d48';
  const descrivi = (y) => document.elementsFromPoint(Math.round(innerWidth / 2), y)
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
    `y=${innerHeight - 1}: ${descrivi(innerHeight - 1)}`,
    `y=${innerHeight - 12}: ${descrivi(innerHeight - 12)}`,
    `y=${innerHeight - 30}: ${descrivi(innerHeight - 30)}`,
  ].join('\n');
  box.style.whiteSpace = 'pre-wrap';
  document.body.appendChild(box);
}
if (new URLSearchParams(location.search).get('debug')) addEventListener('load', mostraDiagnostica);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// initial tab from the query string (?tab=voti), handy for testing too
const tabIniziale = new URLSearchParams(location.search).get('tab');
if (['home', 'calendario', 'compiti', 'voti', 'media'].includes(tabIniziale)) state.tab = tabIniziale;

// is there a session already?
api('/api/data').then((data) => { state.data = data; mostraApp(); }).catch(() => {});
