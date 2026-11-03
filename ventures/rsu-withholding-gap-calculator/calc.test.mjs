import { test } from "node:test";
import assert from "node:assert/strict";
import { rsuGap, incomeTax, taxableOf, supplementalWithholding, addlMedicareTax, marginalRate } from "./calc.mjs";

test("single, $180,000 salary + $100,000 vest: 22% flat withholding is $7,200.25 short", () => {
  const r = rsuGap({ filingStatus: "single", wages: 180000, vest: 100000 });
  // taxable before = 180,000 - 16,100 = 163,900; after = 263,900
  assert.equal(r.taxableBefore, 163900);
  assert.equal(r.taxableAfter, 263900);
  // 37,875 @24% + 54,450 @32% + 7,675 @35%
  assert.equal(r.federalTaxOnVest, 29200.25);
  assert.equal(r.federalWithheld, 22000);
  assert.equal(r.federalGap, 7200.25);
  assert.equal(r.marginalRate, 0.35);
  assert.deepEqual(r.layers.map((l) => l.rate), [0.24, 0.32, 0.35]);
  assert.equal(r.layers.reduce((s, l) => s + l.amount, 0), 100000);
});

test("low bracket: 22% flat over-withholds a vest taxed at 12%", () => {
  const r = rsuGap({ filingStatus: "single", wages: 30000, vest: 10000 });
  // taxable 13,900 -> 23,900, all inside the 12% bracket
  assert.equal(r.federalTaxOnVest, 1200);
  assert.equal(r.federalGap, -1000);
  assert.ok(r.findings.some((f) => /more than the vest adds/.test(f.title)));
});

test("37% mandatory rate applies only to the part over $1,000,000", () => {
  assert.equal(supplementalWithholding(1200000), 1000000 * 0.22 + 200000 * 0.37);
  assert.equal(supplementalWithholding(50000), 11000);
});

test("Additional Medicare Tax: joint filer over-withheld, single about right", () => {
  const j = rsuGap({ filingStatus: "mfj", wages: 220000, vest: 100000 });
  // total 0.9% x (320,000-250,000) = 630; employer withholds 0.9% x 120,000 = 1,080
  assert.equal(j.medicareTotal, 630);
  assert.equal(j.medicareWithheld, 1080);
  assert.equal(j.medicareGap, -450);
  const s = rsuGap({ filingStatus: "single", wages: 220000, vest: 100000 });
  assert.equal(s.medicareGap, 0);
  assert.equal(addlMedicareTax(100000, "single"), 0);
});

test("custom withholding rate and state rates feed the gap", () => {
  const r = rsuGap({ filingStatus: "single", wages: 180000, vest: 100000, withholdingRate: 0.35, stateRate: 0.093, stateWithheldRate: 0.1023 });
  assert.equal(r.federalWithheld, 35000);
  assert.equal(r.stateGap, -930);
});

test("safe harbor: prior-year tax lowers the target, and paychecks convert the gap", () => {
  const strict = rsuGap({ filingStatus: "single", wages: 180000, vest: 100000 });
  assert.equal(strict.safeHarborMet, false);
  const eased = rsuGap({ filingStatus: "single", wages: 180000, vest: 100000, priorYearTax: 20000, paychecksLeft: 10 });
  assert.equal(eased.safeHarborMet, true);
  assert.equal(eased.extraPerPaycheck, 720.03);
});

test("invalid input and helpers", () => {
  assert.equal(rsuGap({ vest: 0 }).invalid, true);
  assert.equal(incomeTax(50400, "single"), 5800);
  assert.equal(marginalRate(100000, "single"), 0.22);
});

test("layers carry the tax on each slice of the vest", () => {
  const r = rsuGap({ filingStatus: "single", wages: 180000, vest: 100000 });
  assert.deepEqual(r.layers.map((l) => l.amount), [37875, 54450, 7675]);
  assert.deepEqual(r.layers.map((l) => l.tax), [9090, 17424, 2686.25]);
});

test("bracket edge and head-of-household deduction", () => {
  // the dollar above the top-35% mfj edge is taxed at 37%, not 35%
  assert.ok(Math.abs(incomeTax(768701, "mfj") - incomeTax(768700, "mfj") - 0.37) < 1e-6);
  assert.equal(taxableOf(100000, "hoh"), 100000 - 24150);
});

test("no Additional Medicare finding when neither total nor withheld is positive", () => {
  const r = rsuGap({ filingStatus: "single", wages: 50000, vest: 10000 });
  assert.equal(r.medicareTotal, 0);
  assert.equal(r.medicareWithheld, 0);
  assert.ok(!r.findings.some((f) => /Additional Medicare/.test(f.title)));
});
