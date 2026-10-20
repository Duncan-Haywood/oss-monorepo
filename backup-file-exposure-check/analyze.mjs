// Classifies a set of per-path probe results (real HTTP responses, collected
// by probe.mjs's live requests) into a verdict about whether a target is
// publicly serving one of its own backup files. Pure function, no I/O, no
// network -- imported identically by the CLI (check.mjs) and the browser
// page (index.html), the same shape `ventures/dotenv-exposure-check/analyze.mjs`
// documents.
//
// The one rule every function in this file is built around, adapted from
// dotenv-exposure-check's own: a backup file's whole purpose is holding a
// full copy of the site or database, so this tool must never become a second
// way to leak what it finds. Two different content shapes need two different
// restraints:
//
//   Archives (zip/tar.gz/gzip/bzip2/7z) are confirmed by their magic bytes
//   only -- the first handful of header bytes probe.mjs already capped the
//   read to. This tool never lists, extracts, or reads a single file out of
//   the archive; a short hex sample of the header is the only "content"
//   ever shown, and that content is structural (a file-format signature),
//   never anything from inside the archive.
//
//   SQL dumps are confirmed by their line SHAPE, the same "verify the real
//   shape, not just an HTTP status" test dotenv-exposure-check applies.
//   Within that shape, `sqlLineKind` below draws a hard line: a schema
//   statement (CREATE/DROP/ALTER/LOCK TABLE) names table structure and is
//   safe to quote as evidence, the same way dotenv-exposure-check quotes a
//   variable NAME rather than its value. A data statement (INSERT/REPLACE/
//   COPY ... FROM stdin) carries actual row *content* -- real customer
//   data, potentially -- and its line text is never quoted anywhere; only
//   a count of how many such lines were seen is ever shown.
//
// What each classification means:
//
//   exposed     The path returned 200 and its body is confirmed either a
//               real archive (matched magic bytes) or a real SQL dump
//               (matched shape) -- not an unrelated page. Two severities:
//                 critical  an archive's magic bytes matched exactly, or
//                           the SQL dump carries an explicit dump-tool
//                           header comment ("-- MySQL dump", "-- pg_dump",
//                           phpMyAdmin's own header) -- the strongest
//                           signal available.
//                 danger    the body has the structural shape of a SQL
//                           dump (multiple CREATE/INSERT-style statement
//                           lines) but no explicit tool header was found --
//                           still real evidence, just one notch softer.
//   blocked     The path returned a clean 401/403/404/410 -- not reachable.
//               A healthy outcome, whether the file was never there or a
//               server rule already denies it.
//   not-backup  The path returned 200, but the body matches neither a known
//               archive signature nor a SQL dump shape (most likely a
//               soft-404 catch-all page, or an HTML/text 200 unrelated to
//               any of this). Reported separately from `blocked` because it
//               says something about the server's behaviour, but it is not
//               evidence of an exposure either way.
//   error       The request itself failed without a clean HTTP status
//               (network error, timeout, a browser's CORS-blocked "failed to
//               fetch"). Never read as either exposed or safe.

// Archive magic-byte signatures, checked at the start of the body. Every one
// of these is a well-documented file-format header, not a guess -- ZIP's
// four-byte local-file-header and end-of-central-directory signatures, gzip's
// two-byte magic, bzip2's three-ASCII-byte "BZh", and 7-Zip's six-byte magic
// are all published in each format's own specification.
const ARCHIVE_SIGNATURES = [
  { name: 'ZIP archive', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'ZIP archive (empty)', bytes: [0x50, 0x4b, 0x05, 0x06] },
  { name: 'ZIP archive (spanned)', bytes: [0x50, 0x4b, 0x07, 0x08] },
  { name: 'gzip archive', bytes: [0x1f, 0x8b] },
  { name: 'bzip2 archive', bytes: [0x42, 0x5a, 0x68] },
  { name: '7-Zip archive', bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
];
// tar has no leading magic -- POSIX ustar tar places its "ustar" signature at
// byte offset 257, so it is checked separately rather than folded into the
// list above.
const TAR_MAGIC_OFFSET = 257;
const TAR_MAGIC = [0x75, 0x73, 0x74, 0x61, 0x72]; // "ustar"

const HTML_SNIFF_RE = /<html[\s>]|<!doctype html/i;

const SQL_HEADER_RE =
  /^--\s*(mysql dump|phpmyadmin sql dump|postgresql database dump|dumped from database version|pg_dump)|^--\s*host:.*database:/i;
const SQL_SCHEMA_RE = /^(create table|drop table(\s+if exists)?|alter table|lock tables|unlock tables)\b/i;
const SQL_DATA_RE = /^(insert into|replace into|copy\s+\S+.*from stdin)\b/i;

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  return new Uint8Array(0);
}

