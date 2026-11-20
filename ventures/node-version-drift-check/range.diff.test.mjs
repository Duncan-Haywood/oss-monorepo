// Differential test: this tool's hand-written range parser against
// node-semver, the package npm itself uses to check engines.node. node-semver
// is read from the npm that ships with Node (or SEMVER_ORACLE=/path/to/semver)
// and only used here as a test oracle, never imported by the tool. When it
// cannot be found the test is skipped, never faked.
//
// What it pins down, on seeded random ranges and release versions:
//   1. satisfies(version, range) equals semver.satisfies for every range
//      both parsers accept;
//   2. intervalsIntersect equals semver.intersects, except where one range is
//      satisfied by no version at all: node-semver 7.7 reports such a range
//      (e.g. `<0.0.0`, `>*`) as intersecting some others, while this tool
//      says no version satisfies both, which is the literal answer;
//   3. every range node-semver accepts, this tool accepts.
// Ranges node-semver rejects but this tool reads are counted, not asserted:
// they are node-semver's regex quirks (`==1.2.3`, `=1.2.3 - 2`) that a real
// engines.node is very unlikely to carry. Prereleases are left out of the
// comparison (versions are releases; ranges with a `-tag` are still parsed,
// and must be accepted, but not compared): the tool treats a prerelease as
// its release by design (README), so `=2.18.2-rc.1` overlaps `>=2.18.2` here
// and not in node-semver.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRange, satisfies, intervalsIntersect } from "./engine.mjs";

function findOracle() {
  const tries = [
    process.env.SEMVER_ORACLE,
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "node_modules", "semver"),
    "/opt/node22/lib/node_modules/npm/node_modules/semver",
    "/usr/lib/node_modules/npm/node_modules/semver",
    "/usr/local/lib/node_modules/npm/node_modules/semver",
  ];
  const req = createRequire(import.meta.url);
  for (const t of tries) if (t && existsSync(join(t, "package.json"))) return req(t);
  return null;
}
const S = findOracle();
const skip = S ? false : "node-semver not found (set SEMVER_ORACLE)";

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 2 ** 32);
}

function gen(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const n = () => pick(["0", "0", "1", "2", "3", "10", "18", "20", "22", "99999"]);
  const partial = () => {
    const k = pick([1, 2, 3, 3, 3]);
    const parts = Array.from({ length: k }, () => (r() < 0.15 ? pick(["x", "X", "*"]) : n()));
    let s = (r() < 0.1 ? pick(["v", "="]) : "") + parts.join(".");
    if (k === 3 && !/[xX*]/.test(s)) {
      if (r() < 0.1) s += pick(["-0", "-beta", "-rc.1"]);
      if (r() < 0.05) s += "+b1";
    }
    return s;
  };
  const sp = () => pick(["", "", " ", "  "]);
  const comp = () => pick(["", ">=", ">", "<", "<=", "=", "^", "~", "~>"]) + sp() + partial();
  const set = () => (r() < 0.15
    ? `${partial()} - ${partial()}`
    : Array.from({ length: pick([1, 1, 2, 2, 3]) }, comp).join(pick([" ", "  "])));
  const range = () => (r() < 0.03
    ? pick(["", "*", "x", " ", ">*", "<*", "<0.0.0", ">=0.0.0"])
    : sp() + Array.from({ length: pick([1, 1, 1, 2, 3]) }, set).join(pick([" || ", "||", "  ||  "])) + sp());
  const version = () => `${n()}.${n()}.${n()}`;
  return { range, version };
}

const hasPre = (range) => /\d-[0-9A-Za-z]/.test(range);
// A range no version satisfies, asked of node-semver one `||` set at a time:
// node-semver 7.7.4's minVersion over a whole range returns null when an empty
// set has the lowest lower bound, even if another set is satisfiable
// (`18.20.18 || <1.0.0 >10.0.0` -> null, though 18.20.18 satisfies it).
const empty = (range) => new S.Range(range).set
  .every((cs) => S.minVersion(cs.map((c) => c.value).join(" ")) === null);

test("satisfies and intersects agree with node-semver on 6,000 random ranges", { skip }, () => {
  const g = gen(20261120);
  const sat = [], inter = [], missed = [];
  let both = 0, quirks = 0;
  for (let i = 0; i < 6000; i += 1) {
    const r = g.range();
    const ours = parseRange(r);
    if (S.validRange(r) === null) { if (ours) quirks += 1; continue; }
    if (!ours) { missed.push(r); continue; }
    if (hasPre(r)) continue;
    both += 1;
    for (let j = 0; j < 6; j += 1) {
      const v = g.version();
      if (satisfies(v, r) !== S.satisfies(v, r)) sat.push([r, v]);
    }
    const r2 = g.range();
    const ours2 = parseRange(r2);
    if (!ours2 || S.validRange(r2) === null || hasPre(r2) || empty(r) || empty(r2)) continue;
    if (intervalsIntersect(ours, ours2) !== S.intersects(r, r2)) inter.push([r, r2]);
  }
  assert.deepEqual(missed, [], "ranges node-semver accepts but this tool rejects");
  assert.deepEqual(sat.slice(0, 5), [], `satisfies disagreements (${sat.length})`);
  assert.deepEqual(inter.slice(0, 5), [], `intersects disagreements (${inter.length})`);
  assert.ok(both > 4000, `only ${both} ranges compared`);
  // Recorded so a change in the quirk count is visible, not hidden.
  assert.ok(quirks < both * 0.05, `${quirks} ranges node-semver rejects were read`);
});

test("an unsatisfiable range: this tool says no overlap, node-semver 7.7 may not", { skip }, () => {
  for (const [a, b] of [["<0.0.0", ">=x.2.3"], [">*", "^0"]]) {
    assert.equal(S.minVersion(a), null, `${a} is empty for node-semver too`);
    assert.equal(intervalsIntersect(parseRange(a), parseRange(b)), false, `${a} vs ${b}`);
  }
});

test("leading zeros are rejected by both", { skip }, () => {
  for (const r of ["01.2.3", ">=018", "^20.01"]) {
    assert.equal(S.validRange(r), null, r);
    assert.equal(parseRange(r), null, r);
  }
});
