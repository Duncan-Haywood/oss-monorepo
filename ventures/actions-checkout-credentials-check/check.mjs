// Browser port of check.py's scanning logic, kept in lock-step so the verdict
// a visitor sees on the page matches the CLI. Plain pasted workflow text in,
// findings out: no YAML library, no network. check.test.mjs pins it against
// the scenarios in test_check.py and against `python3 check.py` itself.

export const WITH_UPLOAD = "checkout-persists-credentials-with-upload";
export const PERSISTS = "checkout-persists-credentials";
export const RISK_CLASSIFICATIONS = new Set([WITH_UPLOAD, PERSISTS]);

const CHECKOUT_RE = /^\s*-?\s*uses:\s*["']?actions\/checkout(?:@\S*)?["']?\s*(?:#.*)?$/;
const EXPORT_RE = /uses:\s*["']?actions\/(?:upload-artifact|cache)(?:\/\w+)?(?:@|\s|["']|$)/;
const PUSH_RE = /\bgit\b[^\n|;&]*\bpush\b/;
const JOBS_RE = /^jobs:\s*(?:#.*)?$/;
const KEY_RE = /^( *)(["']?[A-Za-z0-9_.-]+["']?):\s*(.*?)\s*$/;
const PERSIST_RE = /^\s*-?\s*persist-credentials:\s*["']?(\w+|\$\{\{.*\}\})["']?\s*(?:#.*)?$/;

export const FIX =
  "Add `with: persist-credentials: false` to this checkout. If a later step must " +
  "`git push`, pass the token to that step only (for example via an env var) instead " +
  "of leaving it in .git/config for the whole job.";

const indent = (line) => line.match(/^ */)[0].length;
const skip = (line) => {
  const s = line.trim();
  return s === "" || s.startsWith("#");
};
const isItem = (line) => line.trimStart().startsWith("- ");

function jobBlocks(lines) {
  const start = lines.findIndex((l) => JOBS_RE.test(l));
  if (start < 0) return [];
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!skip(lines[i]) && indent(lines[i]) === 0) break;
    body.push([i + 1, lines[i]]);
  }
  const first = body.find(([, l]) => !skip(l));
  if (!first) return [];
  const jobIndent = indent(first[1]);
  const blocks = [];
  let cur = null;
  for (const [no, line] of body) {
    const m = KEY_RE.exec(line);
    if (!skip(line) && indent(line) === jobIndent && m) {
      cur = { name: m[2].replace(/^["']+|["']+$/g, ""), lines: [] };
      blocks.push(cur);
    } else if (cur) {
      cur.lines.push([no, line]);
    }
  }
  return blocks;
}

function stepSpan(lines, idx) {
  const here = indent(lines[idx][1]);
  let start = idx;
  if (!isItem(lines[idx][1])) {
    for (let j = idx - 1; j >= 0; j--) {
      const l = lines[j][1];
      if (!skip(l) && isItem(l) && indent(l) < here) {
        start = j;
        break;
      }
    }
  }
  const itemIndent = indent(lines[start][1]);
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j][1];
    if (!skip(l) && (indent(l) < itemIndent || (indent(l) === itemIndent && isItem(l)))) {
      end = j;
      break;
    }
  }
  return [start, end];
}

export function scanText(text, filename = "<workflow>") {
  const findings = [];
  for (const block of jobBlocks(text.split(/\r\n|\r|\n/))) {
    const lines = block.lines;
    const exports = lines.some(([, l]) => !skip(l) && EXPORT_RE.test(l));
    const pushes = lines.some(([, l]) => !skip(l) && PUSH_RE.test(l));
    lines.forEach(([no, line], idx) => {
      if (skip(line) || !CHECKOUT_RE.test(line)) return;
      const [start, end] = stepSpan(lines, idx);
      let value = null;
      for (const [, l] of lines.slice(start, end)) {
        const m = PERSIST_RE.exec(l);
        if (m) value = m[1];
      }
      if (value !== null && (value.toLowerCase() === "false" || value.startsWith("${{"))) return;
      let detail = `job '${block.name}': actions/checkout leaves the token in .git/config`;
      if (exports) detail += "; the same job runs actions/upload-artifact or actions/cache";
      if (pushes) detail += "; the job also runs `git push`, so check whether it relies on this credential";
      findings.push({
        file: filename,
        line: no,
        type: exports ? WITH_UPLOAD : PERSISTS,
        detail,
        remediation: FIX,
      });
    });
  }
  return findings;
}

export function scanFiles(files) {
  return files.flatMap((f) => scanText(f.text, f.name));
}

export const hasRisk = (findings) => findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));

export function summaryLine(findings) {
  if (!findings.length) return "No checkout steps leave the token on disk in what you pasted.";
  const up = findings.filter((f) => f.type === WITH_UPLOAD).length;
  return `${findings.length} checkout step(s) leave the token in .git/config; ${up} in a job that also uploads or caches.`;
}
