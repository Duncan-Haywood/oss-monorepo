// Sends the real HTTP requests this check depends on: five GET requests to
// one target URL, each with a different (or absent) Origin request header,
// reading back only the three CORS response headers that matter. Node's
// built-in http/https clients are used deliberately, not fetch(): fetch()
// enforces the same forbidden-header-name rule browsers do for `Origin` in
// some runtimes, and the whole point of a CLI here is that it is not a
// browser and is not bound by that restriction -- the same reason curl,
// Corsy, and every other CORS-testing tool are standalone clients rather
// than browser scripts.
//
// This module only ever talks to the one target URL a caller names. It
// makes no other network call, reads no local files, and sends nothing
// anywhere else.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'cors-misconfig-check/1 (+https://duncan-haywood.github.io/monorepo-projects/cors-misconfig-check/)';

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  if (value == null) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/**
 * One GET request to `targetUrl` with `originHeader` set as the Origin
 * request header (or omitted entirely when `originHeader` is null).
 * Resolves rather than rejects on any failure so a caller running several of
 * these never needs a try/catch per probe.
 */
export function sendProbe(targetUrl, originHeader, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ ok: false, status: null, headers: {}, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, headers: {}, error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { 'user-agent': USER_AGENT, accept: '*/*' };
    if (originHeader !== null) headers.origin = originHeader;

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
          finish({
            ok: true,
            status: res.statusCode ?? null,
            headers: {
              'access-control-allow-origin': headerValue(res.headers, 'access-control-allow-origin'),
              'access-control-allow-credentials': headerValue(res.headers, 'access-control-allow-credentials'),
              vary: headerValue(res.headers, 'vary'),
            },
            error: null,
          });
        });
        res.on('error', (err) => finish({ ok: false, status: res.statusCode ?? null, headers: {}, error: err.message }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, headers: {}, error: err.message }));
    req.end();
  });
}

/**
 * The five (label, Origin header) pairs this check always sends, derived
 * from the target so the prefix/suffix probes are meaningful for that exact
 * host. `randomOrigin` is injectable so tests get a fixed value instead of
 * a fresh random one every run.
 */
export function buildProbeSet(targetUrl, { randomOrigin } = {}) {
  const parsed = new URL(targetUrl);
  const targetOrigin = parsed.origin;
  const hostname = parsed.hostname;
  const nonce = randomOrigin ?? `https://cors-probe-${randomBytes(6).toString('hex')}.invalid`;

  return [
    { label: 'baseline', requestOrigin: null },
    { label: 'reflect', requestOrigin: nonce },
    { label: 'null-origin', requestOrigin: 'null' },
    { label: 'prefix-match', requestOrigin: `${targetOrigin}.attacker-controlled.invalid` },
    { label: 'suffix-match', requestOrigin: `https://evil-${hostname}` },
  ];
}

/**
 * Runs the full probe set against `targetUrl` and returns the raw results
 * (same shape `analyze.mjs`'s `buildReport` expects), run in parallel since
 * each probe is an independent, read-only GET to the same URL.
 */
export async function runProbes(targetUrl, opts = {}) {
  const set = buildProbeSet(targetUrl, opts);
  const results = await Promise.all(
    set.map(async ({ label, requestOrigin }) => ({
      label,
      requestOrigin,
      ...(await sendProbe(targetUrl, requestOrigin, opts)),
    })),
  );
  return results;
}
