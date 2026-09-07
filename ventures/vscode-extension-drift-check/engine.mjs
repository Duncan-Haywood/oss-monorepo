// Deterministic editor-extension drift engine: parse a snapshot of installed
// VS Code / Cursor / Windsurf / VSCodium extensions and report which ones
// changed since an earlier snapshot -- and, more specifically, whether what
// changed was just the version number or the extension's own declared
// *surface* (what triggers it, what it can load). No network call lives
// here -- this module only reads data it is given, so the identical logic
// runs in the browser page (pasted snapshot) and the Node CLI (files on
// disk). See README.md for the dated, sourced incidents this is built
// against, and cli.mjs's `check` command for the one thing this module
// cannot answer on its own: whether an installed extension is still listed
// on the marketplace it came from.
//
// The question this answers: since you last looked, did an extension you
// already trust start doing something it didn't declare before -- a new
// activation event (when it wakes up), a new extension it now pulls in, or a
// changed entry point (what code runs). A version bump alone is routine and
// is not flagged as risky on its own; a *surface* change is the signal, the
// same distinction license-drift-check draws for a license field and
// npm-lifecycle-script-check draws for an install-time script.

/** Manifest fields this engine compares between two snapshots of the same extension. */
export const SURFACE_FIELDS = ["activationEvents", "main", "browser", "extensionDependencies"];

// Editor extensions have no formal, granular permission model the way a
// browser extension does -- there is no manifest field enumerating "reads
// your clipboard" or "makes network requests". What *is* declared, and what
// every documented incident below actually changed, is when the extension's
// code first runs (activationEvents) and what code that is (main/browser,
// extensionDependencies). `*` and `onStartupFinished` mean "run immediately,
// every time the editor starts, unconditionally" -- the broadest activation
// surface an extension can declare.
const STARTUP_ACTIVATION_EVENTS = new Set(["*", "onStartupFinished"]);

/**
 * Buckets a diffed extension's surface change into zero or more risk tags.
 * `before`/`after` are normalized entries (see normalizeEntry). Purely
 * structural -- it is not a verdict that any specific change is malicious.
 */
export function classifySurfaceRisk(before, after) {
  const tags = [];
  const beforeEvents = new Set(before?.activationEvents ?? []);
  const afterEvents = new Set(after?.activationEvents ?? []);
  const gainedStartup = [...afterEvents].some(
    (e) => STARTUP_ACTIVATION_EVENTS.has(e) && !beforeEvents.has(e),
  );
  if (gainedStartup) tags.push("gained-startup-activation");

  const beforeDeps = new Set(before?.extensionDependencies ?? []);
  const afterDeps = new Set(after?.extensionDependencies ?? []);
  const gainedDep = [...afterDeps].some((d) => !beforeDeps.has(d));
  if (gainedDep) tags.push("gained-extension-dependency");

  if (before?.main != null && after?.main != null && before.main !== after.main) {
    tags.push("entry-point-changed");
  }
  if (before?.browser != null && after?.browser != null && before.browser !== after.browser) {
    tags.push("entry-point-changed");
  }
  return [...new Set(tags)];
}

// --- Real, dated incidents (context, not a live feed) -------------------
export const KNOWN_INCIDENTS = [
  {
    project: "GlassWorm (Open VSX)",
    date: "2026-01-31",
    marketplace: "Open VSX",
    note:
      "Self-propagating campaign that has abused at least 72 Open VSX extensions since this date, mimicking widely used linters, formatters, code runners, and AI-coding-assistant tools to reach developer machines.",
  },
  {
    project: "Nx Console",
    date: "2026-05-18",
    marketplace: "VS Code Marketplace",
    note:
      "A trojanized version of the Nx Console extension was live for roughly 18 minutes (12:30-12:48 UTC) before takedown, distributing a credential stealer that harvested 1Password vaults, Claude Code configuration, and npm/GitHub/AWS tokens from anyone who updated during that window.",
  },
];

// --- Snapshot parsing --------------------------------------------------

function normalizeList(list) {
  if (!Array.isArray(list)) return null;
  const cleaned = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].sort();
  return cleaned;
}

function normalizeEntry(raw) {
  const publisher = raw.publisher != null ? String(raw.publisher).trim() : "";
  const name = raw.name != null ? String(raw.name).trim() : "";
  const id = (raw.id ? String(raw.id).trim() : `${publisher}.${name}`).toLowerCase();
  const activationEvents = normalizeList(raw.activationEvents);
  const extensionDependencies = normalizeList(raw.extensionDependencies);
  const main = raw.main != null ? String(raw.main).trim() : null;
  const browser = raw.browser != null ? String(raw.browser).trim() : null;
  const surfaceKnown =
    activationEvents !== null || extensionDependencies !== null || main !== null || browser !== null;
  return {
    id,
    publisher,
    name,
    version: raw.version == null ? "" : String(raw.version).trim(),
    activationEvents,
    extensionDependencies,
    main,
    browser,
    surfaceKnown,
  };
}

/** `publisher.name@version` per line -- the exact output of `code --list-extensions --show-versions`. */
const LIST_EXTENSIONS_LINE = /^([\w-]+)\.([\w.-]+)@([\w.+-]+)\s*$/;

