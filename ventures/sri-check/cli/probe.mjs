// Network layer: the only file in this venture that makes a real HTTP
// request. Uses the global `fetch()` (Node 18+, no dependency) rather than
// `node:http`/`node:https` the way `cors-misconfig-check`'s probe.mjs does --
// that venture needed the low-level client because it has to set the
// `Origin` request header, which `fetch()` refuses in some runtimes. Nothing
// here sets a forbidden header; it sends ordinary GETs, so the simpler API
// is available and used.
//
// Both fetch functions resolve rather than reject on failure, matching the
// convention `cors-misconfig-check/probe.mjs` documents: a caller running
// several of these never needs a try/catch per call, and "this host did not
// answer" is itself evidence that has to survive into the report rather than
// crash the run.

import { digestBase64, ALGORITHMS } from '../sri.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'sri-check/1 (+https://duncan-haywood.github.io/monorepo-projects/sri-check/)';

async function timedFetch(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: controller ? controller.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch a page's HTML as text.
 * @returns {{ok: boolean, status: number|null, text: string|null, error: string|null}}
 */
export async function fetchText(pageUrl, opts = {}) {
  try {
    const res = await timedFetch(pageUrl, opts);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      status: null,
      text: null,
      error: err && err.name === 'AbortError' ? 'timed out' : String(err && err.message ? err.message : err),
    };
  }
}

/**
 * Fetch one asset's bytes and hash them with every algorithm this tool
 * understands, so `sri.mjs`'s `buildReport` can compare against whichever
 * algorithm the page's own integrity attribute uses without a second round
 * trip. Hashing all three costs nothing extra over hashing one -- the bytes
 * are already in memory -- and it is what lets the report also show "here is
 * the sha384 you should have used" even when the page declared sha256.
 *
 * @returns {{ok: boolean, hashes: {sha256: string, sha384: string, sha512: string}|null, error: string|null}}
 */
export async function fetchAndDigest(assetUrl, opts = {}) {
  try {
    const res = await timedFetch(assetUrl, opts);
    if (!res.ok) return { ok: false, hashes: null, error: `HTTP ${res.status}` };
    const buffer = new Uint8Array(await res.arrayBuffer());
    const hashes = {};
    for (const algo of ALGORITHMS) hashes[algo] = await digestBase64(algo, buffer);
    return { ok: true, hashes, error: null };
  } catch (err) {
    return {
      ok: false,
      hashes: null,
      error: err && err.name === 'AbortError' ? 'timed out' : String(err && err.message ? err.message : err),
    };
  }
}

/**
 * Fetch every cross-origin asset in `assets` (as produced by
 * `sri.mjs`'s `extractCrossOriginAssets`) that carries an `integrity`
 * attribute -- there is nothing to verify by fetching one that has none, so
 * those are skipped rather than spending a request that cannot change the
 * finding. Requests run sequentially: this tool has no deadline pressure
 * that would justify fanning out a burst of requests at whatever CDNs the
 * page happens to reference.
 *
 * @returns {Map<string, {ok: boolean, hashes: object|null, error: string|null}>}
 */
export async function fetchAllAssets(assets, opts = {}) {
  const results = new Map();
  for (const asset of assets) {
    if (!asset.integrity) continue;
    results.set(asset.url, await fetchAndDigest(asset.url, opts));
  }
  return results;
}
