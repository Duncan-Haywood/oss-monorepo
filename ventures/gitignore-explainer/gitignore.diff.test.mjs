// Differential test: random .gitignore files and random trees, resolved by
// this engine and by `git check-ignore --no-index -v -n`. Every path's
// deciding rule (file and line, or none) must agree. Skipped when git is
// not installed. GITIGNORE_DIFF_TRIALS raises the number of random repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { analyze, compile, resolver, wildmatch } from "./gitignore.mjs";

let hasGit = true;
try { execFileSync("git", ["--version"], { stdio: "ignore" }); } catch { hasGit = false; }

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["a", "b", "ab", "ba", "a.c", "b.c", "x"];
const SEGMENTS = ["a", "b", "ab", "*", "?", "a*", "*b", "*.c", "[ab]", "[!a]", "[^b]", "[a-b]*", "**", "***", "a**", "**b", "*a*", "\\a", "\\*", "[[:alpha:]]", "[[:digit:]]", "[]a]", "[a-]", "?.c", "b?", "a.c", "[ab", "*\\"];

function makeRepo(r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const files = new Set();
  const nFiles = 4 + Math.floor(r() * 10);
  for (let i = 0; i < nFiles; i++) {
    const depth = Math.floor(r() * 4);
    const parts = [];
    for (let d = 0; d < depth; d++) parts.push(pick(NAMES));
    parts.push(pick(NAMES));
    const p = parts.join("/");
    // a path may not be both a file and a directory
    if ([...files].some((f) => f === p || f.startsWith(p + "/") || p.startsWith(f + "/"))) continue;
    files.add(p);
  }
  const dirs = new Set();
  for (const f of files) { let d = dirname(f); while (d !== ".") { dirs.add(d); d = dirname(d); } }
  const ignoreDirs = ["", ...[...dirs].filter(() => r() < 0.3)];
  const sources = {};
  for (const d of ignoreDirs) {
    const n = 1 + Math.floor(r() * 5);
    const lines = [];
    for (let i = 0; i < n; i++) {
      const segs = [];
      const k = 1 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) segs.push(pick(SEGMENTS));
      let pat = segs.join("/");
      if (r() < 0.25) pat = "/" + pat;
      if (r() < 0.25) pat += "/";
      if (r() < 0.3) pat = "!" + pat;
      if (r() < 0.05) pat += "  ";
      lines.push(pat);
    }
    sources[d ? `${d}/.gitignore` : ".gitignore"] = lines.join("\n") + "\n";
  }
  if (r() < 0.3) sources[".git/info/exclude"] = pick(SEGMENTS) + "\n" + (r() < 0.5 ? "!" : "") + pick(SEGMENTS) + "\n";
  return { files: [...files], dirs: [...dirs], sources };
}

