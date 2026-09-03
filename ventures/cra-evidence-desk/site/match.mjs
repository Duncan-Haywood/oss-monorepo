/**
 * Browser port of `src/cra_evidence_desk/normalize.py` and `core.py`.
 *
 * The CLI is the canonical implementation and stays so; this exists because
 * the audience for it -- a small vendor working out whether a published
 * advisory touches their product -- will not install a Python package to
 * answer one question, and the answer is worth nothing if they have already
 * moved on. Everything here runs in the page. The SBOM never leaves the
 * browser, which is not a nicety: an SBOM is a complete map of a product's
 * dependencies, and uploading one to a stranger's server to ask "am I
 * affected" is a disclosure most vendors would refuse if they thought about
 * it for a second.
 *
 * `parity.test.mjs` holds the shared rules -- the ecosystem table, the
 * coverage boundary, the draft's wording -- to the Python source as text,
 * because CLAUDE.md records that copying a rule instead of importing it has
 * already cost this repo live product twice, and the language boundary means
 * importing is not on offer.
 */

/** Identifies the matching rules a record was produced under. */
export const CRA_MATCH_SPEC_ID = "cra-exact-coordinate-v1";

/** Refuse a file this large rather than hanging the tab parsing it. Browser-only concern. */
export const MAX_BYTES = 25 * 1024 * 1024;

/** Keep the two file pickers to one job each. Browser-only concern. */
export const MAX_FILES = 2;

export const COVERAGE_NOTE =
  "Exact name, ecosystem, and version matches only; no range or reachability analysis.";

export const NEXT_STEP =
  "Review each finding against the authoritative advisory and decide whether a report is required.";

export const RANGE_ONLY_REASON =
  "states affected versions as a range only; this tool matches exact versions and does not resolve ranges";

export const DRAFT_TITLE = "CUSTOMER REVIEW DRAFT: CRA ARTICLE 14 INCIDENT NOTIFICATION";

export const DRAFT_ACTION =
  "Customer action required: verify applicability, impact, mitigation, and reporting deadline with a qualified professional and the authoritative authority.";

export const DRAFT_DISCLAIMER =
  "This draft is not a filing, legal advice, or a conclusion that a report is required.";

/**
 * A purl type and an OSV ecosystem name for the same registry are frequently
 * different strings, and matching is exact, so a CycloneDX SBOM and an OSV
 * advisory naming the same package would never meet without this table.
 */
export const ECOSYSTEM_ALIASES = {
  "crates.io": "cargo",
  go: "golang",
  packagist: "composer",
  rubygems: "gem",
  pypi: "pypi",
  npm: "npm",
  maven: "maven",
  nuget: "nuget",
  hex: "hex",
  pub: "pub",
  cran: "cran",
  hackage: "hackage",
  swifturl: "swift",
};

const COLON_JOINED_ECOSYSTEMS = new Set(["maven"]);

const PURL = /^pkg:([^/]+)\/(.+)$/i;

/** Fold a purl type or an OSV ecosystem name onto one spelling. */
export function canonicalEcosystem(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  // OSV qualifies some ecosystems with a distribution, e.g. "Alpine:v3.19".
  // The qualifier narrows which advisories apply, not which package is named.
  const base = text.split(":")[0];
  return ECOSYSTEM_ALIASES[base] ?? base;
}

function joinName(ecosystem, namespace, name) {
  if (!namespace) return name;
  return `${namespace}${COLON_JOINED_ECOSYSTEMS.has(ecosystem) ? ":" : "/"}${name}`;
}

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A stray `%` in a package name is not a reason to drop the component.
    return segment;
  }
}

/**
 * Split a package URL into the coordinates this tool matches on, or `null`.
 *
 * Null rather than a throw: one malformed entry among two thousand good ones
 * should not cost the user their whole SBOM.
 */
export function parsePurl(purl) {
  const match = PURL.exec(String(purl ?? "").trim());
  if (!match) return null;
  const ecosystem = canonicalEcosystem(match[1]);
  // Qualifiers and subpath are scoping information, never part of identity.
  const rest = match[2].split("#")[0].split("?")[0];
  const at = rest.lastIndexOf("@");
  const coordinates = at > 0 ? rest.slice(0, at) : rest;
  const version = at > 0 ? rest.slice(at + 1) : "";
  const segments = coordinates.split("/").filter(Boolean).map(decode);
  if (!segments.length) return null;
  const name = segments[segments.length - 1];
  const namespace = segments.slice(0, -1).join("/");
  return { ecosystem, name: joinName(ecosystem, namespace, name), version: decode(version) };
}

