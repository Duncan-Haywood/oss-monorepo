// Browser port of check.py's scanning logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text and a plain pasted required-checks list --
// nothing here calls any network API, and nothing here parses YAML with a
// library: it uses the same small line/indentation scan check.py does, on
// purpose, so the two never disagree about what a line means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const CURRENT = "current";
export const STALE = "stale";
export const NO_PR_TRIGGER = "current-but-no-pr-trigger";
export const UNVERIFIABLE = "unverifiable-dynamic-matrix";

const PR_TRIGGERS = new Set(["pull_request", "pull_request_target"]);

const JOB_HEADER_RE = /^(\s*)([A-Za-z0-9_.-]+):\s*(?:#.*)?$/;
const NAME_RE = /^\s*name:\s*(.+?)\s*(?:#.*)?$/;
const STRATEGY_RE = /^\s*strategy:\s*(?:#.*)?$/;
const MATRIX_LINE_RE = /^\s*matrix:\s*(.*?)\s*(?:#.*)?$/;
const KEYVAL_RE = /^\s*([A-Za-z0-9_.-]+):\s*(.*?)\s*(?:#.*)?$/;
const LIST_ITEM_RE = /^\s*-\s*(.+?)\s*(?:#.*)?$/;
const ON_LINE_RE = /^on:\s*(.*?)\s*(?:#.*)?$/;
const USES_WORKFLOW_RE = /^\s*uses:\s*\S+\.ya?ml/;

function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function indentOf(line) {
  return line.length - line.replace(/^ +/, "").length;
}

function isContent(line) {
  const stripped = line.trim();
  return stripped.length > 0 && !stripped.startsWith("#");
}

function findTopLevelBlock(lines, key) {
  let start = null;
  const soloRe = new RegExp(`^${key}:\\s*(?:#.*)?$`);
  const inlineRe = new RegExp(`^${key}:\\s*\\S`);
  for (let i = 0; i < lines.length; i++) {
    if (soloRe.test(lines[i])) {
      start = i + 1;
      break;
    }
    if (key !== "on" && inlineRe.test(lines[i])) return null;
  }
  if (start === null) return null;
  let end = lines.length;
  for (let j = start; j < lines.length; j++) {
    if (isContent(lines[j]) && indentOf(lines[j]) === 0) {
      end = j;
      break;
    }
  }
  return [start, end];
}

/** Best-effort set of top-level `on:` event names. */
export function parseTriggers(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = ON_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const val = m[1].trim();
    if (val) {
      if (val.startsWith("[")) {
        const inner = val.slice(1, val.lastIndexOf("]") === -1 ? undefined : val.lastIndexOf("]"));
        return new Set(
          inner
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .map(stripQuotes),
        );
      }
      return new Set([stripQuotes(val)]);
    }
    const triggers = new Set();
    let childIndent = null;
    for (let k = i + 1; k < lines.length; k++) {
      const line2 = lines[k];
      if (!isContent(line2)) continue;
      const indent2 = indentOf(line2);
      if (indent2 === 0) break;
      if (childIndent === null) childIndent = indent2;
      if (indent2 !== childIndent) continue;
      const listM = LIST_ITEM_RE.exec(line2);
      if (listM) {
        triggers.add(stripQuotes(listM[1]));
        continue;
      }
      const kvM = KEYVAL_RE.exec(line2);
      if (kvM) triggers.add(kvM[1]);
    }
    return triggers;
  }
  return new Set();
}

function cartesianSuffixes(axes) {
  if (!axes.length) return [];
  const valueLists = axes.map(([, values]) => values).filter((v) => v.length);
  if (valueLists.length !== axes.length) return [];
  let combos = [[]];
  for (const values of valueLists) {
    const next = [];
    for (const combo of combos) {
      for (const v of values) next.push([...combo, v]);
    }
    combos = next;
  }
  return combos.map((combo) => combo.join(", "));
}

function parseMatrixBlock(lines, start, end, fieldIndent) {
  const axes = [];
  let dynamic = false;
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (!isContent(line)) {
      i++;
      continue;
    }
    const indent = indentOf(line);
    if (indent <= fieldIndent) break;
    const kv = KEYVAL_RE.exec(line);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const val = kv[2].trim();
    if (key === "include" || key === "exclude") {
      dynamic = true;
      i++;
      continue;
    }
    if (val.includes("${{")) {
      dynamic = true;
      i++;
      continue;
    }
    if (val.startsWith("[")) {
      const closeIdx = val.lastIndexOf("]");
      const inner = closeIdx === -1 ? val.slice(1) : val.slice(1, closeIdx);
      const values = inner
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map(stripQuotes);
      axes.push([key, values]);
      i++;
      continue;
    }
    if (val) {
      axes.push([key, [stripQuotes(val)]]);
      i++;
      continue;
    }
    const values = [];
    const keyIndent = indent;
    let j = i + 1;
    while (j < end) {
      const l2 = lines[j];
      if (!isContent(l2)) {
        j++;
        continue;
      }
      if (indentOf(l2) <= keyIndent) break;
      const item = LIST_ITEM_RE.exec(l2);
      if (item) {
        if (item[1].includes("${{")) dynamic = true;
        values.push(stripQuotes(item[1]));
      }
      j++;
    }
    axes.push([key, values]);
    i = j;
  }
  return { axes, dynamic };
}

function parseJob(lines, segStart, segEnd) {
  let fieldIndent = null;
  for (let i = segStart; i < segEnd; i++) {
    if (isContent(lines[i])) {
      fieldIndent = indentOf(lines[i]);
      break;
    }
  }
  const result = { name: null, matrixAxes: [], dynamicMatrix: false, reusable: false };
  if (fieldIndent === null) return result;

  let i = segStart;
  while (i < segEnd) {
    const line = lines[i];
    if (!isContent(line)) {
      i++;
      continue;
    }
    const indent = indentOf(line);
    if (indent !== fieldIndent) {
      i++;
      continue;
    }
    if (USES_WORKFLOW_RE.test(line)) {
      result.reusable = true;
      i++;
      continue;
    }
    const nameM = NAME_RE.exec(line);
    if (nameM && line.trim().startsWith("name:")) {
      result.name = stripQuotes(nameM[1]);
      i++;
      continue;
    }
    if (STRATEGY_RE.test(line.trim())) {
      let stratFieldIndent = null;
      let j = i + 1;
      while (j < segEnd && !isContent(lines[j])) j++;
      if (j < segEnd && indentOf(lines[j]) > indent) stratFieldIndent = indentOf(lines[j]);
      let k = i + 1;
      while (k < segEnd) {
        const l2 = lines[k];
        if (!isContent(l2)) {
          k++;
          continue;
        }
        if (indentOf(l2) <= indent) break;
        if (stratFieldIndent !== null && indentOf(l2) === stratFieldIndent) {
          const matrixM = MATRIX_LINE_RE.exec(l2.trim());
          if (matrixM) {
            const inlineVal = matrixM[1].trim();
            if (inlineVal) {
              result.matrixAxes = [];
              result.dynamicMatrix = true;
              k++;
              continue;
            }
            let mStart = k + 1;
            let mEnd = k + 1;
            while (mEnd < segEnd) {
              const l3 = lines[mEnd];
              if (isContent(l3) && indentOf(l3) <= stratFieldIndent) break;
              mEnd++;
            }
            const { axes, dynamic } = parseMatrixBlock(lines, mStart, mEnd, stratFieldIndent);
            result.matrixAxes = axes;
            result.dynamicMatrix = dynamic;
            k = mEnd;
            continue;
          }
        }
        k++;
      }
      i = k;
      continue;
    }
    i++;
  }
  return result;
}

/** Scan one workflow file's text. Returns a list of job-report objects. */
export function scanText(text, filename = "<workflow>") {
  const lines = text.split("\n");
  const triggers = parseTriggers(text);
  const runsOnPr = triggers.size ? [...triggers].some((t) => PR_TRIGGERS.has(t)) : null;

  const block = findTopLevelBlock(lines, "jobs");
  if (!block) return [];
  const [start, end] = block;

  let jobIndent = null;
  for (let i = start; i < end; i++) {
    if (isContent(lines[i])) {
      jobIndent = indentOf(lines[i]);
      break;
    }
  }
  if (jobIndent === null) return [];

  const reports = [];
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (isContent(line) && indentOf(line) === jobIndent) {
      const header = JOB_HEADER_RE.exec(line);
      if (header) {
        const jobId = header[2];
        const segStart = i + 1;
        let j = segStart;
        while (j < end) {
          if (isContent(lines[j]) && indentOf(lines[j]) <= jobIndent) break;
          j++;
        }
        const parsed = parseJob(lines, segStart, j);
        const baseName = parsed.name || jobId;
        let checkNames;
        if (parsed.reusable) {
          checkNames = null;
        } else if (parsed.dynamicMatrix) {
          checkNames = null;
        } else if (parsed.matrixAxes.length) {
          const suffixes = cartesianSuffixes(parsed.matrixAxes);
          checkNames = suffixes.length ? suffixes.map((s) => `${baseName} (${s})`) : null;
        } else {
          checkNames = [baseName];
        }
        reports.push({
          file: filename,
          jobId,
          baseName,
          checkNames,
          dynamic: checkNames === null && !parsed.reusable,
          reusable: parsed.reusable,
          runsOnPr,
        });
        i = j;
        continue;
      }
    }
    i++;
  }
  return reports;
}

export function scanFiles(files) {
  const reports = [];
  for (const f of files) reports.push(...scanText(f.text, f.name || "<workflow>"));
  return reports;
}

/** Accepts the JSON shape of GitHub's branch-protection API, a bare JSON
 * list, or plain text (one name per line, optional leading "- " bullet). */
export function parseRequiredChecks(text) {
  const stripped = text.trim();
  if (stripped) {
    let parsed;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (Array.isArray(parsed)) return parsed.map(String).filter((v) => v.trim());
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.contexts)) return parsed.contexts.map(String).filter((v) => v.trim());
        if (parsed.required_status_checks && Array.isArray(parsed.required_status_checks.contexts)) {
          return parsed.required_status_checks.contexts.map(String).filter((v) => v.trim());
        }
        if (Array.isArray(parsed.checks)) {
          return parsed.checks
            .filter((c) => c && String(c.context || "").trim())
            .map((c) => String(c.context));
        }
      }
    }
  }
  const names = [];
  for (const rawLine of text.split("\n")) {
    let candidate = rawLine.trim();
    if (candidate.startsWith("- ")) candidate = candidate.slice(2).trim();
    if (candidate) names.push(candidate);
  }
  return names;
}

