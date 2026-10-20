// Classification core, deliberately parallel to the sibling venture
// pinned-actions-check/classify.mjs: same line-by-line regex scan, same
// four classifications, so a reader who knows one tool already knows this
// one's vocabulary. What this module adds is `parseRemoteRef`, which turns
// a pinned remote `uses:` reference into the file path this venture needs
// to fetch to see what THAT reference itself calls.

export const PINNED = "pinned";
export const MUTABLE = "mutable";
export const LOCAL = "local";
export const DOCKER = "docker";

const SHA_RE = /^[0-9a-f]{40}$/i;

// Matches a `uses:` line (top-level "- uses:" or nested "uses:"), capturing
// the action reference. Same shape as pinned-actions-check's _USES_RE.
const USES_RE = /^\s*(?:-\s*)?uses:\s*(\S+)\s*(?:#.*)?$/;

function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
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
    return { classification: MUTABLE, action: value, ref: null };
  }

  const action = value.slice(0, atIndex);
  const ref = value.slice(atIndex + 1);
  if (SHA_RE.test(ref)) {
    return { classification: PINNED, action, ref };
  }
  return { classification: MUTABLE, action, ref };
}

/** Scan one file's text for `uses:` lines. Returns findings in the same
 * shape pinned-actions-check emits, so the two tools' JSON never disagrees
 * about what a line means. */
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
    findings.push({ file: filename, line: i + 1, action, ref, classification });
  }
  return findings;
}

/** A pinned remote reference names a repo and, usually, a subpath. This
 * decides what kind of file defines "what that reference itself calls",
 * and where to fetch it from.
 *
 * - `owner/repo/.github/workflows/<file>.yml@<sha>` is a reusable workflow:
 *   the file at that exact path IS the definition, and its own `jobs.*.
 *   steps[].uses` lines are the nested references.
 * - Anything else (`owner/repo@<sha>` or `owner/repo/<subpath>@<sha>`) is an
 *   action. A composite action's nested `uses:` lines live in its
 *   `action.yml` (or `.yaml`) at that subpath — a JS or Docker action has
 *   no such nested `uses:` lines, and fetching finds nothing to flag either
 *   way, which is why both extensions are tried before giving up rather
 *   than guessed from the name.
 *
 * Returns null for a malformed action string (no owner/repo).
 */
export function parseRemoteRef(action) {
  const parts = action.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, ...rest] = parts;
  const subpath = rest.join("/");

  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(subpath)) {
    return { owner, repo, kind: "reusable-workflow", candidatePaths: [subpath] };
  }

  const base = subpath ? `${subpath}/` : "";
  return { owner, repo, kind: "action", candidatePaths: [`${base}action.yml`, `${base}action.yaml`] };
}

export function classificationCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] ?? 0) + 1;
  }
  return counts;
}
