// Real-network layer: fetches a page (or an explicit list of script URLs),
// finds each `<script src>`, reads the script's own trailing
// `//# sourceMappingURL=` comment, and -- when that map is not an inline
// `data:` URI -- fetches the referenced `.map` file to see whether it is
// publicly readable and whether it embeds full original source text.
//
// Deliberately the same module imported unmodified by the CLI (Node 22's
// built-in `fetch`) and by the browser page (`index.html` imports it
// directly), the same shape `ventures/supabase-rls-check/probe.mjs`
// documents. Whether a browser run can complete depends on the target's own
// CORS policy for a plain cross-origin GET -- a page's HTML document is
// often not served with permissive CORS, while static JS/CSS assets on many
// CDNs and static-site hosts commonly are (they already need it for
// cross-origin `<script type="module" crossorigin>` and Web Worker imports).
// When a fetch is blocked this way, the browser reports a generic network
// error with no HTTP status attached -- this module never guesses which
// cause it was, and reports it as an unclassified `error` either way; the
// CLI, run from a machine rather than a browser tab, is not subject to CORS
// at all and is the one path guaranteed to complete the check.
//
// This module only ever talks to the one page and the script/map URLs
// derived from it (or explicitly supplied by the caller). It sends nothing
// anywhere but GET requests to hosts the caller already named.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'source-map-leak-check/1 (+https://duncan-haywood.github.io/monorepo-projects/source-map-leak-check/)';
const MAX_BODY_BYTES = 5_000_000; // 5 MB cap per fetched file, script or map

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

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

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  let res;
  try {
    res = await timedFetch(
      url,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: '*/*' } },
      timeoutMs,
      fetchImpl,
    );
  } catch (err) {
    return { ok: false, status: null, text: null, error: err.message ?? String(err) };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, text: null, error: `HTTP ${res.status}` };
  }
  let text;
  try {
    text = res.body?.getReader ? await readCapped(res, MAX_BODY_BYTES) : await res.text();
  } catch (err) {
    return { ok: false, status: res.status, text: null, error: err.message ?? String(err) };
  }
  return { ok: true, status: res.status, text, error: null };
}

// Caps how much of a response body this ever holds in memory -- a script or
// map file has no reason to run into the hundreds of megabytes for this
// check, and a truncated read is still enough to find (or fail to find) the
// sourceMappingURL comment near the end of a normally-sized bundle.
async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) return res.text();
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
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(combined);
}

/** Finds every `<script src="...">` tag and resolves each src against
 * `baseUrl`. Ignores inline scripts (no `src`) -- out of scope, since an
 * inline script cannot carry an external source map reference worth
 * fetching separately. */
export function extractScriptSrcs(html, baseUrl) {
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      seen.add(new URL(m[1], baseUrl).toString());
    } catch {
      // an unresolvable src (e.g. a template placeholder) is skipped, not fatal
    }
  }
  return [...seen];
}

/** Returns the last `//# sourceMappingURL=` (or legacy `//@`) comment's
 * value, or null. Per the source map spec a file may carry at most one
 * meaningful reference; if a bundler concatenated files that each carried
 * one, the last is the one a browser's own devtools would honour. */
