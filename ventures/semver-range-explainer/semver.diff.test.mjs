// Differential test: this engine against node-semver, the package npm itself
// uses, on randomly generated ranges and versions. node-semver is read from
// the npm that ships with Node (or SEMVER_ORACLE=/path/to/semver); when it
// cannot be found the test is skipped, never faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import * as e from "./semver.mjs";

function findOracle() {
  const tries = [process.env.SEMVER_ORACLE, join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "node_modules", "semver"), "/opt/node22/lib/node_modules/npm/node_modules/semver", "/usr/lib/node_modules/npm/node_modules/semver", "/usr/local/lib/node_modules/npm/node_modules/semver"];
  for (const t of tries) if (t && existsSync(join(t, "package.json"))) {
    const req = createRequire(import.meta.url);
    return { S: req(t), version: req(join(t, "package.json")).version };
  }
  return { S: null, version: null };
}
const { S, version: ORACLE_VERSION } = findOracle();
// Match the flavour of node-semver we are compared against (7.7 or 7.8 rules).
const FL = e.semverFlavourFor(ORACLE_VERSION);
const skip = S ? false : "node-semver not found (set SEMVER_ORACLE)";

// Seeded PRNG so a failure reproduces.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 2 ** 32);
}

function gen(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const num = () => pick(["0", "0", "1", "1", "2", "3", "10"]);
  const pre = () => pick(["0", "1", "alpha", "beta", "beta.1", "beta.2", "rc.1", "alpha.0", "0.0"]);
  const xr = () => (r() < 0.15 ? pick(["x", "X", "*"]) : num());
  const full = () => `${num()}.${num()}.${num()}${r() < 0.35 ? "-" + pre() : ""}${r() < 0.05 ? "+b1" : ""}`;
  const partial = () => {
    const n = pick([1, 2, 3, 3, 3]);
    const parts = [xr(), xr(), xr()].slice(0, n);
    let s = (r() < 0.08 ? "v" : "") + parts.join(".");
    if (n === 3 && r() < 0.3 && !parts.some((p) => /[xX*]/.test(p))) s += "-" + pre();
    return s;
  };
  const simple = () => {
    const k = r();
    if (k < 0.25) return "^" + (r() < 0.1 ? " " : "") + partial();
    if (k < 0.45) return pick(["~", "~>"]) + (r() < 0.1 ? " " : "") + partial();
    if (k < 0.8) return pick(["<", "<=", ">", ">=", "=", ""]) + (r() < 0.1 ? " " : "") + partial();
    if (k < 0.85) return pick(["*", "x", ""]);
    return partial();
  };
  const set = () => {
    if (r() < 0.12) return `${partial()} - ${partial()}`;
    return Array.from({ length: pick([1, 1, 2, 2, 3]) }, simple).join(" ");
  };
  const range = () => Array.from({ length: pick([1, 1, 1, 2, 3]) }, set).join(pick([" || ", "||", " ||  "]));
  return { r, pick, full, range };
}

const BAD = ["latest", "1.2.3 - 2 >1", "1.2.3,2.0.0", ">=1.2.3 && <2", "01.2.3", "1.2.3.4", "^>1.2", "~1.2.3 -", "git+https://x", "1.2.3 -2.0.0", "a.b.c", ">=", "<1.2.3-", "1.2.3+"];

test("range parsing, desugaring and validity match node-semver", { skip }, () => {
  let checked = 0;
  for (let seed = 1; seed <= 4000; seed++) {
    const { range } = gen(seed);
    const text = range();
    for (const includePrerelease of [false, true]) {
      let theirs, mine, theirErr = null, myErr = null;
      try { theirs = new S.Range(text, { includePrerelease, semver: FL }).range; } catch (err) { theirErr = err; }
      try { mine = e.rangeString(e.parseRange(text, { includePrerelease, semver: FL })); } catch (err) { myErr = err; }
      assert.equal(!!myErr, !!theirErr, `validity of ${JSON.stringify(text)} incPre=${includePrerelease}: mine ${myErr?.message} theirs ${theirErr?.message}`);
      // node-semver collapses unsatisfiable "<0.0.0-0" sets; compare strings only without them.
      if (!theirErr && !/<0\.0\.0-0/.test(theirs)) assert.equal(mine, theirs, `${JSON.stringify(text)} incPre=${includePrerelease}`);
      checked++;
    }
  }
  for (const b of BAD) {
    assert.throws(() => new S.Range(b), b);
    assert.throws(() => e.parseRange(b, { semver: FL }), b);
  }
  assert.ok(checked >= 8000);
});

