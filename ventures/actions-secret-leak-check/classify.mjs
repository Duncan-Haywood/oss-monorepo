// Browser port of check.py's scanning logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted workflow YAML text -- nothing here calls any network API, and
// nothing here parses YAML with a library: it uses the same small
// step-scoped line scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same scenarios test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const TRANSFORMED_SECRET = "transformed-secret";
export const UNMASKED_ENV_EXPORT = "unmasked-env-export";

export const RISK_CLASSIFICATIONS = new Set([TRANSFORMED_SECRET, UNMASKED_ENV_EXPORT]);

const STEP_ITEM_RE = /^(\s*)-\s/;
const STEP_START_KEY_RE = /^(?:name|id|uses|run|env|if|with|shell)\s*:/;
const ENV_HEADER_RE = /^(\s*)(?:-\s*)?env:\s*(?:#.*)?$/;
const ENV_ENTRY_RE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/;

const RUN_BLOCK_START_RE = /^(\s*)(?:-\s*)?run:\s*[|>][+-]?\s*(?:#.*)?$/;
const RUN_SINGLE_RE = /^(\s*)(?:-\s*)?run:\s*(.+)$/;

const INLINE_SECRET_RE = /\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/;

const TRANSFORM_RE =
  /\bbase64\b|\bopenssl\s+(?:base64|enc)\b|\bxxd\b|\bbasenc\b|\biconv\b|\btr\b|\brev\b|\$\{[A-Za-z_][A-Za-z0-9_]*:[0-9]/;

const ENV_FILE_TARGET_RE = />>\s*"?\$\{?(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_STATE)\}?"?/;

const ADD_MASK_RE = /::add-mask::/;

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

/** Split a workflow file's lines into per-step [start, end) ranges (0-based,
 * half-open), mirroring check.py's _collect_steps. */
export function collectSteps(lines) {
  const steps = [];
  let currentStart = null;
  let currentIndent = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const indent = lineIndent(line);
    const item = STEP_ITEM_RE.exec(line);
    if (currentStart !== null) {
      if (item && indent === currentIndent) {
        steps.push([currentStart, i]);
        currentStart = i;
      } else if (indent < currentIndent) {
        steps.push([currentStart, i]);
        currentStart = null;
        currentIndent = null;
      }
    }
    if (currentStart === null && item) {
      const rest = line.slice(item[0].length);
      if (STEP_START_KEY_RE.test(rest)) {
        currentStart = i;
        currentIndent = indent;
      }
    }
  }
  if (currentStart !== null) steps.push([currentStart, lines.length]);
  return steps;
}

/** Env var names this step's own env: block sources from secrets.*. */
export function stepSecretEnvVars(lines, start, end) {
  const names = new Set();
  // null: not in an env: block. "learning": just saw the header, indent of
  // the first entry line below it sets the block's indent. A number: the
  // established indent of entries in the current env: block.
  let envIndent = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const indent = lineIndent(line);

    if (envIndent === "learning") {
      envIndent = indent;
    } else if (envIndent !== null && indent < envIndent) {
      envIndent = null;
    }

    if (envIndent !== null && envIndent !== "learning") {
      const entry = ENV_ENTRY_RE.exec(line);
      if (entry && entry[3].includes("secrets.")) names.add(entry[2]);
      continue;
    }

    if (ENV_HEADER_RE.test(line)) envIndent = "learning";
  }
  return names;
}

/** [{ lineno0, text }] for this step's run: block, or []. */
export function runBlockLines(lines, start, end) {
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const block = RUN_BLOCK_START_RE.exec(line);
    if (block) {
      const blockIndent = block[1].length;
      const body = [];
      let j = i + 1;
      while (j < end) {
        if (lines[j].trim() === "") {
          body.push({ lineno0: j, text: lines[j] });
          j++;
          continue;
        }
        if (lineIndent(lines[j]) <= blockIndent) break;
        body.push({ lineno0: j, text: lines[j] });
        j++;
      }
      return body;
    }
    const single = RUN_SINGLE_RE.exec(line);
    if (single) return [{ lineno0: i, text: line }];
  }
  return [];
}

function referencesSecret(line, secretEnvNames) {
  if (INLINE_SECRET_RE.test(line)) return true;
  for (const name of secretEnvNames) {
    const re = new RegExp(`\\$\\{?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}?\\b`);
    if (re.test(line)) return true;
  }
  return false;
}

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");

  for (const [start, end] of collectSteps(lines)) {
    const secretEnvNames = stepSecretEnvVars(lines, start, end);
    const runLines = runBlockLines(lines, start, end);
    if (!runLines.length) continue;
    const runText = runLines.map((l) => l.text).join("\n");
    const hasMask = ADD_MASK_RE.test(runText);

    for (const { lineno0, text: line } of runLines) {
      if (line.trim().startsWith("#")) continue;
      if (!referencesSecret(line, secretEnvNames)) continue;

      if (TRANSFORM_RE.test(line)) {
        findings.push({
          file: filename,
          line: lineno0 + 1,
          type: TRANSFORMED_SECRET,
          detail: line.trim(),
          remediation:
            "GitHub's log masking matches the secret's exact string only -- transforming it " +
            "(base64/hex/case/substring) produces a different string that prints unmasked. Avoid " +
            "re-encoding a secret in a step whose output is logged, or explicitly `::add-mask::` the " +
            "transformed value before it can be printed.",
        });
      }
      const target = ENV_FILE_TARGET_RE.exec(line);
      if (target && !hasMask) {
        findings.push({
          file: filename,
          line: lineno0 + 1,
          type: UNMASKED_ENV_EXPORT,
          detail: `${line.trim()}  (${target[1]})`,
          remediation:
            `Writing to $${target[1]} does not register the value with the runner's masking list ` +
            "-- only a declared secrets.* value is auto-masked. Add `echo \"::add-mask::$VALUE\"` " +
            "before this line so later steps that print it don't leak it in plain text.",
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
  const transformed = findings.filter((f) => f.type === TRANSFORMED_SECRET).length;
  const exported = findings.filter((f) => f.type === UNMASKED_ENV_EXPORT).length;
  const parts = [];
  if (transformed) parts.push(`${transformed} transformed-secret finding${transformed === 1 ? "" : "s"}`);
  if (exported) parts.push(`${exported} unmasked-env-export finding${exported === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