function coordinate(ecosystem, name, version) {
  const nameText = String(name ?? "").trim();
  const versionText = String(version ?? "").trim();
  if (!nameText || !versionText) return null;
  return { ecosystem: canonicalEcosystem(ecosystem), name: nameText, version: versionText };
}

/** Prefer the purl, fall back to the loose fields, and let each fill the other's gaps. */
function fromPurlOrFields(purl, ecosystem, name, version) {
  const parsed = parsePurl(purl);
  if (parsed) {
    return coordinate(parsed.ecosystem || ecosystem, parsed.name || name, parsed.version || version);
  }
  return coordinate(ecosystem, name, version);
}

function spdxPurl(pkg) {
  for (const ref of pkg.externalRefs ?? []) {
    if (ref && typeof ref === "object" && String(ref.referenceType ?? "").toLowerCase() === "purl") {
      return String(ref.referenceLocator ?? "");
    }
  }
  return "";
}

/** Every component in a CycloneDX, SPDX, or native SBOM, as exact coordinates. */
export function normalizeSbom(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return [];
  const components = [];

  for (const pkg of document.packages ?? []) {
    if (!pkg || typeof pkg !== "object") continue;
    const found = fromPurlOrFields(spdxPurl(pkg), pkg.ecosystem, pkg.name, pkg.versionInfo ?? pkg.version);
    if (found) components.push(found);
  }

  // CycloneDX and the native shape share the `components` key; CycloneDX adds
  // a purl and nests sub-components, so one walk reads both.
  const walk = (entries) => {
    for (const entry of entries ?? []) {
      if (!entry || typeof entry !== "object") continue;
      const found = fromPurlOrFields(entry.purl, entry.ecosystem, entry.name, entry.version);
      if (found) components.push(found);
      walk(entry.components);
    }
  };
  walk(document.components);

  return components;
}

function osvEntries(vuln) {
  const id = String(vuln.id ?? "unidentified");
  const summary = String(vuln.summary || vuln.details || "No advisory summary supplied.");
  let source = "customer-supplied export";
  if (Array.isArray(vuln.references)) {
    const withUrl = vuln.references.find((r) => r && typeof r === "object" && r.url);
    if (withUrl) source = String(withUrl.url);
  }

  const entries = [];
  for (const affected of vuln.affected ?? []) {
    if (!affected || typeof affected !== "object") continue;
    const pkg = affected.package;
    if (!pkg || typeof pkg !== "object") continue;
    // `affected[].ranges` is deliberately not read: a range says "everything
    // below 1.4.2", which is the inference this tool refuses to make for the
    // customer. `unmatchableAdvisories` reports what that costs them.
    for (const version of affected.versions ?? []) {
      const found = fromPurlOrFields(pkg.purl, pkg.ecosystem, pkg.name, version);
      if (found) entries.push({ ...found, id, summary, source });
    }
  }
  return entries;
}

const looksLikeOsv = (entry) => "affected" in entry || "modified" in entry;

function advisoryEntries(document) {
  let entries = document;
  if (document && typeof document === "object" && !Array.isArray(document)) {
    entries = document.vulns ?? document.advisories ?? [];
  }
  return Array.isArray(entries) ? entries : [];
}

/** Advisories from an OSV export or the native list, as exact coordinates. */
export function normalizeAdvisories(document) {
  const advisories = [];
  for (const entry of advisoryEntries(document)) {
    if (!entry || typeof entry !== "object") continue;
    if (looksLikeOsv(entry)) {
      advisories.push(...osvEntries(entry));
      continue;
    }
    const found = fromPurlOrFields(entry.purl, entry.ecosystem, entry.name, entry.version);
    if (found) {
      advisories.push({
        ...found,
        id: String(entry.id ?? "unidentified"),
        summary: String(entry.summary ?? "No advisory summary supplied."),
        source: String(entry.source ?? "customer-supplied export"),
      });
    }
  }
  return advisories;
}

/**
 * OSV records stating only version ranges, which can never match here.
 *
 * Surfaced rather than dropped: "no findings" means something very different
 * when part of the advisory export was expressed in a form this tool declines
 * to interpret, and a reviewer not told that would read a clean report as
 * coverage it does not have.
 */