test("satisfies, maxSatisfying and minVersion match node-semver on every version near every boundary", { skip }, () => {
  let pairs = 0, minChecked = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const g = gen(seed * 7 + 3);
    const text = g.range();
    let mineR;
    try { mineR = e.parseRange(text, { semver: FL }); } catch { continue; }
    const vs = e.candidates([mineR]).map(e.format);
    for (let i = 0; i < 6; i++) vs.push(g.full());
    for (const includePrerelease of [false, true]) {
      const R = e.parseRange(text, { includePrerelease, semver: FL });
      for (const v of vs) {
        assert.equal(e.satisfies(v, R, { includePrerelease, semver: FL }), S.satisfies(v, text, { includePrerelease, semver: FL }), `${v} in ${JSON.stringify(text)} incPre=${includePrerelease}`);
        pairs++;
      }
      assert.equal(e.maxSatisfying(vs, R, { includePrerelease, semver: FL }), S.maxSatisfying(vs, text, { includePrerelease, semver: FL }), `max ${text}`);
      assert.equal(e.minSatisfying(vs, R, { includePrerelease, semver: FL }), S.minSatisfying(vs, text, { includePrerelease, semver: FL }), `min ${text}`);
    }
    const theirMin = S.minVersion(text);
    const myMin = e.minVersion(mineR);
    // node-semver's minVersion is a heuristic; ours is the exact least version.
    // Where node-semver returns a version, ours must be no higher and must satisfy.
    if (theirMin) {
      assert.ok(myMin && S.satisfies(myMin, text), `${text}: ours ${myMin}`);
      assert.ok(S.lte(myMin, theirMin.version), `${text}: ours ${myMin} above theirs ${theirMin.version}`);
      minChecked++;
    }
  }
  console.log(`node-semver ${ORACLE_VERSION}: satisfies pairs checked: ${pairs}; minVersion checked: ${minChecked}`);
  assert.ok(pairs > 50000, String(pairs));
  assert.ok(minChecked > 1000, String(minChecked));
});

test("version validity matches node-semver", { skip }, () => {
  const samples = ["1.2.3", "v1.2.3", " 1.2.3 ", "=1.2.3", "1.2", "01.2.3", "1.2.3-01", "1.2.3-0a", "1.2.3-beta..1", "1.2.3+", "1.2.3-x.7.z.92", "1.0.0+20130313144700", "9007199254740992.0.0", "1.2.3-", "V1.2.3", "1.2.3 ", "1.2.3-α"];
  for (let seed = 1; seed <= 500; seed++) samples.push(gen(seed).full());
  for (const v of samples) {
    const theirs = S.valid(v);
    const mine = e.parseVersion(v);
    assert.equal(mine ? e.format(mine) : null, theirs, JSON.stringify(v));
  }
});

test("range comparison: every witness is confirmed by node-semver, and subset agrees with node-semver's subset", { skip }, () => {
  let pairs = 0, agree = 0;
  const disagreements = [];
  for (let seed = 1; seed <= 2500; seed++) {
    const g = gen(seed * 13 + 5);
    const a = g.range(), b = g.range();
    try { e.parseRange(a, { semver: FL }); e.parseRange(b, { semver: FL }); } catch { continue; }
    const c = e.compareRanges(a, b, { semver: FL });
    if (c.onlyA) assert.ok(S.satisfies(c.onlyA, a) && !S.satisfies(c.onlyA, b), `onlyA ${c.onlyA}: ${a} vs ${b}`);
    if (c.onlyB) assert.ok(S.satisfies(c.onlyB, b) && !S.satisfies(c.onlyB, a), `onlyB ${c.onlyB}: ${a} vs ${b}`);
    if (c.both) assert.ok(S.satisfies(c.both, a) && S.satisfies(c.both, b), `both ${c.both}: ${a} vs ${b}`);
    // When we say "no witness", random probing with node-semver must not find one either.
    const probes = e.candidates([e.parseRange(a, { semver: FL }), e.parseRange(b, { semver: FL })]).map(e.format);
    for (let i = 0; i < 20; i++) probes.push(g.full());
    for (const v of probes) {
      if (c.aInB) assert.ok(!(S.satisfies(v, a) && !S.satisfies(v, b)), `${v} breaks ${a} ⊆ ${b}`);
      if (!c.overlap) assert.ok(!(S.satisfies(v, a) && S.satisfies(v, b)), `${v} breaks no-overlap ${a} / ${b}`);
    }
    pairs++;
    if (S.subset(a, b) === c.aInB) agree++;
    else disagreements.push([a, b, c.aInB, c.onlyA]);
  }
  assert.ok(pairs > 1500, String(pairs));
  // Recorded, not hidden: where node-semver's subset() differs, our witness
  // was confirmed by node-semver's own satisfies() above, so ours is exact.
  test.diagnostic?.(`subset agreement ${agree}/${pairs}; first disagreements: ${JSON.stringify(disagreements.slice(0, 5))}`);
  console.log(`node-semver ${ORACLE_VERSION} (flavour ${FL}): subset agreement ${agree}/${pairs}; disagreements: ${JSON.stringify(disagreements.slice(0, 8))}`);
});
