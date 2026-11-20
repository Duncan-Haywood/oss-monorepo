// The engine over real projects: the most-starred GitHub repositories (search
// API through an authenticated `gh`), each cloned blobless with no checkout
// (`git clone --depth 1 --filter=blob:none --no-checkout`), its file list from
// `git ls-tree` and every .editorconfig in it from `git show`, run through
// analyze().
//
//   node ventures/editorconfig-explainer/eval/wild-sample.mjs [--top 300] [--out sample.json]
//
// Writes the per-repository findings as JSON and prints counts by kind.

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../editorconfig.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TOP = Number(opt("--top", 300));
const OUT = opt("--out", null);

const gh = (args) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));

const repos = [];
for (let page = 1; repos.length < TOP; page++) {
  const r = gh(["-X", "GET", "search/repositories", "-f", "q=stars:>1000", "-f", "sort=stars", "-f", "order=desc", "-f", "per_page=100", "-f", `page=${page}`]);
  for (const it of r.items) repos.push({ name: it.full_name, branch: it.default_branch });
  if (!r.items.length) break;
}
repos.length = Math.min(repos.length, TOP);

const results = [];
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
for (const repo of repos) {
  const dir = mkdtempSync(join(tmpdir(), "ecwild-"));
  try {
    git(["clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", `https://github.com/${repo.name}`, dir]);
    const commit = git(["rev-parse", "HEAD"], dir).trim();
    // "<mode> <type> <sha>\t<path>"; a symlinked .editorconfig (mode 120000) is
    // a blob holding the link target, not the file, so it is left out
    const entries = git(["ls-tree", "-r", "-z", "HEAD"], dir).split("\0").filter(Boolean).map((e) => ({ mode: e.slice(0, 6), path: e.slice(e.indexOf("\t") + 1) }));
    const paths = entries.map((e) => e.path);
    const configs = entries.filter((e) => e.mode !== "120000" && (e.path === ".editorconfig" || e.path.endsWith("/.editorconfig"))).map((e) => e.path);
    if (!configs.includes(".editorconfig")) { results.push({ repo: repo.name, commit, editorconfig: false, nested: configs.length }); continue; }
    const sources = configs.map((p) => `==> ${p} <==\n${git(["show", `HEAD:${p}`], dir)}`).join("\n");
    const report = analyze({ sources, paths: paths.filter((p) => !configs.includes(p)) });
    results.push({ repo: repo.name, commit, editorconfig: true, configs: configs.length, paths: paths.length, findings: report.findings.map((f) => ({ severity: f.severity, kind: f.kind, file: f.file, line: f.line, text: f.text, title: f.title })) });
  } catch (e) {
    results.push({ repo: repo.name, error: String(e.message).split("\n")[0] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const withFile = results.filter((r) => r.editorconfig);
console.log(`${repos.length} repositories, ${withFile.length} with a top-level .editorconfig (${withFile.reduce((n, r) => n + r.configs, 0)} .editorconfig files in them), ${results.filter((r) => r.error).length} not cloned`);
const byKind = new Map();
for (const r of withFile) for (const k of new Set(r.findings.map((f) => f.kind))) byKind.set(k, (byKind.get(k) || []).concat(r.repo));
for (const [k, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(list.length).padStart(4)}  ${k}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ date: new Date().toISOString().slice(0, 10), top: TOP, results }, null, 1));
