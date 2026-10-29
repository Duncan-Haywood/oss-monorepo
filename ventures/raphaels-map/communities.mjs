// @ts-check
// SPEC §7E: community opportunities, a view over data/communities.json.
//
// Public organizations only (parishes, campus ministries, diocesan offices,
// traditional-liturgy communities, advertised event series). No people.
// The user's own notes on a venue stay in localStorage
// (`raphaels-map-community-notes`, keyed by venue id) and never leave the
// browser. Filters live in the URL hash params (#communities?state=CO&city=…)
// through the shell's setState, so a filtered view can be bookmarked.

export const STALE_DAYS = 180;

export const CAVEAT =
  "An organization being listed here does not mean it has a sizable group of people your age, or anyone looking to marry. Groups start, pause and move; check the page, and go for the community itself.";

export const CATEGORY_LABELS = Object.freeze({
  parish_young_adult: 'Parish young adult group',
  campus_ministry: 'Campus ministry',
  diocesan_young_adult_office: 'Diocesan young adult office',
  traditional_liturgy: 'Traditional Latin Mass community',
  event_series: 'Event series',
});

export const VERIFICATION_LABELS = Object.freeze({
  fetched_official_page: 'Checked on its official page',
  listed_from_search: 'Not verified: listed from a web search',
});

/** @param {string} c */
export const categoryLabel = (c) => /** @type {any} */ (CATEGORY_LABELS)[c] || String(c || 'Other').replace(/_/g, ' ');

/** ISO date (YYYY-MM-DD) to a UTC day number, or null. */
function dayNumber(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null;
}

/** @param {Date|string} d */
export function isoDay(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `iso` to `today`, or null when either is not a date. */
export function daysSince(iso, today) {
  const a = dayNumber(iso), b = dayNumber(isoDay(today));
  return a === null || b === null ? null : b - a;
}

/** Stale: verified, but longer ago than STALE_DAYS. An unverified row is "not verified", not stale. */
export function isStale(venue, today) {
  const d = daysSince(venue && venue.verified_at, today);
  return d !== null && d > STALE_DAYS;
}

/** @param {any} v @param {Date|string} today */
export function venueBadges(v, today) {
  const out = [];
  if (!v || v.verification !== 'fetched_official_page' || !v.verified_at) {
    out.push({ kind: 'not_verified', label: 'Not verified', help: VERIFICATION_LABELS.listed_from_search });
  } else {
    out.push({ kind: 'verified', label: `Checked ${v.verified_at}`, help: VERIFICATION_LABELS.fetched_official_page });
    if (isStale(v, today)) out.push({ kind: 'stale', label: 'Stale', help: `Last checked more than ${STALE_DAYS} days ago.` });
  }
  return out;
}

/** Only http(s) links are rendered as links. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Accept the loaded file (or a {missing:true} marker from data.mjs) and
 * return a predictable shape.
 * @returns {{missing: boolean, reason?: string, generated: string|null, method: string, venues: any[]}}
 */
export function normalizeCommunities(doc) {
  if (!doc || doc.missing === true || typeof doc !== 'object') {
    return { missing: true, reason: (doc && doc.reason) || 'not loaded', generated: null, method: '', venues: [] };
  }
  const venues = Array.isArray(doc.venues)
    ? doc.venues.filter((v) => v && typeof v === 'object' && typeof v.id === 'string' && typeof v.public_name === 'string')
    : [];
  return { missing: false, generated: typeof doc.generated === 'string' ? doc.generated : null, method: String(doc.method || ''), venues };
}

/** Sorted distinct non-empty values of `key`. */
export function distinctValues(venues, key) {
  return [...new Set(venues.map((v) => v[key]).filter((x) => typeof x === 'string' && x))].sort((a, b) => a.localeCompare(b));
}

/** Cities present in a state (or all cities when no state). */
export function citiesIn(venues, state) {
  return distinctValues(state ? venues.filter((v) => v.state === state) : venues, 'city');
}

/**
 * @param {any[]} venues
 * @param {{state?: string, city?: string, category?: string, q?: string, verifiedOnly?: boolean}} f
 */
export function filterVenues(venues, f = {}) {
  const q = String(f.q || '').trim().toLowerCase();
  return venues
    .filter((v) => !f.state || v.state === f.state)
    .filter((v) => !f.city || v.city === f.city)
    .filter((v) => !f.category || v.category === f.category)
    .filter((v) => !f.verifiedOnly || v.verification === 'fetched_official_page')
    .filter((v) => !q || [v.public_name, v.city, v.ministry, v.notes, v.county_name].some((x) => String(x || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.state || '').localeCompare(b.state || '') || (a.city || '').localeCompare(b.city || '') || a.public_name.localeCompare(b.public_name));
}

/** Counts by verification type, for the header and for reports. */
export function verificationCounts(venues) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const v of venues) out[v.verification || 'unknown'] = (out[v.verification || 'unknown'] || 0) + 1;
  return out;
}

