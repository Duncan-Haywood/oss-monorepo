// Pure-ish logic for PyPI Provenance Check: turn a pasted requirements.txt,
// a PEP 621 pyproject.toml `[project] dependencies` array, or a freeform
// "name==version" list into packages to look up, and turn PyPI's own
// answers into a report.
//
// Unlike npm's registry (one call per package returns everything, including
// `dist.attestations.provenance`), PyPI publishes provenance as a *separate*
// per-file endpoint (PEP 740's integrity API), so a lookup is two calls:
//   1. GET /pypi/<name>[/<version>]/json  -- resolve the version and its files
//   2. GET /integrity/<name>/<version>/<filename>/provenance  -- the attestation
// `lookupPackage` below is the one place that orchestrates both; everything
// else here is a pure function testable with fixture data alone.

/** PEP 503 name normalisation: lowercase, runs of -_. collapse to one "-". */
export function normalizePackageName(name) {
  return String(name).toLowerCase().replace(/[-_.]+/g, "-");
}

/**
 * Parses one PEP 508-ish dependency specifier ("requests", "requests==2.31.0",
 * "requests[security]>=2.31.0", "click==8.1.7; python_version<'3.11'") into
 * `{ name, version }`, where `version` is an exact pin only when the *entire*
 * specifier is a single `==`, and `null` (check latest) for anything looser --
 * a range, multiple specifiers, or no specifier at all. Extras and
 * environment markers are recognised and dropped, never treated as part of
 * the name or version. Returns `null` when no name-like token is found.
 */
export function parseDependencySpecifier(raw) {
  let line = String(raw).split(";")[0].trim(); // drop the environment marker
  if (!line) return null;
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(\[[^\]]*\])?\s*(.*)$/.exec(line);
  if (!match) return null;
  const [, name, , rest] = match;
  if (!name) return null;
  const specifier = rest.trim();
  if (!specifier) return { name, version: null };
  const exactPin = /^==\s*([A-Za-z0-9][A-Za-z0-9.!+_*-]*)$/.exec(specifier);
  return { name, version: exactPin ? exactPin[1] : null };
}

function addSeen(seen, name, version) {
  if (!name) return;
  const key = normalizePackageName(name);
  const existing = seen.get(key);
  // Prefer an exact version over a null (unpinned) one for the same name, so
  // one pinned mention wins over a looser mention of the same package.
  if (!existing || (existing.version === null && version !== null)) {
    seen.set(key, { name, version });
  }
}

function fromLines(text) {
  const seen = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const hashIdx = rawLine.indexOf("#");
    let line = (hashIdx === -1 ? rawLine : rawLine.slice(0, hashIdx)).trim();
    if (!line) continue;
    if (line.startsWith("-")) continue; // pip options: -r, -e, --hash, -i, --index-url, ...
    if (/:\/\//.test(line) || /^[a-z][a-z0-9+.-]*\+/i.test(line)) continue; // URLs and VCS refs (git+, hg+, ...)
    const parsed = parseDependencySpecifier(line);
    if (parsed) addSeen(seen, parsed.name, parsed.version);
  }
  return [...seen.values()];
}

/**
 * Finds `key = [ ... ]` in TOML source and returns the array's inner text,
 * respecting brackets nested inside quoted strings (an extras spec like
 * "requests[security]>=2.31.0" contains a "]" that is not the array's own
 * close). Not a general TOML parser -- scoped to exactly this shape.
 */
