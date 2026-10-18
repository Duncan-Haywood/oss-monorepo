// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted Dockerfile text -- nothing here calls any network API, and
// the EOL_DATA table below is a literal copy of check.py's, verified
// identical by classify.test.mjs shelling out to `python3 check.py
// --dump-data`. That parity test, not a shared import, is what keeps the
// two from silently drifting -- a browser page and a Python CLI have no
// runtime to import from each other, the same constraint check.py's own
// module docstring notes about its relationship to classify.mjs in the
// docker-base-image-pin-check sibling.
//
// This is a curated, dated snapshot, not a live feed. See DATASET_AS_OF.

export const EOL = "eol";
export const EOL_SOON = "eol-soon";
export const SUPPORTED = "supported";
export const DEPRECATED_IMAGE = "deprecated-image";
export const UNKNOWN_TAG = "unknown-tag";
export const UNKNOWN_IMAGE = "unknown-image";
export const STAGE = "stage";
export const SCRATCH = "scratch";
export const VARIABLE = "variable";

export const RISK_CLASSIFICATIONS = new Set([EOL, DEPRECATED_IMAGE]);
export const DEFAULT_WARN_DAYS = 90;

export const DATASET_AS_OF = "2026-09-01";

export const EOL_DATA = {
  node: {
    source: "Node.js Release Working Group schedule (nodejs.org/en/about/previous-releases)",
    cycles: {
      "14": { eol: "2023-04-30", confidence: "confirmed" },
      "16": { eol: "2023-09-11", confidence: "confirmed" },
      "18": { eol: "2025-04-30", confidence: "confirmed" },
      "19": { eol: "2023-06-01", confidence: "confirmed" },
      "20": { eol: "2026-04-30", confidence: "confirmed" },
      "21": { eol: "2024-06-01", confidence: "confirmed" },
      "22": { eol: "2027-04-30", confidence: "confirmed" },
      "23": { eol: "2025-06-01", confidence: "confirmed" },
      "24": { eol: "2028-04-30", confidence: "confirmed" },
    },
  },
  python: {
    source: "CPython devguide (devguide.python.org/versions)",
    cycles: {
      "3.7": { eol: "2023-06-27", confidence: "confirmed" },
      "3.8": { eol: "2024-10-07", confidence: "confirmed" },
      "3.9": { eol: "2025-10-05", confidence: "confirmed" },
      "3.10": { eol: "2026-10-04", confidence: "confirmed" },
      "3.11": { eol: "2027-10-24", confidence: "confirmed" },
      "3.12": { eol: "2028-10-02", confidence: "confirmed" },
      "3.13": { eol: "2029-10-31", confidence: "estimated" },
    },
  },
  ubuntu: {
    source: "Ubuntu release cycle wiki -- standard support window, not ESM",
    codenames: { bionic: "18.04", focal: "20.04", jammy: "22.04", noble: "24.04" },
    cycles: {
      "18.04": { eol: "2023-05-31", confidence: "confirmed" },
      "20.04": { eol: "2025-05-29", confidence: "confirmed" },
      "22.04": { eol: "2027-04-01", confidence: "confirmed" },
      "24.04": { eol: "2029-05-31", confidence: "estimated" },
    },
  },
  debian: {
    source: "Debian LTS wiki -- regular security support window, before community LTS extends it",
    codenames: { stretch: "9", buster: "10", bullseye: "11", bookworm: "12", trixie: "13" },
    cycles: {
      "9": { eol: "2020-07-06", confidence: "confirmed" },
      "10": { eol: "2022-09-10", confidence: "confirmed" },
      "11": { eol: "2024-08-14", confidence: "confirmed" },
      "12": { eol: "2026-06-30", confidence: "estimated" },
      "13": { eol: "2028-06-30", confidence: "estimated" },
    },
  },
  alpine: {
    source: "Alpine Linux releases wiki -- each branch's stated ~2-year support window",
    cycles: {
      "3.15": { eol: "2023-11-01", confidence: "confirmed" },
      "3.16": { eol: "2024-05-23", confidence: "confirmed" },
      "3.17": { eol: "2024-11-22", confidence: "confirmed" },
      "3.18": { eol: "2025-05-09", confidence: "confirmed" },
      "3.19": { eol: "2025-11-01", confidence: "confirmed" },
      "3.20": { eol: "2026-04-01", confidence: "estimated" },
      "3.21": { eol: "2026-11-01", confidence: "estimated" },
    },
  },
  php: {
    source: "PHP Supported Versions page (php.net/supported-versions)",
    cycles: {
      "7.4": { eol: "2022-11-28", confidence: "confirmed" },
      "8.0": { eol: "2023-11-26", confidence: "confirmed" },
      "8.1": { eol: "2025-12-31", confidence: "confirmed" },
      "8.2": { eol: "2026-12-31", confidence: "confirmed" },
      "8.3": { eol: "2027-12-31", confidence: "confirmed" },
      "8.4": { eol: "2028-12-31", confidence: "confirmed" },
    },
  },
  ruby: {
    source: "Ruby maintenance branches page (www.ruby-lang.org, ~3-year support per minor)",
    cycles: {
      "2.7": { eol: "2023-03-31", confidence: "confirmed" },
      "3.0": { eol: "2024-03-31", confidence: "confirmed" },
      "3.1": { eol: "2025-03-31", confidence: "confirmed" },
      "3.2": { eol: "2026-03-31", confidence: "estimated" },
      "3.3": { eol: "2027-03-31", confidence: "estimated" },
    },
  },
};

