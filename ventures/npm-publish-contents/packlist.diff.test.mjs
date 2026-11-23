// Differential test: seeded random package trees, packed by this engine and by
// the npm-packlist that ships inside the npm on this machine (the module
// `npm pack` itself calls). Skips when npm's bundled modules cannot be found.
//
//   node --test packlist.diff.test.mjs              # 300 seeds
//   DIFF_SEEDS=2000 DIFF_START=10000 node --test packlist.diff.test.mjs
//   NPM_MODULES=/tmp/npm11/node_modules/npm/node_modules node --test packlist.diff.test.mjs
//
// Seeds 1-300 were used while fixing the engine; DIFF_START=100000 is the
// held-out range reported in the README.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { buildTree, packlist } from "./packlist.mjs";

function npmModules() {
  // NPM_MODULES points at another npm's node_modules, e.g. one installed with
  // `npm i npm@11` in a scratch folder: <folder>/node_modules/npm/node_modules.
  if (process.env.NPM_MODULES) return process.env.NPM_MODULES;
  try {
    const npmBin = realpathSync(execFileSync(process.platform === "win32" ? "where" : "which", ["npm"], { encoding: "utf8" }).trim().split("\n")[0]);
    let d = dirname(npmBin);
    for (let i = 0; i < 4; i++, d = dirname(d)) {
      if (existsSync(join(d, "node_modules", "npm-packlist")) && existsSync(join(d, "node_modules", "@npmcli", "arborist"))) return join(d, "node_modules");
    }
  } catch { /* no npm */ }
  return null;
}

// mulberry32
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = ["lib", "src", "dist", "test", "build", "docs", "Lib", "bin", "node_modules", ".github", "a", "b", "sub", "fixtures", ".hidden", "coverage"];
const FILES = ["index.js", "a.js", "b.ts", "README.md", "readme.txt", "LICENSE", "licence", "Copying", "CHANGELOG.md", ".env", ".env.local",
  "x.orig", ".DS_Store", "._foo", "npm-debug.log", ".npmrc", "package-lock.json", "yarn.lock", "key.pem", "data.json", "Index.JS",
  "a.min.js", "a.js.map", "notes.md", "cli.js", "types.d.ts", "readme.md~", "foo.test.js", ".eslintrc", "file-1.txt", "file-2.txt"];
const PATTERNS = ["*.js", "*.ts", "*.md", "lib", "lib/", "/lib", "dist/", "/dist/", "test", "**/test", "test/**", "*.map", ".env", ".env*",
  "build", "docs/**", "!lib/a.js", "!*.md", "!dist", "!dist/index.js", "a/**/x", "*.{js,ts}", "file-[12].txt", "file-?.txt", "sub/",
  "**/fixtures/**", "!**/index.js", "Lib", "/a", "a/b", "!/a/b", "*", "!*.js", "**/*.d.ts", "!README*", "coverage", "/node_modules",
  "src/*", "src/**/*.ts", "\\#hash", " lib ", "#comment", "!.env", "*.orig", "!.npmrc", "!node_modules/**", "bin/", "!bin/cli.js"];
const FILES_ENTRIES = ["lib", "lib/", "dist", "dist/", "index.js", "./index.js", "bin/cli.js", "src/*", "*.js", "lib/**/*.js", "!lib/a.js",
  "!test", "README.md", "types.d.ts", "docs/*.md", "/dist", "missing", "a", "b/", "**/*.ts", ".env"];

function genCase(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const files = new Set(["package.json"]);
  const n = 4 + Math.floor(r() * 18);
  for (let i = 0; i < n; i++) {
    const depth = Math.floor(r() * 3.2);
    const segs = [];
    for (let d = 0; d < depth; d++) segs.push(pick(DIRS));
    segs.push(pick(FILES));
    files.add(segs.join("/"));
  }
  const contents = {};
  const ruleFile = () => {
    const k = 1 + Math.floor(r() * 5);
    const lines = [];
    for (let i = 0; i < k; i++) lines.push(pick(PATTERNS));
    return lines.join("\n") + "\n";
  };
  if (r() < 0.6) contents[".gitignore"] = ruleFile();
  if (r() < 0.45) contents[".npmignore"] = ruleFile();
  // nested ignore files in folders that exist
  const folders = [...new Set([...files].filter((f) => f.includes("/")).map((f) => f.slice(0, f.lastIndexOf("/"))))];
  for (const f of folders) {
    if (r() < 0.15) contents[f + "/.npmignore"] = ruleFile();
    if (r() < 0.15) contents[f + "/.gitignore"] = ruleFile();
  }
  // drop any file whose path runs through a name already used as a file
  const all = [...files, ...Object.keys(contents)];
  const asFile = new Set(all);
  const clean = all.filter((p) => { const s = p.split("/"); for (let i = 1; i < s.length; i++) if (asFile.has(s.slice(0, i).join("/"))) return false; return true; });
  const pkg = { name: "t" + seed, version: "1.0.0" };
  if (r() < 0.5) { const k = 1 + Math.floor(r() * 4); pkg.files = []; for (let i = 0; i < k; i++) pkg.files.push(pick(FILES_ENTRIES)); }
  if (r() < 0.4) pkg.main = pick(["index.js", "./index.js", "lib/index.js", "dist/index.js", "missing.js", "lib/a.js"]);
  if (r() < 0.3) pkg.bin = r() < 0.5 ? pick(["bin/cli.js", "./bin/cli.js", "cli.js"]) : { tool: pick(["bin/cli.js", "./lib/a.js", "dist/index.js"]) };
  if (r() < 0.15) pkg.browser = pick(["a.js", "lib/a.js", "dist/index.js"]);
  return { files: clean, contents, pkg };
}

