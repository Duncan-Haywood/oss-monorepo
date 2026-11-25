// Differential test: resolve.mjs against the Node that runs this test.
//
// A seeded generator writes a few hundred small packages, each with a random
// "exports" and "imports" map built from the shapes that trip people up
// (pattern keys of different specificity, nested conditions, fallback
// arrays with invalid items, null blocks, "..", "node_modules" and "%2e"
// segments, targets without "./", numeric condition keys, mixed "." and
// condition keys, trailing slashes). Then it asks a child `node` to resolve
// the same specifiers three ways (ESM import with the default conditions,
// ESM with --conditions=development, CommonJS require) and compares the
// outcome, file or error code, with what resolve.mjs predicts.
//
// ESM's import.meta.resolve answers without touching the file, so the
// resolved URL is compared exactly. require() needs the file to exist, so
// its MODULE_NOT_FOUND message carries the path it looked for, which is
// compared instead. Nothing is installed and nothing leaves the machine.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSpecifier, DEFAULT_CONDITIONS } from "./resolve.mjs";

const SEED = Number(process.env.RESOLVE_DIFF_SEED || 20261122);
const PACKAGES = Number(process.env.RESOLVE_DIFF_PACKAGES || 300);

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

function generate(seed, count) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const chance = (p) => r() < p;
  const CONDS = ["import", "require", "node", "default", "development", "browser", "types", "module-sync", "node-addons", "deno"];
  const SEG = ["a", "b", "lib", "dist", "x.js", "feature", "*", "*.js", "..", ".", "node_modules", "%2e", "", "Node_Modules", "a%2fb", "sub/*", "*/index.js"];
  const target = (internal) => {
    if (chance(0.06)) return null;
    if (chance(0.05)) return pick([1, true, ""]);
    if (chance(0.08)) return pick(["dist/index.js", "../outside.js", "/abs.js", "ext", "ext/*", "ext/sub/", "https://example.com/x.js", "./", "./dir/"]);
    if (internal && chance(0.1)) return pick(["ext", "ext/*", "ext/lib/*.js", "#self"]);
    const n = 1 + Math.floor(r() * 3);
    const parts = Array.from({ length: n }, () => pick(SEG));
    return "./" + parts.join("/") + (chance(0.1) ? "/" : "");
  };
  const value = (depth, internal) => {
    const k = r();
    if (depth > 2 || k < 0.45) return target(internal);
    if (k < 0.65) return Array.from({ length: Math.floor(r() * 4) }, () => value(depth + 1, internal));
    const o = {};
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) o[chance(0.03) ? "0" : pick(CONDS)] = value(depth + 1, internal);
    return o;
  };
  const KEYS = [".", "./a", "./lib/*", "./lib/*.js", "./lib/x/*", "./*", "./*.js", "./a/", "./feature", "./sub/*/index", "./**", "./a*b", "./dist/*"];
  const IKEYS = ["#a", "#lib/*", "#lib/*.js", "#*", "#x", "#dep", "#a/", "#a*b"];
  const fills = ["q", "q/r", "x.js", "..", "../q", "a/../b", "node_modules/q", "%2e%2e", "a%2fb", "", "q/", "Q", "a//b"];
  const fill = (key) => {
    const star = key.indexOf("*");
    return star === -1 ? key : key.slice(0, star) + pick(fills) + key.slice(star + 1);
  };

  const pkgs = [];
  for (let i = 0; i < count; i++) {
    const name = `p${i}`;
    let exports;
    const shape = r();
    if (shape < 0.1) exports = target(false);
    else if (shape < 0.2) exports = value(1, false);
    else {
      exports = {};
      const n = 1 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) exports[pick(KEYS)] = value(1, false);
      if (chance(0.05)) exports[pick(CONDS)] = target(false);
    }
    const imports = {};
    const ni = Math.floor(r() * 4);
    for (let j = 0; j < ni; j++) imports[pick(IKEYS)] = value(1, true);
    const specs = [];
    const dotKeys = exports && typeof exports === "object" && !Array.isArray(exports) ? Object.keys(exports).filter((k) => k.startsWith(".")) : [];
    const keys = dotKeys.length ? dotKeys : ["."];
    for (let j = 0; j < 4; j++) {
      const sub = chance(0.15) ? pick(["./nothing", "./lib/", "./a/b", "./lib/x/y.js"]) : fill(pick(keys));
      specs.push(sub === "." ? name : name + sub.slice(1));
    }
    for (let j = 0; j < 2 && ni; j++) specs.push(fill(pick(Object.keys(imports))));
    if (chance(0.2)) specs.push(pick(["#", "#/x", "#missing"]));
    pkgs.push({ name, exports, imports: ni ? imports : undefined, specs });
  }
  return pkgs;
}