function bytesStartWith(bytes, sig, offset = 0) {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function toHex(bytes, n) {
  return Array.from(bytes.slice(0, n)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** Matches the capped response bytes against every known archive signature.
 * Returns `{ name, sampleHex }` for the first match, or `null`. The hex
 * sample is a purely structural artifact (a file-format header) -- never
 * content from inside the archive, which this tool never reads. */
export function matchArchiveSignature(rawBytes) {
  const bytes = toUint8Array(rawBytes);
  for (const sig of ARCHIVE_SIGNATURES) {
    if (bytesStartWith(bytes, sig.bytes)) {
      return { name: sig.name, sampleHex: toHex(bytes, 16) };
    }
  }
  if (bytesStartWith(bytes, TAR_MAGIC, TAR_MAGIC_OFFSET)) {
    return { name: 'tar archive (ustar)', sampleHex: toHex(bytes, 16) };
  }
  return null;
}

/** Classifies each non-blank line of decoded text as a SQL dump "header"
 * (a dump tool's own identifying comment), "schema" (safe to quote --
 * table/column structure, never row data) or "data" (never quoted -- may
 * carry real row content) or `null` (not dump-shaped). Exported for tests
 * that need to check the safe/unsafe split directly. */
export function sqlLineKind(line) {
  const t = line.trim();
  if (!t) return null;
  if (SQL_HEADER_RE.test(t)) return 'header';
  if (SQL_SCHEMA_RE.test(t)) return 'schema';
  if (SQL_DATA_RE.test(t)) return 'data';
  return null;
}

/** Scans decoded text for a SQL dump shape. Never returns a "data"
 * (INSERT/REPLACE/COPY ... FROM stdin) line's own text anywhere in its
 * result -- only a count of how many were seen. `schemaSamples` holds up to
 * three schema-statement lines (table/column structure only), capped to 120
 * characters each. */
export function detectSqlDump(text) {
  if (typeof text !== 'string' || !text) return null;
  if (HTML_SNIFF_RE.test(text)) return null;

  const lines = text.split(/\r?\n/);
  let headerLine = null;
  let schemaCount = 0;
  let dataCount = 0;
  const schemaSamples = [];
  let totalContentLines = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    totalContentLines += 1;
    const kind = sqlLineKind(line);
    if (kind === 'header' && !headerLine) headerLine = t.slice(0, 120);
    else if (kind === 'schema') {
      schemaCount += 1;
      if (schemaSamples.length < 3) schemaSamples.push(t.slice(0, 120));
    } else if (kind === 'data') {
      dataCount += 1;
    }
  }

  if (headerLine) {
    return { severity: 'critical', headerLine, schemaSamples, schemaCount, dataCount, totalContentLines };
  }

  const signalLines = schemaCount + dataCount;
  // Require at least two structural signal lines AND a real share of the
  // content, the same "generous but real bar" dotenv-exposure-check applies
  // to its own KEY=VALUE ratio -- guards against a prose page that happens
  // to mention "CREATE TABLE" once in passing.
  if (signalLines >= 2 && signalLines / totalContentLines >= 0.2) {
    return { severity: 'danger', headerLine: null, schemaSamples, schemaCount, dataCount, totalContentLines };
  }
  return null;
}

function classifyOne(result) {
  const { path } = result;
  if (!result.ok) {
    if (result.status === 401 || result.status === 403 || result.status === 404 || result.status === 410) {
      return { path, category: 'blocked', status: result.status, url: result.url, evidence: null, error: null };
    }
    return { path, category: 'error', status: result.status ?? null, url: result.url, evidence: null, error: result.error ?? 'request failed' };
  }

  const bytes = toUint8Array(result.bytes);
  const archive = matchArchiveSignature(bytes);
  if (archive) {
    return {
      path,
      category: 'exposed',
      status: result.status,
      url: result.url,
      kind: 'archive',
      severity: 'critical',
      evidence: { signature: archive.name, sampleHex: archive.sampleHex },
      error: null,
    };
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const sql = detectSqlDump(text);
  if (sql) {
    return {
      path,
      category: 'exposed',
      status: result.status,
      url: result.url,
      kind: 'sql-dump',
      severity: sql.severity,
      evidence: {
        headerLine: sql.headerLine,
        schemaSamples: sql.schemaSamples,
        schemaCount: sql.schemaCount,
        dataCount: sql.dataCount,
      },
      error: null,
    };
  }

  return { path, category: 'not-backup', status: result.status, url: result.url, evidence: null, error: null };
}

/**
 * @param {string} baseUrl - the site checked, for display only
 * @param {object[]} results - probe.mjs's per-path raw results
 */
export function buildReport(baseUrl, results) {
  const list = Array.isArray(results) ? results : [];
  const classified = list.map(classifyOne);

  const exposed = classified.filter((c) => c.category === 'exposed');
  const blocked = classified.filter((c) => c.category === 'blocked');
  const notBackup = classified.filter((c) => c.category === 'not-backup');
  const errors = classified.filter((c) => c.category === 'error');

  const findings = exposed.map((c) => {
    const critical = c.severity === 'critical';
    const title = critical
      ? `"${c.path}" is publicly readable and confirmed as a real ${c.kind === 'archive' ? 'archive' : 'SQL dump'}`
      : `"${c.path}" is publicly readable and looks like a SQL dump`;
    const detail =
      c.kind === 'archive'
        ? `The response matched the real ${c.evidence.signature} file-format header (${c.evidence.sampleHex}). ` +
          `This tool never lists, extracts, or reads a file from inside the archive -- confirming the header is ` +
          `already enough to know a backup is exposed.`
        : c.evidence.headerLine
          ? `The response opens with a real dump-tool header comment ("${c.evidence.headerLine}"). ` +
            `${c.evidence.dataCount} row-data statement(s) were seen but never read into this report -- ` +
            `only schema statements (table/column structure) are ever quoted.`
          : `The response has the structural shape of a SQL dump (${c.evidence.schemaCount} schema statement(s), ` +
            `${c.evidence.dataCount} row-data statement(s)) without an explicit dump-tool header. ` +
            `Row-data statement text is never quoted in this report -- only schema statements are.`;
    return {
      id: `backup-exposed-${c.path.replace(/[^a-z0-9]+/gi, '-')}`,
      severity: c.severity,
      kind: c.kind,
      path: c.path,
      url: c.url,
      evidence: c.evidence,
      title,
      detail,
    };
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const exposedCount = findings.length;

  return {
    baseUrl,
    pathsChecked: classified.length,
    classified,
    findings,
    blocked,
    notBackup,
    errors,
    criticalCount,
    dangerCount,
    exposedCount,
    incomplete: errors.length > 0,
    ok: exposedCount === 0,
  };
}
