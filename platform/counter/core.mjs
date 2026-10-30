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

// Extra per-day breakdowns of the same counted page loads (never added to the
// page totals): the visitor's country as Cloudflare reports it (`geo:US`), and
// a device class read from the browser string (`dev:mobile`). The country code
// and the class are all that is kept; the address and the browser string are not.
export const GEO_KEY = 'geo:';
export const DEVICE_KEY = 'dev:';
export const DEVICES = Object.freeze(['desktop', 'mobile', 'tablet']);
// Beacons from self-declared crawlers and agents are not page loads, but which
// ones run the page's script, and on which pages, is worth knowing for search
// and AI-answer visibility: `bot:<class>` per day, `botpage:<slug>` per page.
// Only crawlers that execute JavaScript can ever reach these; most AI crawlers
// fetch the HTML and never run it (`platform/edge/README.md`, "What crawler
// counts can and cannot see").
export const BOT_KEY = 'bot:';
export const BOT_PAGE_KEY = 'botpage:';
// First match wins, so the specific agents come before the generic patterns.
export const BOT_CLASSES = Object.freeze([
  ['googlebot', /googlebot|google-inspectiontool|googleother|adsbot-google|mediapartners-google|storebot-google/i],
  ['bingbot', /bingbot|bingpreview|msnbot|adidxbot/i],
  ['applebot', /applebot/i],
  ['duckduckbot', /duckduckbot|duckassistbot/i],
  ['yandexbot', /yandex/i],
  ['baiduspider', /baiduspider/i],
  ['gptbot', /gptbot/i],
  ['oai-searchbot', /oai-searchbot/i],
  ['chatgpt-user', /chatgpt-user/i],
  ['claudebot', /claudebot|claude-searchbot|anthropic-ai/i],
  ['claude-user', /claude-user/i],
  ['perplexitybot', /perplexitybot/i],
  ['perplexity-user', /perplexity-user/i],
  ['ccbot', /ccbot/i],
  ['bytespider', /bytespider/i],
  ['amazonbot', /amazonbot/i],
  ['meta', /meta-externalagent|meta-externalfetcher|facebookexternalhit|facebookbot/i],
  ['petalbot', /petalbot/i],
  ['semrushbot', /semrushbot/i],
  ['ahrefsbot', /ahrefsbot/i],
  ['lighthouse', /lighthouse|pagespeed|gtmetrix/i],
  ['headless', /headless|phantomjs|puppeteer|playwright|selenium/i],
  ['script', /curl|wget|python-requests|httpclient|go-http-client|node-fetch|axios/i],
]);
export const BOTS = Object.freeze([...BOT_CLASSES.map(([c]) => c), 'other']);

/** A crawler/agent class for a browser string, or '' for an ordinary browser. */
export function botClass(ua = '') {
  ua = String(ua);
  for (const [cls, re] of BOT_CLASSES) if (re.test(ua)) return cls;
  return BOT_RE.test(ua) ? 'other' : '';
}

/** 'mobile', 'tablet' or 'desktop' from a browser string. iPadOS reports a Mac, so reads as desktop. */
export function deviceClass(ua = '') {
  ua = String(ua);
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** An ISO country code as Cloudflare's `request.cf.country` gives it (XX unknown, T1 Tor), or ''. */
export function countryCode(c) {
  return typeof c === 'string' && /^[A-Z][A-Z0-9]$/.test(c) ? c : '';
}

/** True for a page slug, false for any `prefix:` breakdown key (ref, src, geo, dev, bot, botpage). */
export function isPageKey(key) {
  return !String(key).includes(':');
}

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
  const bot = botClass(h['user-agent'] || '');
  if (body.length > MAX_BODY) return { count: false, reason: bot ? 'bot' : 'size', ...(bot && { bot }) };
  let slug;
  let ref;
  let src;
  try {
    ({ p: slug, r: ref, s: src } = JSON.parse(body));
  } catch {
    return { count: false, reason: bot ? 'bot' : 'body', ...(bot && { bot }) };
  }
  const slugOk = typeof slug === 'string' && SLUG_RE.test(slug) && !slug.includes('..');
  // A crawler's beacon is not a page load. It is reported back, with the page
  // when that is valid, so a server can keep the separate `bot:` tallies.
  if (bot) return { count: false, reason: 'bot', bot, ...(slugOk && { slug }) };
  if (!slugOk) return { count: false, reason: 'slug' };
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
