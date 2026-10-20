// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text -- nothing here calls any network API, and
// nothing here parses YAML with a library: it uses the same small
// line-by-line indentation scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const FORK_EXPOSED = "fork-exposed";
export const SELF_HOSTED_OTHER_TRIGGER = "self-hosted-other-trigger";
export const GITHUB_HOSTED = "github-hosted";
export const RUNNER_GROUP = "runner-group";
export const DYNAMIC = "dynamic";
export const NO_RUNS_ON = "no-runs-on";
export const NO_JOBS = "no-jobs";

export const RISK_CLASSIFICATIONS = new Set([FORK_EXPOSED]);

// The four triggers that hand a stranger some influence over the event that
// runs a job. Mirrors check.py's RISKY_TRIGGERS exactly.
export const RISKY_TRIGGERS = new Set([
  "pull_request",
  "pull_request_target",
  "workflow_run",
  "issue_comment",
]);

// Mirrors check.py's _TOP_ON_RE / _TOP_JOBS_RE / _JOB_NAME_RE / _RUNS_ON_KEY_RE exactly.
const TOP_ON_RE = /^on:\s*(.*?)\s*(?:#.*)?$/;
const TOP_JOBS_RE = /^jobs:\s*(?:#.*)?$/;
const JOB_NAME_RE = /^([A-Za-z0-9_.-]+):\s*(?:#.*)?$/;
const RUNS_ON_KEY_RE = /^(\s+)runs-on:\s*(.*?)\s*(?:#.*)?$/;

function lineIndent(line) {
  return line.length - line.replace(/^ +/, "").length;
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

/** Returns the Set of trigger event names in the file's `on:` key, in any
 * of its three forms. For the block form, only keys at the shallowest
 * indentation under `on:` count -- mirrors check.py's `_extract_on_events`. */
function extractOnEvents(lines) {
  for (let i = 0; i < lines.length; i++) {
    const match = TOP_ON_RE.exec(lines[i]);
    if (!match) continue;
    const inline = match[1].trim();
    if (inline) {
      if (inline.startsWith("[") && inline.endsWith("]")) {
        return new Set(
          inline
            .slice(1, -1)
            .split(",")
            .map((x) => stripQuotes(x.trim()))
            .filter(Boolean),
        );
      }
      return new Set([stripQuotes(inline)]);
    }
    const events = new Set();
    let eventIndent = null;
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      const stripped = line.trim();
      if (!stripped || stripped.startsWith("#")) {
        j += 1;
        continue;
      }
      const indent = lineIndent(line);
      if (indent === 0) break;
      if (eventIndent === null) eventIndent = indent;
      if (indent === eventIndent) {
        const keyMatch = /^([A-Za-z0-9_.-]+):/.exec(stripped);
        if (keyMatch) events.add(keyMatch[1]);
      }
      j += 1;
    }
    return events;
  }
  return new Set();
}

function findJobsStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (TOP_JOBS_RE.test(lines[i])) return i;
  }
  return null;
}

/** Returns [{id, start, end}]. `end` is exclusive. Mirrors check.py's `_find_jobs`. */
function findJobs(lines, jobsIdx) {
  const jobs = [];
  let jobIndent = null;
  const n = lines.length;
  let i = jobsIdx + 1;
  let jobsBlockEnd = n;
  while (i < n) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) {
      i += 1;
      continue;
    }
    const indent = lineIndent(line);
    if (indent === 0) {
      jobsBlockEnd = i;
      break;
    }
    if (jobIndent === null) jobIndent = indent;
    if (indent === jobIndent) {
      const match = JOB_NAME_RE.exec(stripped);
      if (match) jobs.push({ id: match[1], start: i, end: n });
    }
    i += 1;
  }
  for (let j = 0; j < jobs.length; j++) {
    jobs[j].end = j + 1 < jobs.length ? jobs[j + 1].start : jobsBlockEnd;
  }
  return jobs;
}

/** The shallowest-indented `runs-on:` line within [start, end). Returns
 * {idx, indent} or null. Mirrors check.py's `_find_job_runs_on`. */
function findJobRunsOn(lines, start, end) {
  let best = null;
  for (let idx = start; idx < end; idx++) {
    const match = RUNS_ON_KEY_RE.exec(lines[idx]);
    if (!match) continue;
    const indent = match[1].length;
    if (best === null || indent < best.indent) best = { idx, indent };
  }
  return best;
}

