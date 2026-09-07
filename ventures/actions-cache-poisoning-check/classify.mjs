// Browser port of check.py's scanning logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text -- nothing here calls any network API, and
// nothing here parses YAML with a library: it uses the same small
// indentation-aware line scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same scenarios test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const CACHE_WRITE_ON_UNTRUSTED_TRIGGER = "cache-write-on-untrusted-trigger";
export const UNSCOPED_RESTORE_KEYS = "unscoped-restore-keys";

export const RISK_CLASSIFICATIONS = new Set([CACHE_WRITE_ON_UNTRUSTED_TRIGGER, UNSCOPED_RESTORE_KEYS]);

const UNTRUSTED_TRIGGER_RE = /\bpull_request_target\b|\bworkflow_run\b/;

const CACHE_ACTION_RE = /^(\s*)(?:-\s*)?uses:\s*["']?actions\/cache(?:\/(save|restore))?@/;
const RESTORE_KEYS_RE = /^(\s*)restore-keys:/;

const CACHE_WRITE_REMEDIATION =
  "This job is reachable from a fork (pull_request_target/workflow_run) and writes into " +
  "the repository-scoped Actions cache. A later privileged workflow (a push-to-main or " +
  "release build, say) that restores from the same cache namespace can pick up the fork's " +
  "entry -- the root cause behind the May 2026 TanStack Router incident. Do not cache in a " +
  "job reachable from an untrusted trigger, or key it so no privileged job ever restores " +
  "from the same namespace (prefix the key with the untrusted run's own run id, never a " +
  "branch name or lockfile hash a privileged job also uses).";

const RESTORE_KEYS_REMEDIATION =
  "restore-keys enables prefix-fallback: a miss on the exact key can still restore a " +
  "different entry that only shares the prefix, which is what let independent researchers " +
  "(AdnaneKhan's ActionsCacheBlasting, Hive Security's cache-poisoning writeup) demonstrate a " +
  "near-collision key being adopted. If anything else in this repository -- including an " +
  "unprivileged job -- can write a cache entry under the same prefix, narrow this to an " +
  "exact key or drop the fallback list.";

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");
  const triggerIsUntrusted = UNTRUSTED_TRIGGER_RE.test(text);

  let cacheStepIndent = null;
  let cacheStepVariant = null; // null = unified (reads+writes), "save", "restore"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    if (cacheStepIndent !== null) {
      if (line.trim() === "") {
        // blank line inside the step: keep tracking
      } else if (lineIndent(line) <= cacheStepIndent) {
        cacheStepIndent = null;
        cacheStepVariant = null;
      } else if (RESTORE_KEYS_RE.test(line) && cacheStepVariant !== "save") {
        const label = "actions/cache" + (cacheStepVariant ? `/${cacheStepVariant}` : "");
        findings.push({
          file: filename,
          line: lineno,
          type: UNSCOPED_RESTORE_KEYS,
          detail: `restore-keys on ${label}`,
          remediation: RESTORE_KEYS_REMEDIATION,
        });
      }
    }

    const cacheMatch = CACHE_ACTION_RE.exec(line);
    if (cacheMatch) {
      const variant = cacheMatch[2] || null;
      cacheStepIndent = cacheMatch[1].length;
      cacheStepVariant = variant;
      if (triggerIsUntrusted && variant !== "restore") {
        const label = "actions/cache" + (variant ? `/${variant}` : "");
        findings.push({
          file: filename,
          line: lineno,
          type: CACHE_WRITE_ON_UNTRUSTED_TRIGGER,
          detail: label,
          remediation: CACHE_WRITE_REMEDIATION,
        });
      }
    }
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

export function hasRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No findings.";
  const writes = findings.filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER).length;
  const restores = findings.filter((f) => f.type === UNSCOPED_RESTORE_KEYS).length;
  const parts = [];
  if (writes) parts.push(`${writes} cache-write-on-untrusted-trigger finding${writes === 1 ? "" : "s"}`);
  if (restores) parts.push(`${restores} unscoped-restore-keys finding${restores === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
