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

export const ARTIFACT_EXECUTED = "artifact-executed-after-untrusted-download";
export const UNSCOPED_ARTIFACT_DOWNLOAD = "unscoped-artifact-download";

export const RISK_CLASSIFICATIONS = new Set([ARTIFACT_EXECUTED, UNSCOPED_ARTIFACT_DOWNLOAD]);

const WORKFLOW_RUN_RE = /\bworkflow_run\b/;

const STEPS_KEY_RE = /^(\s*)steps:\s*(#.*)?$/;
const STEP_START_RE = /^(\s*)-\s/;
const DOWNLOAD_ARTIFACT_RE = /^(\s*)(?:-\s*)?uses:\s*["']?(?:actions\/download-artifact|dawidd6\/action-download-artifact)@/;
const NAME_KEY_RE = /^(\s*)name:\s*\S/;
const RUN_KEY_RE = /^(\s*)(?:-\s*)?run:\s*\|?\s*(.*)$/;

const EXEC_LOOKING_RE =
  /\bchmod\s+\+x\b|(?:^|[\s;&|])\.\/\S|(?:^|[\s;&|])(?:bash|sh|source|python3?|node|eval)\b/;

const ARTIFACT_EXECUTED_REMEDIATION =
  "This job is triggered by workflow_run and downloads an artifact, then a later step in " +
  "the same job runs something that looks like it executes a file from disk. The artifact's " +
  "*contents* came from the fork-triggered run this workflow reacts to, not just its event " +
  "payload -- GitHub's Actions Security Lab and independent research (Wiz, Legit Security, " +
  "Orca Security) document this as 'artifact poisoning'. Do not execute, source, or interpret " +
  "anything from a downloaded artifact as code; read specific, expected data fields from it " +
  "instead, and validate their shape before use.";

const UNSCOPED_DOWNLOAD_REMEDIATION =
  "This download-artifact step has no name: input, so it pulls in every artifact the " +
  "triggering (fork-controlled) run uploaded rather than one specific, expected one -- " +
  "widening what untrusted content enters this privileged job even if nothing here executes " +
  "it directly. Pin name: to the exact artifact this job expects.";

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");
  const triggerIsWorkflowRun = WORKFLOW_RUN_RE.test(text);

  // --- state for unscoped-artifact-download (per download step) ---
  let dlStepIndent = null;
  let dlLine = null;
  let dlHasName = false;

  // --- state for artifact-executed-after-untrusted-download (per job) ---
  let downloadLineInJob = null;
  let runBlockIndent = null;
  let runBlockLines = [];
  let runBlockStartLine = null;

  // Indent of the most recent step-list "- " marker. A step's own keys
  // (name, uses, with, run, ...) are conventionally either on the same line
  // as the dash ("- uses: ...") or indented two spaces past it ("- name:
  // ...\n  uses: ..."). stepIndentFor resolves either form to the dash's own
  // indent, so a sibling key like `with:` is never mistaken for the end of
  // the step just because it does not itself start with "-".
  let lastStepDashIndent = null;

  function stepIndentFor(rawIndent) {
    if (lastStepDashIndent !== null && rawIndent === lastStepDashIndent + 2) return lastStepDashIndent;
    return rawIndent;
  }

  function finalizeDownload() {
    if (dlStepIndent !== null && triggerIsWorkflowRun && !dlHasName) {
      findings.push({
        file: filename,
        line: dlLine,
        type: UNSCOPED_ARTIFACT_DOWNLOAD,
        detail: "download-artifact with no name:",
        remediation: UNSCOPED_DOWNLOAD_REMEDIATION,
      });
    }
    dlStepIndent = null;
    dlLine = null;
    dlHasName = false;
  }

  function finalizeRunBlock() {
    if (runBlockIndent !== null && triggerIsWorkflowRun && downloadLineInJob !== null) {
      const body = runBlockLines.join("\n");
      if (EXEC_LOOKING_RE.test(body)) {
        findings.push({
          file: filename,
          line: runBlockStartLine,
          type: ARTIFACT_EXECUTED,
          detail: `run step at line ${runBlockStartLine} follows download-artifact at line ${downloadLineInJob}`,
          remediation: ARTIFACT_EXECUTED_REMEDIATION,
        });
      }
    }
    runBlockIndent = null;
    runBlockLines = [];
    runBlockStartLine = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;
    const blank = line.trim() === "";

    if (runBlockIndent !== null && !blank && lineIndent(line) <= runBlockIndent) {
      finalizeRunBlock();
    }

    if (dlStepIndent !== null) {
      if (blank) {
        // blank line inside the step: keep tracking
      } else if (lineIndent(line) <= dlStepIndent) {
        finalizeDownload();
      } else if (NAME_KEY_RE.test(line)) {
        dlHasName = true;
      }
    }

    if (STEPS_KEY_RE.test(line)) {
      downloadLineInJob = null;
    }

    const stepStartMatch = STEP_START_RE.exec(line);
    if (stepStartMatch) {
      lastStepDashIndent = stepStartMatch[1].length;
    }

    const dlMatch = DOWNLOAD_ARTIFACT_RE.exec(line);
    if (dlMatch) {
      finalizeDownload();
      dlStepIndent = stepIndentFor(dlMatch[1].length);
      dlLine = lineno;
      dlHasName = false;
      downloadLineInJob = lineno;
    }

    const runMatch = RUN_KEY_RE.exec(line);
    if (runMatch) {
      finalizeRunBlock();
      runBlockIndent = stepIndentFor(runMatch[1].length);
      runBlockStartLine = lineno;
      runBlockLines = [runMatch[2]];
    } else if (runBlockIndent !== null && lineIndent(line) > runBlockIndent) {
      runBlockLines.push(line);
    }
  }

  finalizeDownload();
  finalizeRunBlock();

  findings.sort((a, b) => a.line - b.line);
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
  const executed = findings.filter((f) => f.type === ARTIFACT_EXECUTED).length;
  const unscoped = findings.filter((f) => f.type === UNSCOPED_ARTIFACT_DOWNLOAD).length;
  const parts = [];
  if (executed) parts.push(`${executed} artifact-executed-after-untrusted-download finding${executed === 1 ? "" : "s"}`);
  if (unscoped) parts.push(`${unscoped} unscoped-artifact-download finding${unscoped === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