/** Returns {kind, value} for the `runs-on:` key at lines[idx]. Mirrors
 * check.py's `_parse_runs_on` exactly -- see its docstring for the four kinds. */
function parseRunsOn(lines, idx) {
  const match = RUNS_ON_KEY_RE.exec(lines[idx]);
  const inline = match ? match[2].trim() : "";
  const keyIndent = lines[idx].length - lines[idx].replace(/^ +/, "").length;

  if (inline) {
    if (inline.includes("${{")) return { kind: "dynamic", value: null };
    if (inline.startsWith("[") && inline.endsWith("]")) {
      const items = inline
        .slice(1, -1)
        .split(",")
        .map((x) => stripQuotes(x.trim()))
        .filter(Boolean);
      return { kind: "labels", value: items };
    }
    if (inline.startsWith("{")) return { kind: "group", value: null };
    return { kind: "labels", value: [stripQuotes(inline)] };
  }

  const labels = [];
  let sawGroupKey = false;
  let i = idx + 1;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) {
      i += 1;
      continue;
    }
    if (lineIndent(line) <= keyIndent) break;
    if (stripped.startsWith("-")) {
      const item = stripQuotes(stripped.slice(1).trim());
      if (item) labels.push(item);
    } else if (/^group:\s*/.test(stripped)) {
      sawGroupKey = true;
    }
    i += 1;
  }

  if (sawGroupKey) return { kind: "group", value: null };
  if (labels.length) return { kind: "labels", value: labels };
  return { kind: "empty", value: null };
}

function classifyJob(lines, start, end, events) {
  const found = findJobRunsOn(lines, start + 1, end);
  if (found === null) {
    return { classification: NO_RUNS_ON, detail: "no runs-on: found for this job" };
  }
  const { kind, value } = parseRunsOn(lines, found.idx);

  if (kind === "dynamic") {
    return {
      classification: DYNAMIC,
      detail: "runs-on is a `${{ }}` expression (e.g. a matrix) -- cannot classify statically",
    };
  }
  if (kind === "group") {
    return {
      classification: RUNNER_GROUP,
      detail: "runs-on selects a runner group by name -- cannot tell whether that group is self-hosted from this file alone",
    };
  }
  if (kind === "empty") {
    return { classification: NO_RUNS_ON, detail: "runs-on: has no labels or group listed" };
  }

  const labels = value;
  if (!labels.some((label) => label === "self-hosted")) {
    return { classification: GITHUB_HOSTED, detail: `runs-on: ${labels.join(", ")}` };
  }

  const risky = [...events].filter((e) => RISKY_TRIGGERS.has(e)).sort();
  if (risky.length) {
    return {
      classification: FORK_EXPOSED,
      detail: `self-hosted runner in a workflow triggered by ${risky.join(", ")} -- a stranger's fork, comment, or pull request can influence this run`,
    };
  }
  const triggerDesc = events.size ? [...events].sort().join(", ") : "no `on:` trigger found";
  return {
    classification: SELF_HOSTED_OTHER_TRIGGER,
    detail: `self-hosted runner, but this workflow's trigger (${triggerDesc}) is not one of ${[...RISKY_TRIGGERS].sort().join(", ")}`,
  };
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. */
export function scanText(text, filename = "<workflow>") {
  const lines = text.split("\n");
  const events = extractOnEvents(lines);
  const jobsIdx = findJobsStart(lines);

  if (jobsIdx === null) {
    return [{ file: filename, line: 1, scope: "workflow", classification: NO_JOBS, detail: "no `jobs:` section found" }];
  }

  const jobs = findJobs(lines, jobsIdx);
  if (!jobs.length) {
    return [
      {
        file: filename,
        line: jobsIdx + 1,
        scope: "workflow",
        classification: NO_JOBS,
        detail: "`jobs:` section has no jobs this tool could find",
      },
    ];
  }

  const findings = [];
  for (const job of jobs) {
    const { classification, detail } = classifyJob(lines, job.start, job.end, events);
    findings.push({ file: filename, line: job.start + 1, scope: `job:${job.id}`, classification, detail });
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
  if (!findings.length) return "No jobs to check.";
  const counts = classificationCounts(findings);
  const exposed = counts[FORK_EXPOSED] ?? 0;
  const total = findings.length;
  if (exposed) {
    return `${exposed} fork-exposed self-hosted job${exposed === 1 ? "" : "s"} found, out of ${total} job(s) checked.`;
  }
  return `No fork-exposed self-hosted jobs found. (${total} job(s) checked.)`;
}