const FAMILY_ALIASES = { node: "node", python: "python", ubuntu: "ubuntu", debian: "debian", alpine: "alpine", php: "php", ruby: "ruby" };

const DEPRECATED_IMAGES = {
  openjdk: {
    note: "Docker Hub's official `openjdk` image was deprecated by its maintainers in 2022 and receives no new builds. Use `eclipse-temurin` instead (same Adoptium/Temurin binaries).",
  },
};

const MAJOR_ONLY = /^(\d+)/;
const MAJOR_MINOR = /^(\d+)\.(\d+)/;

function cycleNode(tag) {
  const m = MAJOR_ONLY.exec(tag);
  return m ? m[1] : null;
}

function cycleMajorMinor(tag) {
  const m = MAJOR_MINOR.exec(tag);
  return m ? `${m[1]}.${m[2]}` : null;
}

function cycleWithCodenames(tag, family) {
  const codenames = EOL_DATA[family].codenames;
  if (codenames && tag in codenames) return codenames[tag];
  if (family === "debian") {
    const m = MAJOR_ONLY.exec(tag);
    return m ? m[1] : null;
  }
  return cycleMajorMinor(tag);
}

const CYCLE_RESOLVERS = {
  node: cycleNode,
  python: cycleMajorMinor,
  ruby: cycleMajorMinor,
  php: cycleMajorMinor,
  alpine: cycleMajorMinor,
  ubuntu: (tag) => cycleWithCodenames(tag, "ubuntu"),
  debian: (tag) => cycleWithCodenames(tag, "debian"),
};

