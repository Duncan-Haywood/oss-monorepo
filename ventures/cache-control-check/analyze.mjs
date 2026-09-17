// Classifies one HTTP response's caching headers (real headers collected by
// probe.mjs's live network request, or pasted in by hand) into named
// HTTP-caching misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// The value here isn't reading a Cache-Control header -- curl -I does
// that. It's naming the handful of caching patterns that are genuinely
// well-documented facts about cache behaviour rather than style
// preferences: a `Vary: *` response that RFC 9111 defines as never
// cacheable by any shared or private cache, a `public` response that also
// sets a per-visitor cookie (a shared cache may hand one visitor's session
// cookie to the next visitor who hits the same URL), and three lower-
// severity notices for directive combinations that are contradictory or
// silently ignored rather than dangerous.

const STATIC_ASSET_EXTENSIONS = [
  '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf',
  '.mp4', '.webm', '.map',
];

/** Splits a Cache-Control header value into a directive map: a boolean
 * directive (no-store, no-cache, public, private, must-revalidate,
 * immutable) maps to `true`; a valued directive (max-age, s-maxage) maps
 * to its raw string value. Directive names are lowercased; values are not
 * (they are numbers here, so it does not matter). */
export function parseCacheControl(raw) {
  const directives = {};
  if (typeof raw !== 'string' || raw.trim() === '') return directives;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      directives[trimmed.toLowerCase()] = true;
    } else {
      directives[trimmed.slice(0, eq).trim().toLowerCase()] = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    }
  }
  return directives;
}

