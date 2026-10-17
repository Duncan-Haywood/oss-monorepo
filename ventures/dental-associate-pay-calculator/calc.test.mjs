import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseNum, pay, commission, guaranteeBreakeven, sampleInput, reportCsv } from "./calc.mjs";

const ctx = { days: 200, collectRate: 0.98, labRate: 0.07, stayYears: 3 };
const off = (o) => ({ pct: 0.3, basis: "production", guaranteeDay: 0, labShare: 0, signOn: 0, other: 0, ...o });

test("parseNum handles money, percents and blanks", () => {
  assert.equal(parseNum("$1,250"), 1250);
  assert.equal(parseNum("30%"), 30);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("percentage of production, no lab, no guarantee", () => {
  assert.equal(pay(off({}), ctx, 700000), 210000);
});

test("collections basis multiplies by the collection rate", () => {
  assert.ok(Math.abs(pay(off({ basis: "collections" }), ctx, 700000) - 0.3 * 700000 * 0.98) < 1e-6);
});

test("lab share comes off the base before the percentage", () => {
  // 700000 - 700000*0.07*0.5 = 675500; x 30% = 202650
  assert.ok(Math.abs(commission(off({ labShare: 0.5 }), ctx, 700000) - 202650) < 1e-6);
});

test("guarantee is a floor: greater of guarantee and commission", () => {
  const o = off({ guaranteeDay: 600 }); // 120000 floor
  assert.equal(pay(o, ctx, 100000), 120000);
  assert.equal(pay(o, ctx, 700000), 210000);
});

test("guarantee breakeven production", () => {
  assert.equal(guaranteeBreakeven(off({ guaranteeDay: 600 }), ctx), 400000);
  assert.equal(guaranteeBreakeven(off({}), ctx), 0);
});

test("analyze sample: guarantee finding, lab finding, crossover, scenarios", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, null);
  assert.equal(a.scenarios.length, 8);
  assert.equal(a.detail.length, 2);
  // A: collections 686000 - 24500 lab = 661500 x 30% = 198450 > guarantee 120000
  assert.ok(Math.abs(a.detail[0].cash - 198450) < 1e-6);
  // B: 700000 - 49000 lab = 651000 x 33% = 214830
  assert.ok(Math.abs(a.detail[1].cash - 214830) < 1e-6);
  assert.ok(a.findings.some((f) => /lab fees cost you/.test(f.title)));
  assert.ok(a.findings.some((f) => /collections, not production/.test(f.title)));
  assert.ok(a.crossovers.length === 0 || a.crossovers.every((x) => x > 0));
});

test("guarantee active finding and crossover found", () => {
  const raw = { ...sampleInput(), prod: "300000" };
  const a = analyze(raw);
  assert.ok(a.detail[0].guaranteeActive);
  assert.ok(a.findings.some((f) => /paid the guarantee/.test(f.title)));
  assert.ok(a.crossovers.length >= 1);
  const x = a.crossovers[0];
  const again = analyze({ ...raw, prod: String(x) });
  assert.ok(Math.abs(again.detail[0].total - again.detail[1].total) < 50);
});

test("validation", () => {
  assert.match(analyze({ ...sampleInput(), prod: "" }).error, /net production/);
  assert.match(analyze({ ...sampleInput(), pctA: "0", guaranteeDayA: "" }).error, /Offer A/);
  assert.match(analyze({ ...sampleInput(), collectRate: "150" }).error, /Collection rate/);
  assert.match(analyze({ ...sampleInput(), labShareA: "120" }).error, /lab share/);
});

test("csv has a header and one row per scenario", () => {
  const rows = reportCsv(analyze(sampleInput())).trim().split("\n");
  assert.equal(rows.length, 9);
});
