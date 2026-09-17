// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted Dockerfile text -- nothing here calls any network API, and
// nothing here parses a Dockerfile with a library: it uses the same small
// line-by-line regex scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const PINNED = "pinned";
export const MUTABLE = "mutable";
export const STAGE = "stage";
export const SCRATCH = "scratch";
export const VARIABLE = "variable";

export const RISK_CLASSIFICATIONS = new Set([MUTABLE]);

// A digest reference is `@<algorithm>:<hex>`. sha256 is what every current
// registry and buildkit version actually produces, but the reference grammar
// allows any lowercase alphanumeric algorithm name, so this is not hardcoded
// to "sha256".
const DIGEST_RE = /^[a-z0-9]+(?:[+._-][a-z0-9]+)*:[0-9a-f]{32,}$/;

// Matches a `FROM` instruction, tolerating the optional `--platform=...` flag
// and an optional `AS <stage-name>` suffix. Mirrors check.py's _FROM_RE
// exactly, case-insensitively.
const FROM_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*(?:#.*)?$/i;

function looksVariable(text) {
  return text.includes("$");
}

/** Split an image reference into {name, tag, digest}. Mirrors
 * check.py's split_name_and_ref: the tag is read only from the last
 * `/`-separated path segment, so a `registry:port/` prefix is never
 * misread as a tag. */
export function splitNameAndRef(ref) {
  const at = ref.indexOf("@");
  if (at !== -1) {
    return { name: ref.slice(0, at), tag: null, digest: ref.slice(at + 1) };
  }
  const lastSlash = ref.lastIndexOf("/");
  const tail = ref.slice(lastSlash + 1);
  if (tail.includes(":")) {
    const prefix = ref.slice(0, lastSlash + 1);
    const colonIndex = tail.lastIndexOf(":");
    const repo = tail.slice(0, colonIndex);
    const tag = tail.slice(colonIndex + 1);
    return { name: `${prefix}${repo}`, tag, digest: null };
  }
  return { name: ref, tag: null, digest: null };
}

/** Classify one `FROM` reference. Returns {classification, name, tag, digest}. */
export function classifyFrom(ref, stageNames) {
  if (stageNames.has(ref)) {
    return { classification: STAGE, name: ref, tag: null, digest: null };
  }
  if (ref.toLowerCase() === "scratch") {
    return { classification: SCRATCH, name: ref, tag: null, digest: null };
  }
  if (looksVariable(ref)) {
    return { classification: VARIABLE, name: ref, tag: null, digest: null };
  }

  const { name, tag, digest } = splitNameAndRef(ref);

  if (digest !== null) {
    if (DIGEST_RE.test(digest.toLowerCase())) {
      return { classification: PINNED, name, tag: null, digest };
    }
    // Malformed digest-shaped suffix -- not this tool's job to validate
    // Dockerfile syntax, but not silently dropped either.
    return { classification: MUTABLE, name, tag: null, digest };
  }

  return { classification: MUTABLE, name, tag, digest: null };
}

/** The exact, read-only command to look up the digest a mutable tag
 * currently resolves to. This page never runs it. */
export function remediationCommand(name, tag) {
  const ref = tag ? `${name}:${tag}` : `${name}:latest`;
  return `docker buildx imagetools inspect ${ref}`;
}

/** Scan one Dockerfile's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<Dockerfile>") {
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
    const { classification, name, tag, digest } = classifyFrom(ref, stageNames);
    if (alias) stageNames.add(alias);
    if (classification !== PINNED && classification !== MUTABLE) continue;
    const finding = { file: filename, line: i + 1, image: name, tag, digest, classification };
    if (classification === MUTABLE) {
      finding.remediation = remediationCommand(name, tag);
    }
    findings.push(finding);
  }
  return findings;
}

/** Scan one or more pasted Dockerfiles at once. `files` is an array of
 * {name, text}. Returns the concatenated findings, in the order given. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<Dockerfile>"));
  }
  return findings;
}

export function hasUnresolvedRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.classification));
}

/** Counts per classification. */
export function classificationCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] ?? 0) + 1;
  }
  return counts;
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No FROM lines found to classify.";
  const counts = classificationCounts(findings);
  const mutable = counts[MUTABLE] ?? 0;
  const pinned = counts[PINNED] ?? 0;
  if (mutable) {
    return `${mutable} mutable base image reference${mutable === 1 ? "" : "s"} found, ${pinned} already pinned to a digest.`;
  }
  return `Every base image reference is pinned to a content digest. (${pinned} checked.)`;
}
