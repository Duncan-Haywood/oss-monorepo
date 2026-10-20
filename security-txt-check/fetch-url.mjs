// Real HTTP(S) for the CLI. Node's built-in http/https clients are used
// deliberately rather than the global fetch(): explicit control over the
// response-size cap, the timeout, and the redirect chain -- the same shape
// sitemap-lastmod-freshness-check/fetch-url.mjs and cors-misconfig-check/
// probe.mjs use for their own probes.
//
// This module only ever talks to the host a caller names. It makes no other
// network call, reads no local files, and sends nothing anywhere else --
// nothing goes through this portfolio.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
// A security.txt is a short text file. The cap is deliberately small: a
// multi-megabyte response to this path is a misconfigured server or an HTML
// error page, and reading all of it helps nobody.
const MAX_BYTES = 256 * 1024;
const USER_AGENT =
  'security-txt-check/1 (+https://duncan-haywood.github.io/monorepo-projects/security-txt-check/)';

/**
 * Turns whatever the user typed into the two URLs RFC 9116 says to look at,
 * in the order it says to look at them.
 *
 * Accepts a bare hostname ("example.com"), an origin, or a full URL. When the
 * user names a specific path, that path is used alone and no fallback is
 * tried -- they asked about that file, not about the site's convention.
 *
 * @returns {{candidates: string[]}|{error: string}}
 */
export function candidateUrls(input) {
  const raw = String(input ?? '').trim();
  if (raw === '') return { error: 'no target given' };

  let parsed;
  try {
    parsed = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`);
  } catch (err) {
    return { error: `invalid target: ${err.message}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `unsupported scheme: ${parsed.protocol}` };
  }

  const explicitPath = parsed.pathname !== '/' && parsed.pathname !== '';
  if (explicitPath) return { candidates: [parsed.toString()] };

  return {
    candidates: [
      new URL('/.well-known/security.txt', parsed).toString(),
      new URL('/security.txt', parsed).toString(),
    ],
  };
}

/**
 * One GET request, returning the body, the served Content-Type, and the URL
 * that actually answered after redirects. Resolves rather than rejects on any
 * failure -- never throws.
 *
 * @returns {Promise<{ok: boolean, status: number|null, url: string, body: string|null, contentType: string|null, error: string|null}>}
 */
export function fetchText(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ ok: false, status: null, url: targetUrl, body: null, contentType: null, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, url: targetUrl, body: null, contentType: null, error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { 'user-agent': USER_AGENT, accept: 'text/plain,*/*' };

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
          finish({ ok: false, status, url: targetUrl, body: null, contentType: null, error: 'too many redirects' });
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, parsed).toString();
        } catch (err) {
          finish({ ok: false, status, url: targetUrl, body: null, contentType: null, error: `invalid redirect location: ${err.message}` });
          return;
        }
        fetchText(nextUrl, { timeoutMs, redirectsLeft: redirectsLeft - 1 }).then(finish);
        return;
      }

      const contentType = res.headers['content-type'] ?? null;
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          finish({
            ok: Boolean(status) && status < 400,
            status,
            url: targetUrl,
            body: Buffer.concat(chunks).toString('utf8'),
            contentType,
            error: `truncated at ${MAX_BYTES} bytes`,
          });
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        finish({
          ok: Boolean(status) && status < 400,
          status,
          url: targetUrl,
          body: Buffer.concat(chunks).toString('utf8'),
          contentType,
          error: null,
        });
      });
      res.on('error', (err) => finish({ ok: false, status, url: targetUrl, body: null, contentType: null, error: err.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, url: targetUrl, body: null, contentType: null, error: err.message }));
    req.end();
  });
}
