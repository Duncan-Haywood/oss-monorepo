// Zero-dependency, deterministic diff between a package.json "exports" map's
// literal file targets and the files that actually exist on disk (CLI) or
// were pasted as a file listing (browser page). No network access here --
// callers (cli.mjs, index.html) supply the package.json text and the file
// list; this module only parses and compares.
//
// This is a publish-safety check, not a bundler: it never runs the package,
// never resolves imports, and never reads a file's contents -- only whether
// each literal path the "exports" map names actually exists.

/**
 * Parses package.json text. Throws a short, human-readable Error on invalid
 * JSON rather than letting JSON.parse's cryptic message through.
 */
export function parsePackageJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`not valid JSON: ${err.message}`);
  }
}

// Recursively walks a node of the "exports" value, appending one entry per
// leaf string target it finds. `condPath` accumulates the chain of condition
// keys (e.g. ["import", "types"]) purely for reporting -- it plays no part
// in which paths get checked, because a customer's runtime picks exactly one
// branch and a maintainer cannot know in advance which one, so every branch
// that names a file is checked.
function walkExportsValue(value, subpath, condPath, out) {
  if (value === null || value === undefined) return; // explicit "not exported" -- not a file target
  if (typeof value === "string") {
    out.push({ subpath, condition: condPath.join(" > ") || null, target: value });
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkExportsValue(v, subpath, condPath, out);
    return;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value)) walkExportsValue(v, subpath, [...condPath, key], out);
  }
}

/**
 * Flattens a package.json "exports" field (any of its shapes: a bare
 * string, a subpath map, a nested condition map, or fallback arrays at any
 * level) into a flat list of { subpath, condition, target } entries, one per
 * leaf string. Returns [] for a missing/null exports field.
 */
export function extractExportEntries(exportsField) {
  const entries = [];
  if (exportsField == null) return entries;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    walkExportsValue(exportsField, ".", [], entries);
    return entries;
  }
  if (typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    const isSubpathMap = keys.length > 0 && keys.every((k) => k.startsWith("."));
    if (isSubpathMap) {
      for (const [subpath, v] of Object.entries(exportsField)) walkExportsValue(v, subpath, [], entries);
    } else {
      // A bare condition map (import/require/types/...) for the root ".".
      walkExportsValue(exportsField, ".", [], entries);
    }
  }
  return entries;
}

/**
 * Splits flattened entries into three groups:
 *   literal  -- a relative file path ("./..." or "../...") with no glob --
 *               the only group whose existence this tool can check.
 *   wildcard -- contains "*" (e.g. "./features/*"); resolving one requires
 *               matching real files against a pattern, out of scope for v0.
 *   external -- does not start with "." at all (a bare specifier re-exporting
 *               another package's subpath) -- nothing on disk to check.
 */
export function classifyExportEntries(entries) {
  const literal = [];
  const wildcard = [];
  const external = [];
  for (const entry of entries) {
    if (entry.target.includes("*")) wildcard.push(entry);
    else if (entry.target.startsWith(".")) literal.push(entry);
    else external.push(entry);
  }
  return { literal, wildcard, external };
}

/** Strips one leading "./" so a target and a listed file compare equal regardless of which form either was written in. */
export function normalizePath(p) {
  return String(p ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Parses a newline-separated file listing (e.g. `git ls-files`, `find . -type f`)
 * into a Set of normalized relative paths.
 */
export function parseFileList(text) {
  const files = new Set();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    files.add(normalizePath(line));
  }
  return files;
}

/**
 * Compares literal export entries against a set of files known to exist.
 * `fileExists(target)` receives the *original* (unnormalized) target string
 * so a filesystem-backed caller (cli.mjs) can resolve it relative to the
 * package.json's own directory; a text-listing caller (index.html) can pass
 * `(t) => fileSet.has(normalizePath(t))` instead.
 */
export function diffExports({ literal, fileExists }) {
  const missing = [];
  const matched = [];
  for (const entry of literal) {
    if (fileExists(entry.target)) matched.push(entry);
    else missing.push(entry);
  }
  missing.sort((a, b) => a.target.localeCompare(b.target) || a.subpath.localeCompare(b.subpath));
  return { missing, matched };
}

export function summarize(report, { wildcardCount = 0, externalCount = 0 } = {}) {
  const skippedNote = wildcardCount > 0 || externalCount > 0
    ? ` (${wildcardCount ? `${wildcardCount} wildcard` : ""}${wildcardCount && externalCount ? ", " : ""}${externalCount ? `${externalCount} external` : ""} entr${wildcardCount + externalCount === 1 ? "y" : "ies"} not checked)`
    : "";
  if (report.missing.length === 0) {
    return {
      status: "ok",
      text: report.matched.length > 0
        ? `${report.matched.length} export target(s) exist -- nothing missing.${skippedNote}`
        : `No checkable literal export targets found.${skippedNote}`,
    };
  }
  return {
    status: "missing",
    text: `${report.missing.length} export target(s) named in package.json do not exist.${skippedNote}`,
  };
}
