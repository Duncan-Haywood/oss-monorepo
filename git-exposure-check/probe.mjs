// Sends the real HTTP requests this check depends on: two GET requests to a
// target site -- one for `.git/HEAD`, one for `.git/config` -- resolved
// relative to the URL a caller passes in. Node's built-in http/https clients
// are used, and no redirect is followed automatically: a 3xx response is
// reported as-is, with its own status, rather than silently chasing the
// Location, so a caller always knows exactly which response the report
// describes.
//
// Unlike the header-only probes in this portfolio's sibling checkers
// (security-headers-check, cors-misconfig-check, cache-control-check), this
// one has to read a slice of the response *body*: whether `.git/HEAD` is
// really exposed is decided by whether its content parses as a git ref, not
// by the status code alone -- a status-code-only check is fooled by any
// server that answers every path with 200 (a "soft 404"), which is common
// enough that naive git-exposure scanners built on `curl -I` or a bare
// status check produce false positives on exactly this pattern.
//
// The body read is capped at BODY_CAP_BYTES and the socket is destroyed once
// that many bytes have arrived, so pointing this at a server that serves a
// huge file at a probed path costs a bounded amount of memory and time
// rather than downloading the whole thing -- both files this check reads are
// normally under 200 bytes in a real git checkout.
//
// This module only ever talks to the one target site a caller names. It
// makes no other network call, reads no local files, and sends nothing
// anywhere else.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_CAP_BYTES = 8192;
const USER_AGENT =
  'git-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/git-exposure-check/)';

/** The two paths this check probes, relative to the base URL a caller gives
 * it. Exported so the CLI and tests can name them without repeating the
 * literal strings. */
export const HEAD_RELATIVE_PATH = '.git/HEAD';
export const CONFIG_RELATIVE_PATH = '.git/config';

/**
 * One GET request to `relativePath` resolved against `baseUrl`. Resolves
 * rather than rejects on any failure so a caller running several of these
 * never needs a try/catch per probe.
 *
 * @returns {Promise<{ok: boolean, status: number|null, protocol: string|null,
 *   url: string|null, bodySample: string, truncated: boolean, error: string|null}>}
 */
export function sendProbe(baseUrl, relativePath, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(relativePath, baseUrl);
    } catch (err) {
      resolve({ ok: false, status: null, protocol: null, url: null, bodySample: '', truncated: false, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, protocol: null, url: parsed.href, bodySample: '', truncated: false, error: `unsupported scheme: ${parsed.protocol}` });
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

    const req = requester(
      parsed,
      { method: 'GET', headers, timeout: timeoutMs },
      (res) => {
        let bytes = Buffer.alloc(0);
        let truncated = false;
        res.on('data', (chunk) => {
          if (bytes.length >= BODY_CAP_BYTES) {
            truncated = true;
            return;
          }
          bytes = Buffer.concat([bytes, chunk]).subarray(0, BODY_CAP_BYTES);
          if (bytes.length >= BODY_CAP_BYTES) {
            truncated = true;
            res.destroy(); // stop reading once the cap is reached
          }
        });
        res.on('end', () => {
          finish({
            ok: true,
            status: res.statusCode ?? null,
            protocol: parsed.protocol,
            url: parsed.href,
            bodySample: bytes.toString('utf8'),
            truncated,
            error: null,
          });
        });
        res.on('close', () => {
          // `res.destroy()` above (hitting the cap) fires 'close' instead of
          // 'end' -- still a completed, successful read of everything up to
          // the cap, so this must resolve ok:true too, not read as a failure.
          finish({
            ok: true,
            status: res.statusCode ?? null,
            protocol: parsed.protocol,
            url: parsed.href,
            bodySample: bytes.toString('utf8'),
            truncated,
            error: null,
          });
        });
        res.on('error', (err) => finish({ ok: false, status: res.statusCode ?? null, protocol: parsed.protocol, url: parsed.href, bodySample: '', truncated: false, error: err.message }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, protocol: parsed.protocol, url: parsed.href, bodySample: '', truncated: false, error: err.message }));
    req.end();
  });
}

/** Runs both probes against `targetUrl` (resolved as a base for the two
 * relative paths) and returns the raw results, same shape `analyze.mjs`'s
 * `buildReport` expects. */
export async function runProbe(targetUrl, opts = {}) {
  const [head, config] = await Promise.all([
    sendProbe(targetUrl, HEAD_RELATIVE_PATH, opts),
    sendProbe(targetUrl, CONFIG_RELATIVE_PATH, opts),
  ]);
  return { target: targetUrl, head, config };
}