function extractTomlArray(text, key) {
  const re = new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*\\[`);
  const m = re.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  const start = i;
  let depth = 1;
  let inString = null;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (inString) {
      if (c === "\\") { i += 2; continue; }
      if (c === inString) inString = null;
    } else if (c === '"' || c === "'") {
      inString = c;
    } else if (c === "[") {
      depth += 1;
    } else if (c === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  return text.slice(start, i);
}

function fromPyprojectToml(text) {
  const projectSection = /\[project\]([\s\S]*?)(\n\[|$)/.exec(text);
  const scope = projectSection ? projectSection[1] : text;
  const arrayBody = extractTomlArray(scope, "dependencies");
  if (arrayBody === null) return [];
  const seen = new Map();
  const stringRe = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = stringRe.exec(arrayBody))) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (!raw) continue;
    const parsed = parseDependencySpecifier(raw);
    if (parsed) addSeen(seen, parsed.name, parsed.version);
  }
  return [...seen.values()];
}

/**
 * Recognises, in order: a PEP 621 `pyproject.toml` with a `[project]`
 * `dependencies = [...]` array; otherwise a `requirements.txt` (pip's
 * `pip freeze` output pins with `==`) or a freeform list, one package per
 * line -- the same line grammar handles both.
 */
export function parseInput(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  if (/(^|\n)\s*\[project\]/.test(trimmed) && /dependencies\s*=\s*\[/.test(trimmed)) {
    return fromPyprojectToml(trimmed);
  }
  const entries = fromLines(trimmed);
  if (!entries.length) {
    throw new Error("Couldn't find a package name on any line. One per line: \"name\" or \"name==version\".");
  }
  return entries;
}

export function metadataUrl(name, version) {
  const n = encodeURIComponent(normalizePackageName(name));
  return version
    ? `https://pypi.org/pypi/${n}/${encodeURIComponent(version)}/json`
    : `https://pypi.org/pypi/${n}/json`;
}

export function provenanceUrl(name, version, filename) {
  const n = encodeURIComponent(normalizePackageName(name));
  return `https://pypi.org/integrity/${n}/${encodeURIComponent(version)}/${encodeURIComponent(filename)}/provenance`;
}

/** Prefers the wheel PyPI's own resolver would install; falls back to the first file (usually the sdist). */
export function pickDistributionFile(files) {
  if (!Array.isArray(files) || !files.length) return null;
  const chosen = files.find((f) => f && f.packagetype === "bdist_wheel") || files[0];
  return chosen && chosen.filename ? { filename: chosen.filename, packagetype: chosen.packagetype || null } : null;
}

/**
 * Stage 1: turns the `GET /pypi/<name>[/<version>]/json` response into
 * either a terminal row (`done: true`, package/version not found or no
 * distributable file) or a `pending` lookup describing the file whose
 * provenance stage 2 must check.
 */
export function rowFromMetadata({ name, version }, { httpStatus, body, error } = {}) {
  const notFoundDetail = `${name}${version ? `@${version}` : ""} was not found on PyPI.`;
  if (error || !body) {
    return {
      done: true,
      row: {
        name, requestedVersion: version, resolvedVersion: null, hasProvenance: null,
        file: null, publisher: null,
        status: httpStatus === 404 ? "not-found" : "error",
        detail: httpStatus === 404 ? notFoundDetail : (error ? String(error.message || error) : `PyPI returned HTTP ${httpStatus}`),
      },
    };
  }
  const resolvedVersion = version || (body.info && body.info.version) || null;
  const file = pickDistributionFile(body.urls);
  if (!resolvedVersion || !file) {
    return {
      done: true,
      row: {
        name, requestedVersion: version, resolvedVersion, hasProvenance: null,
        file: null, publisher: null, status: "error",
        detail: "No published distribution file found for this release.",
      },
    };
  }
  return { done: false, pending: { name, requestedVersion: version, resolvedVersion, filename: file.filename } };
}

function publisherDetail(publisher) {
  if (publisher && publisher.kind === "GitHub" && publisher.repository) {
    return `Published with a provenance attestation via GitHub Actions from ${publisher.repository}` +
      `${publisher.workflow ? ` (${publisher.workflow})` : ""}.`;
  }
  return "Published with a provenance attestation.";
}

/** Stage 2: turns the `GET /integrity/.../provenance` response into the final report row. */
export function rowFromProvenance(pending, { httpStatus, body, error } = {}) {
  const { name, requestedVersion, resolvedVersion, filename } = pending;
  const base = { name, requestedVersion, resolvedVersion, file: filename };
  if (error) {
    return { ...base, hasProvenance: null, publisher: null, status: "error", detail: String(error.message || error) };
  }
  if (httpStatus === 404) {
    return { ...base, hasProvenance: false, publisher: null, status: "ok", detail: "No provenance attestation on this file." };
  }
  if (httpStatus !== 200 || !body) {
    return { ...base, hasProvenance: null, publisher: null, status: "error", detail: `PyPI integrity API returned HTTP ${httpStatus}` };
  }
  const bundles = Array.isArray(body.attestation_bundles) ? body.attestation_bundles : [];
  const hasProvenance = bundles.length > 0;
  const publisher = hasProvenance ? bundles[0].publisher || null : null;
  return {
    ...base, hasProvenance, publisher, status: "ok",
    detail: hasProvenance ? publisherDetail(publisher) : "No provenance attestation on this file.",
  };
}

/** Runs both lookup stages for one package. The only function here that calls `fetchImpl`. */
export async function lookupPackage(pkg, { fetchImpl }) {
  let metaRes;
  try {
    metaRes = await fetchImpl(metadataUrl(pkg.name, pkg.version));
  } catch (error) {
    return rowFromMetadata(pkg, { error }).row;
  }
  let metaBody = null;
  try {
    if (metaRes.ok) metaBody = await metaRes.json();
  } catch { /* leave metaBody null; reported as a lookup error below */ }
  const stage1 = rowFromMetadata(pkg, { httpStatus: metaRes.status, body: metaBody });
  if (stage1.done) return stage1.row;

  const { pending } = stage1;
  try {
    const provRes = await fetchImpl(provenanceUrl(pending.name, pending.resolvedVersion, pending.filename));
    let provBody = null;
    try { provBody = await provRes.json(); } catch { /* leave provBody null */ }
    return rowFromProvenance(pending, { httpStatus: provRes.status, body: provBody });
  } catch (error) {
    return rowFromProvenance(pending, { error });
  }
}

/** Rolls up a list of report rows into counts. */
export function summarizeReport(rows) {
  const summary = { total: rows.length, withProvenance: 0, withoutProvenance: 0, notFound: 0, errors: 0 };
  for (const row of rows) {
    if (row.status === "not-found") summary.notFound += 1;
    else if (row.status === "error") summary.errors += 1;
    else if (row.hasProvenance) summary.withProvenance += 1;
    else summary.withoutProvenance += 1;
  }
  return summary;
}

/** Runs `fn(item)` over `items` with at most `concurrency` in flight -- polite to PyPI on a large requirements file. */
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.max(1, Math.min(concurrency, items.length)); i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}