export const NOTES_KEY = 'raphaels-map-community-notes';

/** @param {any} storage */
export function loadNotes(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(NOTES_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, string>} notes @param {any} storage */
export function saveNotes(notes, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(NOTES_KEY, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

/** Set or clear one venue's note in the notes map; pure. */
export function setNote(notes, id, text) {
  const next = { ...(notes && typeof notes === 'object' ? notes : {}) };
  const t = String(text || '').slice(0, 2000);
  if (t.trim()) next[id] = t; else delete next[id];
  return next;
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/** @param {any} s */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/**
 * @param {any} v @param {Date|string} today @param {string} note
 */
export function venueHtml(v, today, note = '') {
  const url = safeUrl(v.public_url);
  const badges = venueBadges(v, today)
    .map((b) => `<span class="badge badge-${b.kind}" title="${esc(b.help)}">${esc(b.label)}</span>`).join(' ');
  const place = [v.city, v.state].filter(Boolean).join(', ') + (v.county_name ? ` (${v.county_name})` : '');
  return `
  <article class="venue" data-id="${esc(v.id)}">
    <h4>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(v.public_name)}</a>` : esc(v.public_name)}</h4>
    <p class="venue-meta">${badges} <span>${esc(categoryLabel(v.category))}</span>${place ? ` · <span>${esc(place)}</span>` : ''}</p>
    ${v.ministry ? `<p>${esc(v.ministry)}</p>` : ''}
    ${v.age_scope_published ? `<p>Ages, as the organization publishes them: ${esc(v.age_scope_published)}</p>` : ''}
    ${v.public_event_frequency ? `<p>How often: ${esc(v.public_event_frequency)}</p>` : ''}
    ${v.notes ? `<details><summary>What the listing is based on</summary><p>${esc(v.notes)}</p></details>` : ''}
    ${url ? '' : '<p class="venue-warn">No usable public link.</p>'}
    <label class="venue-note">Your notes (kept in this browser only)
      <textarea data-note="${esc(v.id)}" rows="2" maxlength="2000">${esc(note)}</textarea></label>
  </article>`;
}

/**
 * @param {HTMLElement} el
 * @param {{data?: any, state?: any, setState?: (patch: any) => void, record?: (e: string) => void, today?: Date|string, storage?: any}} ctx
 */
export function mount(el, ctx = {}) {
  const record = typeof ctx.record === 'function' ? ctx.record : () => {};
  const today = ctx.today || new Date();
  const storage = 'storage' in ctx ? ctx.storage : globalThis.localStorage;
  const st = (ctx.state && ctx.state.params) || {};
  /** @type {{state: string, city: string, category: string, q: string, verifiedOnly: boolean}} */
  let filters = { state: st.state || '', city: st.city || '', category: st.category || '', q: '', verifiedOnly: false };
  let notes = loadNotes(storage);
  /** @type {ReturnType<typeof normalizeCommunities>} */
  let doc = normalizeCommunities(null);
  let loaded = false;
  const ac = new AbortController();
  const opt = { signal: ac.signal };

  // Filters go to the hash params so the view can be bookmarked. The shell
  // re-renders on setState; this view has no update(), so it is not redrawn twice.
  const saveFilters = () => {
    try { ctx.setState?.({ params: { state: filters.state, city: filters.city, category: filters.category } }); } catch { /* optional */ }
  };

  function listHtml() {
    const rows = filterVenues(doc.venues, filters);
    if (!rows.length) return '<p class="empty">No listed organizations match these filters. That means none are in this list, not that none exist: ask a local parish or the diocese.</p>';
    return rows.map((v) => venueHtml(v, today, notes[v.id] || '')).join('');
  }

  function render() {
    if (!loaded) { el.innerHTML = '<p class="loading">Loading communities…</p>'; return; }
    if (doc.missing) {
      el.innerHTML = `<section class="communities"><h2>Community opportunities</h2>
        <p class="empty">The community list (data/communities.json) could not be loaded (${esc(doc.reason)}). Nothing is shown rather than guessing.</p>
        <p class="caveat">${esc(CAVEAT)}</p></section>`;
      return;
    }
    const v = doc.venues;
    const counts = verificationCounts(v);
    const opts = (/** @type {string[]} */ xs, sel, fmt = (/** @type {string} */ x) => x) =>
      xs.map((x) => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(fmt(x))}</option>`).join('');
    el.innerHTML = `
    <section class="communities" aria-labelledby="cm-h">
      <h2 id="cm-h">Community opportunities</h2>
      <p class="caveat"><strong>Read first.</strong> ${esc(CAVEAT)}</p>
      <p class="cm-summary">${v.length} public organizations${doc.generated ? `, list compiled ${esc(doc.generated)}` : ''}.
        ${counts.fetched_official_page || 0} checked on their official page; ${counts.listed_from_search || 0} listed from a web search and <strong>not verified</strong>.
        Badges turn "Stale" ${STALE_DAYS} days after a check.</p>
      <form class="cm-filters" onsubmit="return false">
        <label>State <select data-f="state"><option value="">All</option>${opts(distinctValues(v, 'state'), filters.state)}</select></label>
        <label>City <select data-f="city"><option value="">All</option>${opts(citiesIn(v, filters.state), filters.city)}</select></label>
        <label>Kind <select data-f="category"><option value="">All</option>${opts(distinctValues(v, 'category'), filters.category, categoryLabel)}</select></label>
        <label>Search <input data-f="q" type="search" value="${esc(filters.q)}"></label>
        <label><input data-f="verifiedOnly" type="checkbox" ${filters.verifiedOnly ? 'checked' : ''}> Verified only</label>
      </form>
      <div class="cm-list" aria-live="polite">${listHtml()}</div>
      ${doc.method ? `<details class="cm-method"><summary>How this list was made</summary><p>${esc(doc.method)}</p></details>` : ''}
      <p class="cm-note">Know a public group that is missing or out of date? Check its official page and open an issue with the link. Never add a private person.</p>
    </section>`;
  }

  el.addEventListener('change', (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    const f = t.getAttribute('data-f');
    if (f) {
      /** @type {any} */ (filters)[f] = t.type === 'checkbox' ? t.checked : t.value;
      if (f === 'state') filters.city = '';
      saveFilters(); record('communities_filter'); render();
    }
  }, opt);

  el.addEventListener('input', (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.getAttribute('data-f') === 'q') {
      filters.q = t.value;
      const list = el.querySelector('.cm-list');
      if (list) list.innerHTML = listHtml();
      return;
    }
    const id = t.getAttribute('data-note');
    if (id) { notes = setNote(notes, id, t.value); saveNotes(notes, storage); }
  }, opt);

  el.addEventListener('focusout', (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).getAttribute?.('data-note')) record('communities_note');
  }, opt);

  el.addEventListener('click', (ev) => {
    const a = /** @type {HTMLElement} */ (ev.target).closest?.('.venue h4 a');
    if (a) record('communities_link');
  }, opt);

  render();
  const src = ctx.data;
  const p = src && typeof src.get === 'function' ? src.get('communities.json') : Promise.resolve(src && src.communities ? src.communities : { missing: true, reason: 'no data loader' });
  Promise.resolve(p).then((d) => { doc = normalizeCommunities(d); }, (e) => { doc = normalizeCommunities({ missing: true, reason: String(e) }); })
    .finally(() => { loaded = true; if (!ac.signal.aborted) render(); });
  record('communities_view');
  return { destroy() { ac.abort(); el.innerHTML = ''; } };
}
