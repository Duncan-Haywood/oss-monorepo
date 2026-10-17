// Browser port of check.py's scanning logic, kept in lock-step so the verdict
// a visitor sees on this page matches the CLI. Plain text in, findings out;
// no network calls and no YAML library. classify.test.mjs pins the port and
// runs a parity test against `python3 check.py`.

export const DEPRECATED_RUNTIME = "deprecated-runtime";
export const AGEING_RUNTIME = "ageing-runtime";
export const SHUT_DOWN_VERSION = "shut-down-version";
export const RISK_CLASSIFICATIONS = new Set([DEPRECATED_RUNTIME, SHUT_DOWN_VERSION]);
export const TABLE_AS_OF = "2026-10";

export const RUNTIMES = {
  checkout: { 1: 12, 2: 12, 3: 16, 4: 20, 5: 24 },
  "setup-node": { 1: 12, 2: 12, 3: 16, 4: 20, 5: 24 },
  "setup-python": { 1: 12, 2: 12, 3: 12, 4: 16, 5: 20, 6: 24 },
  "setup-go": { 1: 12, 2: 12, 3: 12, 4: 16, 5: 20, 6: 24 },
  "setup-java": { 1: 12, 2: 12, 3: 16, 4: 20, 5: 24 },
  "upload-artifact": { 1: 12, 2: 12, 3: 16, 4: 20, 5: 20, 6: 24 },
  "download-artifact": { 1: 12, 2: 12, 3: 16, 4: 20, 5: 20, 6: 24 },
  cache: { 1: 12, 2: 12, 3: 16, 4: 20, 5: 24 },
  "github-script": { 5: 16, 6: 16, 7: 20, 8: 24 },
};
const LATEST = Object.fromEntries(
  Object.entries(RUNTIMES).map(([k, t]) => [k, Math.max(...Object.keys(t).map(Number))]),
);
const SHUT_DOWN = { "upload-artifact": 3, "download-artifact": 3, cache: 2 };

const USES_RE = /^\s*(?:-\s+)?uses:\s*["']?actions\/([A-Za-z0-9_.-]+)(?:\/[^@\s"']*)?@([^\s"'#]+)/;
const MAJOR_RE = /^v?(\d+)(?:\.\d+)*$/;

function finding(file, line, type, name, ref, node, detail, remediation) {
  return { file, line, type, action: `actions/${name}@${ref}`, node, detail, remediation };
}

export function scanText(text, file = "<workflow>") {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trimStart().startsWith("#")) return;
    const m = USES_RE.exec(line);
    if (!m) return;
    const [, name, ref] = m;
    const table = Object.hasOwn(RUNTIMES, name) ? RUNTIMES[name] : null;
    const mm = MAJOR_RE.exec(ref);
    if (!table || !mm) return;
    const major = Number(mm[1]);
    const node = table[major];
    if (node === undefined) return;
    const latest = LATEST[name];
    const fix = `Move to actions/${name}@v${latest} (check its release notes for breaking changes first).`;
    const n = i + 1;
    if (major <= (SHUT_DOWN[name] ?? 0)) {
      out.push(finding(file, n, SHUT_DOWN_VERSION, name, ref, node,
        `actions/${name} v${major} has been shut down by GitHub; jobs using it fail.`, fix));
    } else if (node <= 16) {
      out.push(finding(file, n, DEPRECATED_RUNTIME, name, ref, node,
        `actions/${name} v${major} runs on Node ${node}, which is end of life; GitHub warns on it and forces a newer runtime.`, fix));
    } else if (node === 20 && major < latest) {
      out.push(finding(file, n, AGEING_RUNTIME, name, ref, node,
        `actions/${name} v${major} runs on Node 20; GitHub has announced moving the runner default to Node 24.`, fix));
    }
  });
  return out;
}

export function scanFiles(files) {
  return files.flatMap((f) => scanText(f.text, f.name));
}

export function hasRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));
}

export function summaryLine(findings) {
  if (!findings.length) return "No first-party action on a deprecated or ageing runtime found.";
  const c = (t) => findings.filter((f) => f.type === t).length;
  return `${c(SHUT_DOWN_VERSION)} shut down, ${c(DEPRECATED_RUNTIME)} deprecated runtime, ${c(AGEING_RUNTIME)} ageing runtime.`;
}
