// Real-network layer: sends one plain GET request to each of a short list of
// well-known dotenv filenames at a site's root and returns exactly what came
// back -- status and a byte-capped body, nothing else. Deliberately the same
// module imported unmodified by the CLI (Node 22's built-in `fetch`) and by
// the browser page (`index.html` imports it directly), the same shape
// `ventures/git-exposure-check/probe.mjs` documents.
//
// This module never inspects, extracts, or reports any VALUE from a response
// body -- see analyze.mjs for why that matters here specifically. It only
// fetches; classification (and the value-redaction that classification
// depends on) happens there.
//
// Whether a browser run can complete depends on the target's own CORS policy
// for a plain cross-origin GET -- most servers do not send permissive CORS
// headers on arbitrary static paths, so a cross-origin browser fetch commonly
// fails with a generic, status-less network error. This module never guesses
// which cause that was; it reports it as an unclassified `error`. The CLI,
// run from a machine rather than a browser tab, is not subject to CORS at all
// and is the one path guaranteed to complete.
//
// This module only ever talks to the one base URL the caller names, at the
// fixed list of paths below. It sends nothing anywhere but GET requests to a
// host the caller already supplied.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'dotenv-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/dotenv-exposure-check/)';
// A real dotenv file is normally a handful of short lines. This cap is
// generous enough to still classify a real exposure while bounding what this
// tool ever holds in memory or could be made to download on repeat.
const MAX_BODY_BYTES = 1_000_000;

// The specific dotenv filenames checked, in the precedence order Next.js's
// own documentation defines for them (.env, then environment-specific, then
// the *.local overrides that are meant to never be committed at all) --
// `.env.local` and the two `*.local` variants are the ones most likely to
// carry a real developer's own secrets rather than committed defaults.
export const ENV_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development.local',
];

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

/** One GET request to `${baseUrl}/${path}`, capped and never throwing on an
 * ordinary HTTP or network failure -- those come back as `ok: false` with
 * `error` set, so a caller can tell "confirmed absent/blocked" (a clean
 * status) apart from "could not confirm either way" (a network error). */
export async function fetchEnvPath(baseUrl, path, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  let res;
  try {
    res = await timedFetch(
      url,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: '*/*' } },
      timeoutMs,
      fetchImpl,
    );
  } catch (err) {
    return { path, url, ok: false, status: null, text: null, error: err.message ?? String(err) };
  }
  if (!res.ok) {
    return { path, url, ok: false, status: res.status, text: null, error: `HTTP ${res.status}` };
  }
  let text;
  try {
    text = await readCapped(res, MAX_BODY_BYTES);
  } catch (err) {
    return { path, url, ok: false, status: res.status, text: null, error: err.message ?? String(err) };
  }
  return { path, url, ok: true, status: res.status, text, error: null };
}

/** Full run: fetch every path in `ENV_PATHS` (or an explicit subset) against
 * `baseUrl`, in parallel. Never throws on a per-path failure -- every path
 * gets a result, `ok: false` and all. */
export async function checkSite(baseUrl, { paths = ENV_PATHS, timeoutMs, fetchImpl } = {}) {
  if (!baseUrl) throw new Error('a base URL is required');
  const results = await Promise.all(
    paths.map((path) => fetchEnvPath(baseUrl, path, { timeoutMs, fetchImpl })),
  );
  return { baseUrl, results };
}