function fromListExtensionsText(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = LIST_EXTENSIONS_LINE.exec(trimmed);
    if (!m) throw new Error(`not a recognised snapshot: line "${trimmed}" is not "publisher.name@version"`);
    const [, publisher, name, version] = m;
    entries.push(normalizeEntry({ publisher, name, version }));
  }
  return entries;
}

function dedupeSort(entries) {
  const byId = new Map();
  for (const e of entries) byId.set(e.id, e); // last occurrence wins
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Parses a snapshot given as either:
 *  - a JSON array of `{id?, publisher, name, version, activationEvents, main,
 *    browser, extensionDependencies}` objects -- exactly what
 *    `node cli.mjs snapshot` writes from a local extensions directory, and
 *    the only format that carries the surface fields, or
 *  - the plain-text output of `code --list-extensions --show-versions` (or
 *    the Cursor/Windsurf/VSCodium equivalent) -- `publisher.name@version`
 *    per line, id and version only, no surface data.
 *
 * Returns a de-duplicated (by id, last occurrence wins), id-sorted array.
 */
export function parseSnapshot(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") || raw.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`not valid JSON (${err.message})`);
    }
    if (!Array.isArray(data)) {
      throw new Error('expected a JSON array of extension entries from "node cli.mjs snapshot"');
    }
    return dedupeSort(data.map((raw2) => normalizeEntry(raw2 && typeof raw2 === "object" ? raw2 : {})));
  }

  return dedupeSort(fromListExtensionsText(raw));
}

function signatureOf(entry) {
  if (!entry.surfaceKnown) return null;
  return JSON.stringify({
    activationEvents: entry.activationEvents,
    extensionDependencies: entry.extensionDependencies,
    main: entry.main,
    browser: entry.browser,
  });
}

/**
 * Diffs two parsed snapshots. `ignore` is a list of extension ids whose
 * change is accepted and should not count toward a fail-worthy result
 * (still reported, separately).
 */
export function diffSnapshots(baseline, current, { ignore = [] } = {}) {
  const ignoreSet = new Set(ignore.map((s) => String(s).trim().toLowerCase()));
  const baseMap = new Map(baseline.map((e) => [e.id, e]));
  const curMap = new Map(current.map((e) => [e.id, e]));
  const ids = new Set([...baseMap.keys(), ...curMap.keys()]);

  const added = [];
  const removed = [];
  const changed = [];
  const ignoredChanges = [];
  let unchanged = 0;

  for (const id of ids) {
    const before = baseMap.get(id);
    const after = curMap.get(id);
    if (!before) {
      added.push(after);
      continue;
    }
    if (!after) {
      removed.push(before);
      continue;
    }
    const versionChanged = before.version !== after.version;
    // Both sides lacking surface data (two plain `code --list-extensions`
    // snapshots) is the common, low-friction path -- that comparison is
    // simply not attempted, and is not reported as uncertain. Only a
    // *mismatch* in kind (one snapshot carries surface data, the other
    // doesn't) is a genuine "cannot confirm", and that must never be
    // silently folded into "unchanged".
    const surfaceComparable = before.surfaceKnown && after.surfaceKnown;
    const surfaceUnknown = before.surfaceKnown !== after.surfaceKnown;
    const surfaceChanged = surfaceComparable && signatureOf(before) !== signatureOf(after);
    if (!versionChanged && !surfaceChanged && !surfaceUnknown) {
      unchanged += 1;
      continue;
    }
    const entry = {
      id,
      publisher: after.publisher,
      name: after.name,
      beforeVersion: before.version,
      afterVersion: after.version,
      versionChanged,
      surfaceChanged,
      surfaceUnknown,
      riskTags: classifySurfaceRisk(before, after),
    };
    if (ignoreSet.has(id)) ignoredChanges.push(entry);
    else changed.push(entry);
  }

  const byId = (a, b) => a.id.localeCompare(b.id);
  added.sort(byId);
  removed.sort(byId);
  changed.sort(byId);
  ignoredChanges.sort(byId);

  return { added, removed, changed, ignoredChanges, unchanged, totalBaseline: baseline.length, totalCurrent: current.length };
}

export function summarizeDiff(result) {
  const surfaceChanges = result.changed.filter((c) => c.surfaceChanged).length;
  if (surfaceChanges > 0) {
    return {
      status: "changed",
      text: `${surfaceChanges} extension(s) changed what triggers them or what they load since the last snapshot.`,
    };
  }
  const versionOnly = result.changed.length;
  if (versionOnly > 0) {
    return {
      status: "changed",
      text: `${versionOnly} extension(s) updated version only (no declared surface change).`,
    };
  }
  const parts = [
    "No surface changes.",
    `${result.added.length} added`,
    `${result.removed.length} removed`,
    `${result.unchanged} unchanged`,
  ];
  if (result.ignoredChanges.length) parts.push(`${result.ignoredChanges.length} ignored`);
  return { status: "ok", text: parts.join(" ").replace("changes. ", "changes: ") };
}

/** Every entry in a single snapshot that activates unconditionally on startup, sorted worst-first. */
export function broadActivation(entries) {
  return entries
    .filter((e) => (e.activationEvents ?? []).some((ev) => STARTUP_ACTIVATION_EVENTS.has(ev)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
