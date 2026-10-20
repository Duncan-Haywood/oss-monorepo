// Deterministic license-drift engine: parse two point-in-time snapshots of a
// dependency tree's declared licenses and report exactly which packages'
// license field changed between them. No network call lives here -- this
// module only compares data it is given, so the identical logic runs in the
// browser page (pasted snapshots) and the Node CLI (files on disk).
//
// The question this answers: given a baseline snapshot (last known-good,
// usually committed to the repo) and a current snapshot (this PR, this
// `npm install`), which packages' *license* changed -- not their version,
// not their vulnerability count, their license. Dependabot and Renovate open
// a PR when a version changes; neither flags a license change on its own,
// and a routine "bump the lockfile" PR is exactly how a relicense like
// Elastic's or Redis's reaches a project that never chose to accept it. See
// README.md for the four real, dated events this is built against.

// --- License family classification (informational only) -------------------
//
// This buckets a license *string* into one of four public, well-documented
// families using keyword matching -- it is not a legal opinion about any
// specific license and it is not exhaustive. It exists so a report can say
// "this one is worth a human's attention" without claiming to know whether
// it actually is. See README's disclaimer: verify with counsel before
// relying on this categorization.
//
// The one disambiguation that matters most for this exact niche: "BSL"
// colloquially means HashiCorp/Sentry/CockroachDB's source-available
// *Business Source License* (SPDX id `BUSL-1.1`, sometimes written informally
// as `BSL-1.1`), but the actual SPDX id `BSL-1.0` is the unrelated, fully
// permissive *Boost Software License*. Confusing the two in either direction
// is exactly the kind of silent misread this tool exists to prevent, so the
// two are matched on the version digit (`-1.0` vs `-1.1`) and tested
// explicitly below.
const SOURCE_AVAILABLE_HINTS = [
  "business source license",
  "busl",
  "bsl-1.1",
  "bsl 1.1",
  "sspl",
  "server side public license",
  "elastic license",
  "commons clause",
  "rsal",
  "redis source available",
  "polyform",
  "prosperity public license",
  "functional source license",
  "fsl-1",
  "fair source",
];

const COPYLEFT_HINTS = [
  "agpl",
  "gpl-1",
  "gpl-2",
  "gpl-3",
  "gplv1",
  "gplv2",
  "gplv3",
  "gnu general public license",
  "lgpl",
  "mpl-1",
  "mpl-2",
  "mozilla public license",
  "epl-1",
  "epl-2",
  "eclipse public license",
  "eupl",
  "cddl",
  "osl-",
  "sleepycat",
  "ms-rl",
];

const PERMISSIVE_HINTS = [
  "mit",
  "bsd-2",
  "bsd-3",
  "bsd-4",
  "0bsd",
  "apache-1",
  "apache-2",
  "apache 2",
  "apache license",
  "isc",
  "zlib",
  "unlicense",
  "cc0",
  "ncsa",
  "python-2.0",
  "boost software license",
  "bsl-1.0",
  "bsl 1.0",
  "blueoak",
  "mit-0",
  "wtfpl",
  "x11",
];

const UNCLEAR_EXACT = new Set([
  "",
  "unknown",
  "unlicensed",
  "none",
  "proprietary",
  "custom",
  "n/a",
  "nolicense",
  "not specified",
]);

/**
 * Buckets a license string into a public, well-documented family. Purely
 * informational -- see the file header. Returns one of:
 * "permissive" | "copyleft" | "source-available" | "unclear" | "unknown".
 */
export function classifyLicenseFamily(license) {
  const norm = String(license ?? "").trim().toLowerCase();
  if (!norm || UNCLEAR_EXACT.has(norm) || norm.includes("see license")) return "unclear";
  if (SOURCE_AVAILABLE_HINTS.some((h) => norm.includes(h))) return "source-available";
  if (COPYLEFT_HINTS.some((h) => norm.includes(h))) return "copyleft";
  if (PERMISSIVE_HINTS.some((h) => norm.includes(h))) return "permissive";
  return "unknown";
}

// --- Real, dated relicensing events (context, not a live feed) -------------
//
// Every row here is a specific, publicly reported event with a date. This is
// not a prediction that any given dependency will do this -- it is evidence
// that it has happened, repeatedly, to widely used open-source projects, via
// exactly the mechanism this tool watches for: an existing user's routine
// update silently crossing a license line they never agreed to.
export const KNOWN_RELICENSE_EVENTS = [
  {
    project: "MongoDB Server",
    from: "AGPL-3.0",
    to: "SSPL-1.0",
    date: "2018-10-16",
    note:
      "The event that introduced the SSPL. Versions released on or after this date, including patch releases of older lines, moved to the new license.",
  },
  {
    project: "Elasticsearch & Kibana (Elastic)",
    from: "Apache-2.0",
    to: "SSPL-1.0 / Elastic License (dual)",
    date: "2021-01-14",
    note:
      "AWS forked the last Apache-2.0 release as OpenSearch within three months. Elastic re-added an AGPL-3.0 option in 2024 without dropping the others.",
  },
  {
    project: "Terraform (HashiCorp)",
    from: "MPL-2.0",
    to: "BUSL-1.1",
    date: "2023-08-10",
    note:
      "The OpenTF Manifesto asking HashiCorp to reverse the change gathered more than 33,000 GitHub stars within a month; the fork became OpenTofu, now a CNCF project.",
  },
  {
    project: "Redis",
    from: "BSD-3-Clause",
    to: "SSPLv1 / RSALv2 (dual)",
    date: "2024-03-20",
    note:
      "AWS, Google Cloud, Oracle, and others forked the last BSD-licensed release as Valkey under the Linux Foundation within days.",
  },
];

