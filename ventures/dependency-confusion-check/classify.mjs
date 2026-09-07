// Browser port of check.py's scanning logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted text -- nothing here calls any network API (no registry
// lookups, nothing), and nothing here parses YAML with a library.
//
// classify.test.mjs pins this port against the same scenarios test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const PIP_EXTRA_INDEX_URL = "pip-extra-index-url";
export const NPM_UNSCOPED_PRIVATE_DEPENDENCY = "npm-unscoped-private-dependency";

export const RISK_CLASSIFICATIONS = new Set([PIP_EXTRA_INDEX_URL, NPM_UNSCOPED_PRIVATE_DEPENDENCY]);

const PUBLIC_NPM_REGISTRIES = new Set(["registry.npmjs.org", "registry.yarnpkg.com", "npm.pkg.github.com"]);

const EXTRA_INDEX_URL_RE = /--extra-index-url(?:[=\s]+(\S+))?/;
const NPM_REGISTRY_RE = /^\s*registry\s*=\s*(\S+)/m;

const PIP_REMEDIATION =
  "--extra-index-url tells pip to consider a second index in addition to the primary one, " +
  "and pip installs whichever index reports the higher version for a given package name -- " +
  "pip's own documentation names this as a substitution risk. A public package published " +
  "under your internal package's name, at a higher version, would win. Use --index-url with " +
  "a single trusted index that proxies or mirrors the packages you need (most private-index " +
  "servers support this), or pin exact versions with --require-hashes so an unexpected " +
  "package cannot silently substitute.";

const NPM_REMEDIATION =
  "This repository's .npmrc sets a private default registry, but an unscoped dependency name " +
  "resolves against whatever registry is in effect wherever the install runs -- a machine or " +
  "CI runner without this .npmrc falls back to the public npm registry for the same name. If " +
  "nobody has claimed it there, anyone can publish a package under that name and have it " +
  "installed instead. Publish internal packages under an npm org scope (@your-org/name), " +
  "which nobody outside your org can publish under, or claim the unscoped name on the public " +
  "registry as an empty placeholder.";

/** Scan one pip-related file's text for --extra-index-url. Returns findings,
 * in the same shape check.py's --format json emits. */
export function scanPipText(text, filename = "<pip-config>") {
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("#")) continue;
    if (!EXTRA_INDEX_URL_RE.test(line)) continue;
    findings.push({
      file: filename,
      line: i + 1,
      type: PIP_EXTRA_INDEX_URL,
      detail: line.trim(),
      remediation: PIP_REMEDIATION,
    });
  }
  return findings;
}

function npmPrivateRegistryHost(npmrcText) {
  const match = NPM_REGISTRY_RE.exec(npmrcText || "");
  if (!match) return null;
  const host = match[1].replace(/^\w+:\/\//, "").split("/")[0];
  if (!host || PUBLIC_NPM_REGISTRIES.has(host)) return null;
  return host;
}

function lineNumberOf(text, needle) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return 1;
}

/** Scan a package.json + .npmrc pair. Returns findings. All three
 * dependency keys are read; a name is flagged once per pass even if it
 * appears in more than one of them, matching check.py's `set(names)`. */
export function scanNpm(packageJsonText, npmrcText, filename = "package.json") {
  const privateHost = npmPrivateRegistryHost(npmrcText);
  if (!privateHost) return [];

  let manifest;
  try {
    manifest = JSON.parse(packageJsonText);
  } catch {
    return [];
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return [];

  const names = new Set();
  for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = manifest[key];
    if (deps && typeof deps === "object" && !Array.isArray(deps)) {
      for (const name of Object.keys(deps)) names.add(name);
    }
  }

  const findings = [];
  for (const name of [...names].sort()) {
    if (name.startsWith("@")) continue;
    const lineno = lineNumberOf(packageJsonText, JSON.stringify(name));
    findings.push({
      file: filename,
      line: lineno,
      type: NPM_UNSCOPED_PRIVATE_DEPENDENCY,
      detail: `unscoped dependency "${name}" with private registry ${privateHost} in .npmrc`,
      remediation: NPM_REMEDIATION,
    });
  }
  return findings;
}

export function hasRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No findings.";
  const pip = findings.filter((f) => f.type === PIP_EXTRA_INDEX_URL).length;
  const npm = findings.filter((f) => f.type === NPM_UNSCOPED_PRIVATE_DEPENDENCY).length;
  const parts = [];
  if (pip) parts.push(`${pip} pip-extra-index-url finding${pip === 1 ? "" : "s"}`);
  if (npm) parts.push(`${npm} npm-unscoped-private-dependency finding${npm === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
