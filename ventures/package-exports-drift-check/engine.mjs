// Zero-dependency, deterministic diff between a package.json "exports" map's
// literal file targets and the files that actually exist on disk (CLI) or
// were pasted as a file listing (browser page). No network access here --
// callers (cli.mjs, index.html) supply the package.json text and the file
// list; this module only parses and compares.
//
// This is a publish-safety check, not a bundler: it never runs the package,
// never resolves imports, and never reads a file's contents -- only whether
// each literal path the "exports" map names actually exists. Which file a
// given import reaches is resolve.mjs's job, checked against Node itself.

import { resolveExports } from "./resolve.mjs";

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
 *   literal  -- a "./" target that names one file. A target with "*" under
 *               a key without "*" is literal too: Node reads the "*" as part
 *               of the file name. So is a target without "*" under a
 *               pattern key, which sends every match to that one file.
 *   wildcard -- a "*" target under a "*" key ("./features/*": "./src/*.js"),
 *               checked by checkWildcards against the file listing.
 *   invalid  -- a target Node refuses with ERR_INVALID_PACKAGE_TARGET: one
 *               that does not start with "./" ("dist/index.js", a bare
 *               package name, "../x", "/abs", a URL) or that contains a ".",
 *               ".." or "node_modules" segment. "exports" cannot re-export
 *               another package; only "imports" can.
 */
export function classifyExportEntries(entries) {
  const literal = [];
  const wildcard = [];
  const invalid = [];
  for (const entry of entries) {
    const pattern = entry.subpath.includes("*") && entry.subpath.indexOf("*") === entry.subpath.lastIndexOf("*");
    const probe = pattern
      ? resolveExports({ [entry.subpath]: entry.target }, replaceFirstStar(entry.subpath, "x"), { conditions: [] })
      : resolveExports({ ".": entry.target }, ".", { conditions: [] });
    if (!pattern && entry.subpath !== "." && entry.subpath.endsWith("/")) invalid.push({ ...entry, reason: folderMappingReason(entry.subpath) });
    else if (!probe.ok && probe.code === "ERR_INVALID_PACKAGE_TARGET") invalid.push({ ...entry, reason: invalidReason(entry.target) });
    else if (pattern && entry.target.includes("*")) wildcard.push(entry);
    else literal.push(entry);
  }
  return { literal, wildcard, invalid };
}

// Node 17 removed folder mappings: a key ending in "/" with no "*" matches
// no import at all (ERR_PACKAGE_PATH_NOT_EXPORTED), so its target is never
// read, whatever is on disk.
function folderMappingReason(subpath) {
  return `is a folder mapping, which Node 17 removed: no import matches the key "${subpath}" (ERR_PACKAGE_PATH_NOT_EXPORTED); write ${JSON.stringify(subpath + "*")} with a "*" target instead`;
}

function invalidReason(target) {
  if (!target.startsWith("./")) {
    if (target.startsWith("../") || target === "..") return `points outside the package; Node only allows targets inside it, starting with "./"`;
    if (target.startsWith("/")) return `is an absolute path; "exports" targets must start with "./"`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return `is a URL; "exports" targets must start with "./"`;
    return `does not start with "./"; Node does not read it as a file, and "exports" cannot point at another package (only "imports" can)`;
  }
  return `contains a ".", ".." or "node_modules" path segment, which Node refuses`;
}

/**
 * For each wildcard entry, the listed files its target pattern can reach.
 * Every "*" in a target is replaced by the same non-empty text, as Node
 * does. An entry that reaches no listed file is the wildcard form of a
 * missing target: every import through it fails.
 */
export function checkWildcards(wildcard, fileSet) {
  const files = [...fileSet];
  return wildcard.map((entry) => {
    const t = normalizePath(entry.target);
    const parts = t.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp("^" + parts[0] + parts.slice(1).map((p, i) => (i === 0 ? "(.+)" : "\\1") + p).join("") + "$");
    // Node refuses a request whose "*" part holds a ".", ".." or
    // "node_modules" segment (ERR_INVALID_MODULE_SPECIFIER), so such a file
    // is not reachable through the pattern.
    const reached = files.filter((f) => {
      const m = re.exec(f);
      return m && !m[1].split("/").some((seg) => seg === "." || seg === ".." || seg.toLowerCase() === "node_modules");
    }).sort();
    return {
      ...entry,
      reached,
      examples: reached.slice(0, 3).map((f) => ({ file: f, subpath: replaceFirstStar(entry.subpath, re.exec(f)[1]) })),
    };
  });
}

/**
 * Problems Node reports for the "exports" map as a whole, before any target
 * is looked at: a map that mixes "." keys with condition keys
 * (ERR_INVALID_PACKAGE_CONFIG on every import) and numeric condition keys.
 */
export function exportsConfigErrors(exportsField) {
  const errors = [];
  if (exportsField && typeof exportsField === "object" && !Array.isArray(exportsField)) {
    const keys = Object.keys(exportsField);
    const dot = keys.filter((k) => k.startsWith("."));
    if (dot.length && dot.length !== keys.length) {
      errors.push(`"exports" mixes subpath keys (${dot.slice(0, 3).map((k) => JSON.stringify(k)).join(", ")}) with condition keys (${keys.filter((k) => !k.startsWith(".")).slice(0, 3).map((k) => JSON.stringify(k)).join(", ")}): Node throws ERR_INVALID_PACKAGE_CONFIG for every import of this package`);
    }
  }
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (/^(0|[1-9][0-9]*)$/.test(k) && Number(k) < 4294967295) errors.push(`numeric key "${k}" under ${where}: Node throws ERR_INVALID_PACKAGE_CONFIG when it reaches it`);
        walk(x, k.startsWith(".") ? JSON.stringify(k) : where);
      }
    }
  };
  walk(exportsField, '"exports"');
  return errors;
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

export function summarize(report, { wildcardCount = 0, invalidCount = 0, unmatchedWildcardCount = 0, configErrorCount = 0 } = {}) {
  const problems = [];
  if (configErrorCount) problems.push(`${configErrorCount} map-level error(s) Node rejects`);
  if (report.missing.length) problems.push(`${report.missing.length} export target(s) named in package.json do not exist`);
  if (invalidCount) problems.push(`${invalidCount} target(s) Node refuses as invalid`);
  if (unmatchedWildcardCount) problems.push(`${unmatchedWildcardCount} wildcard target(s) match no listed file`);
  const checked = report.matched.length + (wildcardCount - unmatchedWildcardCount);
  if (problems.length === 0) {
    return {
      status: "ok",
      text: checked > 0
        ? `${report.matched.length} export target(s) exist${wildcardCount ? ` and ${wildcardCount} wildcard target(s) each reach at least one file` : ""} -- nothing missing.`
        : `No checkable export targets found.`,
    };
  }
  return { status: "missing", text: problems.join("; ") + "." };
}

/** Substitute the single "*" of an exports pattern key (first occurrence only, like Node). */
function replaceFirstStar(key, value) {
  const i = key.indexOf("*");
  return i === -1 ? key : key.slice(0, i) + value + key.slice(i + 1);
}
