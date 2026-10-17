// Real-network layer: sends one plain GET request to a hostname and returns
// exactly what came back -- status and a byte-capped body, nothing else.
// Deliberately the same module imported unmodified by the CLI (Node's
// built-in `fetch`) and by the browser page (`index.html` imports it
// directly), the same shape `ventures/dotenv-exposure-check/probe.mjs`
// documents.
//
// This module never inspects the body -- it only fetches; classification
// against a provider's fingerprint happens in analyze.mjs.
//
// Whether a browser run can complete depends on the target's own CORS
// policy for a plain cross-origin GET -- most third-party hosting providers
// do not send permissive CORS headers on their catch-all "not found" pages,
// so a cross-origin browser fetch commonly fails with a generic, status-less
// network error. This module never guesses which cause that was; it reports
// it as an unclassified `error`. The CLI, run from a machine rather than a
// browser tab, is not subject to CORS at all and is the one path guaranteed
// to complete.
//
// This module only ever sends a single GET request to the one hostname the
// caller named.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'subdomain-takeover-check/1 (+https://duncan-haywood.github.io/monorepo-projects/subdomain-takeover-check/)';
// A provider's "unclaimed" page is normally small. Generous enough to still
// see the fingerprint text while bounding what this tool ever holds in
// memory or could be made to download on repeat.
const MAX_BODY_BYTES = 200_000;

async function timedFetch(url, init, timeoutMs, fetchImpl) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch implementation available in this environment');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      try { await reader.cancel(); } catch { /* best effort */ }
      break;
    }
  }
  const combined = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const room = combined.length - offset;
    if (room <= 0) break;
    combined.set(room < chunk.length ? chunk.subarray(0, room) : chunk, offset);
    offset += Math.min(chunk.length, room);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

/**
 * One GET request to `url` (a full URL, e.g. `https://blog.example.com/` or
 * a test server's loopback base). Never throws on an ordinary HTTP or
 * network failure -- those come back as `ok: false` with `error` set, since
 * a status-carrying response (even a 404 or 500) is still evidence a caller
 * may want, distinct from "the request never completed at all".
 */
export async function fetchHost(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  let res;
  try {
    res = await timedFetch(
      url,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' } },
      timeoutMs,
      fetchImpl,
    );
  } catch (err) {
    return { url, ok: false, status: null, text: null, error: err.message ?? String(err) };
  }
  let text;
  try {
    text = await readCapped(res, MAX_BODY_BYTES);
  } catch (err) {
    return { url, ok: false, status: res.status, text: null, error: err.message ?? String(err) };
  }
  // A provider's own fingerprint page is often served with a 404 status --
  // that is expected (it is, after all, "not found"), so `ok` here tracks
  // "did we get a body to check", not HTTP-success. A response with no body
  // at all is not useful evidence either way.
  return { url, ok: true, status: res.status, text, error: null };
}

/** Convenience wrapper: builds `https://<hostname>/` and fetches it. Tests
 * that need a loopback base URL call `fetchHost` directly instead. */
export async function fetchHostname(hostname, opts = {}) {
  return fetchHost(`https://${hostname}/`, opts);
}
