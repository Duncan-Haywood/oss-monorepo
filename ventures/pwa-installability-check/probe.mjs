// Fetches the real, live data this check depends on: the page's HTML (to
// find its `<link rel="manifest">`), the manifest.json it points at, and
// each icon URL the manifest lists. Everything here is a plain, unauthenticated
// GET request using Node's built-in fetch() -- no browser, no headless
// Chrome, no Lighthouse/Puppeteer dependency.
//
// This module only ever talks to the one page URL a caller names, the
// manifest URL that page's own HTML names, and the icon URLs that manifest
// itself lists. It makes no other network call, reads no local files, and
// sends nothing anywhere else.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'pwa-installability-check/1 (+https://duncan-haywood.github.io/monorepo-projects/pwa-installability-check/)';

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      ok: true,
      status: res.status,
      contentType: res.headers.get('content-type') ?? null,
      finalUrl: res.url || url,
      body,
      error: null,
    };
  } catch (err) {
    return { ok: false, status: null, contentType: null, finalUrl: url, body: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A lightweight existence/type check for an icon URL: does it respond, with
 * what status, and what content-type. Reads and discards the body (some
 * servers answer HEAD with a 405 or lie about content-length on HEAD, so a
 * real GET is the more honest signal here; icons are small).
 */
async function fetchIconMeta(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*' },
      signal: controller.signal,
    });
    // Drain the body without holding it all in memory unnecessarily.
    if (res.body) {
      // eslint-disable-next-line no-unused-vars
      for await (const _chunk of res.body) {
        /* discard */
      }
    }
    return {
      ok: true,
      status: res.status,
      contentType: res.headers.get('content-type') ?? null,
      error: null,
    };
  } catch (err) {
    return { ok: false, status: null, contentType: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** First `<link rel="manifest">` tag's href in `html`, case- and
 * attribute-order-insensitive. Returns the raw href string, unresolved. */
export function findManifestHref(html) {
  const linkRe = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0];
    if (!/rel\s*=\s*["']?\s*manifest\s*["']?/i.test(tag)) continue;
    const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (!hrefMatch) continue;
    return hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? null;
  }
  return null;
}

/**
 * Runs the full probe against `pageUrl`: fetches the page, finds and fetches
 * the manifest, parses it, and fetches every icon it lists. Never throws --
 * every stage that can fail records its own `ok`/`error` and the pipeline
 * stops cleanly at the first missing link, since nothing later than a
 * missing manifest can be checked at all.
 */
export async function runProbe(pageUrl, opts = {}) {
  let target;
  try {
    target = new URL(pageUrl);
  } catch (err) {
    return {
      pageUrl,
      secure: null,
      page: { ok: false, status: null, error: `invalid URL: ${err.message}` },
      manifestHref: null,
      manifestUrl: null,
      manifest: { ok: false, status: null, error: null },
      manifestJson: null,
      parseError: null,
      icons: [],
    };
  }

  const secure = target.protocol === 'https:' || target.hostname === 'localhost' || target.hostname === '127.0.0.1';

  const page = await fetchText(pageUrl, opts);
  const result = {
    pageUrl,
    secure,
    page: { ok: page.ok, status: page.status, contentType: page.contentType, error: page.error },
    manifestHref: null,
    manifestUrl: null,
    manifest: { ok: false, status: null, contentType: null, error: null },
    manifestJson: null,
    parseError: null,
    icons: [],
  };

  if (!page.ok) return result;

  const manifestHref = findManifestHref(page.body ?? '');
  result.manifestHref = manifestHref;
  if (!manifestHref) return result;

  let manifestUrl;
  try {
    manifestUrl = new URL(manifestHref, page.finalUrl || pageUrl).toString();
  } catch (err) {
    result.parseError = `manifest href is not a resolvable URL: ${err.message}`;
    return result;
  }
  result.manifestUrl = manifestUrl;

  const manifest = await fetchText(manifestUrl, opts);
  result.manifest = { ok: manifest.ok, status: manifest.status, contentType: manifest.contentType, error: manifest.error };
  if (!manifest.ok || manifest.status < 200 || manifest.status >= 300) return result;

  let json;
  try {
    json = JSON.parse(manifest.body);
  } catch (err) {
    result.parseError = err.message;
    return result;
  }
  result.manifestJson = json;

  const iconEntries = Array.isArray(json.icons) ? json.icons : [];
  result.icons = await Promise.all(
    iconEntries.map(async (icon) => {
      const src = typeof icon?.src === 'string' ? icon.src : null;
      let resolvedUrl = null;
      let resolveError = null;
      if (src) {
        try {
          resolvedUrl = new URL(src, manifestUrl).toString();
        } catch (err) {
          resolveError = err.message;
        }
      }
      const fetchResult = resolvedUrl
        ? await fetchIconMeta(resolvedUrl, opts)
        : { ok: false, status: null, contentType: null, error: resolveError ?? 'no src' };
      return {
        src,
        resolvedUrl,
        sizes: typeof icon?.sizes === 'string' ? icon.sizes : null,
        type: typeof icon?.type === 'string' ? icon.type : null,
        purpose: typeof icon?.purpose === 'string' ? icon.purpose : null,
        fetch: fetchResult,
      };
    }),
  );

  return result;
}
