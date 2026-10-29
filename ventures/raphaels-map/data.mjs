// @ts-check
// Fetch and cache the published JSON in data/. Never throws: a file that is
// missing, unreadable or not JSON resolves to {missing: true, path, reason},
// so every view can render an empty state instead of breaking.
//
// There is deliberately no switch here that points the page at the test
// fixtures. Tests construct a loader with their own fetch; the end-to-end
// script injects fixtures with Playwright's page.route.

/**
 * @param {{base?: string, fetchImpl?: typeof fetch}} [opts]
 */
export function createLoader({ base = 'data/', fetchImpl } = {}) {
  /** @type {Map<string, Promise<any>>} */
  const cache = new Map();
  /** @type {Set<string>} */
  const synthetic = new Set();
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  /** @param {string} path */
  async function load(path) {
    if (!doFetch) return { missing: true, path, reason: 'no fetch available' };
    let res;
    try {
      res = await doFetch(base + path);
    } catch (err) {
      return { missing: true, path, reason: `network: ${err && err.message ? err.message : err}` };
    }
    if (!res || !res.ok) return { missing: true, path, reason: `HTTP ${res ? res.status : '?'}`, status: res ? res.status : 0 };
    let body;
    try {
      body = await res.json();
    } catch {
      return { missing: true, path, reason: 'not valid JSON' };
    }
    if (body === null || typeof body !== 'object') return { missing: true, path, reason: 'unexpected content' };
    if (body.synthetic === true) synthetic.add(path);
    return body;
  }

  return {
    base,
    /** @param {string} path */
    get(path) {
      if (!cache.has(path)) cache.set(path, load(path));
      return /** @type {Promise<any>} */ (cache.get(path));
    },
    /** Paths whose content declared itself synthetic test data. */
    syntheticPaths: () => [...synthetic],
    clear: () => cache.clear(),
  };
}

/** @param {any} x */
export const isMissing = (x) => !x || x.missing === true;

/**
 * The files most views need, loaded in parallel. Missing ones stay
 * {missing: true}.
 * @param {{get: (p: string) => Promise<any>}} data
 */
export async function loadCore(data) {
  const [sources, metrics, geos, county] = await Promise.all([
    data.get('sources.json'),
    data.get('metrics.json'),
    data.get('us/geographies.json'),
    data.get('us/county_observations.json'),
  ]);
  return { sources, metrics, geos, county };
}

/** Index helpers that tolerate missing files. */
export function metricIndex(metrics) {
  const out = new Map();
  if (!isMissing(metrics)) for (const m of metrics.metrics || []) out.set(m.metric_id, m);
  return out;
}

export function sourceIndex(sources) {
  const out = new Map();
  if (!isMissing(sources)) for (const s of sources.sources || []) out.set(s.id, s);
  return out;
}

export function countyIndex(geos) {
  const out = new Map();
  if (!isMissing(geos)) for (const c of geos.counties || []) out.set(c.id, c);
  return out;
}

/** States that have at least one county in geographies.json, sorted by name. */
export function statesWithCounties(geos) {
  if (isMissing(geos)) return [];
  const have = new Set((geos.counties || []).map((c) => c.state));
  return (geos.states || []).filter((s) => have.has(s.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Great-circle distance in miles between two {lat, lon} points (county centres). */
export function milesBetween(a, b) {
  if (!a || !b || ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
