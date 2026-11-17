import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, parseInstance, makeInstance, deferredAcceptance, checkStability, allStableMatchings,
  scoreMatching, parseMatching, toCsv, PAPERS, SAMPLE_TEXT,
} from "./engine.mjs";
import { EXAMPLES } from "./example-data.mjs";

const REF = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));

function fromRef(c) {
  const rs = Object.keys(c.residents);
  const hs = Object.keys(c.hospitals);
  const ri = new Map(rs.map((r, i) => [r, i]));
  const hi = new Map(hs.map((h, j) => [h, j]));
  return makeInstance(
    { label: "residents", names: rs, prefs: rs.map((r) => c.residents[r].map((h) => hi.get(h))) },
    { label: "hospitals", names: hs, prefs: hs.map((h) => c.hospitals[h].map((r) => ri.get(r))), cap: hs.map((h) => c.capacity[h]) },
  );
}
const named = (inst, m) => Object.fromEntries(m.map((j, i) => [inst.A.names[i], j >= 0 ? inst.B.names[j] : null]));

test(`deferred acceptance matches ${REF.tool} on all ${REF.cases.length} reference instances, both sides proposing`, () => {
  assert.ok(REF.cases.length >= 200);
  for (const [k, c] of REF.cases.entries()) {
    const inst = fromRef(c);
    assert.deepEqual(named(inst, deferredAcceptance(inst, "A")), c.resident_optimal, `case ${k} resident-optimal`);
    assert.deepEqual(named(inst, deferredAcceptance(inst, "B")), c.hospital_optimal, `case ${k} hospital-optimal`);
  }
});

// Seeded generator for property tests.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomInstance(r, nA, nB, maxCap, pDrop) {
  const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const keys = (n) => [...Array(n).keys()];
  return makeInstance(
    { names: keys(nA).map((i) => `a${i}`), prefs: keys(nA).map(() => sh(keys(nB)).filter(() => r() > pDrop)) },
    { names: keys(nB).map((j) => `b${j}`), prefs: keys(nB).map(() => sh(keys(nA)).filter(() => r() > pDrop)), cap: keys(nB).map(() => 1 + Math.floor(r() * maxCap)) },
  );
}
function brute(inst) {
  const out = new Set();
  const m = new Array(inst.A.n).fill(-1);
  const rec = (i) => {
    if (i === inst.A.n) { if (checkStability(inst, m).stable) out.add(m.join(",")); return; }
    for (const j of [-1, ...inst.A.prefs[i]]) { m[i] = j; rec(i + 1); }
    m[i] = -1;
  };
  rec(0);
  return out;
}

test("the listing equals a brute-force search over every matching on 1,000 small random instances", () => {
  const r = rng(7);
  let total = 0;
  let several = 0;
  for (let t = 0; t < 1000; t++) {
    const inst = randomInstance(r, 1 + Math.floor(r() * 6), 1 + Math.floor(r() * 5), t % 2 ? 1 : 3, t % 3 ? 0.3 : 0);
    const want = brute(inst);
    const got = allStableMatchings(inst);
    assert.equal(got.complete, true);
    const keys = got.matchings.map((m) => m.join(","));
    assert.equal(new Set(keys).size, keys.length, "no repeats");
    assert.deepEqual(new Set(keys), want, `instance ${t}`);
    total += want.size;
    if (want.size > 1) several++;
  }
  assert.ok(several > 25, `only ${several} instances had more than one stable matching`);
  assert.ok(total > 1000);
});

test("optimality, the lattice extremes and the rural hospitals theorem hold on random instances", () => {
  const r = rng(11);
  for (let t = 0; t < 400; t++) {
    const inst = randomInstance(r, 2 + Math.floor(r() * 12), 1 + Math.floor(r() * 6), 3, t % 2 ? 0.25 : 0);
    const aOpt = deferredAcceptance(inst, "A");
    const bOpt = deferredAcceptance(inst, "B");
    assert.ok(checkStability(inst, aOpt).stable && checkStability(inst, bOpt).stable);
    const { matchings } = allStableMatchings(inst);
    assert.deepEqual(matchings[0], aOpt, "the listing starts at the applicant-optimal matching");
    const rA = (i, j) => (j < 0 ? Infinity : inst.A.rank[i].get(j));
    for (const m of matchings) {
      for (let i = 0; i < inst.A.n; i++) {
        assert.ok(rA(i, aOpt[i]) <= rA(i, m[i]), "applicant-optimal is best for every applicant");
        assert.ok(rA(i, bOpt[i]) >= rA(i, m[i]), "programme-optimal is worst for every applicant");
      }
      assert.deepEqual(m.map((j) => j >= 0), aOpt.map((j) => j >= 0), "same applicants matched");
    }
  }
});

test("Gale and Shapley's cyclic 3x3 kind of instance has three stable matchings", () => {
  const inst = parseInstance(`[men]\nx: A > B > C\ny: B > C > A\nz: C > A > B\n[women]\nA: y > z > x\nB: z > x > y\nC: x > y > z\n`);
  const { matchings } = allStableMatchings(inst);
  assert.equal(matchings.length, 3);
  const r = analyze({ text: EXAMPLES.cyclic.text });
  assert.equal(r.stableMatchings.count, 3);
  assert.equal(r.unique, false);
  // Everyone gets first choice on one side, third on the other, in the extremes; the middle one gives everyone their second.
  assert.equal(r.stableMatchings.egalitarian.total, 12);
  assert.equal(r.stableMatchings.minimumRegret.regret, 2);
});

