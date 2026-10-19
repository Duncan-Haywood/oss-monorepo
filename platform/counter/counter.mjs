// A first-party, cookieless page-view counter for the GitHub Pages catalogue.
//
// WHY THIS EXISTS
//
// GitHub Pages serves static files and gives the repository owner no visitor
// numbers at all, so `portfolio/usage/usage.yaml` has carried
// `live_url_visitors: null` since the site went up. The owner asked on
// 2026-10-16 for a way to "measure users actually" on the Pages site, with the
// numbers committed to the repository, and without signing up for a stack of
// third-party accounts. A static host cannot receive a request, so a count
// needs exactly one always-on process somewhere. This is that process: about
// two hundred lines, no dependencies, runnable on any machine with Node.
//
// WHAT IT STORES, IN FULL
//
//   { "2026-10-16": { "hub": 41, "shop-rate-calculator": 3, ... }, ... }
//
// One integer per (UTC day, page slug). Nothing else is ever written: no IP
// address, no user agent, no referrer, no cookie, no identifier, no timestamp
// finer than the day. A page reached through a distribution channel's link
// (`?ref=<tag>`) also adds one to `"ref:<tag>"` that day, with the tag taken
// from the closed list `REFS` below: which
// channel's link was followed, never who followed it. The page sends only its own slug, which is one of a
// known set the build writes (`data-pf-slug`), so the store cannot be used to
// smuggle free text. That is the payload `portfolio/usage/README.md` allows:
// events, never people.
//
// WHAT IT REFUSES
//
//   - requests carrying `DNT: 1` or `Sec-GPC: 1` (the page already stays
//     silent for those browsers; this is the server keeping the same promise);
//   - user agents that announce themselves as crawlers, so a sitemap crawl
//     does not read as an audience (the agent string is tested and dropped,
//     never stored);
//   - slugs outside `SLUG_RE`, bodies over 256 bytes, and any path but /hit;
//   - more than `maxPerSlugPerDay` hits on one slug in one day, so a script
//     hammering the endpoint caps out at a number that is visibly absurd
//     rather than silently plausible.
//
// The counts are an upper-bound tally of page loads by browsers that did not
// opt out. They are not people and must never be written up as people.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLUG_RE = /^[a-z0-9][a-z0-9._/-]{0,119}$/;
export const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests|httpclient/i;
export const MAX_BODY = 256;
// Distribution-channel tags a page may report (`?ref=<tag>`), kept here so the
// image stays one file. `platform/distribution/attribution.mjs` maps each
// channel to its tag, and its test fails if the two lists drift apart.
export const REFS = Object.freeze(['bluesky', 'devto', 'gh-action', 'ghcr', 'hashnode', 'homebrew', 'mastodon', 'mcp', 'npm', 'pypi', 'release', 'vscode', 'webext', 'wordpress']);
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

export function loadStore(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

export function saveStore(file, days) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(days, null, 1)}\n`);
  fs.renameSync(tmp, file);
}

/**
 * The HTTP server. `allowOrigin` is the Pages origin (scheme + host), which is
 * the only origin the browser lets call /hit; /counts is public because it is
 * aggregate by construction and is committed to a public repository anyway.
 */
export function createCounterServer({ tally, allowOrigin, now = () => new Date() }) {
  return http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': allowOrigin, vary: 'origin' };
    const url = req.url || '/';
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
      return res.end();
    }
    if (req.method === 'GET' && url.split('?')[0] === '/counts') {
      const since = new URL(url, 'http://x').searchParams.get('since') || '0000-00-00';
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      return res.end(JSON.stringify({ unit: 'page loads by browsers that did not opt out; not people', days: tally.since(since) }));
    }
    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok\n');
    }
    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (tooBig) return;
      body += chunk;
      if (body.length > MAX_BODY) tooBig = true;
    });
    req.on('end', () => {
      const verdict = classify({ method: req.method, url, headers: req.headers, body: tooBig ? 'x'.repeat(MAX_BODY + 1) : body });
      if (verdict.count) {
        const day = utcDay(now());
        if (tally.add(verdict.slug, day) && verdict.ref) tally.add(`${REF_KEY}${verdict.ref}`, day);
      }
      // 204 either way: a refusal tells a page nothing it could act on, and
      // an identical answer gives a prober nothing to tune against.
      res.writeHead(verdict.reason === 'route' ? 404 : 204, cors);
      res.end();
    });
  });
}

// CLI: COUNTER_ORIGIN=https://duncan-haywood.github.io node counter.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowOrigin = process.env.COUNTER_ORIGIN;
  if (!allowOrigin) {
    console.error('COUNTER_ORIGIN is required (the Pages origin, e.g. https://duncan-haywood.github.io)');
    process.exit(2);
  }
  const file = process.env.COUNTER_STORE || path.join(process.cwd(), 'counts.json');
  const port = Number(process.env.PORT || 8787);
  const tally = new Tally({ initial: loadStore(file) });
  const flush = () => {
    if (tally.dirty) {
      saveStore(file, tally.days);
      tally.dirty = false;
    }
  };
  setInterval(flush, 60_000).unref();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
  createCounterServer({ tally, allowOrigin }).listen(port, () => {
    console.log(`counter listening on :${port}, store ${file}, origin ${allowOrigin}`);
  });
}