// The child: resolves every spec and prints one JSON line per answer.
const ORACLE = `
import fs from "node:fs";
import { createRequire } from "node:module";
const [mode, root, list] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(list, "utf8"));
const out = [];
for (const { name, spec } of cases) {
  const dir = root + "/node_modules/" + name + "/";
  let res;
  try {
    if (mode === "require") {
      const req = createRequire(spec.startsWith("#") ? dir + "package.json" : root + "/index.js");
      res = { ok: true, path: req.resolve(spec) };
    } else {
      const parent = new URL(spec.startsWith("#") ? "file://" + dir + "probe.mjs" : "file://" + root + "/probe.mjs").href;
      res = { ok: true, href: import.meta.resolve(spec, parent) };
    }
  } catch (e) {
    res = { ok: false, code: e.code, message: String(e.message).split("\\n")[0] };
  }
  out.push(res);
}
process.stdout.write(JSON.stringify(out));
`;

function runOracle(root, cases, mode, extraArgs = []) {
  const list = path.join(root, `cases-${mode}.json`);
  fs.writeFileSync(list, JSON.stringify(cases));
  const script = path.join(root, "oracle.mjs");
  fs.writeFileSync(script, ORACLE);
  const out = execFileSync(process.execPath, ["--experimental-import-meta-resolve", "--no-warnings", ...extraArgs, script, mode, root, list], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

// Reduces Node's answer to {file} | {external} | {code}, in the terms
// resolve.mjs uses.
function nodeOutcome(res, mode, dir) {
  if (res.ok) {
    if (mode === "require") {
      return res.path.startsWith(dir) ? { file: "./" + res.path.slice(dir.length).split(path.sep).join("/") } : { other: res.path };
    }
    const base = pathToFileURL(dir).href;
    return res.href.startsWith(base) ? { encoded: "./" + res.href.slice(base.length) } : { other: res.href };
  }
  if (res.code === "MODULE_NOT_FOUND" || res.code === "ERR_MODULE_NOT_FOUND") {
    const pkg = /Cannot find (?:package|module) '([^']+)'/.exec(res.message);
    if (pkg && /^ext(\/|$)|\/node_modules\/ext(\/|')/.test(pkg[1])) return { external: true };
    if (pkg && pkg[1].startsWith(dir)) return { file: "./" + pkg[1].slice(dir.length).split(path.sep).join("/") };
    if (pkg && pkg[1].startsWith("#")) return { external: true };
    return { code: res.code, message: res.message };
  }
  return { code: res.code };
}

const RESOLUTION_ERRORS = new Set(["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_INVALID_PACKAGE_TARGET", "ERR_INVALID_PACKAGE_CONFIG", "ERR_INVALID_MODULE_SPECIFIER", "ERR_PACKAGE_IMPORT_NOT_DEFINED"]);

// When resolve.mjs hands the question to another package (an "imports"
// target naming a package), to legacy "main" lookup (no usable "exports")
// or to require()'s plain module lookup (no "imports"), all it claims is
// that Node gets past the package's own maps: Node's answer must then be a
// lookup result, not one of the five resolution errors.
function compatible(ours, theirs) {
  if (ours.external || ours.code === "NO_EXPORTS" || ours.code === "NO_IMPORTS") return !RESOLUTION_ERRORS.has(theirs.code);
  return JSON.stringify(ours) === JSON.stringify(theirs);
}

function ourOutcome(r, mode) {
  if (r.ok && "external" in r) return { external: true };
  if (r.ok) return mode === "require" ? { file: r.file } : { encoded: r.encoded };
  return { code: r.code };
}

test(`resolve.mjs agrees with node ${process.version} on ${PACKAGES} generated packages (seed ${SEED})`, { timeout: 240_000 }, () => {
  const pkgs = generate(SEED, PACKAGES);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exports-diff-")));
  try {
    for (const p of pkgs) {
      const dir = path.join(root, "node_modules", p.name);
      fs.mkdirSync(dir, { recursive: true });
      const json = { name: p.name };
      if (p.exports !== undefined) json.exports = p.exports;
      if (p.imports !== undefined) json.imports = p.imports;
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(json));
    }
    const cases = pkgs.flatMap((p) => p.specs.map((spec) => ({ name: p.name, spec, pkg: p })));
    const runs = [
      { label: "import", mode: "import", extra: [], args: [] },
      { label: "import --conditions=development", mode: "import", extra: ["development"], args: ["--conditions=development"] },
      { label: "require", mode: "require", extra: [], args: [] },
    ];
    const disagreements = [];
    const tally = {};
    for (const run of runs) {
      const answers = runOracle(root, cases.map(({ name, spec }) => ({ name, spec })), run.mode, run.args);
      cases.forEach((c, i) => {
        const dir = path.join(root, "node_modules", c.name) + path.sep;
        const theirs = nodeOutcome(answers[i], run.mode, dir);
        const pkg = { name: c.pkg.name, exports: c.pkg.exports, imports: c.pkg.imports };
        const ours = ourOutcome(resolveSpecifier(pkg, c.spec, { mode: run.mode, extraConditions: run.extra }), run.mode);
        const key = ours.code === "NO_EXPORTS" || ours.code === "NO_IMPORTS" ? ours.code : theirs.code || (theirs.external || ours.external ? "external" : "file");
        tally[key] = (tally[key] || 0) + 1;
        if (!compatible(ours, theirs)) disagreements.push({ run: run.label, spec: c.spec, pkg, ours, theirs, raw: answers[i] });
      });
    }
    const total = cases.length * runs.length;
    console.log(`# ${total} resolutions, ${disagreements.length} disagreements; outcomes: ${JSON.stringify(tally)}`);
    const seen = new Set();
    for (const d of disagreements) {
      const sig = d.run + JSON.stringify(d.ours) + (d.theirs.code || Object.keys(d.theirs)[0]);
      if (seen.has(sig) || seen.size >= 12) continue;
      seen.add(sig);
      console.log(JSON.stringify(d));
    }
    assert.equal(disagreements.length, 0, `${disagreements.length} of ${total} disagree; first: ${JSON.stringify(disagreements[0])}`);
    // The generator must exercise the interesting outcomes, or a pass means little.
    for (const code of ["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_INVALID_PACKAGE_TARGET", "ERR_INVALID_PACKAGE_CONFIG", "ERR_INVALID_MODULE_SPECIFIER", "ERR_PACKAGE_IMPORT_NOT_DEFINED", "file", "external"]) {
      assert.ok((tally[code] || 0) > 0, `no case produced ${code}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("DEFAULT_CONDITIONS match this Node's defaults", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exports-cond-")));
  try {
    const conds = ["node", "import", "require", "module-sync", "node-addons", "default"];
    const cases = [];
    for (const c of conds) {
      const dir = path.join(root, "node_modules", `c-${c}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: `c-${c}`, exports: { [c]: "./yes.js", default: "./no.js" } }));
      cases.push({ name: `c-${c}`, spec: `c-${c}` });
    }
    for (const mode of ["import", "require"]) {
      const answers = runOracle(root, cases, mode);
      const active = conds.filter((c, i) => {
        const o = nodeOutcome(answers[i], mode, path.join(root, "node_modules", `c-${c}`) + path.sep);
        return (o.file || o.encoded) === "./yes.js";
      });
      assert.deepEqual(active.filter((c) => c !== "default").sort(), [...DEFAULT_CONDITIONS[mode]].sort(), mode);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