export function unmatchableAdvisories(document) {
  const skipped = [];
  for (const entry of advisoryEntries(document)) {
    if (!entry || typeof entry !== "object" || !looksLikeOsv(entry)) continue;
    let hasExact = false;
    let hasRanges = false;
    for (const affected of entry.affected ?? []) {
      if (!affected || typeof affected !== "object") continue;
      if (affected.versions?.length) hasExact = true;
      if (affected.ranges?.length) hasRanges = true;
    }
    if (hasRanges && !hasExact) {
      skipped.push({ advisory: String(entry.id ?? "unidentified"), reason: RANGE_ONLY_REASON });
    }
  }
  return skipped;
}

/** Match exact component coordinates; never infer affected ranges. */
export function match(sbom, advisories) {
  const indexed = new Map();
  for (const advisory of normalizeAdvisories(advisories)) {
    indexed.set(`${advisory.ecosystem} ${advisory.name.toLowerCase()} ${advisory.version}`, advisory);
  }
  const findings = [];
  for (const component of normalizeSbom(sbom)) {
    const advisory = indexed.get(
      `${component.ecosystem} ${component.name.toLowerCase()} ${component.version}`,
    );
    if (advisory) {
      findings.push({
        component: `${component.name}@${component.version}`,
        ecosystem: component.ecosystem || "unspecified",
        advisory: advisory.id,
        summary: advisory.summary,
        source: advisory.source,
      });
    }
  }
  return findings;
}

/**
 * The evidence record.
 *
 * `generated` is a date, not a timestamp: the record is filed as evidence of
 * what was checked, and the hour someone ran a matcher is not part of that,
 * while a full timestamp in an exported file is one more identifying detail
 * than the job needs.
 */
export function report(sbom, advisories, product, version, today = new Date()) {
  const findings = match(sbom, advisories);
  const skipped = unmatchableAdvisories(advisories);
  const result = {
    spec: CRA_MATCH_SPEC_ID,
    generated: today.toISOString().slice(0, 10),
    product,
    version,
    component_count: normalizeSbom(sbom).length,
    advisory_count: normalizeAdvisories(advisories).length,
    matched_findings: findings,
    coverage: COVERAGE_NOTE,
    next_step: NEXT_STEP,
  };
  if (skipped.length) result.advisories_not_evaluated = skipped;
  return result;
}

/** The copyable Article 14 draft, word-for-word the one the CLI prints. */
export function article14Draft(result) {
  const lines = [
    DRAFT_TITLE,
    "",
    `Product: ${result.product}`,
    `Affected version under review: ${result.version}`,
    "",
    "Observed evidence:",
  ];
  if (result.matched_findings.length) {
    for (const f of result.matched_findings) {
      lines.push(`- ${f.component} matched ${f.advisory}: ${f.summary} (source: ${f.source})`);
    }
  } else {
    lines.push("- No exact matches in the supplied advisory export.");
  }
  if (result.advisories_not_evaluated?.length) {
    lines.push("", "Not evaluated by this tool (review these separately):");
    for (const s of result.advisories_not_evaluated) lines.push(`- ${s.advisory}: ${s.reason}`);
  }
  lines.push("", DRAFT_ACTION, DRAFT_DISCLAIMER);
  return `${lines.join("\n")}\n`;
}

/**
 * Parse a file the user picked, with the failure the user can act on.
 *
 * A bare `JSON.parse` throw reads "Unexpected token < in JSON at position 0",
 * which tells someone who exported the wrong thing nothing about what to do.
 */
export function parseInput(text, label) {
  if (text.length > MAX_BYTES) {
    throw new Error(`${label} is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Trim it, or use the command-line version for very large files.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON. Export it as JSON — CycloneDX, SPDX, or OSV all work.`);
  }
  return parsed;
}

/** Name the format read, so the page can tell the user what it understood. */
export function describeSbom(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return "unrecognised";
  if (document.bomFormat === "CycloneDX" || document.specVersion) return "CycloneDX";
  if (document.spdxVersion || Array.isArray(document.packages)) return "SPDX";
  if (Array.isArray(document.components)) return "component list";
  return "unrecognised";
}

/** Name the advisory format read. */
export function describeAdvisories(document) {
  if (Array.isArray(document)) {
    return document.some((e) => e && typeof e === "object" && looksLikeOsv(e)) ? "OSV" : "advisory list";
  }
  if (document && typeof document === "object" && (document.vulns || document.advisories)) return "OSV";
  return "unrecognised";
}
