// Differential test: random .gitattributes files (root, nested,
// .git/info/attributes) over random trees, resolved by this engine and by
// git itself. Two oracles:
//   `git check-attr -a --stdin`  every attribute of every file and folder
//   `git ls-files --eol`         the line-ending request ("attr/" column)
// Both must agree exactly. Skipped when git is not installed.
// GITATTRIBUTES_DIFF_TRIALS raises the number of random repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compile, resolvePath, showValue, attrAction, gitModeFor, splitSources, parsePaths, DEFAULTS } from "./gitattributes.mjs";

let hasGit = true, GIT = "modern", gitVersion = "";
try { gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim(); GIT = gitModeFor(gitVersion); } catch { hasGit = false; }

// git reads no system or global attributes file in these runs
const GIT_ENV = { ...process.env, GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", HOME: tmpdir() };
const GIT_ARGS = ["-c", "core.attributesFile=/dev/null", "-c", "core.quotePath=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false"];

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

const NAMES = ["a", "b", "ab", "a.c", "b.c", "x", "d"];
const SEGMENTS = ["a", "b", "ab", "*", "?", "a*", "*b", "*.c", "[ab]", "[!a]", "[a-b]*", "**", "a**", "**b", "*a*", "\\a", "[[:alpha:]]", "?.c", "a.c", "[ab", "d"];
// attribute names: real ones, macro names, and invalid or reserved ones
// that make git drop the whole line
const ATTRS = ["text", "eol", "crlf", "diff", "merge", "binary", "m1", "m2", "q", "Q.r_s", "builtin_x", "a/b", "-", "x y"];
const VALUES = ["auto", "lf", "crlf", "input", "1", "x=y", "", "CRLF", "true"];

function token(r, pick) {
  const name = pick(ATTRS);
  const k = r();
  if (k < 0.15) return "-" + name;
  if (k < 0.25) return "!" + name;
  if (k < 0.55) return name + "=" + pick(VALUES);
  return name;
}

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
    if ([...files].some((f) => f === p || f.startsWith(p + "/") || p.startsWith(f + "/"))) continue;
    files.add(p);
  }
  const dirs = new Set();
  for (const f of files) { let d = dirname(f); while (d !== ".") { dirs.add(d); d = dirname(d); } }
  const attrDirs = ["", ...[...dirs].filter(() => r() < 0.35)];
  const sources = {};
  const lineFor = () => {
    const k = r();
    const sep = () => (r() < 0.2 ? "\t" : r() < 0.1 ? "  " : " ");
    const tokens = [];
    const n = Math.floor(r() * 4);
    for (let i = 0; i < n; i++) tokens.push(token(r, pick));
    if (k < 0.12) return `[attr]${pick(["m1", "m2", "binary", "q", "bad/name"])}${tokens.map((t) => sep() + t).join("")}`;
    if (k < 0.16) return pick(["# comment", "   # indented comment", "", "\t"]);
    const segs = [];
    const depth = 1 + Math.floor(r() * 3);
    for (let j = 0; j < depth; j++) segs.push(pick(SEGMENTS));
    let pat = segs.join("/");
    if (r() < 0.25) pat = "/" + pat;
    if (r() < 0.2) pat += "/";
    if (r() < 0.06) pat = "!" + pat;
    if (r() < 0.06) pat = `"${pat.replace(/\\/g, "\\\\")}"`;
    const lead = r() < 0.08 ? "  " : "";
    const crlf = r() < 0.08 ? "\r" : "";
    return lead + pat + tokens.map((t) => sep() + t).join("") + crlf;
  };
  for (const d of attrDirs) {
    const n = 1 + Math.floor(r() * 6);
    const lines = [];
    for (let i = 0; i < n; i++) lines.push(lineFor());
    sources[d ? `${d}/.gitattributes` : ".gitattributes"] = lines.join("\n") + "\n";
  }
  if (r() < 0.35) sources[".git/info/attributes"] = [lineFor(), lineFor()].join("\n") + "\n";
  return { files: [...files], dirs: [...dirs], sources };
}

function writeRepo(repo) {
  const root = mkdtempSync(join(tmpdir(), "ga-diff-"));
  execFileSync("git", ["init", "-q", root], { env: GIT_ENV });
  for (const f of repo.files) { mkdirSync(join(root, dirname(f)), { recursive: true }); writeFileSync(join(root, f), "x\n"); }
  for (const [p, text] of Object.entries(repo.sources)) { mkdirSync(join(root, dirname(p)), { recursive: true }); writeFileSync(join(root, p), text); }
  return root;
}

