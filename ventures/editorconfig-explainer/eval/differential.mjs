// Differential check: random .editorconfig trees and paths, resolved by this
// engine and by two shipping cores, editorconfig-core-py (PyPI `editorconfig`)
// and the npm `editorconfig` package. Neither is a dependency; install them
// somewhere and point at them:
//
//   python3 -m venv /tmp/ecpy && /tmp/ecpy/bin/pip install editorconfig==0.17.1
//   mkdir /tmp/ecjs && (cd /tmp/ecjs && npm i editorconfig@4.0.1)
//   node ventures/editorconfig-explainer/eval/differential.mjs --py /tmp/ecpy/bin/python --npm /tmp/ecjs [--trees 300] [--seed 1]
//
// Prints agreement per core and the disagreements grouped by the feature of
// the section name or value that caused them, with one example each.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { parseFile, resolvePath, sectionMatches, hasSlash, legacyValue } from "../editorconfig.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PY = opt("--py");
const NPM = opt("--npm");
const TREES = Number(opt("--trees", 300));
let seed = Number(opt("--seed", 1));
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const npm = NPM ? createRequire(join(NPM, "package.json"))("editorconfig") : null;

const DIRS = ["", "src", "src/lib", "docs", "a", "a/b", "{x}"];
const NAMES = ["a.c", "b.js", "x.md", "Makefile", "1", "12", "060", "-3", "ab.py", "a,b.txt", ".env", "README.md", "{single}.b", "test.min.js"];
const GLOBS = ["*", "**", "*.c", "*.{c,js}", "*.{md}", "{a,b}.c", "{1..20}", "{-5..5}", "{20..1}", "[ab]*", "[!a]*", "[a-c].*", "?.c", "**.js", "src/*", "src/**", "/src/*.js", "**/lib/*", "a/**/b.js", "*.min.js", "Makefile", "{single}.b", "{a\\,b,c}.txt", "src/", ".*", "*.[ch]", "{src,docs}/**", "**/*.md", "{,a}b.js", "[[]x", "*.{py,{js,c}}"];
const KEYS = ["indent_style", "indent_size", "tab_width", "end_of_line", "charset", "k1", "k2", "Key3"];
const VALUES = ["tab", "space", "2", "4", "Tab", "LF", "crlf", "utf-8", "UTF-8", "unset", "v", "x y", "4 # four", "v;w", "v ; c", ""];

// Random section names built from atoms, to reach combinations the fixed
// list above does not.
const ATOMS = ["*", "**", "?", "a", "b", "c", ".", "/", "src", "lib", "[ab]", "[!a]", "[a-c]", "{a,b}", "{c,{a,b}}", "{1..20}", "{,x}", "\\*", "-", ",", "1", "2", "{x}", "js", "md"];
function composeGlob() {
  let g = "";
  const n = 1 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) g += pick(ATOMS);
  return g;
}

function makeTree() {
  const files = [];
  const nfiles = 1 + Math.floor(rnd() * 3);
  const used = new Set();
  for (let i = 0; i < nfiles; i++) {
    const dir = i === 0 ? "" : pick(DIRS.slice(1));
    if (used.has(dir)) continue;
    used.add(dir);
    let text = rnd() < 0.6 || dir ? (rnd() < 0.5 ? "root = true\n" : "") : "root = true\n";
    if (rnd() < 0.1) text = "root = TRUE\n";
    const nsec = 1 + Math.floor(rnd() * 4);
    for (let s = 0; s < nsec; s++) {
      text += `[${rnd() < 0.5 ? pick(GLOBS) : composeGlob()}]\n`;
      const np = 1 + Math.floor(rnd() * 3);
      for (let p = 0; p < np; p++) text += `${pick(KEYS)} = ${pick(VALUES)}\n`;
    }
    files.push({ file: (dir ? dir + "/" : "") + ".editorconfig", dir, text });
  }
  const paths = new Set();
  for (let i = 0; i < 8; i++) { const d = pick(DIRS); paths.add((d ? d + "/" : "") + pick(NAMES)); }
  return { files, paths: [...paths] };
}

