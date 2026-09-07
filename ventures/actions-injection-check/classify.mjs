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

export const PWN_REQUEST_CHECKOUT = "pwn-request-checkout";
export const SCRIPT_INJECTION = "script-injection";

export const RISK_CLASSIFICATIONS = new Set([PWN_REQUEST_CHECKOUT, SCRIPT_INJECTION]);

const UNTRUSTED_TRIGGER_RE = /\bpull_request_target\b|\bworkflow_run\b/;

const CHECKOUT_RE = /^(\s*)(?:-\s*)?uses:\s*["']?actions\/checkout@/;
const REF_RE = /^(\s*)ref:\s*(.+?)\s*(?:#.*)?$/;

const RUN_BLOCK_START_RE = /^(\s*)(?:-\s*)?run:\s*[|>][+-]?\s*(?:#.*)?$/;
const RUN_SINGLE_RE = /^(\s*)(?:-\s*)?run:\s*(.+)$/;

// Any github.event.<...> or github.head_ref path, wherever it appears inside
// an expression -- not anchored to "the whole expression is just this path",
// so a path embedded in format(...) or a comparison is still found.
const CONTEXT_PATH_RE = /github\.(?:event\.[A-Za-z0-9_.[\]*]+|head_ref\b)/g;

// Per GitHub's own "Understanding the risk of script injection" guidance: an
// event-context path ending in one of these segments carries
// attacker-supplied content.
const UNTRUSTED_SUFFIXES = new Set([
  "body", "default_branch", "email", "head_ref", "label", "message", "name", "page_name", "ref", "title",
]);

const CHECKOUT_UNTRUSTED_REF_RE =
  /github\.event\.pull_request\.head\.(?:sha|ref|label)|github\.head_ref\b|github\.event\.workflow_run\.head_(?:sha|branch)\b/;

function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function lineIndent(line) {
  return line.match(/^ */)[0].length;
}

/** Every github.event..../github.head_ref path in text whose last segment
 * marks it as attacker-controlled. Returns an array of path strings, in the
 * order they appear. */
export function untrustedContextPaths(text) {
  const found = [];
  for (const match of text.matchAll(CONTEXT_PATH_RE)) {
    const path = match[0];
    if (path === "github.head_ref") {
      found.push(path);
      continue;
    }
    const segments = path.split(".");
    let last = segments[segments.length - 1];
    last = last.replace(/\[.*?\]/g, "").replace(/\*$/, "");
    if (UNTRUSTED_SUFFIXES.has(last)) found.push(path);
  }
  return found;
}

export function hasUntrustedCheckoutRef(value) {
  return CHECKOUT_UNTRUSTED_REF_RE.test(value);
}

function remediationForPath(path) {
  return (
    `Pass ${path} through a step \`env:\` var instead of interpolating it directly, ` +
    `e.g. \`env:\\n  TITLE: \${{ ${path} }}\` and reference "$TITLE" (quoted) inside the script instead.`
  );
}

const CHECKOUT_REMEDIATION =
  "Drop this explicit ref (checkout then uses the safe base-repo default), or move any step that " +
  "builds/tests/executes the fork's code into an unprivileged pull_request workflow and hand off only " +
  "reviewed results via artifacts. Upgrading actions/checkout to v7+ also refuses this pattern by default " +
  "(GitHub, June 2026).";

/** Scan one workflow file's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. */
export function scanText(text, filename = "<workflow>") {
  const findings = [];
  const lines = text.split("\n");
  const triggerIsUntrusted = UNTRUSTED_TRIGGER_RE.test(text);

  let runBlockIndent = null;
  let checkoutStepIndent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    if (checkoutStepIndent !== null) {
      if (line.trim() === "") {
        // blank line inside the step: keep tracking
      } else if (lineIndent(line) <= checkoutStepIndent) {
        checkoutStepIndent = null;
      } else {
        const refMatch = REF_RE.exec(line);
        if (refMatch && triggerIsUntrusted) {
          const refValue = stripQuotes(refMatch[2].trim());
          if (hasUntrustedCheckoutRef(refValue)) {
            findings.push({
              file: filename,
              line: lineno,
              type: PWN_REQUEST_CHECKOUT,
              detail: refValue,
              remediation: CHECKOUT_REMEDIATION,
            });
          }
        }
      }
    }

    if (runBlockIndent !== null) {
      if (line.trim() === "") continue;
      if (lineIndent(line) > runBlockIndent) {
        for (const path of untrustedContextPaths(line)) {
          findings.push({ file: filename, line: lineno, type: SCRIPT_INJECTION, detail: path, remediation: remediationForPath(path) });
        }
        continue;
      }
      runBlockIndent = null;
      // falls through to re-examine this same (now-dedented) line below
    }

    const blockStart = RUN_BLOCK_START_RE.exec(line);
    if (blockStart) {
      runBlockIndent = blockStart[1].length;
      continue;
    }

    const single = RUN_SINGLE_RE.exec(line);
    if (single && !line.trim().startsWith("#")) {
      for (const path of untrustedContextPaths(single[2])) {
        findings.push({ file: filename, line: lineno, type: SCRIPT_INJECTION, detail: path, remediation: remediationForPath(path) });
      }
      continue;
    }

    const checkoutMatch = CHECKOUT_RE.exec(line);
    if (checkoutMatch) {
      checkoutStepIndent = checkoutMatch[1].length;
      continue;
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
  const pwn = findings.filter((f) => f.type === PWN_REQUEST_CHECKOUT).length;
  const injection = findings.filter((f) => f.type === SCRIPT_INJECTION).length;
  const parts = [];
  if (pwn) parts.push(`${pwn} pwn-request checkout finding${pwn === 1 ? "" : "s"}`);
  if (injection) parts.push(`${injection} script-injection finding${injection === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}