test("a blocking pair is found and explained", () => {
  const r = analyze({ text: SAMPLE_TEXT, check: "ana: mercy\nben: city\ncal: city\ndee: general" });
  assert.equal(r.check.stable, false);
  assert.ok(r.check.blocking.some((b) => b.applicants === "ana" && b.programmes === "city"));
  assert.match(r.check.blocking[0].why, /prefers/);
  const ok = analyze({ text: SAMPLE_TEXT, check: Object.entries(r.optimalA.assignment).map(([a, b]) => `${a}: ${b ?? "-"}`).join("\n") });
  assert.equal(ok.check.stable, true);
  const over = analyze({ text: SAMPLE_TEXT, check: "ana: mercy\ndee: mercy" });
  assert.equal(over.check.stable, false);
  assert.ok(over.check.problems.some((p) => /only 1 place/.test(p)));
});

test("one-sided listings are dropped with a warning; bad input gives a clear error", () => {
  const r = analyze({ text: "[a]\nx: P > Q\ny: P\n[b]\nP: y\nQ: x\n" });
  assert.match(r.warnings[0], /one-sided listing.*x lists P/);
  assert.equal(r.matching.assignment.x, "Q");
  assert.throws(() => parseInstance("x: P"), /header/);
  assert.throws(() => parseInstance("[a]\nx: P\n[b]\nQ: x"), /"P", who is not in \[b\]/);
  assert.throws(() => parseInstance("[a]\nx (2): P\n[b]\nP: x"), /second side only/);
  assert.throws(() => parseInstance("[a]\nx: P > P\n[b]\nP: x"), /twice/);
  assert.throws(() => parseInstance("[a]\nx: P\n[b]\nP: x\n[c]\n"), /two sides/);
  assert.throws(() => parseMatching(parseInstance(SAMPLE_TEXT), "zed: city"), /not in/);
});

test("capacities parse in both spellings and examples run", () => {
  const a = parseInstance("[a]\nx: P\ny: P\n[b]\nP (2): x > y\n");
  const b = parseInstance("[a]\nx: P\ny: P\n[b]\nP*2: x, y\n");
  assert.deepEqual(a.B.cap, [2]);
  assert.deepEqual(b.B.cap, [2]);
  for (const [k, ex] of Object.entries(EXAMPLES)) {
    const r = analyze({ text: ex.text, proposer: ex.proposer ?? "A" });
    assert.ok(r.summary.length > 50, k);
    assert.equal(r.ruralHospitals, true, k);
    assert.equal(r.stableMatchings.complete, true, k);
  }
});

function cyclicBlocks(n) {
  // n disjoint cyclic 3x3 blocks have 3^n stable matchings.
  const A = [];
  const B = [];
  for (let k = 0; k < n; k++) {
    const [x, y, z] = ["x", "y", "z"].map((s) => s + k);
    const [p, q, r] = ["P", "Q", "R"].map((s) => s + k);
    A.push(`${x}: ${p} > ${q} > ${r}`, `${y}: ${q} > ${r} > ${p}`, `${z}: ${r} > ${p} > ${q}`);
    B.push(`${p}: ${y} > ${z} > ${x}`, `${q}: ${z} > ${x} > ${y}`, `${r}: ${x} > ${y} > ${z}`);
  }
  return `[m]\n${A.join("\n")}\n[w]\n${B.join("\n")}\n`;
}

test("the listing stops at its limit and says so", () => {
  const r = analyze({ text: cyclicBlocks(9), limit: 1000 });
  assert.equal(r.stableMatchings.count, 1000);
  assert.equal(r.stableMatchings.complete, false);
  assert.match(r.summary, /at least 1000/);
  const all = allStableMatchings(parseInstance(cyclicBlocks(7)));
  assert.equal(all.complete, true);
  assert.equal(all.matchings.length, 3 ** 7);
});

test("CSV cells that look like formulas are defused", async () => {
  const { csvCell } = await import("./engine.mjs");
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-1+CMD"), "'-1+CMD");
  assert.equal(csvCell("@x"), "'@x");
  assert.equal(csvCell("-3"), "-3");
  assert.equal(csvCell("ana"), "ana");
  const r = analyze({ text: "[a]\n=evil: P\n[b]\nP: =evil\n" });
  assert.match(toCsv(r), /\n'=evil,P,1,/);
});

test("scores, CSV and papers", () => {
  const inst = parseInstance(SAMPLE_TEXT);
  const s = scoreMatching(inst, deferredAcceptance(inst, "A"));
  assert.equal(s.sumA, 4);
  const csv = toCsv(analyze({}));
  assert.match(csv.split("\n")[0], /^applicants,matching,matching rank/);
  assert.equal(csv.trim().split("\n").length, 5);
  for (const p of PAPERS) {
    assert.ok(p.authors && p.title && p.venue && p.year && p.url && p.implemented && p.deviations, p.title);
  }
});

test("checkStability flags an unacceptable pair at the first programme (index 0)", () => {
  const inst = parseInstance("[a]\nx: q\ny: p\n[b]\np: y\nq: x\n");
  const c = checkStability(inst, [0, 1]); // x at p, y at q: neither pair is acceptable
  assert.equal(c.problems.length, 2);
  assert.match(c.problems[0], /x is placed at p/);
  assert.equal(c.stable, false);
});

test("a huge capacity is clamped to the list length, not expanded seat by seat", () => {
  const t0 = Date.now();
  const r = analyze({ text: "[a]\nx: c\ny: c\n[b]\nc (300000000): x > y\n" });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.matching.assignment.x, "c");
  assert.equal(r.matching.assignment.y, "c");
  assert.equal(r.stableMatchings.count, 1);
  assert.equal(r.sides.B.places, 300000000);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});

test("two sides with the same header label are told apart", () => {
  assert.throws(() => parseInstance("[s]\nx: c\n[s]\nc: x\n"), /different names/);
});