export function extractSourceMappingUrl(jsText) {
  const re = /\/\/[#@]\s*sourceMappingURL=(\S+)/g;
  let last = null;
  let m;
  while ((m = re.exec(jsText)) !== null) last = m[1].trim();
  return last;
}

function decodeInlineSourceMap(dataUri) {
  const base64Match = /^data:[^,]*;base64,([\s\S]*)$/.exec(dataUri);
  if (base64Match) return JSON.parse(base64ToUtf8(base64Match[1]));
  const plainMatch = /^data:[^,]*,([\s\S]*)$/.exec(dataUri);
  if (plainMatch) return JSON.parse(decodeURIComponent(plainMatch[1]));
  throw new Error('unrecognised data: URI for an inline source map');
}

/** Full per-script check: fetch the script, look for a sourceMappingURL
 * comment, and if present, resolve and fetch (or inline-decode) the map to
 * see whether it is readable and whether it embeds full source text. */
export async function checkScript(scriptUrl, { timeoutMs, fetchImpl } = {}) {
  const scriptRes = await fetchText(scriptUrl, { timeoutMs, fetchImpl });
  if (!scriptRes.ok) {
    return {
      scriptUrl, hasReference: false, mapUrl: null, mapFetchable: false,
      sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
      status: scriptRes.status, error: scriptRes.error,
    };
  }

  const mappingUrl = extractSourceMappingUrl(scriptRes.text);
  if (!mappingUrl) {
    return {
      scriptUrl, hasReference: false, mapUrl: null, mapFetchable: false,
      sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
      status: null, error: null,
    };
  }

  let mapJson;
  let mapUrl;
  let mapStatus = null;
  let mapError = null;

  if (mappingUrl.startsWith('data:')) {
    mapUrl = '(inline data: URI in the script itself)';
    try {
      mapJson = decodeInlineSourceMap(mappingUrl);
    } catch (err) {
      return {
        scriptUrl, hasReference: true, mapUrl, mapFetchable: false,
        sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
        status: null, error: `inline source map could not be decoded: ${err.message}`,
      };
    }
  } else {
    try {
      mapUrl = new URL(mappingUrl, scriptUrl).toString();
    } catch {
      return {
        scriptUrl, hasReference: true, mapUrl: null, mapFetchable: false,
        sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
        status: null, error: `sourceMappingURL is not a resolvable URL: ${mappingUrl}`,
      };
    }
    const mapRes = await fetchText(mapUrl, { timeoutMs, fetchImpl });
    mapStatus = mapRes.status;
    if (!mapRes.ok) {
      return {
        scriptUrl, hasReference: true, mapUrl, mapFetchable: false,
        sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
        status: mapStatus, error: mapRes.error,
      };
    }
    try {
      mapJson = JSON.parse(mapRes.text);
    } catch (err) {
      return {
        scriptUrl, hasReference: true, mapUrl, mapFetchable: false,
        sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
        status: mapStatus, error: `map was fetched but is not valid JSON: ${err.message}`,
      };
    }
  }

  const sources = Array.isArray(mapJson?.sources) ? mapJson.sources : [];
  const sourcesContent = Array.isArray(mapJson?.sourcesContent) ? mapJson.sourcesContent : [];
  const hasSourcesContent = sourcesContent.some((s) => typeof s === 'string' && s.length > 0);

  return {
    scriptUrl, hasReference: true, mapUrl, mapFetchable: true,
    sourcesCount: sources.length, hasSourcesContent,
    sampleSources: sources.slice(0, 5),
    status: mapStatus, error: null,
  };
}

/** Full run: either check the explicit `scriptUrls` given, or fetch
 * `pageUrl`'s HTML and derive the list from its own `<script src>` tags. */
export async function checkPage(pageUrl, { scriptUrls: givenScripts, timeoutMs, fetchImpl, maxScripts = 40 } = {}) {
  let scriptUrls = givenScripts;
  if (!scriptUrls || scriptUrls.length === 0) {
    if (!pageUrl) throw new Error('either a page URL or an explicit list of script URLs is required');
    const pageRes = await fetchText(pageUrl, { timeoutMs, fetchImpl });
    if (!pageRes.ok) {
      return { pageUrl, scripts: [], pageError: pageRes.error, truncated: false };
    }
    scriptUrls = extractScriptSrcs(pageRes.text, pageUrl);
  }

  const capped = scriptUrls.slice(0, maxScripts);
  const scripts = await Promise.all(capped.map((u) => checkScript(u, { timeoutMs, fetchImpl })));
  return { pageUrl: pageUrl ?? null, scripts, pageError: null, truncated: scriptUrls.length > capped.length };
}