function feature(tree, path, a, b) {
  // values that differ only by an old core stripping " # ..." or " ; ..."
  const keys0 = new Set([...Object.keys(a), ...Object.keys(b)]);
  if ([...keys0].every((k) => a[k] === b[k] || (a[k] !== undefined && b[k] !== undefined && legacyValue(a[k]) === b[k]))) return "inline comment in value";
  // a reversed numeric range that would have matched read low..high
  for (const f of tree.files) {
    for (const s of parseFile(f.text, f.file).sections) {
      const swapped = s.name.replace(/\{([+-]?\d+)\.\.([+-]?\d+)\}/g, (m, x, y) => (Number(x) > Number(y) ? `{${y}..${x}}` : m));
      if (swapped !== s.name && sectionMatches(swapped, f.dir, path)) return "reversed numeric range (e.g. {20..1})";
      const crossing = (hasSlash(s.name) ? "" : "**/") + s.name.replace(/\[[!^][^\]\/]*\]/g, "{/,?}");
      if (/\[[!^]/.test(s.name) && !sectionMatches(s.name, f.dir, path) && sectionMatches(crossing, f.dir, path)) return "negated bracket matched a / (e.g. [{a,b}[!a]1] on a/1)";
      const unescaped = s.name.replace(/\\([*?\[])/g, "$1");
      if (unescaped !== s.name && sectionMatches(unescaped, f.dir, path) !== sectionMatches(s.name, f.dir, path)) return "backslash-escaped wildcard (e.g. [\\*.c])";
    }
  }
  // name the first differing key and the section names that set it
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) {
      const v = String(a[k] ?? b[k] ?? "");
      if (/\s[#;]/.test(v) || /\s[#;]/.test(String(b[k] ?? "")) || /\s[#;]/.test(String(a[k] ?? ""))) return "inline comment in value";
      return `key ${k}`;
    }
  }
  return "?";
}

const PY_SCRIPT = `
import json, sys, editorconfig
out = []
for p in json.load(sys.stdin):
    try: out.append(dict(editorconfig.get_properties(p)))
    except Exception as e: out.append({"__error__": type(e).__name__})
print(json.dumps(out))
`;

const stats = { cases: 0, py: { agree: 0, groups: new Map() }, npm: { agree: 0, groups: new Map() } };
function note(core, tag, ex) {
  const g = stats[core].groups;
  if (!g.has(tag)) g.set(tag, { n: 0, ex });
  g.get(tag).n++;
}

for (let t = 0; t < TREES; t++) {
  const tree = makeTree();
  const dir = mkdtempSync(join(tmpdir(), "ecdiff-"));
  for (const f of tree.files) {
    mkdirSync(join(dir, f.dir), { recursive: true });
    writeFileSync(join(dir, f.file), f.text);
  }
  const parsed = tree.files.map((f) => parseFile(f.text, f.file));
  const abs = tree.paths.map((p) => join(dir, p));
  const ours = tree.paths.map((p) => resolvePath(parsed, p).core);
  const py = PY ? JSON.parse(execFileSync(PY, ["-c", PY_SCRIPT], { input: JSON.stringify(abs) }).toString()) : null;
  tree.paths.forEach((p, i) => {
    stats.cases++;
    const mine = ours[i];
    if (py) {
      const other = py[i];
      const same = JSON.stringify(Object.entries(mine).sort()) === JSON.stringify(Object.entries(other).sort());
      if (same) stats.py.agree++; else note("py", other.__error__ ? `core-py raised ${other.__error__}` : feature(tree, p, mine, other), { files: tree.files.map((f) => `==> ${f.file} <==\n${f.text}`).join(""), path: p, engine: mine, core: other });
    }
    if (npm) {
      const raw = npm.parseSync(abs[i], { root: dir });
      const other = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
      const same = JSON.stringify(Object.entries(mine).sort()) === JSON.stringify(Object.entries(other).sort());
      if (same) stats.npm.agree++; else note("npm", feature(tree, p, mine, other), { files: tree.files.map((f) => `==> ${f.file} <==\n${f.text}`).join(""), path: p, engine: mine, core: other });
    }
  });
  rmSync(dir, { recursive: true, force: true });
}

console.log(`${stats.cases} (tree, path) cases over ${TREES} random trees`);
for (const core of ["py", "npm"]) {
  if ((core === "py" && !PY) || (core === "npm" && !npm)) continue;
  const s = stats[core];
  console.log(`\n${core === "py" ? "editorconfig-core-py" : "npm editorconfig"}: ${s.agree} of ${stats.cases} agree (${(100 * s.agree / stats.cases).toFixed(1)}%)`);
  for (const [tag, g] of [...s.groups].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${g.n}  ${tag}`);
    if (argv.includes("--examples")) console.log(`    path ${g.ex.path}\n    engine ${JSON.stringify(g.ex.engine)}\n    core   ${JSON.stringify(g.ex.core)}\n${g.ex.files.replace(/^/gm, "      ")}`);
  }
}
