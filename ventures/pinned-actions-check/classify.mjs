// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text -- nothing here calls any network API, and
// nothing here parses YAML with a library: it uses the same small
// line-by-line regex scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const PINNED = "pinned";
export const MUTABLE = "mutable";
export const LOCAL = "local";
export const DOCKER = "docker";

export const RISK_CLASSIFICATIONS = new Set([MUTABLE]);

// A commit SHA is exactly 40 hex characters. An abbreviated SHA is not
// rewarded as pinned -- it can collide and is not what GitHub's own
// hardening guidance recommends.
const SHA_RE = /^[0-9a-f]{40}$/;

// Matches a `uses:` line (top-level "- uses:" or nested "uses:"), capturing
// the action reference. Mirrors check.py's _USES_RE exactly.
const USES_RE = /^\s*(?:-\s*)?uses:\s*(\S+)\s*(?:#.*)?$/;

function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

/** Heuristic used only to choose the remediation command's ref type. Never
 * changes the classification. */
export function looksLikeVersionTag(ref) {
  return /^v?\d+(\.\d+){0,2}$/.test(ref);
}

/** Classify one `uses:` value. Returns {classification, action, ref}. */
export function classifyUses(rawValue) {
  const value = stripQuotes(rawValue.trim());

  if (value.startsWith("./") || value.startsWith("../")) {
    return { classification: LOCAL, action: value, ref: null };
  }
  if (value.startsWith("docker://")) {
    return { classification: DOCKER, action: value, ref: null };
  }

  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) {
    // No ref at all resolves to the action's default branch -- the most
    // mutable case there is.
    return { classification: MUTABLE, action: value, ref: null };
  }

  const action = value.slice(0, atIndex);
  const ref = value.slice(atIndex + 1);
  if (SHA_RE.test(ref.toLowerCase())) {
    return { classification: PINNED, action, ref };
  }
  return { classification: MUTABLE, action, ref };
}

/** The exact, read-only `git ls-remote` command to look up what a mutable ref
 * currently resolves to. This page never runs it. */
export function remediationCommand(action, ref) {
  const parts = action.split("/");
  if (parts.length < 2 || !parts[1]) return null;
  const [org, repo] = parts;
  const url = `https://github.com/${org}/${repo}`;
  if (ref === null || ref === undefined) return `git ls-remote ${url}`;
  const refPath = looksLikeVersionTag(ref) ? `refs/tags/${ref}` : `refs/heads/${ref}`;
  return `git ls-remote ${url} ${refPath}`;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (stripped.startsWith("#")) continue;
    const match = USES_RE.exec(line);
    if (!match) continue;
    const { classification, action, ref } = classifyUses(match[1]);
    if (classification !== PINNED && classification !== MUTABLE) continue;
    const finding = { file: filename, line: i + 1, action, ref, classification };
    if (classification === MUTABLE) {
      finding.remediation = remediationCommand(action, ref);
    }
    findings.push(finding);
  }
  return findings;
}

/** Scan one or more pasted workflow "files" at once. `files` is an array of
 * {name, text}. Returns the concatenated findings, in the order given. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<workflow>"));
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
  if (!findings.length) return "No third-party `uses:` references found.";
  const counts = classificationCounts(findings);
  const mutable = counts[MUTABLE] ?? 0;
  const pinned = counts[PINNED] ?? 0;
  if (mutable) {
    return `${mutable} mutable reference${mutable === 1 ? "" : "s"} found, ${pinned} already pinned to a commit SHA.`;
  }
  return `Every third-party action reference is pinned to a commit SHA. (${pinned} checked.)`;
}
