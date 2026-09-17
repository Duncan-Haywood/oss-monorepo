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

export const EXPLICIT = "explicit";
export const WRITE_ALL = "write-all";
export const UNSPECIFIED = "unspecified";

export const RISK_CLASSIFICATIONS = new Set([WRITE_ALL, UNSPECIFIED]);

// Top-level keys start in column 0. Mirrors check.py's _TOP_PERMISSIONS_RE /
// _TOP_JOBS_RE / _JOB_NAME_RE / _PERMISSIONS_KEY_RE exactly.
const TOP_PERMISSIONS_RE = /^permissions:\s*(.*?)\s*(?:#.*)?$/;
const TOP_JOBS_RE = /^jobs:\s*(?:#.*)?$/;
const JOB_NAME_RE = /^([A-Za-z0-9_.-]+):\s*(?:#.*)?$/;
const PERMISSIONS_KEY_RE = /^(\s+)permissions:\s*(.*?)\s*(?:#.*)?$/;

function lineIndent(line) {
  return line.length - line.replace(/^ +/, "").length;
}

/** `lines[keyIdx]` is a `permissions:` key at `keyIndent`. Returns
 * {classification, detail}. */
function classifyPermissionsValue(lines, keyIdx, keyIndent) {
  const match = /^\s*permissions:\s*(.*?)\s*(?:#.*)?$/.exec(lines[keyIdx]);
  const inline = match ? match[1].trim() : "";

  if (inline) {
    if (inline === WRITE_ALL) return { classification: WRITE_ALL, detail: "write-all" };
    return { classification: EXPLICIT, detail: inline };
  }

  const scopes = [];
  let i = keyIdx + 1;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) {
      i += 1;
      continue;
    }
    if (lineIndent(line) <= keyIndent) break;
    scopes.push(stripped);
    i += 1;
  }
  return { classification: EXPLICIT, detail: scopes.length ? scopes.join(", ") : "(no scopes)" };
}

function findTopLevelPermissions(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (TOP_PERMISSIONS_RE.test(lines[i])) return i;
  }
  return null;
}

function findJobsStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (TOP_JOBS_RE.test(lines[i])) return i;
  }
  return null;
}

/** Returns {jobIndent, jobs: [{id, start, end}]}. `end` is exclusive. */
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
  return { jobIndent, jobs };
}

/** The shallowest-indented `permissions:` line within [start, end) --
 * `permissions` is only a valid job-level key in the workflow schema, never
 * a step input, so the shallowest match within a job's own body is its
 * job-level grant. Returns {idx, indent} or null. */
function findJobPermissions(lines, start, end) {
  let best = null;
  for (let idx = start; idx < end; idx++) {
    const match = PERMISSIONS_KEY_RE.exec(lines[idx]);
    if (!match) continue;
    const indent = match[1].length;
    if (best === null || indent < best.indent) best = { idx, indent };
  }
  return best;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const lines = text.split("\n");
  const findings = [];

  const topIdx = findTopLevelPermissions(lines);
  let topClassification = null;
  if (topIdx !== null) {
    const { classification, detail } = classifyPermissionsValue(lines, topIdx, 0);
    topClassification = classification;
    findings.push({ file: filename, line: topIdx + 1, scope: "workflow", classification, detail });
  }

  const jobsIdx = findJobsStart(lines);
  let jobs = [];
  if (jobsIdx !== null) {
    jobs = findJobs(lines, jobsIdx).jobs;
  }

  for (const job of jobs) {
    const found = findJobPermissions(lines, job.start + 1, job.end);
    if (found !== null) {
      const { classification, detail } = classifyPermissionsValue(lines, found.idx, found.indent);
      findings.push({ file: filename, line: found.idx + 1, scope: `job:${job.id}`, classification, detail });
    } else if (topClassification === null) {
      findings.push({
        file: filename,
        line: job.start + 1,
        scope: `job:${job.id}`,
        classification: UNSPECIFIED,
        detail: "no permissions block on this job or the workflow",
      });
    } else {
      findings.push({
        file: filename,
        line: job.start + 1,
        scope: `job:${job.id}`,
        classification: topClassification,
        detail: "inherited from the workflow-level permissions",
      });
    }
  }

  if (topIdx === null && jobs.length === 0) {
    findings.push({
      file: filename,
      line: 1,
      scope: "workflow",
      classification: UNSPECIFIED,
      detail: "no `permissions:` key and no `jobs:` section found",
    });
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
  if (!findings.length) return "No workflow-level or job-level permissions to check.";
  const counts = classificationCounts(findings);
  const risky = (counts[WRITE_ALL] ?? 0) + (counts[UNSPECIFIED] ?? 0);
  const explicit = counts[EXPLICIT] ?? 0;
  if (risky) {
    return `${risky} risky finding${risky === 1 ? "" : "s"} (unspecified or write-all), ${explicit} already explicit.`;
  }
  return `Every workflow and job has an explicit permissions grant. (${explicit} checked.)`;
}
