import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, pay, totalComp, startsPayingAt, productionForCash, crossovers, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const A = { mode: "greater", base: 120000, pct: 22, excl: 10, threshold: 0, signOn: 10000, other: 3000 };
const B = { mode: "plus", base: 95000, pct: 18, excl: 0, threshold: 400000, signOn: 0, other: 0 };
const S = { mode: "salary", base: 130000, pct: 0, excl: 0, threshold: 0, signOn: 0, other: 0 };

test("parseNum strips currency formatting and rejects junk", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum("22%"), 22);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("salary ignores production", () => {
  assert.equal(pay(S, 1), 130000);
  assert.equal(pay(S, 5e6), 130000);
});

test("greater-of pays the base until the adjusted percentage overtakes it", () => {
  assert.equal(pay(A, 500000), 120000); // 0.22 * 450000 = 99000 < base
  assert.ok(Math.abs(pay(A, 800000) - 0.22 * 720000) < 1e-6); // 158400
});

test("plus pays base plus percentage above the threshold only", () => {
  assert.equal(pay(B, 300000), 95000);
  assert.equal(pay(B, 400000), 95000);
  assert.equal(pay(B, 800000), 95000 + 0.18 * 400000);
});

test("exclusion shrinks the paid production in plus mode too", () => {
  const o = { ...B, excl: 20, threshold: 300000 };
  assert.equal(pay(o, 800000), 95000 + 0.18 * (640000 - 300000));
});

test("total comp spreads sign-on and adds recurring extras", () => {
  assert.ok(Math.abs(totalComp(A, 800000, 3) - (158400 + 3000 + 10000 / 3)) < 1e-6);
});

test("startsPayingAt: base over share, or threshold over kept share", () => {
  assert.ok(Math.abs(startsPayingAt(A) - 120000 / 0.198) < 1e-6);
  assert.ok(Math.abs(startsPayingAt({ ...B, excl: 20 }) - 400000 / 0.8) < 1e-6);
  assert.equal(startsPayingAt(S), null);
});

test("productionForCash inverts pay above the base", () => {
  assert.equal(productionForCash(A, 100000), 0);
  for (const o of [A, B]) {
    const w = productionForCash(o, 200000);
    assert.ok(Math.abs(pay(o, w) - 200000) < 1e-6);
  }
  assert.equal(productionForCash(S, 200000), null);
});

test("two crossovers on the sample, at hand-computed volumes", () => {
  const c = crossovers(A, B, 3, 2000000);
  assert.equal(c.length, 2);
  // A flat 126333.33 vs B 0.18w + 23000 -> w = 103333.33/0.18
  assert.ok(Math.abs(c[0] - 103333.333 / 0.18) < 5);
  // 0.198w + 6333.33 = 0.18w + 23000 -> w = 16666.67/0.018
  assert.ok(Math.abs(c[1] - 16666.667 / 0.018) < 5);
});

test("analyze on the sample: B ahead by $2,267 at 800k, exclusion flagged", () => {
  const r = analyze(sampleInput());
  assert.equal(r.error, null);
  assert.equal(Math.round(r.detail[0].cash), 158400);
  assert.equal(Math.round(r.detail[1].cash), 167000);
  assert.equal(r.scenarios.find((s) => s.label === "Your expected production").winner, "B");
  assert.ok(r.findings.some((f) => /really 19\.8%/.test(f.title)));
  assert.equal(r.crossovers.length, 2);
  assert.ok(Math.abs(r.detail[0].hourly - r.detail[0].total / (45 * 48)) < 1e-9);
});

test("production below the overtake point is reported as base only", () => {
  const r = analyze({ ...sampleInput(), prod: "500000" });
  assert.equal(r.detail[0].onBase, true);
  assert.ok(r.findings.some((f) => /Offer A: at your expected production you are paid the base only/.test(f.title)));
});

test("bad input returns an error, not a result", () => {
  assert.match(analyze({ ...sampleInput(), prod: "" }).error, /production/);
  assert.match(analyze({ ...sampleInput(), baseA: "x" }).error, /Offer A/);
  assert.match(analyze({ ...sampleInput(), pctB: "0" }).error, /Offer B/);
  assert.match(analyze({ ...sampleInput(), pctA: "150" }).error, /Offer A/);
  assert.match(analyze({ ...sampleInput(), exclA: "100" }).error, /Offer A/);
  assert.match(analyze({ ...sampleInput(), modeB: "salary", baseB: "" }).error, /Offer B/);
});

test("csv has a header and one row per scenario", () => {
  const r = analyze(sampleInput());
  assert.equal(reportCsv(r).trim().split("\n").length, 1 + r.scenarios.length);
});
