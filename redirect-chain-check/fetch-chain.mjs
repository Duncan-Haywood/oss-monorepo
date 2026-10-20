// Real HTTP(S) for the CLI. Node's built-in http/https clients are used
// deliberately, not the global fetch(), because fetch() with the default
// `redirect: "follow"` hides every intermediate hop -- exactly the
// information this tool exists to report -- and `redirect: "manual"` in
// Node's fetch implementation does not reliably expose the Location header
// either. Requesting one hop at a time and deciding whether to follow it
// ourselves is the only way to see the whole chain.
//
// This module only ever talks to URLs a caller names -- the starting URL the
// user passed on the command line, and each Location header that URL's own
// server sends back. It makes no other network call, reads no local files,
// and sends nothing anywhere else. It never reads a response body -- a
// redirect's body is irrelevant and the final landing page's body is not
// needed to classify the chain -- so every request stops as soon as the
// status and headers arrive, the same "headers only, drain immediately"
// shape sitemap-lastmod-freshness-check/fetch-url.mjs's fetchHeaders() uses.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_HOPS = 10;
const USER_AGENT =
  'redirect-chain-check/1 (+https://duncan-haywood.github.io/monorepo-projects/redirect-chain-check/)';

/**
 * Makes exactly one HTTP request to `targetUrl` and reports its status and
 * (if it is a redirect) the resolved absolute Location -- without following
 * it. Never throws; resolves with `status: null` and `error` set on any
 * failure (invalid URL, unsupported scheme, timeout, network error).
 *
 * @returns {Promise<{url: string, status: number|null, location: string|null, error: string|null}>}
 */
export function fetchOneHop(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ url: targetUrl, status: null, location: null, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ url: targetUrl, status: null, location: null, error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(parsed, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      timeout: timeoutMs,
    }, (res) => {
      const status = res.statusCode ?? null;
      let location = null;
      if (status >= 300 && status < 400 && res.headers.location) {
        try {
          location = new URL(res.headers.location, parsed).toString();
        } catch {
          // An unresolvable Location header is reported as-is; classifyChain
          // will flag it as an invalid hop URL rather than this module
          // silently dropping it.
          location = res.headers.location;
        }
      }
      // Headers are all this tool needs -- stop reading now regardless of
      // status, so a large landing page costs nothing to check.
      res.resume();
      res.on('end', () => finish({ url: targetUrl, status, location, error: null }));
      res.on('error', (err) => finish({ url: targetUrl, status, location, error: err.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ url: targetUrl, status: null, location: null, error: err.message }));
    req.end();
  });
}

/**
 * Walks a redirect chain starting at `startUrl`, one real request per hop,
 * stopping at the first non-redirect response, the first request failure, or
 * `maxHops` requests -- whichever comes first.
 *
 * @param {string} startUrl
 * @param {object} [opts]
 * @param {number} [opts.maxHops] - safety bound against an unbounded or
 *   looping chain; a chain that is still redirecting at this many hops is
 *   reported as `truncated`, which `classifyChain` (engine.mjs) turns into a
 *   `chain-incomplete` finding since the last hop it saw is itself a
 *   redirect.
 * @param {number} [opts.timeoutMs]
 * @param {typeof fetchOneHop} [opts.fetchOneHopFn] - injectable for tests.
 * @returns {Promise<{hops: Array<{url:string,status:number|null,error:string|null}>, truncated: boolean}>}
 */
export async function walkChain(startUrl, {
  maxHops = DEFAULT_MAX_HOPS,
  timeoutMs,
  fetchOneHopFn = fetchOneHop,
} = {}) {
  const hops = [];
  let current = startUrl;
  const fetchOpts = timeoutMs ? { timeoutMs } : {};

  for (let i = 0; i < maxHops; i++) {
    // eslint-disable-next-line no-await-in-loop -- each hop's target depends on the previous one's response
    const result = await fetchOneHopFn(current, fetchOpts);
    hops.push({ url: result.url, status: result.status, error: result.error });

    if (result.error || result.status == null) {
      return { hops, truncated: false };
    }
    if (result.status >= 300 && result.status < 400 && result.location) {
      current = result.location;
      continue;
    }
    return { hops, truncated: false }; // landed: non-redirect status, or a redirect with no usable Location
  }
  return { hops, truncated: true }; // still redirecting after maxHops requests
}
