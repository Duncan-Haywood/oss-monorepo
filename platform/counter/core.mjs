// The counter's pure logic, with no Node imports, so the same rules run in the
// Node server (`counter.mjs`) and in the Cloudflare Worker (`platform/edge/`).
// See `counter.mjs` for what is stored and what is refused, and why.

export const SLUG_RE = /^[a-z0-9][a-z0-9._/-]{0,119}$/;
export const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests|httpclient/i;
export const MAX_BODY = 256;
// Distribution-channel tags a page may report (`?ref=<tag>`), kept here so the
// image stays one file. `platform/distribution/attribution.mjs` maps each
// channel to its tag, and its test fails if the two lists drift apart.
export const REFS = Object.freeze(['android', 'bluesky', 'desktop', 'devto', 'email', 'facebook', 'gh-action', 'ghcr', 'hashnode', 'hn', 'homebrew', 'instagram', 'ios', 'linkedin', 'mastodon', 'mcp', 'medium', 'npm', 'pypi', 'reddit', 'release', 'substack', 'threads', 'tiktok', 'vscode', 'webext', 'wordpress', 'x', 'youtube']);
// `:` is outside SLUG_RE, so a channel key can never collide with a page slug.
export const REF_KEY = 'ref:';
// Referring-site classes. The page maps the referrer's hostname to one of
// these in the browser (`sourceOf`, inlined into the site's shared chrome) and
// sends only the class. `SOURCE_HOSTS` matches an exact host (after `www.`),
// `SOURCE_LABELS` any dot-separated label but the last, so google.co.uk and
// news.google.com both read as `google`. Anything else is `other`.
export const SOURCE_HOSTS = Object.freeze({
  't.co': 'x', 'x.com': 'x', 'twitter.com': 'x', 'news.ycombinator.com': 'hackernews',
  'bsky.app': 'bluesky', 'dev.to': 'devto', 'lobste.rs': 'lobsters', 'chat.openai.com': 'chatgpt',
  'copilot.microsoft.com': 'copilot', 'gemini.google.com': 'gemini',
});
export const SOURCE_LABELS = Object.freeze({
  google: 'google', bing: 'bing', duckduckgo: 'duckduckgo', yahoo: 'yahoo', ecosia: 'ecosia',
  brave: 'brave', kagi: 'kagi', yandex: 'yandex', baidu: 'baidu', startpage: 'startpage',
  chatgpt: 'chatgpt', perplexity: 'perplexity', claude: 'claude', reddit: 'reddit',
  github: 'github', linkedin: 'linkedin', facebook: 'facebook', instagram: 'instagram',
  youtube: 'youtube', mastodon: 'mastodon', medium: 'medium', substack: 'substack',
  stackoverflow: 'stackoverflow', stackexchange: 'stackoverflow', npmjs: 'npm', pypi: 'pypi',
});
export const SOURCES = Object.freeze([...new Set([...Object.values(SOURCE_HOSTS), ...Object.values(SOURCE_LABELS), 'other'])].sort());
export const SOURCE_KEY = 'src:';

/** Hostname -> source class, or '' for none. The chrome script inlines this function's source, so it stays ES5. */
export function sourceOf(host, hosts, labels) {
  host = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!host) return '';
  var own = Object.prototype.hasOwnProperty;
  if (own.call(hosts, host)) return hosts[host];
  var parts = host.split('.');
  for (var i = parts.length - 2; i >= 0; i--) if (own.call(labels, parts[i])) return labels[parts[i]];
  return 'other';
}

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
  let src;
  try {
    ({ p: slug, r: ref, s: src } = JSON.parse(body));
  } catch {
    return { count: false, reason: 'body' };
  }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) {
    return { count: false, reason: 'slug' };
  }
  // A channel tag or source class outside its closed list is dropped, not
  // refused: the page load still happened, only its attribution is unknown.
  const out = { count: true, slug };
  if (REFS.includes(ref)) out.ref = ref;
  if (SOURCES.includes(src)) out.src = src;
  return out;
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