function writeCase(root, c) {
  for (const f of c.files) {
    const p = join(root, f);
    mkdirSync(dirname(p), { recursive: true });
    if (f === "package.json") writeFileSync(p, JSON.stringify(c.pkg));
    else writeFileSync(p, c.contents[f] ?? "x\n");
  }
}

const mods = npmModules();
const SEEDS = Number(process.env.DIFF_SEEDS || 300);
const START = Number(process.env.DIFF_START || 1);

test("engine agrees with npm-packlist on seeded random packages", { skip: mods ? false : "npm's bundled npm-packlist not found" }, async () => {
  const req = createRequire(join(mods, "noop.js"));
  const Arborist = req("@npmcli/arborist");
  const realPacklist = req("npm-packlist");
  const base = mkdtempSync(join(tmpdir(), "packdiff-"));
  const failures = [];
  try {
    for (let seed = START; seed < START + SEEDS; seed++) {
      const c = genCase(seed);
      const root = join(base, String(seed));
      writeCase(root, c);
      const tree = await new Arborist({ path: root }).loadActual();
      const theirs = (await realPacklist(tree, { path: root })).map((f) => f.replace(/^\.\//, ""));
      const contents = { ...c.contents, "package.json": JSON.stringify(c.pkg) };
      const ours = packlist(buildTree(c.files, contents), c.pkg).files;
      const a = [...ours].sort().join("\n");
      const b = [...theirs].sort().join("\n");
      if (a !== b) {
        failures.push({ seed, onlyOurs: ours.filter((f) => !theirs.includes(f)), onlyNpm: theirs.filter((f) => !ours.includes(f)) });
      }
      rmSync(root, { recursive: true, force: true });
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  if (failures.length) {
    for (const f of failures.slice(0, 8)) {
      const c = genCase(f.seed);
      console.log(JSON.stringify({ ...f, pkg: c.pkg, contents: c.contents, files: c.files }, null, 1));
    }
  }
  console.log(`seeds ${START}..${START + SEEDS - 1}: ${SEEDS - failures.length} of ${SEEDS} agree`);
  assert.equal(failures.length, 0, `${failures.length} of ${SEEDS} seeds disagree`);
});

export { genCase };

// The matcher on its own, against the real minimatch with ignore-walk's
// options, on patterns the tree generator does not reach: classes, braces,
// sequences, escapes, posix classes, globstars in odd places.
const MM_PATTERNS = ["*.js", "**", "a/**", "**/b", "a/**/b", "a/**/**/b", "[abc]*", "[!abc]*", "[a-c].txt", "[[:digit:]]*", "[[:upper:]]x",
  "{a,b}/c", "{1..3}.txt", "x{,y}", "{a,{b,c}}", "file{01..03}", "\\*", "a\\?b", "\\[x]", ".*", "*.*", "??.js", "?", "*/", "/a/", "a/*/",
  "./a", "a/../b", "a//b", "**/.git/**", "readme{,.*[^~$]}", "/readme{,.*[^~$]}", "*.[jt]s", "[]a]", "[a-]", "[z-a]", "a/b/", "**/", "/**/x",
  "{}", "{a}", "a,b", "${a,b}", "[^a]", "[\\]]", "x\\", "*.JS", "LIB", "a*b*c", "***", "*.min.js", ".env*", "!(a)", "@(a|b).js"];
const MM_PATHS = ["a", "b", "c", "a/c", "b/c", "a/b", "a/x/b", "a/x/y/b", "x.js", ".js", "A.JS", "1.txt", "4.txt", "x", "xy", "file02", "*",
  "a?b", "[x]", "x", ".env", ".env.local", "README", "readme.md", "README.md~", "readme.", "/readme.md", "/a", "/a/", "a/", "a/b/", "lib", "LIB/x",
  "ab.js", "abc", "aXbYc", ".git", "x/.git/y", "]", "a-", "-", "abc.min.js", "a/.hidden", "..", ".", "a/..", "z.ts", "q.jsx", "1x", "Ex", "x\\"];

test("compiled rules agree with minimatch on a pattern x path grid", { skip: mods ? false : "npm's bundled minimatch not found" }, async () => {
  const { compileRule } = await import("./packlist.mjs");
  const req = createRequire(join(mods, "noop.js"));
  const { Minimatch } = req("minimatch");
  const opts = { matchBase: true, dot: true, flipNegate: true, nocase: true };
  const bad = [];
  let checked = 0;
  for (const pat of MM_PATTERNS) {
    if (/[!@]\(/.test(pat)) continue; // extglobs: approximate by design
    const mm = new Minimatch(pat, opts);
    const ours = compileRule(pat);
    assert.equal(ours.negate, mm.negate, pat);
    for (const path of MM_PATHS) for (const partial of [false, true]) {
      checked++;
      const a = ours.match(path, partial);
      const b = mm.match(path, partial);
      if (a !== b) bad.push(`${pat} ~ ${path}${partial ? " (partial)" : ""}: ours ${a}, minimatch ${b}`);
    }
  }
  console.log(`minimatch grid: ${checked - bad.length} of ${checked} agree`);
  assert.deepEqual(bad.slice(0, 20), []);
});
