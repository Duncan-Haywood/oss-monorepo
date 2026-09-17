// Deterministic npm lifecycle-script engine: parse a package-lock.json (or a
// richer local node_modules snapshot) and report which packages run code at
// install time -- and, given two point-in-time snapshots, exactly which
// packages *gained* one since the last check. No network call lives here --
// this module only reads data it is given, so the identical logic runs in
// the browser page (pasted lockfile/snapshot) and the Node CLI (files on
// disk). See README.md for the dated, sourced incidents this is built
// against.
//
// The question this answers: does a dependency run its own code the moment
// `npm install` touches it (a `preinstall`, `install`, `postinstall`, or
// `prepare` script), and -- the sharper question -- did that only start
// being true since the last snapshot you looked at. `npm audit` matches
// installed versions against a CVE database; it has nothing to say about a
// script that is not a known vulnerability, which is exactly the shape of
// every incident below. License-checker-style tools and `npm audit` both
// answer "what does this package declare right now"; this exists for "is
// that different from what it was last time", the same point-in-time-diff
// shape `ventures/license-drift-check` already uses for the license field.

// npm's own documented "lifecycle scripts" that run at install time (not
// test/build/lint scripts a maintainer runs by hand). `prepare` also runs on
// `npm install` for a git dependency, and locally when a maintainer runs
// `npm install` with no arguments in the package's own directory -- so it is
// a real install-time execution point, not just a publish-time one.
export const LIFECYCLE_SCRIPT_KEYS = ["preinstall", "install", "postinstall", "prepare"];

// --- Risk heuristics (informational only) -----------------------------
//
// This flags a script *string* for a small set of well-documented attacker
// patterns using keyword matching -- it is not a verdict that any specific
// script is malicious, and it is not exhaustive. A legitimate build step
// (compiling a native addon, running a bundler) can also fetch a network
// resource; a heuristic hit means "read this one", not "this is malware".
// See README's disclaimer.
const SHELL_PIPE_HINTS = [
  "| sh",
  "|sh",
  "| bash",
  "|bash",
  "| powershell",
  "| iex",
  "invoke-expression",
];

const NETWORK_HINTS = [
  "curl ",
  "curl\t",
  "wget ",
  "http://",
  "https://",
  "fetch(",
  "xmlhttprequest",
];

const OBFUSCATION_HINTS = [
  "base64",
  "atob(",
  "eval(",
  "fromcharcode",
  "unescape(",
];

/**
 * Buckets a lifecycle script's command text into zero or more risk tags,
 * purely by keyword match. Returns a de-duplicated array of:
 * "pipes-a-download-to-a-shell" | "makes-a-network-call" | "obfuscated-or-encoded".
 */
export function classifyScriptRisk(scriptText) {
  const norm = String(scriptText ?? "").toLowerCase();
  const tags = [];
  if (SHELL_PIPE_HINTS.some((h) => norm.includes(h))) tags.push("pipes-a-download-to-a-shell");
  if (NETWORK_HINTS.some((h) => norm.includes(h))) tags.push("makes-a-network-call");
  if (OBFUSCATION_HINTS.some((h) => norm.includes(h))) tags.push("obfuscated-or-encoded");
  return tags;
}

// --- Real, dated incidents (context, not a live feed) -------------------
//
// Every row here is a specific, publicly reported event with a date and the
// install-time mechanism it used. Not a prediction that any given dependency
// will do this -- evidence that the mechanism this tool watches has been used
// repeatedly, against widely used packages, via a routine install rather
// than a targeted attack.
export const KNOWN_INCIDENTS = [
  {
    project: "ua-parser-js",
    date: "2021-10-22",
    mechanism: "preinstall",
    note:
      "npm account hijacked; malicious versions published for roughly four hours added a preinstall.js that installed an XMRig cryptominer on Linux and a Windows password-stealing trojan, on a package with about 8 million weekly downloads.",
  },
  {
    project: "coa & rc",
    date: "2021-11-04",
    mechanism: "postinstall",
    note:
      "Two unrelated, separately maintained packages (8.8M and 14.2M weekly downloads) were hijacked the same day; both carried an identical malicious postinstall script fetching an OS-specific payload.",
  },
  {
    project: "Shai-Hulud",
    date: "2025-09-15",
    mechanism: "postinstall",
    note:
      "Self-propagating worm: a postinstall script harvested npm/GitHub credentials and cloud tokens, then used any stolen npm token to publish a trojanized version of every package that token could reach -- hundreds of packages compromised.",
  },
  {
    project: "Shai-Hulud 2.0",
    date: "2025-11",
    mechanism: "preinstall",
    note:
      "Second wave of the same worm, moved from postinstall to preinstall so the payload runs before a scanner's own install-time hooks -- over 700 packages compromised, 27,000+ malicious repos created, plus a destructive fallback if containment was detected.",
  },
];

