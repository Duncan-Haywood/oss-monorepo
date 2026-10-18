// Pure logic for npm Provenance Check: turn a pasted package-lock.json,
// package.json, or freeform "name@version" list into a list of packages to
// look up, and turn the registry's own answers into a report. No network
// call lives here -- `cli.mjs` and `index.html` do the fetching and pass the
// results in, so this file is testable with fixture data alone.

/**
 * Parses a pasted or read file into a de-duplicated list of
 * `{ name, version }`, where `version` is an exact pinned version (from a
 * lockfile) or `null` (meaning "check whatever npm currently publishes as
 * latest" -- see the README for why an unpinned range can't be resolved
 * without a network call of its own).
 *
 * Recognises, in order:
 *   1. An npm lockfile (`lockfileVersion` 2 or 3), which pins exact versions
 *      via its `packages` map (`node_modules/<name>` -> `{ version }`).
 *   2. An npm lockfile v1 (`dependencies` map, exact versions).
 *   3. A `package.json` (`dependencies`/`devDependencies`/`optionalDependencies`
 *      maps of name -> version *range*, which this tool cannot resolve to an
 *      exact installed version without reading node_modules or the lockfile
 *      npm itself would produce -- so these are treated as unpinned).
 *   4. A freeform list, one package per line: `name`, `name@version`, or a
 *      scoped `@scope/name@version`.
 */
export function parseInput(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  let json;
  try {
    json = JSON.parse(trimmed);
  } catch {
    json = null;
  }

  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (json.packages && typeof json.packages === "object") {
      return fromLockfileV2(json.packages);
    }
    if (json.dependencies && isLockfileV1Shape(json.dependencies)) {
      return fromLockfileV1(json.dependencies);
    }
    if (hasPackageJsonDeps(json)) {
      return fromPackageJson(json);
    }
    throw new Error(
      "That's valid JSON, but not a package-lock.json (no \"packages\" or " +
      "lockfileVersion-1 \"dependencies\" map) or a package.json (no " +
      "dependencies/devDependencies). Paste one of those, or a plain list " +
      "of package names.",
    );
  }

  return fromFreeformList(trimmed);
}

function isLockfileV1Shape(deps) {
  // v1 lockfile deps are objects with a "version" field; a package.json
  // "dependencies" map is name -> range *string*. That single type check
  // is enough to tell the two shapes apart.
  return Object.values(deps).every((v) => v && typeof v === "object" && typeof v.version === "string");
}

function hasPackageJsonDeps(json) {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .some((k) => json[k] && typeof json[k] === "object");
}

function nameFromPackagePath(pkgPath) {
  // "node_modules/foo" -> "foo"; "node_modules/@scope/foo" -> "@scope/foo";
  // "node_modules/a/node_modules/@scope/foo" (nested) -> "@scope/foo".
  const idx = pkgPath.lastIndexOf("node_modules/");
  const tail = idx === -1 ? pkgPath : pkgPath.slice(idx + "node_modules/".length);
  return tail;
}

function fromLockfileV2(packages) {
  const seen = new Map();
  for (const [pkgPath, meta] of Object.entries(packages)) {
    if (pkgPath === "") continue; // the root project itself
    if (!meta || typeof meta !== "object") continue;
    if (meta.link) continue; // symlinked local workspace package, not a registry package
    const name = nameFromPackagePath(pkgPath);
    if (!name) continue;
    const version = typeof meta.version === "string" ? meta.version : null;
    addSeen(seen, name, version);
  }
  return [...seen.values()];
}

function fromLockfileV1(deps, seen = new Map()) {
  for (const [name, meta] of Object.entries(deps)) {
    if (!meta || typeof meta !== "object") continue;
    addSeen(seen, name, typeof meta.version === "string" ? meta.version : null);
    if (meta.dependencies && typeof meta.dependencies === "object") {
      fromLockfileV1(meta.dependencies, seen);
    }
  }
  return [...seen.values()];
}

function fromPackageJson(json) {
  const seen = new Map();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = json[field];
    if (!deps || typeof deps !== "object") continue;
    for (const name of Object.keys(deps)) {
      // A package.json range ("^1.2.3", "workspace:*", a git URL) is not an
      // exact installed version -- check latest instead, and say so in the
      // report rather than guessing which resolved version npm would pick.
      addSeen(seen, name, null);
    }
  }
  return [...seen.values()];
}

function fromFreeformList(text) {
  const seen = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, "");
    if (!line || line.startsWith("#")) continue;
    const match = /^(@?[^\s@]+(?:\/[^\s@]+)?)(?:@([^\s@]+))?$/.exec(line);
    if (!match) continue;
    const [, name, version] = match;
    addSeen(seen, name, version || null);
  }
  if (!seen.size && text) {
    throw new Error("Couldn't find a package name on any line. One per line: \"name\" or \"name@version\".");
  }
  return [...seen.values()];
}

function addSeen(seen, name, version) {
  if (!name) return;
  const existing = seen.get(name);
  // Prefer an exact version over a null (unpinned) one for the same name,
  // so a lockfile's pinned entry wins over a looser mention elsewhere.
  if (!existing || (existing.version === null && version !== null)) {
    seen.set(name, { name, version });
  }
}

/**
 * Turns one registry API response (the JSON body of
 * `GET /<name>/<version-or-"latest">`) into a report row. `body` is `null`
 * when the request failed outright (network error, non-2xx, bad JSON) --
 * `httpStatus` distinguishes "package or version not found" (404) from
 * other failures so the report can say which.
 */
export function rowFromRegistryResponse({ name, version }, { body, httpStatus, error } = {}) {
  if (error || !body) {
    return {
      name,
      requestedVersion: version,
      resolvedVersion: null,
      hasProvenance: null,
      attestationUrl: null,
      status: httpStatus === 404 ? "not-found" : "error",
      detail: httpStatus === 404
        ? `${name}${version ? `@${version}` : ""} was not found on the public registry.`
        : (error ? String(error.message || error) : `registry returned HTTP ${httpStatus}`),
    };
  }
  const attestations = body.dist && body.dist.attestations;
  const hasProvenance = Boolean(attestations && attestations.provenance);
  return {
    name,
    requestedVersion: version,
    resolvedVersion: body.version || version || "latest",
    hasProvenance,
    attestationUrl: hasProvenance ? attestations.url || null : null,
    status: "ok",
    detail: hasProvenance
      ? "Published with a provenance attestation (trusted publishing or --provenance)."
      : "No provenance attestation on this version.",
  };
}

/** Rolls up a list of report rows (from `rowFromRegistryResponse`) into counts. */
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

/**
 * Runs `lookup(pkg)` over `packages` with at most `concurrency` in flight at
 * once -- polite to the public registry on a large lockfile, and it's the
 * one piece of orchestration worth sharing between the CLI and the browser
 * page rather than writing twice.
 */
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

export function registryUrl(name, version) {
  const encodedName = name.split("/").map(encodeURIComponent).join("/");
  return `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version || "latest")}`;
}
