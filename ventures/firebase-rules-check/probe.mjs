// Sends the real HTTP requests this check depends on, using the global
// `fetch` -- the same module runs unmodified from the CLI (Node 22's
// built-in fetch) and from the browser page (index.html imports it
// directly). Firebase's Realtime Database REST API is documented and
// designed to be called directly with plain HTTP from a browser tab (the
// `.json` suffix convention exists for exactly that), so a visitor's own
// browser can run the real Realtime Database check with no server of ours
// in the middle. The Firestore REST endpoint (firestore.googleapis.com) is
// less certain to answer a cross-origin browser fetch with the right CORS
// headers in every project configuration -- if a visitor's browser reports
// a network or CORS error on the Firestore half, index.html says so and
// points at the identical CLI check, which is never subject to browser CORS
// restrictions.
//
// Every request here goes only to the one Firebase project a caller names
// (its Realtime Database URL and/or its Firestore project ID), and only
// ever with a plain, unauthenticated GET -- the same request Firebase's own
// REST documentation describes as the normal, unauthenticated shape a
// request takes when no ID token is attached. This module makes no other
// network call, reads no local files, and sends nothing anywhere else.
//
// Firebase has no equivalent of PostgREST's schema-listing endpoint for
// Firestore, so unlike ventures/supabase-rls-check this module cannot
// discover collection names on its own -- the caller supplies the
// collection names to check (the same "I already know what to check"
// fallback path supabase-rls-check's own runProbes offers via its
// `tables` option). The Realtime Database half needs no such list: a
// `shallow=true` request against any path returns only the immediate child
// key names with no field values at all, so the root of the tree can be
// probed directly.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'firebase-rules-check/1 (+https://duncan-haywood.github.io/monorepo-projects/firebase-rules-check/)';

function normalizeDatabaseUrl(databaseUrl) {
  const trimmed = String(databaseUrl || '').trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`unsupported scheme: ${parsed.protocol}`);
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

function normalizeProjectId(projectId) {
  const trimmed = String(projectId || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(trimmed)) {
    throw new Error(`not a plausible Firebase project ID: ${JSON.stringify(projectId)}`);
  }
  return trimmed;
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
 * Probes one path in a Realtime Database with `shallow=true`, which Firebase
 * documents to return only the immediate child key names (each as the
 * literal value `true`) and never the actual field values underneath them --
 * enough to tell whether the path is readable by an unauthenticated request
 * without ever downloading real data.
 */
export async function probeRealtimeDatabasePath(databaseUrl, path, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const base = normalizeDatabaseUrl(databaseUrl);
  const cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
  const url = `${base}/${cleanPath}.json?shallow=true`;
  let res;
  try {
    res = await timedFetch(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }, timeoutMs, fetchImpl);
  } catch (err) {
    return { path: cleanPath || '/', ok: false, status: null, keys: null, error: err.message ?? String(err) };
  }
  let body;
  let parseError = null;
  try {
    const text = await res.text();
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch (err) {
    parseError = err.message ?? String(err);
  }
  return {
    path: cleanPath || '/',
    ok: res.ok,
    status: res.status,
    keys: res.ok && body && typeof body === 'object' ? Object.keys(body) : res.ok ? [] : null,
    isNull: res.ok && body === null,
    error: !res.ok ? `HTTP ${res.status}` : parseError,
  };
}

/**
 * Requests up to one document from a Firestore collection with
 * `pageSize=1`. Never reads more than one document, and the report built
 * from this result (`analyze.mjs`) only ever surfaces field *names*, not
 * field values -- the same "evidence, not a data dump" posture
 * `ventures/supabase-rls-check` uses.
 */
export async function probeFirestoreCollection(projectId, collectionPath, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl, apiKey } = {}) {
  const project = normalizeProjectId(projectId);
  const cleanPath = String(collectionPath || '').replace(/^\/+|\/+$/g, '');
  const query = new URLSearchParams({ pageSize: '1' });
  if (apiKey) query.set('key', apiKey);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/${cleanPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?${query.toString()}`;
  let res;
  try {
    res = await timedFetch(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }, timeoutMs, fetchImpl);
  } catch (err) {
    return { collection: cleanPath, ok: false, status: null, documentCount: 0, fieldNames: [], error: err.message ?? String(err) };
  }
  let body;
  let parseError = null;
  try {
    body = await res.json();
  } catch (err) {
    parseError = err.message ?? String(err);
  }
  const documents = Array.isArray(body?.documents) ? body.documents : [];
  const fieldNames = documents.length > 0 && documents[0]?.fields && typeof documents[0].fields === 'object' ? Object.keys(documents[0].fields) : [];
  const apiError = !res.ok ? (body?.error?.message ? `HTTP ${res.status}: ${body.error.message}` : `HTTP ${res.status}`) : parseError;
  return { collection: cleanPath, ok: res.ok, status: res.status, documentCount: documents.length, fieldNames, error: apiError };
}

/**
 * Full run: Realtime Database root (if a `databaseUrl` was given), then one
 * probe per Firestore collection name in `collections` (if any). Either
 * input may be omitted -- a project may use only one of the two products.
 */
export async function runProbes(projectId, { databaseUrl, collections = [], apiKey, timeoutMs, fetchImpl, maxCollections = 50 } = {}) {
  const realtimeDatabase = databaseUrl
    ? await probeRealtimeDatabasePath(databaseUrl, '/', { timeoutMs, fetchImpl })
    : null;

  const capped = collections.slice(0, maxCollections);
  const firestore = await Promise.all(
    capped.map((collection) => probeFirestoreCollection(projectId, collection, { timeoutMs, fetchImpl, apiKey })),
  );

  return {
    projectId,
    databaseUrl: databaseUrl ? normalizeDatabaseUrl(databaseUrl) : null,
    realtimeDatabase,
    firestore,
    truncated: collections.length > capped.length,
  };
}
