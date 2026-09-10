// Sends the one real HTTP request this check depends on: a GET to the
// target URL, reading back the response headers that decide whether -- and
// how -- a browser or CDN cache stores and reuses this response. Node's
// built-in http/https clients are used, and no redirect is followed
// automatically -- a 3xx response is reported as-is, with its own headers,
// rather than silently chasing the Location so a caller always knows
// exactly which response the report describes.
//
// This module only ever talks to the one target URL a caller names. It
// makes no other network call, reads no local files, and sends nothing
// anywhere else.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'cache-control-check/1 (+https://duncan-haywood.github.io/monorepo-projects/cache-control-check/)';

const HEADER_NAMES = [
  'cache-control',
  'expires',
  'date',
  'age',
  'vary',
  'etag',
  'last-modified',
  'accept-ranges',
];

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  if (value == null) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/**
 * One GET request to `targetUrl`. Resolves rather than rejects on any
 * failure so a caller never needs a try/catch around it.
 */
export function sendProbe(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ ok: false, status: null, protocol: null, path: null, headers: {}, setCookie: [], error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, protocol: null, path: null, headers: {}, setCookie: [], error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { 'user-agent': USER_AGENT, accept: 'text/html,*/*' };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(
      parsed,
      { method: 'GET', headers, timeout: timeoutMs },
      (res) => {
        res.on('data', () => {}); // headers are all this check needs; drain and discard the body
        res.on('end', () => {
          const out = {};
          for (const name of HEADER_NAMES) out[name] = headerValue(res.headers, name);
          const setCookie = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [];
          finish({
            ok: true,
            status: res.statusCode ?? null,
            protocol: parsed.protocol,
            path: parsed.pathname,
            headers: out,
            setCookie,
            error: null,
          });
        });
        res.on('error', (err) => finish({ ok: false, status: res.statusCode ?? null, protocol: parsed.protocol, path: parsed.pathname, headers: {}, setCookie: [], error: err.message }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, protocol: parsed.protocol, path: parsed?.pathname ?? null, headers: {}, setCookie: [], error: err.message }));
    req.end();
  });
}

/** Runs the single probe against `targetUrl` and returns the raw result
 * (same shape `analyze.mjs`'s `buildReport` expects). */
export async function runProbe(targetUrl, opts = {}) {
  return { target: targetUrl, ...(await sendProbe(targetUrl, opts)) };
}
