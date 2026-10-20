// Fetches one page's HTML over real HTTP(S) for the CLI. Node's built-in
// http/https clients are used deliberately, not the global fetch(): this
// gives explicit control over the response-size cap and timeout the way
// cors-misconfig-check/probe.mjs does for its own probes, rather than
// relying on undocumented fetch() defaults.
//
// This module only ever talks to URLs a caller names -- the target the user
// passed on the command line, and the alternate hrefs that target page's own
// hreflang tags name. It makes no other network call, reads no local files,
// and sends nothing anywhere else. It follows a small, bounded number of
// redirects (ordinary hosting behaviour: www redirects, trailing slashes,
// http->https) and gives up rather than following an unbounded chain.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB is generous for an HTML document's <head>+<body>
const USER_AGENT =
  'hreflang-reciprocity-check/1 (+https://duncan-haywood.github.io/monorepo-projects/hreflang-reciprocity-check/)';

/**
 * One GET request to `targetUrl`. Resolves rather than rejects on any
 * failure so a caller checking many alternates never needs a try/catch per
 * request. Never throws.
 *
 * @returns {Promise<{ok: boolean, status: number|null, url: string, html: string|null, error: string|null}>}
 */
export function fetchPage(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      resolve({ ok: false, status: null, url: targetUrl, html: null, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, url: targetUrl, html: null, error: `unsupported scheme: ${parsed.protocol}` });
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

    const req = requester(parsed, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? null;

      if (status && status >= 300 && status < 400 && res.headers.location) {
        res.resume(); // discard the redirect body
        if (redirectsLeft <= 0) {
          finish({ ok: false, status, url: targetUrl, html: null, error: 'too many redirects' });
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, parsed).toString();
        } catch (err) {
          finish({ ok: false, status, url: targetUrl, html: null, error: `invalid redirect location: ${err.message}` });
          return;
        }
        fetchPage(nextUrl, { timeoutMs, redirectsLeft: redirectsLeft - 1 }).then(finish);
        return;
      }

      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          // res.destroy() emits neither 'end' nor (reliably) 'error', so the
          // promise has to settle here rather than waiting for a stream event
          // that a forcibly-destroyed response may never send.
          finish({
            ok: true,
            status,
            url: targetUrl,
            html: Buffer.concat(chunks).toString('utf8'),
            error: `truncated at ${MAX_BYTES} bytes`,
          });
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        finish({
          ok: true,
          status,
          url: targetUrl,
          html: Buffer.concat(chunks).toString('utf8'),
          error: null,
        });
      });
      res.on('error', (err) => finish({ ok: false, status, url: targetUrl, html: null, error: err.message }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, url: targetUrl, html: null, error: err.message }));
    req.end();
  });
}