// --- Snapshot parsing --------------------------------------------------

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  let name = pick(raw, ["name", "packagename", "package", "import path", "importpath"]);
  let version = pick(raw, ["version"]);
  let license = pick(raw, ["license", "licenses", "licensetype"]);
  if (Array.isArray(license)) {
    license = license
      .map((l) => (l && typeof l === "object" ? l.type || l.name : l))
      .filter(Boolean)
      .join(" OR ");
  } else if (license && typeof license === "object") {
    license = license.type || license.name || "";
  }
  name = name == null ? "" : String(name).trim();
  version = version == null ? "" : String(version).trim();
  license = license == null ? "" : String(license).trim();
  if (!name) return null;
  return { name, version, license: license || "UNKNOWN" };
}

// Minimal CSV split: no quoted-comma support. Documented limitation -- use
// the JSON snapshot format (what `cli.mjs snapshot` produces) for anything
// exotic; this exists to accept pip-licenses/cargo-license/go-licenses
// output with a one-line conversion (see README).
function splitCsvLine(line) {
  return line.split(",").map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
}

/**
 * Parses a snapshot given as either:
 *  - a JSON array of {name, version, license} objects (any casing, and
 *    accepts `licenses` as an array like pip-licenses/cargo-license emit), or
 *  - a JSON object with a `dependencies` or `packages` array in it, or
 *  - CSV/TSV-ish text: a header row containing "license" maps columns by
 *    name; otherwise columns are assumed to be name,version,license
 *    positionally (go-licenses' 3-column, header-less CSV: import path,
 *    license URL, license name -- the last column is read as the license).
 *
 * Returns a de-duplicated (by name, last occurrence wins), name-sorted array
 * of {name, version, license}.
 */
export function parseSnapshot(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];

  let entries;
  if (raw.startsWith("[") || raw.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`not valid JSON (${err.message})`);
    }
    const list = Array.isArray(data) ? data : data.dependencies || data.packages;
    if (!Array.isArray(list)) {
      throw new Error("expected a JSON array of {name, version, license} objects, or {dependencies: [...]}");
    }
    entries = list.map(normalizeEntry).filter(Boolean);
  } else {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let rows = lines.map(splitCsvLine);
    let nameIdx = 0;
    let versionIdx = 1;
    let licenseIdx = 2;
    const header = rows[0].map((c) => c.toLowerCase());
    if (header.some((c) => c.includes("license"))) {
      const findCol = (needle) => header.findIndex((c) => c.includes(needle));
      const foundName = findCol("name") !== -1 ? findCol("name") : findCol("package") !== -1 ? findCol("package") : findCol("import");
      nameIdx = foundName === -1 ? 0 : foundName;
      versionIdx = findCol("version");
      licenseIdx = findCol("license");
      rows = rows.slice(1);
    } else if (rows.length && rows[0].length < 3) {
      // Header-less, fewer than 3 columns (e.g. go-licenses' name,license):
      // last column is the license, first is the name, no version.
      versionIdx = -1;
      licenseIdx = rows[0].length - 1;
    }
    entries = rows
      .map((cols) =>
        normalizeEntry({
          name: cols[nameIdx] ?? "",
          version: versionIdx >= 0 ? cols[versionIdx] ?? "" : "",
          license: cols[licenseIdx] ?? cols[cols.length - 1] ?? "",
        }),
      )
      .filter(Boolean);
  }

  const byName = new Map();
  for (const e of entries) byName.set(e.name, e); // last occurrence wins
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeForCompare(license) {
  return String(license ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Diffs two parsed snapshots (arrays of {name, version, license}).
 * `ignore` is a list of package names whose license change is accepted and
 * should not count toward a fail-worthy result (still reported, separately).
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
      added.push({ name: after.name, version: after.version, license: after.license, family: classifyLicenseFamily(after.license) });
      continue;
    }
    if (!after) {
      removed.push({ name: before.name, version: before.version, license: before.license, family: classifyLicenseFamily(before.license) });
      continue;
    }
    if (normalizeForCompare(before.license) === normalizeForCompare(after.license)) {
      unchanged += 1;
      continue;
    }
    const entry = {
      name,
      beforeVersion: before.version,
      afterVersion: after.version,
      beforeLicense: before.license,
      afterLicense: after.license,
      beforeFamily: classifyLicenseFamily(before.license),
      afterFamily: classifyLicenseFamily(after.license),
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
  if (result.changed.length) {
    return {
      status: "changed",
      text: `${result.changed.length} package(s) changed license since the last snapshot.`,
    };
  }
  const parts = [`No license changes.`, `${result.added.length} added`, `${result.removed.length} removed`, `${result.unchanged} unchanged`];
  if (result.ignoredChanges.length) parts.push(`${result.ignoredChanges.length} ignored`);
  return { status: "ok", text: parts.join(" ").replace("changes. ", "changes: ") };
}
