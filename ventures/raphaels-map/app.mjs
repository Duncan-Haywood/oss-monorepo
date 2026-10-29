// @ts-check
// Router and shared context. Hash routes (#explore, #compare?ids=08013,08031)
// keep every view shareable; preferences (age band, weights, mode,
// origin/radius) persist in localStorage behind try/catch.
import { createLoader } from './data.mjs';
import * as fmt from './format.mjs';
import { record, setUsageOptOut, usageOptedOut } from './usage.mjs';
import { AGE_BANDS, MODES } from './score.mjs';

export const VIEWS = ['home', 'explore', 'compare', 'rank', 'surveys', 'communities', 'toolkit', 'methodology', 'intl'];
export const VIEW_LABELS = {
  home: 'Home', explore: 'Explore map', compare: 'Compare', rank: 'Rank', surveys: 'Surveys',
  communities: 'Communities', toolkit: 'Toolkit', methodology: 'Methodology', intl: 'International',
};
/** Views written by another module owner; a failed import shows a placeholder. */
export const OPTIONAL_VIEWS = new Set(['communities', 'toolkit']);
export const PREFS_KEY = 'raphaels-map-prefs';

/**
 * '#compare?ids=08013,08031' -> {view: 'compare', params: {ids: '08013,08031'}}
 * @param {string} hash
 */
export function parseHash(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const q = h.indexOf('?');
  const name = decodeURIComponent(q < 0 ? h : h.slice(0, q)).trim().toLowerCase();
  /** @type {Record<string, string>} */
  const params = {};
  if (q >= 0) {
    for (const part of h.slice(q + 1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const k = safeDecode(eq < 0 ? part : part.slice(0, eq));
      const v = eq < 0 ? '' : safeDecode(part.slice(eq + 1));
      if (k) params[k] = v;
    }
  }
  return { view: VIEWS.includes(name) ? name : 'home', params };
}

function safeDecode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

/** Inverse of parseHash. Commas stay readable. Empty and null params are dropped. */
export function buildHash(view, params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2C/gi, ',')}`);
  return `#${view}${parts.length ? `?${parts.join('&')}` : ''}`;
}

/** Comma list param -> unique, cleaned ids. */
export function idList(s, max = 10) {
  return [...new Set(String(s || '').split(',').map((x) => x.trim()).filter((x) => /^m?\d{2,5}$/.test(x)))].slice(0, max);
}

export const DEFAULT_PREFS = Object.freeze({
  band: '20_24',
  mode: 'volume',
  weights: { ...MODES.volume.weights },
  minDims: 2,
  normalization: 'percentile',
  includeProxies: false,
  origin: null,
  radius: null,
  compare: [],
});

/** Validate stored preferences; anything odd falls back to the default. */
export function sanitizePrefs(p) {
  const d = DEFAULT_PREFS;
  const o = p && typeof p === 'object' ? p : {};
  const weights = { ...d.weights };
  if (o.weights && typeof o.weights === 'object') {
    for (const k of Object.keys(weights)) {
      const v = Number(o.weights[k]);
      if (Number.isFinite(v)) weights[k] = Math.min(1, Math.max(0, v));
    }
  }
  const radius = Number(o.radius);
  return {
    band: AGE_BANDS.some((b) => b.id === o.band) ? o.band : d.band,
    mode: o.mode in MODES ? o.mode : d.mode,
    weights,
    minDims: [1, 2, 3, 4].includes(Number(o.minDims)) ? Number(o.minDims) : d.minDims,
    normalization: o.normalization === 'log_minmax' ? 'log_minmax' : 'percentile',
    includeProxies: o.includeProxies === true,
    origin: typeof o.origin === 'string' && /^\d{5}$/.test(o.origin) ? o.origin : null,
    radius: Number.isFinite(radius) && radius > 0 && radius <= 3000 ? radius : null,
    compare: Array.isArray(o.compare) ? idList(o.compare.join(',')) : [],
  };
}

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(PREFS_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizePrefs(null);
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    if (storage) storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage is optional */
  }
}

/**
 * Create the shared context and router. Browser only.
 * @param {{root?: Document, data?: ReturnType<typeof createLoader>}} [o]
 */