// --- Snapshot parsing --------------------------------------------------

function scriptsSignature(scripts) {
  if (!scripts) return null;
  const entries = Object.entries(scripts).filter(([, v]) => v);
  if (!entries.length) return null;
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function normalizeEntry({ name, version, hasInstallScript, scripts }) {
  const sig = scriptsSignature(scripts);
  const riskTags = sig
    ? classifyScriptRisk(Object.values(sig).join(" && "))
    : [];
  return {
    name: String(name).trim(),
    version: version == null ? "" : String(version).trim(),
    hasInstallScript: sig ? true : Boolean(hasInstallScript),
    scripts: sig,
    riskTags,
  };
}

/**
 * Extracts {name, version, hasInstallScript} from an npm `package-lock.json`
 * (lockfileVersion 2 or 3)'s `packages` map. That map never carries the
 * script *text* -- only whether one exists -- because the lockfile records
 * the resolved tree, not each package's own manifest contents.
 */
function fromLockfilePackages(packages) {
  const entries = [];
  for (const [key, meta] of Object.entries(packages)) {
    if (key === "") continue; // the project's own root entry, not a dependency
    if (!meta || typeof meta !== "object") continue;
    const name = meta.name ? String(meta.name) : key.replace(/^.*node_modules\//, "");
    if (!name) continue;
    entries.push(
      normalizeEntry({
        name,
        version: meta.version,
        hasInstallScript: Boolean(meta.hasInstallScript),
        scripts: null,
      }),
    );
  }
  return entries;
}

/**
 * Extracts entries from a plain JSON array -- either the richer shape
 * `node cli.mjs snapshot` produces ({name, version, scripts: {...}}, with the
 * actual script text) or a simplified {name, version, hasInstallScript} list.
 */
function fromEntryArray(list) {
  const entries = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = raw.name == null ? "" : String(raw.name).trim();
    if (!name) continue;
    entries.push(
      normalizeEntry({
        name,
        version: raw.version,
        hasInstallScript: raw.hasInstallScript,
        scripts: raw.scripts,
      }),
    );
  }
  return entries;
}

function dedupeSort(entries) {
  const byName = new Map();
  for (const e of entries) byName.set(e.name, e); // last occurrence wins
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parses a snapshot given as either:
 *  - the full text of an npm `package-lock.json` (lockfileVersion 2 or 3 --
 *    detected by a top-level `packages` object), which yields `hasInstallScript`
 *    per package but never the script text itself, or
 *  - a JSON array of `{name, version, scripts}` objects -- exactly what
 *    `node cli.mjs snapshot` writes from a local `node_modules`, carrying the
 *    real script text and therefore a risk classification, or
 *  - a JSON array of `{name, version, hasInstallScript}` objects.
 *
 * Returns a de-duplicated (by name, last occurrence wins), name-sorted array
 * of `{name, version, hasInstallScript, scripts, riskTags}`.
 */
export function parseSnapshot(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `not valid JSON (${err.message}) -- paste a package-lock.json or the output of "node cli.mjs snapshot"`,
    );
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.packages && typeof data.packages === "object") {
      return dedupeSort(fromLockfilePackages(data.packages));
    }
    if (data.dependencies && typeof data.dependencies === "object") {
      throw new Error(
        "this looks like an npm lockfileVersion 1 file (no per-package \"packages\" map), which predates the hasInstallScript field -- regenerate package-lock.json with npm 7+ (lockfileVersion 2 or 3), or use \"node cli.mjs snapshot\" to read installed packages directly",
      );
    }
  }

  if (Array.isArray(data)) {
    return dedupeSort(fromEntryArray(data));
  }

  throw new Error(
    'expected a package-lock.json (lockfileVersion 2 or 3) or a JSON array of {name, version, scripts} objects from "node cli.mjs snapshot"',
  );
}

