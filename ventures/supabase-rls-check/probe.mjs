// Sends the real HTTP requests this check depends on, using the global
// `fetch` -- deliberately, so this exact module runs unmodified from the CLI
// (Node 22's built-in fetch) and from the browser page (index.html imports it
// directly). That is possible here in a way it is not for
// ventures/cors-misconfig-check's probe.mjs: the headers PostgREST (Supabase's
// REST layer) actually reads -- `apikey` and `Authorization: Bearer <key>` --
// are ordinary request headers, not one of the Fetch spec's forbidden names
// the way `Origin` is. And PostgREST answers with
// `Access-Control-Allow-Origin: *` by design (it is meant to be called
// directly from a browser tab, from whatever site embeds the project), so a
// visitor's own browser can run the real check with no server of ours in the
// middle.
//
// This module only ever talks to the one project URL a caller names, using
// the anon key that same caller supplies. It makes no other network call,
// reads no local files, and sends the key nowhere but that one project's own
// REST endpoint -- the same request the project's own client-side app
// already makes on every page load.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'supabase-rls-check/1 (+https://duncan-haywood.github.io/monorepo-projects/supabase-rls-check/)';

function normalizeBaseUrl(projectUrl) {
  const trimmed = String(projectUrl || '').trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`unsupported scheme: ${parsed.protocol}`);
  }
  return parsed.origin;
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

/**
 * Reads PostgREST's own root OpenAPI document (`GET /rest/v1/`) and returns
 * the table/view names it lists under `paths` (excluding the root path
 * itself). This is the same schema listing the anon key can already see
 * before any table-level request -- PostgREST publishes it so client
 * libraries can introspect the API, and it requires no more privilege than
 * the anon role's default `USAGE` grant on the exposed schema, which is what
 * every fresh Supabase project starts with regardless of whether RLS is on.
 */
export async function listTables(baseUrl, anonKey, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const url = `${baseUrl}/rest/v1/`;
  let res;
  try {
    res = await timedFetch(
      url,
      { method: 'GET', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'user-agent': USER_AGENT, accept: 'application/openapi+json, application/json' } },
      timeoutMs,
      fetchImpl,
    );
  } catch (err) {
    return { ok: false, tables: [], error: err.message ?? String(err) };
  }
  if (!res.ok) {
    return { ok: false, tables: [], status: res.status, error: `HTTP ${res.status} reading the schema root -- check the project URL and anon key` };
  }
  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, tables: [], status: res.status, error: `could not parse the schema document as JSON: ${err.message}` };
  }
  const paths = body && typeof body === 'object' ? body.paths : null;
  if (!paths || typeof paths !== 'object') {
    return { ok: false, tables: [], status: res.status, error: 'schema document has no "paths" -- this may not be a PostgREST/Supabase REST endpoint' };
  }
  const tables = Object.keys(paths)
    .filter((p) => p.startsWith('/') && p !== '/' && !p.includes('rpc/'))
    .map((p) => p.slice(1));
  return { ok: true, tables, status: res.status, error: null };
}

/**
 * Requests exactly one row from `table` with an exact row count (via
 * `Prefer: count=exact` and a `Range: 0-0`), which is enough to know whether
 * the anon key can read real rows without ever pulling a whole table into
 * memory. Never mutates anything -- this sends GET only.
 */
export async function probeTable(baseUrl, anonKey, table, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`;
  let res;
  try {
    res = await timedFetch(
      url,
      {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'user-agent': USER_AGENT,
          Range: '0-0',
          Prefer: 'count=exact',
        },
      },
      timeoutMs,
      fetchImpl,
    );
  } catch (err) {
    return { table, ok: false, status: null, rowsReturned: 0, totalCount: null, columns: [], error: err.message ?? String(err) };
  }

  let rows = [];
  let parseError = null;
  try {
    rows = await res.json();
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    parseError = err.message ?? String(err);
  }

  const contentRange = res.headers.get('content-range'); // e.g. "0-0/42" or "*/0"
  let totalCount = null;
  if (contentRange) {
    const m = /\/(\d+|\*)$/.exec(contentRange);
    if (m && m[1] !== '*') totalCount = Number(m[1]);
  }

  return {
    table,
    ok: res.ok,
    status: res.status,
    rowsReturned: rows.length,
    totalCount,
    columns: rows.length > 0 && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [],
    error: !res.ok ? `HTTP ${res.status}` : parseError,
  };
}

/**
 * Full run: normalise the URL, list the tables the anon key can see in the
 * schema, then probe each one for a real, readable row. `tables`, if given,
 * skips the schema-listing request and checks exactly those names instead --
 * useful when a project has disabled the OpenAPI root (some do) but the
 * caller already knows which tables to check.
 */
export async function runProbes(projectUrl, anonKey, { tables: givenTables, timeoutMs, fetchImpl, maxTables = 200 } = {}) {
  const baseUrl = normalizeBaseUrl(projectUrl);

  let tables = givenTables;
  let schemaError = null;
  if (!tables) {
    const listed = await listTables(baseUrl, anonKey, { timeoutMs, fetchImpl });
    if (!listed.ok) {
      return { baseUrl, tables: [], schemaError: listed.error, results: [] };
    }
    tables = listed.tables;
  }

  const capped = tables.slice(0, maxTables);
  const results = await Promise.all(
    capped.map((table) => probeTable(baseUrl, anonKey, table, { timeoutMs, fetchImpl })),
  );
  return { baseUrl, tables: capped, schemaError, results, truncated: tables.length > capped.length };
}
