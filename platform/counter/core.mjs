// The counter's pure logic, with no Node imports, so the same rules run in the
// Node server (`counter.mjs`) and in the Cloudflare Worker (`platform/edge/`).
// See `counter.mjs` for what is stored and what is refused, and why.

export const SLUG_RE = /^[a-z0-9][a-z0-9._/-]{0,119}$/;
export const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests|httpclient/i;
export const MAX_BODY = 256;
// Distribution-channel tags a page may report (`?ref=<tag>`), kept here so the
// image stays one file. `platform/distribution/attribution.mjs` maps each
// channel to its tag, and its test fails if the two lists drift apart.
export const REFS = Object.freeze(['android', 'bluesky', 'devto', 'gh-action', 'ghcr', 'hashnode', 'homebrew', 'ios', 'mastodon', 'mcp', 'npm', 'pypi', 'release', 'vscode', 'webext', 'wordpress']);
// `:` is outside SLUG_RE, so a channel key can never collide with a page slug.
export const REF_KEY = 'ref:';

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Pure decision: should this request be counted, and under which slug? */
export function classify({ method, url, headers = {}, body = '' }) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  if (method !== 'POST' || url.split('?')[0] !== '/hit') return { count: false, reason: 'route' };
  if (h.dnt === '1' || h['sec-gpc'] === '1') return { count: false, reason: 'opted-out' };
  if (BOT_RE.test(h['user-agent'] || '')) return { count: false, reason: 'bot' };
  if (body.length > MAX_BODY) return { count: false, reason: 'size' };
  let slug;
  let ref;
  try {
    ({ p: slug, r: ref } = JSON.parse(body));
  } catch {
    return { count: false, reason: 'body' };
  }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) {
    return { count: false, reason: 'slug' };
  }
  // A channel tag outside the closed list is dropped, not refused: the page
  // load still happened, only its attribution is unknown.
  return REFS.includes(ref) ? { count: true, slug, ref } : { count: true, slug };
}

export class Tally {
  constructor({ maxPerSlugPerDay = 20000, initial = {} } = {}) {
    this.maxPerSlugPerDay = maxPerSlugPerDay;
    this.days = structuredClone(initial);
    this.dirty = false;
  }

  add(slug, day = utcDay()) {
    const d = (this.days[day] ||= {});
    if ((d[slug] || 0) >= this.maxPerSlugPerDay) return false;
    d[slug] = (d[slug] || 0) + 1;
    this.dirty = true;
    return true;
  }

  /** Days on or after `since` (YYYY-MM-DD), in date order. */
  since(since = '0000-00-00') {
    return Object.fromEntries(
      Object.keys(this.days).sort().filter((d) => d >= since).map((d) => [d, this.days[d]]),
    );
  }
}
