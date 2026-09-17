// Browser port of sbom_diff.py's comparison logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. diff.test.mjs
// pins this port against the same fixtures test_sbom_diff.py uses, plus a
// parity test that shells out to `python3 sbom_diff.py` and asserts
// identical output on the same input.

function versionOrNull(value) {
  if (value === undefined || value === null) return null;
  if (value === "NOASSERTION") return null;
  return value;
}

/** Extract {name, version, purl} from a CycloneDX document's `components`. */
function extractCycloneDx(doc) {
  const components = [];
  for (const c of doc.components || []) {
    if (!c || typeof c !== "object" || !c.name) continue;
    components.push({ name: c.name, version: c.version || null, purl: c.purl || null });
  }
  return components;
}

/** Extract {name, version, purl} from an SPDX document's `packages`. */
function extractSpdx(doc) {
  const components = [];
  for (const p of doc.packages || []) {
    if (!p || typeof p !== "object" || !p.name) continue;
    components.push({ name: p.name, version: versionOrNull(p.versionInfo), purl: null });
  }
  return components;
}

/** "CycloneDX", "SPDX", or null if the document's shape is not recognized. */
export function detectFormat(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (doc.bomFormat === "CycloneDX" || Array.isArray(doc.components)) return "CycloneDX";
  if ("spdxVersion" in doc || Array.isArray(doc.packages)) return "SPDX";
  return null;
}

/** Parse SBOM JSON text. Returns {format, components}. Throws with a
 * message naming `label` if the text is not valid JSON or not a
 * recognizable CycloneDX/SPDX shape. */
export function parseSbom(text, label = "<sbom>") {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${err.message})`);
  }
  const format = detectFormat(doc);
  if (format === "CycloneDX") return { format, components: extractCycloneDx(doc) };
  if (format === "SPDX") return { format, components: extractSpdx(doc) };
  throw new Error(
    `${label}: not a recognized CycloneDX or SPDX document (expected "bomFormat": "CycloneDX", ` +
      `"spdxVersion", a top-level "components" array, or a top-level "packages" array)`,
  );
}

function groupByName(components) {
  const grouped = new Map();
  for (const c of components) {
    if (!grouped.has(c.name)) grouped.set(c.name, new Set());
    grouped.get(c.name).add(c.version);
  }
  return grouped;
}

function sortVersions(set) {
  return [...set].sort((a, b) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : 1;
  });
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Compare two component lists. Returns {added, removed, versionChanged},
 * each sorted by package name -- mirrors sbom_diff.py's diff_components. */
export function diffComponents(oldComponents, newComponents) {
  const oldByName = groupByName(oldComponents);
  const newByName = groupByName(newComponents);

  const added = [];
  const removed = [];
  const versionChanged = [];

  const allNames = [...new Set([...oldByName.keys(), ...newByName.keys()])].sort();
  for (const name of allNames) {
    const oldVersions = oldByName.get(name);
    const newVersions = newByName.get(name);

    if (oldVersions === undefined) {
      for (const v of sortVersions(newVersions)) added.push({ name, version: v });
      continue;
    }
    if (newVersions === undefined) {
      for (const v of sortVersions(oldVersions)) removed.push({ name, version: v });
      continue;
    }
    if (!sameSet(oldVersions, newVersions)) {
      const gained = sortVersions(new Set([...newVersions].filter((v) => !oldVersions.has(v))));
      const lost = sortVersions(new Set([...oldVersions].filter((v) => !newVersions.has(v))));
      versionChanged.push({ name, from: lost, to: gained });
    }
  }

  return { added, removed, versionChanged };
}

export function hasAnyChange(diff) {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.versionChanged.length > 0;
}

/** One-line headline for the page. */
export function summaryLine(diff, oldCount, newCount) {
  if (!hasAnyChange(diff)) {
    return `No package changes — both SBOMs list the same ${newCount} package(s) at the same versions.`;
  }
  return (
    `${diff.added.length} added, ${diff.removed.length} removed, ` +
    `${diff.versionChanged.length} version-changed, out of ${oldCount} → ${newCount} package(s) total.`
  );
}
