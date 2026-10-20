import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 850,000 net estate with both bands owes 140,000", () => {
  const r = run({});
  // net 850,000 - NRB 325,000 - RNRB 175,000 = 350,000 at 40%
  assert.equal(r.net, 850000);
  assert.equal(r.taxable, 350000);
  assert.equal(r.tax, 140000);
  assert.equal(r.effective, 16.47);
});

test("no home to descendants means no residence band", () => {
  const r = run({ homeToDescendants: "no" });
  assert.equal(r.rnrb, 0);
  assert.equal(r.tax, (850000 - 325000) * 0.4);
});

test("residence band is capped at the home value", () => {
  const r = run({ home: 100000 });
  assert.equal(r.rnrb, 100000);
});

test("taper: 2.2m net loses 100,000 of the residence band; 2.35m loses all of it", () => {
  const a = run({ assets: 2200000, debts: 0, home: 800000 });
  assert.equal(a.taperLoss, 100000);
  assert.equal(a.rnrb, 75000);
  const b = run({ assets: 2350000, debts: 0, home: 800000 });
  assert.equal(b.rnrb, 0);
});

test("transferred bands from a late spouse double the allowances", () => {
  const r = run({ unusedNrb: 100, unusedRnrb: 100, assets: 1000000, debts: 0, home: 600000 });
  assert.equal(r.nrb, 650000);
  assert.equal(r.rnrb, 350000);
  assert.equal(r.tax, 0);
});

test("spouse exemption removes the amount from tax", () => {
  const r = run({ assets: 1000000, debts: 0, spouse: 1000000, home: 0, homeToDescendants: "no" });
  assert.equal(r.tax, 0);
});

test("charity gift of 10% of baseline lowers rate to 36%", () => {
  // net 1,000,000, baseline = 675,000, 10% = 67,500
  const at = run({ assets: 1000000, debts: 0, home: 0, homeToDescendants: "no", charity: 67500 });
  assert.equal(at.reduced, true);
  assert.equal(at.rate, 0.36);
  assert.equal(at.taxable, 1000000 - 67500 - 325000);
  const below = run({ assets: 1000000, debts: 0, home: 0, homeToDescendants: "no", charity: 67499 });
  assert.equal(below.reduced, false);
  assert.equal(below.rate, 0.4);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(parse({ ...SAMPLE, assets: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, assets: -5 }).errors.length);
  assert.ok(parse({ ...SAMPLE, debts: 5000000 }).errors.length);
  assert.ok(parse({ ...SAMPLE, home: 5000000 }).errors.length);
  assert.ok(parse({ ...SAMPLE, unusedNrb: 150 }).errors.length);
  assert.ok(parse({ ...SAMPLE, spouse: 900000 }).errors.length);
  assert.deepEqual(compute({}).errors.length > 0, true);
});

test("summary names the source and disclaims advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});

test("gifts in the last 7 years use up the nil-rate band first", () => {
  const base = compute({ ...SAMPLE, assets: 1000000, debts: 0, home: 0, homeToDescendants: "no" });
  const gifted = compute({ ...SAMPLE, assets: 1000000, debts: 0, home: 0, homeToDescendants: "no", gifts: 100000 });
  assert.equal(gifted.tax - base.tax, 40000);
  assert.equal(compute({ ...SAMPLE, gifts: -1 }).errors.length > 0, true);
});

test("pensions count in the estate only for deaths on or after 6 April 2027", () => {
  const base = { ...SAMPLE, assets: 800000, debts: 0, home: 0, homeToDescendants: "no", pension: 200000 };
  const before = compute({ ...base, pensionIn: "no" });
  const after = compute({ ...base, pensionIn: "yes" });
  assert.equal(after.tax - before.tax, 80000);
  assert.ok(before.findings.some((f) => f.title.includes("left out because the death is before")));
  assert.equal(compute({ ...SAMPLE, pension: "abc" }).errors.length > 0, true);
});