function gitAnswers(repo) {
  const root = mkdtempSync(join(tmpdir(), "gi-diff-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    for (const f of repo.files) { mkdirSync(join(root, dirname(f)), { recursive: true }); writeFileSync(join(root, f), ""); }
    for (const [p, text] of Object.entries(repo.sources)) { mkdirSync(join(root, dirname(p)), { recursive: true }); writeFileSync(join(root, p), text); }
    const query = [...repo.files, ...repo.dirs];
    let out;
    try {
      out = execFileSync("git", ["-c", "core.excludesFile=/dev/null", "check-ignore", "--no-index", "-v", "-n", "--stdin"], {
        cwd: root, input: query.join("\n") + "\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      // exit 1 means "nothing ignored"; the -n listing is still on stdout
      if (e.status !== 1) throw e;
      out = e.stdout;
    }
    const ans = new Map();
    for (const line of out.split("\n")) {
      if (!line) continue;
      const tab = line.indexOf("\t");
      const head = line.slice(0, tab), path = line.slice(tab + 1);
      if (head === "::") { ans.set(path, null); continue; }
      const m = head.match(/^(.*?):(\d+):/);
      ans.set(path, `${m[1]}:${m[2]}`);
    }
    return ans;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("wildmatch basics", () => {
  assert.ok(wildmatch("*.c", "a.c"));
  assert.ok(!wildmatch("*.c", "x/a.c"));
  assert.ok(wildmatch("**/a", "x/y/a"));
  assert.ok(wildmatch("**/a", "a"));
  assert.ok(wildmatch("x/**/a", "x/a"));
  assert.ok(wildmatch("x/**", "x/y/z"));
  assert.ok(!wildmatch("x/**", "x"));
  assert.ok(!wildmatch("x**/a", "xy/z/a"));
  assert.ok(wildmatch("[!a]b", "cb"));
  assert.ok(wildmatch("[[:digit:]]x", "7x"));
  assert.ok(!wildmatch("[ab", "a"));
});

test("matches git check-ignore on random repositories", { skip: !hasGit && "git not installed" }, (t) => {
  const trials = Number(process.env.GITIGNORE_DIFF_TRIALS || 150);
  const r = rng(20261111);
  let compared = 0;
  for (let t = 0; t < trials; t++) {
    const repo = makeRepo(r);
    const git = gitAnswers(repo);
    const bundle = Object.entries(repo.sources).map(([p, text]) => `==> ${p} <==\n${text}`).join("\n");
    const explain = resolver(compile(bundle));
    for (const [path, isDir] of [...repo.files.map((f) => [f, false]), ...repo.dirs.map((d) => [d, true])]) {
      const x = explain(path, isDir);
      const mine = x.rule ? `${x.rule.source}:${x.rule.line}` : null;
      assert.equal(mine, git.get(path), `trial ${t}, ${path}${isDir ? "/" : ""}\n${bundle}`);
      compared++;
    }
  }
  t.diagnostic(`${trials} random repositories, ${compared} paths, all agree with git`);
  assert.ok(compared > trials * 4);
});

test("every suggested fix does in git what the report says it does", { skip: !hasGit && "git not installed" }, (t) => {
  const trials = Number(process.env.GITIGNORE_DIFF_TRIALS || 150) * 2;
  const r = rng(424242);
  let fixes = 0, complete = 0, clean = 0;
  for (let i = 0; i < trials; i++) {
    const repo = makeRepo(r);
    const bundle = Object.entries(repo.sources).map(([p, text]) => `==> ${p} <==\n${text}`).join("\n");
    const res = analyze({ sources: bundle, paths: repo.files.join("\n"), tracked: "" });
    if (!res.fix) continue;
    fixes++;
    if (!res.fix.unfixed.length) complete++;
    if (!res.fix.sideEffects.length) clean++;
    const patched = { ...repo.sources };
    for (const p of res.fix.patches) patched[p.file] = patched[p.file] + "\n" + p.lines.join("\n") + "\n";
    const before = gitAnswers(repo), after = gitAnswers({ ...repo, sources: patched });
    const ignoredIn = (ans, path) => {
      const hit = ans.get(path);
      if (!hit) return false;
      const [src, line] = [hit.slice(0, hit.lastIndexOf(":")), Number(hit.slice(hit.lastIndexOf(":") + 1))];
      const text = (src in patched ? patched[src] : repo.sources[src]).split("\n")[line - 1];
      return !text.startsWith("!");
    };
    for (const p of res.fix.fixed) assert.equal(ignoredIn(after, p), false, `fix did not re-include ${p}\n${bundle}\n${JSON.stringify(res.fix)}`);
    for (const p of res.fix.unfixed) assert.equal(ignoredIn(after, p), true, p);
    const claimed = new Set(res.fix.sideEffects.map((x) => x.path));
    const targets = new Set([...res.fix.fixed, ...res.fix.unfixed]);  // fixed includes paths inside re-opened folders
    for (const f of repo.files) {
      if (targets.has(f)) continue;
      const changed = ignoredIn(before, f) !== ignoredIn(after, f);
      assert.equal(changed, claimed.has(f), `side effect on ${f} misreported\n${bundle}\n${JSON.stringify(res.fix)}`);
    }
  }
  t.diagnostic(`${fixes} suggested fixes checked in git; ${complete} re-include every blocked path, ${clean} change no other path`);
  assert.ok(fixes > 5);
});
