import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, pay, totalComp, earnOutWrvu, wrvuForCash, crossovers, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const A = { base: 280000, threshold: 4800, cf: 52, signOn: 30000, other: 0 };
const B = { base: 320000, threshold: 0, cf: 0, signOn: 0, other: 0 };

test("parseNum strips currency formatting and rejects junk", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("pay is base plus incentive above the threshold only", () => {
  assert.equal(pay(A, 4000), 280000);
  assert.equal(pay(A, 4800), 280000);
  assert.equal(pay(A, 5200), 280000 + 400 * 52);
  assert.equal(pay(B, 9000), 320000);
});

test("total comp spreads the sign-on over the stay", () => {
  assert.equal(totalComp(A, 5200, 3), 280000 + 20800 + 10000);
});

test("earn-out is base over rate, null without a rate", () => {
  assert.ok(Math.abs(earnOutWrvu(A) - 280000 / 52) < 1e-9);
  assert.equal(earnOutWrvu(B), null);
});

test("wrvuForCash inverts pay above the base", () => {
  assert.equal(wrvuForCash(A, 250000), 0);
  const w = wrvuForCash(A, 300000);
  assert.ok(Math.abs(pay(A, w) - 300000) < 1e-6);
  assert.equal(wrvuForCash(B, 400000), null);
});

test("crossover lands where the two totals are equal", () => {
  const c = crossovers(A, B, 3, 13000);
  assert.equal(c.length, 1);
  assert.ok(Math.abs(totalComp(A, c[0], 3) - totalComp(B, c[0], 3)) < 50);
  // by hand: 280000 + (w-4800)*52 + 10000 = 320000  =>  w = 4800 + 30000/52
  assert.ok(Math.abs(c[0] - (4800 + 30000 / 52)) < 5);
});

test("analyze on the sample: B pays more at 5,200 wRVUs, no threshold gap", () => {
  const r = analyze(sampleInput());
  assert.equal(r.error, null);
  assert.equal(r.detail[0].cash, 300800);
  assert.equal(r.detail[1].cash, 320000);
  assert.equal(r.scenarios.find((s) => s.label === "Your expected volume").winner, "B");
  assert.ok(!r.findings.some((f) => /earned out/.test(f.title)));
});

test("a threshold above the base earn-out is flagged with the effective rate", () => {
  const r = analyze({ ...sampleInput(), thresholdA: "6000", wrvu: "6500" });
  const f = r.findings.find((x) => /earned out/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /Offer A/);
  assert.ok(r.detail[0].effectivePerWrvu < 52 * 1 + 50000);
  assert.equal(Math.round(r.detail[0].cash), 280000 + 500 * 52);
});

test("volume below the threshold is reported as a shortfall", () => {
  const r = analyze({ ...sampleInput(), wrvu: "4000" });
  assert.equal(r.detail[0].shortfall, 800);
  assert.ok(r.findings.some((f) => /below the incentive threshold/.test(f.title)));
});

test("bad input returns an error, not a result", () => {
  assert.match(analyze({ ...sampleInput(), wrvu: "" }).error, /wRVUs/);
  assert.match(analyze({ ...sampleInput(), baseA: "x" }).error, /Offer A/);
  assert.match(analyze({ ...sampleInput(), baseB: "0" }).error, /Offer B/);
});

test("csv has a header and one row per scenario", () => {
  const r = analyze(sampleInput());
  const lines = reportCsv(r).trim().split("\n");
  assert.equal(lines.length, 1 + r.scenarios.length);
});