function looksLikeStaticAsset(path) {
  if (typeof path !== 'string') return false;
  const clean = path.split('?')[0].split('#')[0].toLowerCase();
  return STATIC_ASSET_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

function parseHttpDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function findingsFor(headers, { path, setCookie }) {
  const findings = [];
  const cc = parseCacheControl(headers['cache-control']);
  const vary = typeof headers.vary === 'string' ? headers.vary.trim() : null;
  const etag = typeof headers.etag === 'string' ? headers.etag.trim() : null;
  const hasCookies = Array.isArray(setCookie) && setCookie.length > 0;
  const hasCacheControl = Object.keys(cc).length > 0;
  const hasExpires = typeof headers.expires === 'string' && headers.expires.trim() !== '';

  if (vary === '*') {
    findings.push({
      id: 'vary-star',
      severity: 'danger',
      title: 'Vary: * makes this response uncacheable by any shared or private cache',
      detail:
        'RFC 9111 defines a response carrying "Vary: *" as never reusable from cache, for any request, by ' +
        'any HTTP/1.1-compliant cache -- browser or CDN. If this response also carries Cache-Control or ' +
        'Expires headers meant to make it cacheable, Vary: * overrides them entirely: nothing here is ever ' +
        'served from cache again, even for byte-identical requests.',
      evidenceHeader: `vary: ${vary}`,
    });
  }

  if (cc.public === true && hasCookies) {
    findings.push({
      id: 'public-with-set-cookie',
      severity: 'danger',
      title: 'Cache-Control: public alongside a Set-Cookie header',
      detail:
        'public tells every shared cache between this server and the visitor -- a CDN, a corporate proxy -- ' +
        'that it may store this response and serve it to a different visitor. This response also sets a ' +
        'cookie, which is normally scoped to the one visitor who received it. A shared cache that honours ' +
        '"public" and is not specifically configured to strip Set-Cookie on cache writes can serve visitor ' +
        "A's session cookie to visitor B on the next request for this URL.",
      evidenceHeader: `cache-control: ${headers['cache-control']}; set-cookie: ${setCookie[0]}${setCookie.length > 1 ? ` (+${setCookie.length - 1} more)` : ''}`,
    });
  }

  if (cc['no-store'] === true && cc['max-age'] !== undefined) {
    findings.push({
      id: 'no-store-with-max-age',
      severity: 'notice',
      title: 'Cache-Control has both no-store and max-age',
      detail:
        'no-store forbids any cache from storing this response at all, so a max-age directive alongside it ' +
        'is never consulted by a compliant cache -- there is nothing stored for it to apply to. This is not ' +
        'harmful, but it usually means a caching header was copied from a cacheable response and no-store ' +
        'was added on top without removing the now-meaningless max-age.',
      evidenceHeader: `cache-control: ${headers['cache-control']}`,
    });
  }

  if (hasExpires && hasCacheControl && cc['max-age'] !== undefined) {
    findings.push({
      id: 'expires-overridden-by-max-age',
      severity: 'notice',
      title: 'Expires is present but overridden by Cache-Control: max-age',
      detail:
        'When both are present, HTTP/1.1 and later caches use Cache-Control\'s max-age to compute freshness ' +
        'and ignore Expires entirely -- it is kept only for caches that predate HTTP/1.1. If the two headers ' +
        'disagree (a common drift when one is set by application code and the other by a proxy default), only ' +
        'an old cache will ever see the difference, and even then only Expires is honoured -- worth syncing or ' +
        'dropping Expires rather than leaving the two to drift.',
      evidenceHeader: `cache-control: ${headers['cache-control']}; expires: ${headers.expires}`,
    });
  }

  if (hasExpires && !cc['max-age']) {
    const expiresMs = parseHttpDate(headers.expires);
    const dateMs = parseHttpDate(headers.date);
    if (expiresMs !== null && dateMs !== null && expiresMs <= dateMs) {
      findings.push({
        id: 'expires-before-date',
        severity: 'notice',
        title: 'Expires is at or before this response\'s own Date header',
        detail:
          'Per RFC 9111, a response whose Expires is not later than its Date is already stale the moment it ' +
          'arrives -- every compliant cache must revalidate it before reuse, which for most practical purposes ' +
          'means it is never served from cache. This is sometimes intentional (a deliberate "always stale" ' +
          'marker some servers use in place of no-cache), but it usually means a computed Expires value drifted ' +
          "behind the server's own clock or a template default was never updated.",
        evidenceHeader: `date: ${headers.date}; expires: ${headers.expires}`,
      });
    }
  }

  if (etag && etag.startsWith('W/') && headers['accept-ranges'] && headers['accept-ranges'].toLowerCase() !== 'none') {
    findings.push({
      id: 'weak-etag-with-range-support',
      severity: 'notice',
      title: 'A weak ETag on a response that advertises byte-range support',
      detail:
        'RFC 9110 requires a strong validator for a conditional Range request -- a weak ETag (the "W/" prefix) ' +
        'cannot be used to validate a partial-content request, so a client resuming a download or seeking a ' +
        "media file cannot rely on this ETag to confirm the resource hasn't changed since the earlier bytes " +
        'were fetched. Worth a strong ETag (or Last-Modified, which range requests can also use) if this ' +
        'endpoint is meant to serve large files or streamed media.',
      evidenceHeader: `etag: ${headers.etag}; accept-ranges: ${headers['accept-ranges']}`,
    });
  }

  if (!hasCacheControl && !hasExpires && looksLikeStaticAsset(path)) {
    findings.push({
      id: 'missing-cache-control-static-asset',
      severity: 'notice',
      title: 'No Cache-Control or Expires on what looks like a static asset',
      detail:
        `The request path ("${path}") has a file extension typical of a static asset (script, stylesheet, ` +
        'image, font, or similar) that rarely changes per-deploy, but this response carries neither ' +
        'Cache-Control nor Expires. Without one, browsers fall back to heuristic freshness (commonly a ' +
        'fraction of the time since Last-Modified), which varies by browser and typically revalidates far ' +
        'sooner than a versioned or content-hashed asset needs to -- an explicit long max-age (paired with a ' +
        'content hash in the filename, if this asset is not itself versioned) is usually cheap to add and ' +
        'saves a real request on every repeat visit.',
      evidenceHeader: `path: ${path}; cache-control: (absent); expires: (absent)`,
    });
  }

  return findings;
}

function norm(value) {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {{ok: boolean, status: number|null, protocol: string|null, path: string|null,
 *   headers: object, setCookie: string[], error: string|null}} probe
 * @returns {{target: string, probe: object, findings: object[], dangerCount: number,
 *   noticeCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  const incomplete = p.ok === false;
  const headers = p.headers && typeof p.headers === 'object' ? p.headers : {};
  const setCookie = Array.isArray(p.setCookie) ? p.setCookie : [];

  const findings = incomplete ? [] : findingsFor(headers, { path: p.path ?? null, setCookie });

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    probe: {
      ok: p.ok !== false,
      status: p.status ?? null,
      protocol: p.protocol ?? null,
      path: p.path ?? null,
      headers: {
        'cache-control': norm(headers['cache-control']),
        expires: norm(headers.expires),
        date: norm(headers.date),
        age: norm(headers.age),
        vary: norm(headers.vary),
        etag: norm(headers.etag),
        'last-modified': norm(headers['last-modified']),
        'accept-ranges': norm(headers['accept-ranges']),
      },
      setCookie,
      error: norm(p.error),
    },
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
