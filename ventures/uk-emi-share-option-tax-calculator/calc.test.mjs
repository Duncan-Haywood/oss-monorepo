import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, incomeTax, personalAllowance, capitalGainsTax } from "./calc.mjs";

const base = { options: "", strike: "", grantValue: "", salePrice: "", income: "", months: "", badrUsed: "", aeaUsed: "", year: "2025" };

test("personal allowance tapers away between 100k and 125,140", () => {
  assert.equal(personalAllowance(50000), 12570);
  assert.equal(personalAllowance(110000), 12570 - 5000);
  assert.equal(personalAllowance(125140), 0);
  assert.equal(personalAllowance(200000), 0);
});

test("income tax: basic, higher and additional bands", () => {
  assert.equal(incomeTax(12570), 0);
  assert.equal(incomeTax(50270), 7540);
  assert.equal(Math.round(incomeTax(150000)), 53703);
});

test("worked example: discount taxed as income, BADR on the rest", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.emi.discount, 9000);
  assert.equal(r.emi.itOnDiscount, 3600);
  assert.equal(r.emi.gain, 40000);
  assert.equal(Math.round(r.emi.cgt.tax), 5180);
  assert.equal(Math.round(r.emi.net), 40220);
  assert.equal(r.badrOk, true);
});

test("missing the 24 months pushes the gain to 24%", () => {
  const r = compute({ ...SAMPLE, months: "18" });
  assert.equal(r.badrOk, false);
  assert.equal(Math.round(r.emi.cgt.tax), 8880);
  assert.ok(r.findings.some((f) => /Waiting until month 24 would save about £3,700/.test(f.title)));
});

test("no discount when exercise price is at market value", () => {
  const r = compute({ ...SAMPLE, strike: "1.00" });
  assert.equal(r.emi.discount, 0);
  assert.equal(r.emi.itOnDiscount, 0);
  assert.equal(r.emi.gain, 40000);
});

test("a sale below grant value only taxes the lower value as income", () => {
  const r = compute({ ...SAMPLE, salePrice: "0.50" });
  assert.equal(r.emi.discount, 4000);
  assert.equal(r.emi.gain, 0);
  assert.equal(r.emi.cgt.tax, 0);
});

test("unapproved comparison taxes the whole spread as income", () => {
  const r = compute({ ...base, options: "10000", strike: "1", grantValue: "1", salePrice: "3", income: "60000", months: "30" });
  assert.equal(r.unapprovedTax, 8000);
  assert.ok(r.emiSaving > 0);
});

test("BADR lifetime limit spills the excess to ordinary rates", () => {
  const r = compute({ ...base, options: "1000000", strike: "0", grantValue: "0", salePrice: "2", income: "100000", months: "36" });
  assert.equal(r.emi.cgt.badrGain, 1000000);
  assert.ok(r.emi.gain > 1000000);
  assert.ok(r.findings.some((f) => /exceeds the £1m/.test(f.title)));
});

test("annual exempt amount comes off the ordinary-rate gain first", () => {
  const c = capitalGainsTax({ gain: 10000, incomeAfter: 20000, badrEligible: false, badrRate: 0.14 });
  assert.equal(c.taxableOther, 7000);
  assert.equal(c.tax, 7000 * 0.18);
});

test("2026/27 uses the 18% BADR rate", () => {
  const a = compute({ ...SAMPLE, year: "2025" });
  const b = compute({ ...SAMPLE, year: "2026" });
  assert.ok(b.emi.cgt.tax > a.emi.cgt.tax);
  assert.equal(Math.round(b.emi.cgt.badrTax), 6660);
});

test("scenarios scale the sale price and grow net with it", () => {
  const r = compute(SAMPLE);
  assert.equal(r.scenarios.length, 5);
  assert.equal(r.scenarios[1].price, 5);
  assert.ok(r.scenarios[4].net > r.scenarios[0].net);
});

test("bad input is rejected", () => {
  assert.ok(compute({ ...SAMPLE, options: "-1" }).errors.length);
  assert.ok(compute({ ...SAMPLE, options: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: "1999" }).errors.length);
});

test("summary names the numbers", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /You keep: £40,220/);
  assert.match(t, /Not tax advice/);
});
