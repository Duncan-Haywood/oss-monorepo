// Real HTTP(S) for the CLI. Node's built-in http/https clients are used
// deliberately, not the global fetch(): explicit control over the response-
// size cap, timeout, and (for `fetchHeaders`) stopping before the body is
// read, the way cors-misconfig-check/probe.mjs and
// hreflang-reciprocity-check/fetch-page.mjs do for their own probes.
//
// This module only ever talks to URLs a caller names -- the sitemap URL the
// user passed on the command line, and the <loc> URLs that sitemap's own
// entries name. It makes no other network call, reads no local files, and
// sends nothing anywhere else. It follows a small, bounded number of
// redirects (ordinary hosting behaviour) and gives up rather than following
// an unbounded chain.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB is generous for a sitemap (the protocol caps at 50,000 URLs / 50 MB uncompressed)
const USER_AGENT =
  'sitemap-lastmod-freshness-check/1 (+https://duncan-haywood.github.io/monorepo-projects/sitemap-lastmod-freshness-check/)';

/** Returns `{parsed}` or `{error}` -- never throws, so callers format one
 * consistent error string regardless of which of the two ways parsing a URL
 * can go wrong. */
function parseAndValidateUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    return { error: `invalid URL: ${err.message}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `unsupported scheme: ${parsed.protocol}` };
  }
  return { parsed };
}

/**
 * One GET request to `targetUrl`, returning the full body (capped). Used for
 * the sitemap document itself. Resolves rather than rejects on any failure.
 * Never throws.
 *
 * @returns {Promise<{ok: boolean, status: number|null, url: string, body: string|null, error: string|null}>}
 */
export function fetchBody(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve) => {
    const { parsed, error } = parseAndValidateUrl(targetUrl);
    if (error) {
      resolve({ ok: false, status: null, url: targetUrl, body: null, error });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { 'user-agent': USER_AGENT, accept: 'application/xml,text/xml,*/*' };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(parsed, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? null;

      if (status && status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          finish({ ok: false, status, url: targetUrl, body: null, error: 'too many redirects' });
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, parsed).toString();
        } catch (err) {
          finish({ ok: false, status, url: targetUrl, body: null, error: `invalid redirect location: ${err.message}` });
          return;
        }
        fetchBody(nextUrl, { timeoutMs, redirectsLeft: redirectsLeft - 1 }).then(finish);
        return;
      }

      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          finish({
            ok: true,
            status,
            url: targetUrl,
            body: Buffer.concat(chunks).toString('utf8'),
            error: `truncated at ${MAX_BYTES} bytes`,
          });
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        finish({ ok: true, status, url: targetUrl, body: Buffer.concat(chunks).toString('utf8'), error: null });
      });
      res.on('error', (err) => finish({ ok: false, status, url: targetUrl, body: null, error: err.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, url: targetUrl, body: null, error: err.message }));
    req.end();
  });
}

/**
 * Reads only the response headers of `targetUrl` -- the response body is
 * never consumed, so this is cheap to run against every URL a large sitemap
 * names. Parses the `Last-Modified` header into a `Date`, when present and
 * parseable.
 *
 * Uses GET rather than HEAD deliberately: some servers reply to HEAD with a
 * different (or absent) `Last-Modified` than they do to GET, and some reject
 * HEAD outright (405), so GET-and-stop-at-headers is the more broadly
 * compatible choice. Resolves rather than rejects on any failure. Never
 * throws.
 *
 * @returns {Promise<{ok: boolean, status: number|null, url: string, lastModified: Date|null, error: string|null}>}
 */
export function fetchHeaders(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve) => {
    const { parsed, error } = parseAndValidateUrl(targetUrl);
    if (error) {
      resolve({ ok: false, status: null, url: targetUrl, lastModified: null, error });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { 'user-agent': USER_AGENT, accept: '*/*' };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(parsed, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? null;

      if (status && status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        res.destroy();
        if (redirectsLeft <= 0) {
          finish({ ok: false, status, url: targetUrl, lastModified: null, error: 'too many redirects' });
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, parsed).toString();
        } catch (err) {
          finish({ ok: false, status, url: targetUrl, lastModified: null, error: `invalid redirect location: ${err.message}` });
          return;
        }
        fetchHeaders(nextUrl, { timeoutMs, redirectsLeft: redirectsLeft - 1 }).then(finish);
        return;
      }

      const raw = res.headers['last-modified'];
      let lastModified = null;
      if (raw) {
        const parsedDate = new Date(raw);
        if (!Number.isNaN(parsedDate.getTime())) lastModified = parsedDate;
      }
      // Stop as soon as the headers are in -- the body is never needed here,
      // and destroying the response now is what keeps this cheap at scale.
      res.destroy();
      finish({ ok: Boolean(status) && status < 400, status, url: targetUrl, lastModified, error: null });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, url: targetUrl, lastModified: null, error: err.message }));
    req.end();
  });
}
