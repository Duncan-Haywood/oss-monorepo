import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, savingsTax, taxFreeInterest, SAMPLE, summaryText } from "./calc.mjs";

test("basic-rate taxpayer: first £1,000 is free, rest at 20%", () => {
  const t = savingsTax(32000, 3200);
  assert.equal(t.psa, 1000);
  assert.equal(t.tax, 440);
});

test("higher-rate taxpayer: £500 allowance, rest at 40%", () => {
  const t = savingsTax(60000, 2000);
  assert.equal(t.psa, 500);
  assert.equal(t.tax, 600);
});

test("additional-rate taxpayer has no allowance and pays 45%", () => {
  const t = savingsTax(150000, 2000);
  assert.equal(t.psa, 0);
  assert.equal(t.tax, 900);
});

test("low earner: starting rate band plus the PSA", () => {
  // other 12,570 -> no PA left, taxable other 0, SRB 5,000 free, then PSA 1,000.
  const t = savingsTax(12570, 7000);
  assert.equal(t.startingUsed, 5000);
  assert.equal(t.psaUsed, 1000);
  assert.equal(t.tax, 200);
});

test("unused personal allowance covers interest first", () => {
  assert.equal(savingsTax(0, 12570).tax, 0);
  const t = savingsTax(0, 20000);
  // 12,570 PA, 5,000 SRB, 1,000 PSA, 1,430 at 20%
  assert.equal(t.tax, 286);
});

test("tax-free interest ceiling is consistent with savingsTax", () => {
  for (const other of [0, 10000, 12570, 15000, 30000, 50270, 60000, 110000, 150000]) {
    const f = taxFreeInterest(other);
    assert.ok(savingsTax(other, f).tax <= 0.01, `other ${other}`);
    assert.ok(savingsTax(other, f + 50).tax > 0, `other ${other}`);
  }
});

test("compute validates input and sample runs", () => {
  assert.ok(compute({ otherIncome: "x", interest: "1" }).errors.length > 0);
  assert.ok(compute({ otherIncome: "1", interest: "-5" }).errors.length > 0);
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tax, 440);
  assert.equal(r.netInterest, 2760);
  assert.match(summaryText(r), /Tax due: £440\.00/);
  assert.ok(r.potFree > 0 && r.potFree < 70000);
});

test("zero interest is zero tax", () => {
  const r = compute({ otherIncome: "40000", interest: "", savingsPot: "", aer: "" });
  assert.equal(r.tax, 0);
  assert.equal(r.effective, 0);
});
