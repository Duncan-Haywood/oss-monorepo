// Sends the one real HTTP request this check depends on: a GET to a cloud
// provider's own anonymous bucket-listing endpoint, built by engine.mjs.
// Node's built-in http/https clients are used directly (the same choice
// git-exposure-check makes) so the body read can be capped -- a bucket that
// really is publicly listable can report thousands of objects, and this
// tool only needs enough of the body to classify the result and show a
// handful of example names, not the whole listing.
//
// Unlike git-exposure-check's probe, this one DOES follow redirects, up to
// a small cap. That is not a relaxation of the "only look at what the
// target actually serves" rule -- it is required for AWS's own path-style
// endpoint to work at all: `s3.amazonaws.com/<bucket>` 307-redirects to the
// bucket's real region (`s3.<region>.amazonaws.com/<bucket>`) whenever the
// caller does not already know the region, which is the ordinary case here
// since this tool never asks the visitor for one. Every redirect is
// followed as a fresh GET to the `Location` the SAME provider's own server
// returned -- never to an arbitrary third party -- and the cap (5) exists
// only to bound a misbehaving or looping server, not because a real S3
// lookup needs more than one hop in practice.
//
// This module only ever talks to the one bucket-listing URL it is given
// (and the redirects that URL's own response names). It makes no other
// network call, reads no local files, and sends nothing anywhere else.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_CAP_BYTES = 16_384;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  'cloud-bucket-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/cloud-bucket-exposure-check/)';

/**
 * One GET request to `targetUrl`, following same-request-method redirects
 * up to `MAX_REDIRECTS` times. Resolves rather than rejects on any failure
 * so a caller never needs a try/catch around it.
 *
 * @returns {Promise<{ok: boolean, status: number|null, url: string|null,
 *   bodySample: string, truncated: boolean, error: string|null}>}
 */
export function sendProbe(targetUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let hops = 0;

    const attempt = (urlString) => {
      let parsed;
      try {
        parsed = new URL(urlString);
      } catch (err) {
        resolve({ ok: false, status: null, url: null, bodySample: '', truncated: false, error: `invalid URL: ${err.message}` });
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        resolve({ ok: false, status: null, url: parsed.href, bodySample: '', truncated: false, error: `unsupported scheme: ${parsed.protocol}` });
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

        if (status !== null && status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // discard the redirect response body
          if (hops >= MAX_REDIRECTS) {
            finish({ ok: false, status, url: parsed.href, bodySample: '', truncated: false, error: 'too many redirects' });
            return;
          }
          hops += 1;
          const next = new URL(res.headers.location, parsed).href;
          attempt(next);
          return;
        }

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
        const complete = () =>
          finish({ ok: true, status, url: parsed.href, bodySample: bytes.toString('utf8'), truncated, error: null });
        res.on('end', complete);
        // `res.destroy()` above (hitting the cap) fires 'close' instead of
        // 'end' -- still a completed, successful read of everything up to
        // the cap.
        res.on('close', complete);
        res.on('error', (err) => finish({ ok: false, status, url: parsed.href, bodySample: '', truncated: false, error: err.message }));
      });
      req.on('timeout', () => req.destroy(new Error('timed out')));
      req.on('error', (err) => finish({ ok: false, status: null, url: parsed.href, bodySample: '', truncated: false, error: err.message }));
      req.end();
    };

    attempt(targetUrl);
  });
}

/** Runs the probe against a resolved target (the shape `buildProbeUrl` /
 * `detectTargetFromUrl` in engine.mjs return) and folds the provider back
 * into the result, since `buildReport` needs it to pick the right XML
 * shape to look for. */
export async function runProbe(resolved, opts = {}) {
  const result = await sendProbe(resolved.probeUrl, opts);
  return { ...result, provider: resolved.provider };
}
