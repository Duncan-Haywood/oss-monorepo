// Sends the real HTTP request(s) this check depends on: one GET to the URL a
// caller names, following redirects itself so the report can say how many
// hops it took, then -- only when the page carries exactly one absolute,
// non-self-referencing canonical link -- a second GET to that canonical URL
// to see whether it actually resolves to a usable, indexable page.
//
// Node's built-in http/https clients are used deliberately, not fetch() from
// a browser tab: reading another origin's response body and headers from
// inside a page is CORS-gated, and most sites set no
// Access-Control-Allow-Origin at all, so a browser tab could not reliably
// read this evidence even for a URL you own. That is the same "browser
// can't do the full check itself" split `cors-misconfig-check` and
// `security-headers-check` already document, for a different underlying
// reason each time.
//
// This module only ever talks to the URL(s) a caller names (the target, and
// at most one canonical-URL follow-up). It makes no other network call,
// reads no local files, and sends nothing anywhere else.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2_000_000; // only <head> matters; no real page needs more to find it
const USER_AGENT =
  'canonical-tag-check/1 (+https://duncan-haywood.github.io/monorepo-projects/canonical-tag-check/)';

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  if (value == null) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function singleGet(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, status: null, headers: {}, body: '', error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, headers: {}, body: '', error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(
      parsed,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' }, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          if (size >= MAX_BODY_BYTES) return;
          chunks.push(chunk);
          size += chunk.length;
        });
        res.on('end', () => {
          finish({
            ok: true,
            status: res.statusCode ?? null,
            headers: {
              location: headerValue(res.headers, 'location'),
              'x-robots-tag': headerValue(res.headers, 'x-robots-tag'),
              'content-type': headerValue(res.headers, 'content-type'),
            },
            body: Buffer.concat(chunks).toString('utf8'),
            error: null,
          });
        });
        res.on('error', (err) => finish({ ok: false, status: res.statusCode ?? null, headers: {}, body: '', error: err.message }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, headers: {}, body: '', error: err.message }));
    req.end();
  });
}

/**
 * GET `url`, following up to MAX_REDIRECTS 3xx `Location` redirects itself
 * (Node's http/https clients do not follow redirects automatically). Returns
 * the final response plus how many hops it took to get there.
 */
export async function fetchFollowingRedirects(url, opts = {}) {
  let current = url;
  let redirectCount = 0;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await singleGet(current, opts);
    if (!res.ok) {
      return { ...res, requestedUrl: url, finalUrl: current, redirectCount };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      let next;
      try {
        next = new URL(res.headers.location, current).toString();
      } catch {
        return { ...res, requestedUrl: url, finalUrl: current, redirectCount };
      }
      current = next;
      redirectCount += 1;
      continue;
    }
    return { ...res, requestedUrl: url, finalUrl: current, redirectCount };
  }
  return {
    ok: false,
    status: null,
    headers: {},
    body: '',
    error: 'too many redirects',
    requestedUrl: url,
    finalUrl: current,
    redirectCount,
  };
}

function extractHead(html) {
  const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html || '');
  return m ? m[1] : html || '';
}

function attrValue(match) {
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_ATTR_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const META_ROBOTS_TAG_RE = /<meta\b[^>]*\bname\s*=\s*(?:"robots"|'robots')[^>]*>/gi;
const CONTENT_ATTR_RE = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

/** Every canonical `<link>` tag found in the document's `<head>`, in
 * document order, as `{ href, raw }`. `rel` is matched case-insensitively
 * and by exact token (a `rel="alternate canonical"` list still counts;
 * `rel="noncanonical"` does not). */
export function extractCanonicalLinks(html) {
  const out = [];
  const head = extractHead(html);
  for (const tagMatch of head.matchAll(LINK_TAG_RE)) {
    const tag = tagMatch[0];
    const rel = attrValue(tag.match(REL_ATTR_RE));
    if (!rel) continue;
    const rels = rel.toLowerCase().trim().split(/\s+/);
    if (!rels.includes('canonical')) continue;
    out.push({ href: attrValue(tag.match(HREF_ATTR_RE)), raw: tag });
  }
  return out;
}

/** Every `<meta name="robots" content="...">` tag's content, joined with
 * ", " -- or null if none is present. */
export function extractMetaRobots(html) {
  const head = extractHead(html);
  const contents = [];
  for (const tagMatch of head.matchAll(META_ROBOTS_TAG_RE)) {
    const content = attrValue(tagMatch[0].match(CONTENT_ATTR_RE));
    if (content) contents.push(content);
  }
  return contents.length ? contents.join(', ') : null;
}

function normalizeUrl(u) {
  try {
    const p = new URL(u);
    p.hash = '';
    if ((p.protocol === 'http:' && p.port === '80') || (p.protocol === 'https:' && p.port === '443')) p.port = '';
    return p.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

/**
 * Fetches `targetUrl`, extracts its canonical link tag(s) and meta-robots
 * directive, and -- only when the page names exactly one absolute,
 * non-self-referencing canonical -- fetches that URL too, to see whether it
 * actually resolves to a usable, indexable page.
 *
 * @returns {{ target: string, page: object, canonicalTarget: object|null }}
 */
export async function runProbe(targetUrl, opts = {}) {
  const fetched = await fetchFollowingRedirects(targetUrl, opts);
  const canonicalLinks = fetched.ok ? extractCanonicalLinks(fetched.body) : [];
  const metaRobots = fetched.ok ? extractMetaRobots(fetched.body) : null;

  const page = {
    requestedUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    redirectCount: fetched.redirectCount,
    ok: fetched.ok,
    status: fetched.status,
    error: fetched.error,
    xRobotsTag: fetched.headers?.['x-robots-tag'] ?? null,
    metaRobots,
    canonicalLinks,
  };

  let canonicalTarget = null;
  if (fetched.ok && canonicalLinks.length === 1 && canonicalLinks[0].href) {
    let abs = null;
    try {
      abs = new URL(canonicalLinks[0].href, fetched.finalUrl).toString();
    } catch {
      abs = null;
    }
    if (abs && normalizeUrl(abs) !== normalizeUrl(fetched.finalUrl)) {
      const target = await fetchFollowingRedirects(abs, opts);
      canonicalTarget = {
        requestedUrl: abs,
        finalUrl: target.finalUrl,
        redirectCount: target.redirectCount,
        ok: target.ok,
        status: target.status,
        error: target.error,
        xRobotsTag: target.headers?.['x-robots-tag'] ?? null,
        metaRobots: target.ok ? extractMetaRobots(target.body) : null,
      };
    }
  }

  return { target: targetUrl, page, canonicalTarget };
}