function signatureOf(entry) {
  if (!entry.hasInstallScript) return "";
  if (entry.scripts) {
    return Object.entries(entry.scripts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  }
  return "(script present -- text unknown, pasted from a package-lock.json)";
}

/**
 * Diffs two parsed snapshots (arrays of {name, version, hasInstallScript,
 * scripts, riskTags}). `ignore` is a list of package names whose change is
 * accepted and should not count toward a fail-worthy result (still
 * reported, separately).
 */
export function diffSnapshots(baseline, current, { ignore = [] } = {}) {
  const ignoreSet = new Set(ignore.map((s) => String(s).trim().toLowerCase()));
  const baseMap = new Map(baseline.map((e) => [e.name, e]));
  const curMap = new Map(current.map((e) => [e.name, e]));
  const names = new Set([...baseMap.keys(), ...curMap.keys()]);

  const added = [];
  const removed = [];
  const changed = [];
  const ignoredChanges = [];
  let unchanged = 0;

  for (const name of names) {
    const before = baseMap.get(name);
    const after = curMap.get(name);
    if (!before) {
      added.push({ name: after.name, version: after.version, hasInstallScript: after.hasInstallScript, scripts: after.scripts, riskTags: after.riskTags });
      continue;
    }
    if (!after) {
      removed.push({ name: before.name, version: before.version, hasInstallScript: before.hasInstallScript, scripts: before.scripts, riskTags: before.riskTags });
      continue;
    }
    if (signatureOf(before) === signatureOf(after)) {
      unchanged += 1;
      continue;
    }
    const kind = !before.hasInstallScript && after.hasInstallScript
      ? "gained"
      : before.hasInstallScript && !after.hasInstallScript
        ? "lost"
        : "modified";
    const entry = {
      name,
      beforeVersion: before.version,
      afterVersion: after.version,
      kind,
      beforeHasInstallScript: before.hasInstallScript,
      afterHasInstallScript: after.hasInstallScript,
      beforeScripts: before.scripts,
      afterScripts: after.scripts,
      riskTags: after.riskTags,
    };
    if (ignoreSet.has(name.toLowerCase())) ignoredChanges.push(entry);
    else changed.push(entry);
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  added.sort(byName);
  removed.sort(byName);
  changed.sort(byName);
  ignoredChanges.sort(byName);

  return {
    added,
    removed,
    changed,
    ignoredChanges,
    unchanged,
    totalBaseline: baseline.length,
    totalCurrent: current.length,
  };
}

export function summarizeDiff(result) {
  const gained = result.changed.filter((c) => c.kind === "gained").length;
  const addedWithScript = result.added.filter((a) => a.hasInstallScript).length;
  const newlyScripted = gained + addedWithScript;
  if (newlyScripted > 0) {
    return {
      status: "changed",
      text: `${newlyScripted} package(s) now run an install-time script that did not before.`,
    };
  }
  const otherChanges = result.changed.length;
  if (otherChanges > 0) {
    return {
      status: "changed",
      text: `${otherChanges} package(s) changed their install-time script since the last snapshot (none newly gained one).`,
    };
  }
  const parts = [
    "No new install-time scripts.",
    `${result.added.length} added`,
    `${result.removed.length} removed`,
    `${result.unchanged} unchanged`,
  ];
  if (result.ignoredChanges.length) parts.push(`${result.ignoredChanges.length} ignored`);
  return { status: "ok", text: parts.join(" ").replace("scripts. ", "scripts: ") };
}

/** Every entry in a single snapshot that runs code at install time right now, sorted worst-first by risk tag count. */
export function currentlyScripted(entries) {
  return entries
    .filter((e) => e.hasInstallScript)
    .sort((a, b) => b.riskTags.length - a.riskTags.length || a.name.localeCompare(b.name));
}