const FROM_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*(?:#.*)?$/i;

export function normalizeTag(tag) {
  return tag.toLowerCase().split("-", 1)[0];
}

/** Mirrors check.py's split_name_and_tag: the tag is read only from the
 * last `/`-separated path segment, so a `registry:port/` prefix is never
 * misread as a tag. A digest reference has no tag to classify by. */
export function splitNameAndTag(ref) {
  const at = ref.indexOf("@");
  if (at !== -1) return { name: ref.slice(0, at), tag: null };
  const lastSlash = ref.lastIndexOf("/");
  const tail = ref.slice(lastSlash + 1);
  if (tail.includes(":")) {
    const prefix = ref.slice(0, lastSlash + 1);
    const colonIndex = tail.lastIndexOf(":");
    const repo = tail.slice(0, colonIndex);
    const tag = tail.slice(colonIndex + 1);
    return { name: `${prefix}${repo}`, tag };
  }
  return { name: ref, tag: null };
}

export function repoBasename(name) {
  const lastSlash = name.lastIndexOf("/");
  return name.slice(lastSlash + 1).toLowerCase();
}

/** Classify one `FROM` reference. `today` and `warnDays` are injected so
 * tests are not a function of the wall clock. */
export function classifyFrom(ref, stageNames, today, warnDays = DEFAULT_WARN_DAYS) {
  if (stageNames.has(ref)) return { classification: STAGE, image: ref, tag: null };
  if (ref.toLowerCase() === "scratch") return { classification: SCRATCH, image: ref, tag: null };
  if (ref.includes("$")) return { classification: VARIABLE, image: ref, tag: null };

  const { name, tag } = splitNameAndTag(ref);
  const basename = repoBasename(name);

  if (basename in DEPRECATED_IMAGES) {
    return { classification: DEPRECATED_IMAGE, image: name, tag, note: DEPRECATED_IMAGES[basename].note };
  }

  const family = FAMILY_ALIASES[basename];
  if (!family) return { classification: UNKNOWN_IMAGE, image: name, tag };

  if (tag === null || tag.toLowerCase() === "latest") {
    return { classification: UNKNOWN_TAG, image: name, tag };
  }

  const normalized = normalizeTag(tag);
  const cycle = CYCLE_RESOLVERS[family](normalized);
  const cycles = EOL_DATA[family].cycles;
  if (cycle === null || !(cycle in cycles)) {
    return { classification: UNKNOWN_TAG, image: name, tag };
  }

  const row = cycles[cycle];
  const eolDate = new Date(`${row.eol}T00:00:00Z`);
  const result = { image: name, tag, cycle, eol: row.eol, confidence: row.confidence, source: EOL_DATA[family].source };
  const msPerDay = 86400000;
  const daysDiff = Math.round((eolDate.getTime() - today.getTime()) / msPerDay);
  if (daysDiff < 0) {
    result.classification = EOL;
    result.daysPastEol = -daysDiff;
  } else if (daysDiff <= warnDays) {
    result.classification = EOL_SOON;
    result.daysUntilEol = daysDiff;
  } else {
    result.classification = SUPPORTED;
  }
  return result;
}

/** Scan one Dockerfile's text. `today` defaults to the real current day. */
export function scanText(text, filename = "<Dockerfile>", today = new Date(), warnDays = DEFAULT_WARN_DAYS) {
  const findings = [];
  const stageNames = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (stripped.startsWith("#")) continue;
    const match = FROM_RE.exec(line);
    if (!match) continue;
    const ref = match[1];
    const alias = match[2];
    const result = classifyFrom(ref, stageNames, today, warnDays);
    if (alias) stageNames.add(alias);
    if (result.classification === STAGE || result.classification === SCRATCH || result.classification === VARIABLE) continue;
    result.file = filename;
    result.line = i + 1;
    findings.push(result);
  }
  return findings;
}

/** Scan one or more pasted Dockerfiles at once. `files` is an array of
 * {name, text}. */
export function scanFiles(files, today = new Date(), warnDays = DEFAULT_WARN_DAYS) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<Dockerfile>", today, warnDays));
  }
  return findings;
}

export function hasUnresolvedRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.classification));
}

export function classificationCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] ?? 0) + 1;
  }
  return counts;
}

export function summaryLine(findings) {
  if (!findings.length) return "No FROM lines found to classify.";
  const counts = classificationCounts(findings);
  const risky = (counts[EOL] ?? 0) + (counts[DEPRECATED_IMAGE] ?? 0);
  const soon = counts[EOL_SOON] ?? 0;
  if (risky) {
    return `${risky} base image reference${risky === 1 ? "" : "s"} already past end-of-life or discontinued, ${soon} more due soon.`;
  }
  if (soon) {
    return `${soon} base image reference${soon === 1 ? "" : "s"} reach end-of-life within the warning window.`;
  }
  return "No base image in this scan is past end-of-life or within the warning window, per the checked-in dataset.";
}