/** Compare required check names against scanned job reports. Returns a list
 * of {name, status, note}. */
export function compare(requiredNames, reports) {
  const allCurrent = new Set();
  const noPrNames = new Set();
  const unverifiableBases = [];

  for (const r of reports) {
    if (r.reusable) {
      unverifiableBases.push([
        r.baseName,
        'this job calls a reusable workflow (`uses: <file>.yml`), whose check-run naming convention (typically "<caller job> / <called job>") this tool does not compute -- this tool cannot confirm whether the name still exists.',
      ]);
      continue;
    }
    if (r.dynamic) {
      unverifiableBases.push([
        r.baseName,
        "a job with this base name has a dynamic or include/exclude matrix that cannot be enumerated statically -- this tool cannot confirm whether the name still exists.",
      ]);
      continue;
    }
    for (const name of r.checkNames || []) {
      if (r.runsOnPr === false) noPrNames.add(name);
      else allCurrent.add(name);
    }
  }

  function unverifiableMatch(name) {
    for (const [base, note] of unverifiableBases) {
      if (name === base || name.startsWith(`${base} (`) || name.startsWith(`${base} / `)) return note;
    }
    return null;
  }

  return requiredNames.map((name) => {
    if (allCurrent.has(name)) return { name, status: CURRENT, note: null };
    if (noPrNames.has(name)) {
      return {
        name,
        status: NO_PR_TRIGGER,
        note: "the job exists with this exact name, but its workflow does not trigger on pull_request (or pull_request_target) -- it can never post this status to a pull request either.",
      };
    }
    const note = unverifiableMatch(name);
    if (note !== null) return { name, status: UNVERIFIABLE, note };
    return {
      name,
      status: STALE,
      note:
        'no job in the scanned workflow(s) currently reports a status under this exact name. GitHub will never satisfy this required check again -- every new pull request will sit at "Expected — Waiting for status to be reported" forever until it is removed from branch protection or a job is renamed/added to match.',
    };
  });
}

export function hasStale(results) {
  return results.some((r) => r.status === STALE);
}

/** One-line headline for the page. */
export function summaryLine(results) {
  if (!results.length) return "No required check names to compare.";
  const stale = results.filter((r) => r.status === STALE).length;
  const noPr = results.filter((r) => r.status === NO_PR_TRIGGER).length;
  const unverifiable = results.filter((r) => r.status === UNVERIFIABLE).length;
  const current = results.filter((r) => r.status === CURRENT).length;
  if (stale || noPr) {
    return `${stale + noPr} of ${results.length} required check(s) can never be satisfied by a new pull request.`;
  }
  if (unverifiable) {
    return `${current} current, ${unverifiable} unverifiable (dynamic matrix or reusable workflow) — nothing confirmed stale.`;
  }
  return `All ${results.length} required check(s) match a job that would report on a pull request today.`;
}