function gitCheckAttr(root, query) {
  // spawnSync keeps git's warnings about the dropped lines out of the log
  const res = spawnSync("git", [...GIT_ARGS, "check-attr", "-a", "--stdin"], {
    cwd: root, input: query.join("\n") + "\n", encoding: "utf8", env: GIT_ENV,
  });
  if (res.status !== 0) throw new Error(`git check-attr failed: ${res.stderr}`);
  const out = res.stdout;
  const ans = new Map(query.map((q) => [q, []]));
  for (const line of out.split("\n")) {
    if (!line) continue;
    // "path: name: value"; names never contain ": "
    const i = line.indexOf(": ");
    const j = line.indexOf(": ", i + 2);
    ans.get(line.slice(0, i)).push(`${line.slice(i + 2, j)}: ${line.slice(j + 2)}`);
  }
  for (const v of ans.values()) v.sort();
  return ans;
}

function gitEolAttr(root) {
  const add = spawnSync("git", [...GIT_ARGS, "add", "-A"], { cwd: root, env: GIT_ENV, encoding: "utf8" });
  if (add.status !== 0) throw new Error(`git add failed: ${add.stderr}`);
  const ls = spawnSync("git", [...GIT_ARGS, "ls-files", "--eol"], { cwd: root, encoding: "utf8", env: GIT_ENV });
  if (ls.status !== 0) throw new Error(`git ls-files failed: ${ls.stderr}`);
  const out = ls.stdout;
  const ans = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const m = line.slice(0, tab).match(/attr\/(.*)$/);
    ans.set(line.slice(tab + 1), m[1].trim());
  }
  return ans;
}

function engineSources(repo) {
  return Object.entries(repo.sources).map(([p, text]) => `==> ${p} <==\n${text}`).join("\n");
}

function oursFor(files, path, isDir) {
  const { attrs } = resolvePath(files, path, isDir);
  return [...attrs].filter(([, d]) => d.value !== null).map(([n, d]) => `${n}: ${showValue(d.value)}`).sort();
}

const TRIALS = Number(process.env.GITATTRIBUTES_DIFF_TRIALS || 160);

test(`engine agrees with git check-attr and ls-files --eol on ${TRIALS} random repositories (${gitVersion || "git missing"})`, { skip: !hasGit && "git not installed" }, () => {
  let compared = 0, eolCompared = 0;
  for (let seed = 1; seed <= TRIALS; seed++) {
    const repo = makeRepo(rng(seed));
    const root = writeRepo(repo);
    try {
      const files = compile(engineSources(repo), { git: GIT });
      const query = [...repo.files, ...repo.dirs.map((d) => d + "/")];
      const git = gitCheckAttr(root, query);
      for (const q of query) {
        const isDir = q.endsWith("/");
        const ours = oursFor(files, isDir ? q.slice(0, -1) : q, isDir);
        assert.deepEqual(ours, git.get(q), `seed ${seed}, path ${q}\n${engineSources(repo)}`);
        compared++;
      }
      const eol = gitEolAttr(root);
      for (const f of repo.files) {
        const { attrs } = resolvePath(files, f, false);
        const ours = attrAction((n) => attrs.get(n)?.value).label;
        assert.equal(ours, eol.get(f), `eol, seed ${seed}, path ${f}\n${engineSources(repo)}`);
        eolCompared++;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  assert.ok(compared > TRIALS * 5, `compared ${compared} paths`);
  assert.ok(eolCompared > TRIALS * 3, `compared ${eolCompared} eol answers`);
});

test("the page's example resolves the same in git", { skip: !hasGit && "git not installed" }, () => {
  const sources = {};
  for (const f of splitSources(DEFAULTS.sources)) sources[f.path] = f.lines.join("\n") + "\n";
  const paths = parsePaths(DEFAULTS.paths);
  const repo = { files: paths.filter((p) => !p.isDir).map((p) => p.path), dirs: [], sources };
  const root = writeRepo(repo);
  try {
    const files = compile(DEFAULTS.sources, { git: GIT });
    const query = paths.map((p) => p.path + (p.isDir ? "/" : ""));
    const git = gitCheckAttr(root, query);
    for (const p of paths) assert.deepEqual(oursFor(files, p.path, p.isDir), git.get(p.path + (p.isDir ? "/" : "")), p.path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
