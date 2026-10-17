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

export const JOB_MISSING_TIMEOUT = "job-missing-timeout";
export const JOB_TIMEOUT_AT_DEFAULT = "job-timeout-at-default";

export const RISK_CLASSIFICATIONS = new Set([JOB_MISSING_TIMEOUT, JOB_TIMEOUT_AT_DEFAULT]);

const DEFAULT_TIMEOUT_MINUTES = 360;

const JOBS_RE = /^jobs:\s*(?:#.*)?$/;
const KEY_RE = /^( *)(["']?[A-Za-z0-9_.-]+["']?):\s*(.*?)\s*$/;
const TIMEOUT_NUMBER_RE = /^["']?(\d+)["']?\s*(?:#.*)?$/;

const REMEDIATION =
  "Add a job-level timeout-minutes a few times longer than the job normally takes " +
  "(for example 15 for a test job, 30 for a build), so a hung run is cancelled in " +
  "minutes instead of billing until GitHub's 360-minute default.";

const AT_DEFAULT_REMEDIATION =
  "timeout-minutes of 360 or more is GitHub's own default restated, so it limits " +
  "nothing. Set it a few times longer than the job normally takes (for example 15 " +
  "for a test job, 30 for a build).";

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

function isBlankOrComment(line) {
  const s = line.trim();
  return s === "" || s.startsWith("#");
}

function stripComment(value) {
  return value.replace(/\s+#.*$/, "").trim();
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

function billingNote(runsOn, jobText) {
  const haystack = (runsOn.includes("${{") ? runsOn + "\n" + jobText : runsOn).toLowerCase();
  if (haystack.includes("self-hosted")) {
    return "self-hosted runner: not metered by GitHub, but a hung run holds that runner for up to 360 min";
  }
  let multiplier = 1;
  if (haystack.includes("macos")) multiplier = 10;
  else if (haystack.includes("windows")) multiplier = 2;
  if (multiplier === 1) return "up to 360 billed min per hung run";
  return `up to 360 min x ${multiplier} = ${(360 * multiplier).toLocaleString("en-US")} billed min per hung run on private repositories`;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));

  const jobsAt = lines.findIndex((l) => JOBS_RE.test(l));
  if (jobsAt === -1) return findings;

  const body = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isBlankOrComment(line)) {
      body.push([i + 1, line]);
      continue;
    }
    if (lineIndent(line) === 0) break;
    body.push([i + 1, line]);
  }

  let jobIndent = null;
  for (const [, line] of body) {
    if (!isBlankOrComment(line)) {
      jobIndent = lineIndent(line);
      break;
    }
  }
  if (jobIndent === null) return findings;

  const blocks = [];
  let current = null;
  for (const [lineno, line] of body) {
    if (isBlankOrComment(line)) {
      if (current) current.lines.push([lineno, line]);
      continue;
    }
    const match = KEY_RE.exec(line);
    if (lineIndent(line) === jobIndent && match) {
      current = { name: stripQuotes(match[2]), line: lineno, lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push([lineno, line]);
    }
  }

  for (const block of blocks) {
    let propIndent = null;
    for (const [, line] of block.lines) {
      if (!isBlankOrComment(line)) {
        propIndent = lineIndent(line);
        break;
      }
    }
    if (propIndent === null || propIndent <= jobIndent) continue;

    let runsOn = null;
    let timeout = null;
    let isCall = false;
    for (const [, line] of block.lines) {
      if (isBlankOrComment(line) || lineIndent(line) !== propIndent) continue;
      const match = KEY_RE.exec(line);
      if (!match) continue;
      const key = match[2];
      const value = stripComment(match[3]);
      if (key === "runs-on") runsOn = value;
      else if (key === "timeout-minutes") timeout = value;
      else if (key === "uses") isCall = true;
    }

    if (isCall || runsOn === null) continue;

    const jobText = block.lines.map(([, l]) => l).join("\n");
    const head = `job '${block.name}'` + (runsOn ? ` (runs-on: ${runsOn})` : "");

    if (timeout === null) {
      findings.push({
        file: filename,
        line: block.line,
        type: JOB_MISSING_TIMEOUT,
        detail: `${head}: no timeout-minutes; ${billingNote(runsOn, jobText)}`,
        remediation: REMEDIATION,
      });
      continue;
    }

    const number = TIMEOUT_NUMBER_RE.exec(timeout);
    if (number && parseInt(number[1], 10) >= DEFAULT_TIMEOUT_MINUTES) {
      findings.push({
        file: filename,
        line: block.line,
        type: JOB_TIMEOUT_AT_DEFAULT,
        detail: `${head}: timeout-minutes: ${number[1]}; ${billingNote(runsOn, jobText)}`,
        remediation: AT_DEFAULT_REMEDIATION,
      });
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
  const missing = findings.filter((f) => f.type === JOB_MISSING_TIMEOUT).length;
  const atDefault = findings.filter((f) => f.type === JOB_TIMEOUT_AT_DEFAULT).length;
  const parts = [];
  if (missing) parts.push(`${missing} job-missing-timeout finding${missing === 1 ? "" : "s"}`);
  if (atDefault) parts.push(`${atDefault} job-timeout-at-default finding${atDefault === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