export function startApp({ root = document, data = createLoader() } = {}) {
  /** @type {Map<string, any>} */
  const mounted = new Map();
  const ctx = {
    data,
    fmt,
    record,
    state: { ...parseHash(location.hash), prefs: loadPrefs() },
    /**
     * @param {{view?: string, params?: Record<string, any>, prefs?: Record<string, any>}} patch
     * @param {{replace?: boolean, mergeParams?: boolean, silent?: boolean}} [o]
     */
    setState(patch, { replace = true, mergeParams = true, silent = false } = {}) {
      const prev = ctx.state;
      const view = patch.view && VIEWS.includes(patch.view) ? patch.view : prev.view;
      let params = patch.view && patch.view !== prev.view ? { ...(patch.params || {}) } : mergeParams ? { ...prev.params, ...(patch.params || {}) } : { ...(patch.params || {}) };
      params = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
      const prefs = patch.prefs ? sanitizePrefs({ ...prev.prefs, ...patch.prefs }) : prev.prefs;
      if (patch.prefs) savePrefs(prefs);
      ctx.state = { view, params, prefs };
      const hash = buildHash(view, params);
      if (hash !== location.hash) {
        try {
          history[replace && view === prev.view ? 'replaceState' : 'pushState'](null, '', hash);
        } catch {
          location.hash = hash;
        }
      }
      if (!silent) render();
    },
  };

  const nav = root.querySelector('#nav');
  async function render() {
    const { view } = ctx.state;
    for (const v of VIEWS) {
      const sec = root.getElementById(`view-${v}`);
      if (sec) sec.hidden = v !== view;
    }
    nav?.querySelectorAll('a[data-view]').forEach((a) => {
      if (a.getAttribute('data-view') === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const sec = root.getElementById(`view-${view}`);
    if (!sec) return;
    try {
      if (!mounted.has(view)) {
        mounted.set(view, null);
        sec.setAttribute('aria-busy', 'true');
        let mod;
        try {
          mod = await import(`./${view}.mjs`);
        } catch (err) {
          sec.innerHTML = OPTIONAL_VIEWS.has(view)
            ? `<h2>${fmt.esc(VIEW_LABELS[view])}</h2><div class="empty" role="status"><p>This part of the tool is still being built and is not available in this copy yet.</p></div>`
            : `<div class="empty" role="alert"><p>This view could not be loaded (${fmt.esc(err && err.message ? err.message : err)}). Reload the page to try again.</p></div>`;
          sec.removeAttribute('aria-busy');
          return;
        }
        mounted.set(view, mod);
        await mod.mount(sec, ctx);
        sec.removeAttribute('aria-busy');
      } else {
        const mod = mounted.get(view);
        if (mod && typeof mod.update === 'function') await mod.update(ctx);
      }
    } catch (err) {
      sec.removeAttribute('aria-busy');
      const box = root.createElement('div');
      box.className = 'empty';
      box.setAttribute('role', 'alert');
      box.textContent = `Something went wrong drawing this view: ${err && err.message ? err.message : err}`;
      sec.prepend(box);
      console.error(err);
    }
    syntheticBanner();
  }

  function syntheticBanner() {
    const el = root.getElementById('synthetic-banner');
    if (!el) return;
    const paths = data.syntheticPaths();
    el.hidden = !paths.length;
    if (paths.length) el.textContent = `Test data: ${paths.length} loaded file(s) declare themselves synthetic. None of these numbers are real statistics.`;
  }

  window.addEventListener('hashchange', () => {
    const next = parseHash(location.hash);
    if (next.view !== ctx.state.view) record(`view_${next.view}`);
    ctx.state = { ...next, prefs: ctx.state.prefs };
    render();
  });

  const opt = root.getElementById('usage-optout');
  if (opt) {
    const sync = () => { opt.textContent = usageOptedOut() ? 'Turn anonymous counting back on' : 'Turn anonymous counting off'; };
    sync();
    opt.addEventListener('click', () => { setUsageOptOut(!usageOptedOut()); sync(); });
  }
  record('app_opened');
  record(`view_${ctx.state.view}`);
  render();
  return ctx;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('app-root')) {
  startApp();
}
