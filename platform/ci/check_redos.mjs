// Sweeps the repository's own product code for regular expressions that can backtrack exponentially (ReDoS),
// using the regex-redos-check venture's static engine. A finding is a suspect; each one either gets fixed or is
// listed in redos_allowlist.json with the reason it is safe (checked by timing, or input it can never see).
//
// Why: a 2026-11-15 sweep (docs/posts/2026-11-15-five-regexes-that-could-hang-our-own-tools.md) found four
// exponential patterns in shipped products, reachable from a pasted sudoers file, a scanned source line, an
// uploaded GPX file and a typed wage rule. Nothing in CI would have caught the next one.
//
// Tests: ventures/regex-redos-check/repo-sweep.test.mjs (kept there so the venture suite runs it).
// Usage: node platform/ci/check_redos.mjs [--root DIR] [--json]
// Exit 1 when an error-level finding is not in the allowlist, or an allowlist entry no longer matches anything.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSource } from "../../ventures/regex-redos-check/engine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const ALLOW = path.join(HERE, "redos_allowlist.json");

const SOURCE = /\.(?:[cm]?js|ts|py)$/;
// Tests, fixtures and bundled third-party code are not product code we own.
const SKIP_FILE = /(?:\.test\.[cm]?js$|(?:^|\/)test_[^/]*\.py$|_test\.py$|\.min\.js$|\.esm\.js$)/;
const SKIP_DIR = new Set(["node_modules", ".git", "tests", "test", "fixtures", "vendor", "dist", "build", "target", "pkg"]);

export function* sourceFiles(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith(".")) stack.push(p); }
      else if (SOURCE.test(e.name) && !SKIP_FILE.test(p)) yield p;
    }
  }
}

export function sweep(root, allow) {
  const used = new Set();
  const fresh = [];
  let files = 0, patterns = 0;
  for (const file of sourceFiles(root)) {
    files += 1;
    const rel = path.relative(REPO, file).split(path.sep).join("/");
    const scan = scanSource(fs.readFileSync(file, "utf8"), rel);
    patterns += scan.patterns.length;
    for (const f of scan.findings) {
      if (f.severity !== "error") continue;
      const key = `${rel}\t${f.pattern}`;
      if (allow.has(key)) { used.add(key); continue; }
      fresh.push({ file: rel, line: f.line, rule: f.rule, pattern: f.pattern, message: f.message });
    }
  }
  const stale = [...allow.keys()].filter((k) => !used.has(k) && k.startsWith(path.relative(REPO, root).split(path.sep).join("/")));
  return { files, patterns, fresh, stale };
}

export function loadAllow(file = ALLOW) {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Map(rows.map((r) => [`${r.file}\t${r.pattern}`, r.reason]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = path.resolve(REPO, args.includes("--root") ? args[args.indexOf("--root") + 1] : "ventures");
  const r = sweep(root, loadAllow());
  if (args.includes("--json")) console.log(JSON.stringify(r, null, 1));
  else {
    for (const f of r.fresh) console.log(`${f.file}:${f.line}  ${f.rule}  /${f.pattern}/\n    ${f.message}`);
    for (const k of r.stale) {
      // Keys are `${file}\t${pattern}`: split on the first tab only, the pattern itself may hold tabs.
      const tab = k.indexOf("\t");
      console.log(`stale allowlist entry (no longer found): ${tab < 0 ? k : `${k.slice(0, tab)}  ${k.slice(tab + 1)}`}`);
    }
    console.log(`${r.files} files, ${r.patterns} regexes: ${r.fresh.length} new error-level ReDoS suspects, ${r.stale.length} stale allowlist entries.`);
  }
  process.exit(r.fresh.length || r.stale.length ? 1 : 0);
}
