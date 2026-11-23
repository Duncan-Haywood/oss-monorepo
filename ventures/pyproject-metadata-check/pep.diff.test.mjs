// Differential test: pep.mjs against packaging 26 on seeded random strings.
// Needs a Python with packaging>=26: PACKAGING_PYTHON=/path/to/python node --test pep.diff.test.mjs
// Skips (with a note) when no such Python is found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { parseVersion, parseSpecifierSet, parseRequirement, parseLicenseExpression } from "./pep.mjs";

const PY = process.env.PACKAGING_PYTHON || "python3";
let available = false;
try {
  available = execFileSync(PY, ["-I", "-c", "import packaging.licenses, packaging; print(packaging.__version__)"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split(".")[0] >= 26;
} catch { available = false; }

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 2 ** 32);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const maybe = (r, p, f) => (r() < p ? f() : "");

function oracle(queries) {
  const out = execFileSync(PY, ["-I", new URL("./eval/packaging_oracle.py", import.meta.url).pathname], { input: queries.map((q) => JSON.stringify(q)).join("\n") + "\n", maxBuffer: 1 << 28 });
  return out.toString().trim().split("\n").map((l) => JSON.parse(l));
}

function genVersion(r) {
  const sep = () => pick(r, ["", ".", "-", "_", ""]);
  const num = () => pick(r, ["0", "1", "2", "10", "01", "007", "2026"]);
  let v = maybe(r, 0.1, () => pick(r, ["v", "V", " ", "x"])) + maybe(r, 0.1, () => num() + "!") + num();
  for (let i = 0; i < Math.floor(r() * 4); i++) v += pick(r, [".", ".", "-", ".."]) + num();
  v += maybe(r, 0.3, () => sep() + pick(r, ["a", "b", "rc", "c", "alpha", "beta", "pre", "preview", "RC", "dev2"]) + sep() + maybe(r, 0.7, num));
  v += maybe(r, 0.25, () => pick(r, ["-" + num(), sep() + pick(r, ["post", "rev", "r", "Post"]) + sep() + maybe(r, 0.6, num)]));
  v += maybe(r, 0.25, () => sep() + pick(r, ["dev", "DEV"]) + sep() + maybe(r, 0.6, num));
  v += maybe(r, 0.2, () => "+" + pick(r, ["ubuntu", "abc", "1", "x_y", "a.01", "", "UB-2", ".x"]));
  v += maybe(r, 0.05, () => pick(r, [" ", "*", ".*", "\t", "=="]));
  return v;
}
function genSpec(r) {
  const op = pick(r, ["==", "!=", "~=", ">=", "<=", "<", ">", "===", "=", "=>", ""]);
  let v = genVersion(r).trim();
  if (r() < 0.15) v = v.replace(/[+].*$/, "") + ".*";
  return pick(r, ["", " "]) + op + pick(r, ["", " "]) + v;
}
function genSpecSet(r) {
  const n = Math.floor(r() * 3) + (r() < 0.1 ? 0 : 1);
  return Array.from({ length: n }, () => genSpec(r)).join(pick(r, [",", ", ", " ,", ",,"]));
}
function genMarkerItem(r) {
  const vars = ["python_version", "sys_platform", "os_name", "platform.machine", "extra", "implementation_name", "python_full_version", "platform_system", "os.name", "pyversion", "dependency_groups"];
  const vals = ["'3.10'", '"linux"', "'win32'", '"cp"', "'docs'", "''", "'a\"b'", "linux"];
  const ops = ["==", "!=", ">=", "<", "in", "not in", "not  in", "~=", "===", "=", "notin"];
  const side = () => (r() < 0.55 ? pick(r, vars) : pick(r, vals));
  return side() + pick(r, [" ", "", "  "]) + pick(r, ops) + pick(r, [" ", ""]) + side();
}
function genMarker(r, depth = 0) {
  let m = depth < 2 && r() < 0.2 ? "(" + genMarker(r, depth + 1) + pick(r, [")", ")", ""]) : genMarkerItem(r);
  while (r() < 0.3) m += pick(r, [" and ", " or ", " AND ", "and", " && "]) + genMarkerItem(r);
  return m;
}
function genRequirement(r) {
  let s = pick(r, ["", " "]) + pick(r, ["requests", "Django", "zope.interface", "my_pkg", "a", "-bad", "pkg-", "foo bar", "numpy2", "x.y_z-w", "café"]);
  s += maybe(r, 0.25, () => pick(r, ["[", " ["]) + pick(r, ["socks", "security,socks", "a, b", "a b", "", "x,", "-y"]) + pick(r, ["]", "]", ""]));
  if (r() < 0.15) {
    s += pick(r, [" @ ", "@", " @"]) + pick(r, ["https://example.com/p.whl", "git+https://github.com/o/r@v1", "file:///tmp/x.tar.gz", ""]);
    s += maybe(r, 0.4, () => pick(r, [" ; ", "; ", ";", " ;"]) + genMarker(r));
  } else {
    const spec = maybe(r, 0.75, () => genSpecSet(r));
    s += r() < 0.15 && spec ? "(" + spec + pick(r, [")", ""]) : spec;
    s += maybe(r, 0.35, () => pick(r, [" ; ", ";", "; ", " "]) + genMarker(r));
  }
  return s;
}
function genLicense(r, depth = 0) {
  const ids = ["MIT", "mit", "Apache-2.0", "BSD-3-Clause", "GPL-3.0-only", "GPL-2.0+", "GPL-3.0", "LicenseRef-Mine", "licenseref-x.y", "LicenseRef-a_b", "LicenseRef-z+", "Nonexistent-1.0", "LGPL-2.1-or-later", "0BSD", "MPL-2.0", "Unlicense", "Proprietary", "eCos-2.0"];
  const exc = ["Classpath-exception-2.0", "LLVM-exception", "classpath-exception-2.0", "Nope-exception", "MIT"];
  let s = depth < 2 && r() < 0.2 ? "(" + genLicense(r, depth + 1) + pick(r, [")", ")", ""]) : pick(r, ids);
  if (r() < 0.12) s += pick(r, [" WITH ", " with ", " WITH"]) + pick(r, exc);
  while (r() < 0.3) s += pick(r, [" OR ", " AND ", " or ", " and ", " ", " OR(", " XOR "]) + pick(r, ids);
  return maybe(r, 0.03, () => "(") + s;
}

const N = Number(process.env.PEP_DIFF_N || 4000);

function run(kind, gen, mine, seed) {
  const r = rng(seed);
  const inputs = Array.from({ length: N }, () => gen(r));
  const py = oracle(inputs.map((s) => ({ kind, s })));
  const bad = [];
  let valid = 0;
  inputs.forEach((s, i) => {
    const want = py[i];
    const got = mine(s);
    if (want.ok !== undefined) valid++;
    const same = want.error !== undefined ? got.error !== undefined : got.error === undefined && JSON.stringify(got.ok) === JSON.stringify(want.ok);
    if (!same) bad.push({ s, want, got });
  });
  return { bad, valid, total: inputs.length };
}

const opts = { skip: available ? false : `no Python with packaging>=26 at ${PY}` };

test("PEP 440 versions: same validity and normal form as packaging.version.Version", opts, () => {
  const res = run("version", genVersion, (s) => {
    const v = parseVersion(s);
    return v ? { ok: v.normalized } : { error: "invalid" };
  }, 1);
  assert.deepEqual(res.bad.slice(0, 5), []);
  assert.ok(res.valid > N * 0.2 && res.valid < N * 0.9, `valid share ${res.valid}`);
});

test("specifier sets: same validity and count as packaging.specifiers.SpecifierSet", opts, () => {
  const res = run("specset", genSpecSet, (s) => {
    const p = parseSpecifierSet(s);
    return p.error ? { error: p.error } : { ok: p.specs.length };
  }, 2);
  assert.deepEqual(res.bad.slice(0, 5), []);
  assert.ok(res.valid > N * 0.1 && res.valid < N * 0.9, `valid share ${res.valid}`);
});

test("PEP 508 requirements: same validity, name, extras, url, specifier count and marker as packaging.requirements.Requirement", opts, () => {
  const res = run("requirement", genRequirement, (s) => {
    const p = parseRequirement(s);
    if (p.error) return { error: p.error };
    const set = parseSpecifierSet(p.specifier);
    if (set.error) return { error: set.error };
    return { ok: { name: p.name, extras: [...new Set(p.extras)].sort(), url: p.url, nspec: set.specs.length, marker: p.marker !== null } };
  }, 3);
  assert.deepEqual(res.bad.slice(0, 5), []);
  assert.ok(res.valid > N * 0.1 && res.valid < N * 0.9, `valid share ${res.valid}`);
});

test("SPDX expressions: same validity and canonical form as packaging.licenses", opts, () => {
  const res = run("license", genLicense, (s) => {
    const p = parseLicenseExpression(s);
    return p.error ? { error: p.error } : { ok: p.normalized };
  }, 4);
  assert.deepEqual(res.bad.slice(0, 5), []);
  assert.ok(res.valid > N * 0.1 && res.valid < N * 0.9, `valid share ${res.valid}`);
});
