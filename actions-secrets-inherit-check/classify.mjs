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

export const SECRETS_INHERIT_EXTERNAL_WORKFLOW = "secrets-inherit-external-workflow";
export const SECRETS_INHERIT_UNTRUSTED_TRIGGER = "secrets-inherit-untrusted-trigger";

export const RISK_CLASSIFICATIONS = new Set([
  SECRETS_INHERIT_EXTERNAL_WORKFLOW,
  SECRETS_INHERIT_UNTRUSTED_TRIGGER,
]);

const UNTRUSTED_TRIGGER_RE = /\bpull_request_target\b|\bworkflow_run\b/;

const REUSABLE_USES_RE = /^(\s*)(?:-\s*)?uses:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/;
const SECRETS_INHERIT_RE = /^(\s*)secrets:\s*inherit\s*(?:#.*)?$/;

const EXTERNAL_REMEDIATION =
  "secrets: inherit hands every secret this repository's workflow can see to a reusable " +
  "workflow hosted in a different repository -- code you may not review on the same " +
  "schedule as your own. Name only the specific secrets that workflow actually needs " +
  "(secrets: { TOKEN: ${{ secrets.TOKEN }} }) instead of inheriting the whole set, and pin " +
  "the call to a full commit SHA rather than a mutable branch or tag.";

const UNTRUSTED_TRIGGER_REMEDIATION =
  "This job is reachable from a fork (pull_request_target/workflow_run) and " +
  "secrets: inherit hands it every secret this workflow can see, not just what it needs. " +
  "A fork-raised event should reach at most the specific secrets required for that job " +
  "(secrets: { TOKEN: ${{ secrets.TOKEN }} }), or the job should run on the unprivileged " +
  "pull_request trigger instead.";

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function isReusableWorkflowCall(value) {
  return value.includes(".github/workflows/");
}

function isExternalCall(value) {
  return !(value.startsWith("./") || value.startsWith("../"));
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");
  const triggerIsUntrusted = UNTRUSTED_TRIGGER_RE.test(text);

  let jobIndent = null;
  let jobIsExternalCall = false;
  let jobCallValue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    if (jobIndent !== null) {
      if (line.trim() === "") {
        // blank line inside the job's mapping: keep tracking
      } else if (lineIndent(line) < jobIndent) {
        jobIndent = null;
        jobIsExternalCall = false;
        jobCallValue = null;
      } else if (lineIndent(line) === jobIndent && SECRETS_INHERIT_RE.test(line)) {
        if (jobIsExternalCall) {
          findings.push({
            file: filename,
            line: lineno,
            type: SECRETS_INHERIT_EXTERNAL_WORKFLOW,
            detail: `secrets: inherit on ${jobCallValue}`,
            remediation: EXTERNAL_REMEDIATION,
          });
        }
        if (triggerIsUntrusted) {
          findings.push({
            file: filename,
            line: lineno,
            type: SECRETS_INHERIT_UNTRUSTED_TRIGGER,
            detail: `secrets: inherit on ${jobCallValue}`,
            remediation: UNTRUSTED_TRIGGER_REMEDIATION,
          });
        }
      }
    }

    const usesMatch = REUSABLE_USES_RE.exec(line);
    if (usesMatch) {
      const value = stripQuotes(usesMatch[2]);
      if (isReusableWorkflowCall(value)) {
        jobIndent = usesMatch[1].length;
        jobIsExternalCall = isExternalCall(value);
        jobCallValue = value;
      } else {
        jobIndent = null;
        jobIsExternalCall = false;
        jobCallValue = null;
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
  const external = findings.filter((f) => f.type === SECRETS_INHERIT_EXTERNAL_WORKFLOW).length;
  const untrusted = findings.filter((f) => f.type === SECRETS_INHERIT_UNTRUSTED_TRIGGER).length;
  const parts = [];
  if (external) parts.push(`${external} secrets-inherit-external-workflow finding${external === 1 ? "" : "s"}`);
  if (untrusted) parts.push(`${untrusted} secrets-inherit-untrusted-trigger finding${untrusted === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
