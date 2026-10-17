// Real-network layer: sends one plain GET request to each of a short list of
// well-known backup-file paths at a site's root and returns exactly what came
// back -- status and a byte-capped *raw* body, nothing else. Deliberately the
// same module shape imported unmodified by the CLI (Node 22's built-in
// `fetch`) and by the browser page (`index.html` imports it directly), the
// same split `ventures/dotenv-exposure-check/probe.mjs` documents: this file
// only fetches, classification happens in analyze.mjs.
//
// Unlike the dotenv/git checkers, a real backup file is commonly *binary*
// (a zip, a gzip-compressed archive) rather than always text, so this module
// reads the capped response as raw bytes (a Uint8Array) rather than decoding
// to a string -- decoding first would corrupt exactly the archive
// magic-byte header analyze.mjs needs to tell a real backup apart from an
// unrelated 200 response. analyze.mjs is responsible for any text decoding
// it needs (e.g. to look for a SQL dump's header comment).
//
// The read is capped at a few kilobytes -- enough to read an archive's
// magic-byte header or a SQL dump tool's own header comment lines, never
// enough to be "downloading the backup". This tool confirms a backup file is
// present and readable; it does not fetch, unzip, or extract its contents.
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
  'backup-file-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/backup-file-exposure-check/)';
// A real archive's magic bytes live in the first handful of bytes, and a
// mysqldump/pg_dump/phpMyAdmin header comment lives in the first few lines.
// This cap is generous enough to classify a real exposure while bounding
// what this tool ever holds in memory, downloads from the target, or could
// be made to fetch on repeat -- it is deliberately far short of "the whole
// backup", the same restraint `git-exposure-check` applies to never
// requesting a repository's packed objects once exposure is confirmed.
const MAX_BODY_BYTES = 8192;

// The specific backup filenames checked: a mix of common archive
// (zip/tar.gz) and database-dump (sql/sql.gz) names drawn from the same
// "well-known filename" wordlists security testing methodologies already
// use for this exact reconnaissance step (OWASP's Web Security Testing
// Guide names "Review Old Backup and Unreferenced Files" explicitly, and
// SecLists' own "Backup files" wordlists carry this same short set of
// names). Kept short and well-documented rather than exhaustive, the same
// trade-off `dotenv-exposure-check` makes with its five dotenv filenames.
export const BACKUP_PATHS = [
  'backup.zip',
  'backup.tar.gz',
  'backup.sql',
  'backup.sql.gz',
  'db.sql',
  'database.sql',
  'dump.sql',
  'site.zip',
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

/** Reads at most `maxBytes` of a response body as raw bytes, cancelling the
 * rest of the stream once the cap is reached rather than buffering a large
 * real backup file end to end. */
async function readCappedBytes(res, maxBytes) {
  if (!res.body?.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > maxBytes ? buf.slice(0, maxBytes) : buf;
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
  return combined;
}

/** One GET request to `${baseUrl}/${path}`, capped and never throwing on an
 * ordinary HTTP or network failure -- those come back as `ok: false` with
 * `error` set, so a caller can tell "confirmed absent/blocked" (a clean
 * status) apart from "could not confirm either way" (a network error). */
export async function fetchBackupPath(baseUrl, path, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
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
    return { path, url, ok: false, status: null, bytes: null, error: err.message ?? String(err) };
  }
  if (!res.ok) {
    return { path, url, ok: false, status: res.status, bytes: null, error: `HTTP ${res.status}` };
  }
  let bytes;
  try {
    bytes = await readCappedBytes(res, MAX_BODY_BYTES);
  } catch (err) {
    return { path, url, ok: false, status: res.status, bytes: null, error: err.message ?? String(err) };
  }
  return { path, url, ok: true, status: res.status, bytes, error: null };
}

/** Full run: fetch every path in `BACKUP_PATHS` (or an explicit subset)
 * against `baseUrl`, in parallel. Never throws on a per-path failure --
 * every path gets a result, `ok: false` and all. */
export async function checkSite(baseUrl, { paths = BACKUP_PATHS, timeoutMs, fetchImpl } = {}) {
  if (!baseUrl) throw new Error('a base URL is required');
  const results = await Promise.all(
    paths.map((path) => fetchBackupPath(baseUrl, path, { timeoutMs, fetchImpl })),
  );
  return { baseUrl, results };
}
