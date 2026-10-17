// Browser port of check.py's scanning logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text -- nothing here calls any network API, and
// nothing here parses YAML with a library: it reads `cron:` lines the same
// way check.py does, on purpose, so the two never disagree.
//
// classify.test.mjs pins this port against the same scenarios test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const CRON_INVALID = "cron-invalid";
export const CRON_TOO_FREQUENT = "cron-faster-than-5-minutes";
export const CRON_TOP_OF_HOUR = "cron-top-of-hour";

export const RISK_CLASSIFICATIONS = new Set([CRON_INVALID, CRON_TOO_FREQUENT, CRON_TOP_OF_HOUR]);

const MIN_INTERVAL_MINUTES = 5;

const FIELDS = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day of month", 1, 31],
  ["month", 1, 12],
  ["day of week", 0, 6],
];

const CRON_LINE_RE = /^\s*-?\s*cron:\s*(.*?)\s*$/;
const NUMBER_RE = /^\d+$/;

const INVALID_REMEDIATION =
  "Use exactly five space-separated fields: minute hour day-of-month month " +
  "day-of-week, each inside its range. GitHub cron has no seconds field.";
const FREQUENT_REMEDIATION =
  "GitHub's shortest supported schedule interval is 5 minutes. Use */5 or " +
  "slower, or trigger the work another way (workflow_dispatch, a webhook).";
const TOP_OF_HOUR_REMEDIATION =
  "Scheduled runs can be delayed or dropped at the start of the hour, when " +
  "load is highest. Pick an off-peak minute such as 17 or 43.";

function unquote(value) {
  let v = value.replace(/\s+#.*$/, "").trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    v = v.slice(1, -1);
  }
  return v.trim();
}

function checkNumber(token, low, high) {
  return NUMBER_RE.test(token) && Number(token) >= low && Number(token) <= high;
}

function fieldProblem(field, low, high) {
  for (const part of field.split(",")) {
    if (part === "") return "empty list item";
    const slash = part.indexOf("/");
    const base = slash === -1 ? part : part.slice(0, slash);
    const step = slash === -1 ? "" : part.slice(slash + 1);
    if (slash !== -1 && !(NUMBER_RE.test(step) && Number(step) >= 1)) return `bad step '${step}'`;
    if (base === "*") continue;
    const ends = base.includes("-") ? [base.slice(0, base.indexOf("-")), base.slice(base.indexOf("-") + 1)] : [base];
    for (const end of ends) {
      if (!checkNumber(end, low, high)) return `'${end}' is not a number from ${low} to ${high}`;
    }
  }
  return null;
}

/** Findings for one cron expression: array of [type, detail, remediation]. */
export function classifyCron(expr) {
  const fields = expr.split(/\s+/).filter(Boolean);
  if (fields.length !== 5) {
    return [[CRON_INVALID, `'${expr}' has ${fields.length} field(s), GitHub needs 5`, INVALID_REMEDIATION]];
  }
  const problems = [];
  FIELDS.forEach(([name, low, high], i) => {
    const reason = fieldProblem(fields[i], low, high);
    if (reason) problems.push(`${name} field '${fields[i]}': ${reason}`);
  });
  if (problems.length) return [[CRON_INVALID, `'${expr}': ${problems.join("; ")}`, INVALID_REMEDIATION]];

  const minute = fields[0];
  const slash = minute.indexOf("/");
  const base = slash === -1 ? minute : minute.slice(0, slash);
  const step = slash === -1 ? "" : minute.slice(slash + 1);
  if (base === "*" && (!step || Number(step) < MIN_INTERVAL_MINUTES)) {
    const every = step ? Number(step) : 1;
    return [[CRON_TOO_FREQUENT, `'${expr}' asks for every ${every} minute(s)`, FREQUENT_REMEDIATION]];
  }
  if (base.includes("-") && step && Number(step) < MIN_INTERVAL_MINUTES) {
    return [[CRON_TOO_FREQUENT, `'${expr}' steps every ${step} minute(s)`, FREQUENT_REMEDIATION]];
  }
  if (minute.replace(/^0+/, "") === "") {
    return [[CRON_TOP_OF_HOUR, `'${expr}' runs at minute 0, the busiest minute of the hour`, TOP_OF_HOUR_REMEDIATION]];
  }
  return [];
}

/** Scan one workflow file's text. Returns finding objects in the same shape
 * check.py's --format json emits. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  text.split("\n").forEach((raw, idx) => {
    const line = raw.replace(/\r$/, "");
    const match = CRON_LINE_RE.exec(line);
    if (!match || line.trimStart().startsWith("#")) return;
    const expr = unquote(match[1]);
    if (!expr) return;
    for (const [type, detail, remediation] of classifyCron(expr)) {
      findings.push({ file: filename, line: idx + 1, type, detail, remediation });
    }
  });
  return findings;
}

/** Scan several pasted files: `files` is an array of {name, text}. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) findings.push(...scanText(file.text, file.name || "<workflow>"));
  return findings;
}

export function hasRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No findings.";
  const parts = [];
  for (const kind of [CRON_INVALID, CRON_TOO_FREQUENT, CRON_TOP_OF_HOUR]) {
    const n = findings.filter((f) => f.type === kind).length;
    if (n) parts.push(`${n} ${kind} finding${n === 1 ? "" : "s"}`);
  }
  return `${parts.join(", ")}.`;
}
