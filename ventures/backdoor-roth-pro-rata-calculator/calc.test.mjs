import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS_2026,
  money,
  iraLimitFor,
  proRata,
  backdoorRothOutcome,
} from "./calc.mjs";

function close(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

test("2026 IRA limits are the documented figures", () => {
  assert.equal(LIMITS_2026.iraContribution, 7_500);
  assert.equal(LIMITS_2026.iraCatchUp50, 1_100);
  assert.equal(iraLimitFor(49), 7_500);
  assert.equal(iraLimitFor(50), 8_600);
});

test("clean backdoor: no other IRA money means a fully tax-free conversion", () => {
  const r = proRata({ nondeductibleContribution: 7_500, conversion: 7_500, yearEndIraValue: 0 });
  assert.equal(r.ratio, 1);
  assert.equal(r.taxableConversion, 0);
  assert.equal(r.nontaxableConversion, 7_500);
  assert.equal(r.basisCarriedForward, 0);
});

test("textbook pro-rata: $7,500 basis, $92,500 pre-tax IRA left, $7,500 converted", () => {
  const r = proRata({ nondeductibleContribution: 7_500, conversion: 7_500, yearEndIraValue: 92_500 });
  close(r.ratio, 0.075, 1e-9);
  close(r.nontaxableConversion, 562.5);
  close(r.taxableConversion, 6_937.5);
  close(r.basisCarriedForward, 6_937.5);
});

test("the form's ratio rounds up to three places and never exceeds 1.000", () => {
  const r = proRata({ nondeductibleContribution: 1, conversion: 3, yearEndIraValue: 0 });
  assert.equal(r.formRatio, 0.334);
  const big = proRata({ nondeductibleContribution: 50_000, conversion: 1_000, yearEndIraValue: 0 });
  assert.equal(big.ratio, 1);
  assert.equal(big.formRatio, 1);
});

test("prior-year basis counts toward the ratio", () => {
  const r = proRata({ nondeductibleContribution: 0, priorBasis: 20_000, conversion: 10_000, yearEndIraValue: 90_000 });
  close(r.ratio, 0.2, 1e-9);
  close(r.nontaxableConversion, 2_000);
  close(r.taxableConversion, 8_000);
  close(r.basisCarriedForward, 18_000);
});

test("ordinary distributions share the same ratio", () => {
  const r = proRata({ nondeductibleContribution: 10_000, otherDistributions: 10_000, conversion: 10_000, yearEndIraValue: 80_000 });
  close(r.ratio, 0.1, 1e-9);
  close(r.taxableDistributions, 9_000);
  close(r.taxableConversion, 9_000);
  close(r.taxableTotal, 18_000);
});

test("nothing anywhere yields a zero ratio and no NaN", () => {
  const r = proRata({});
  assert.equal(r.ratio, 0);
  assert.equal(r.taxableConversion, 0);
  assert.ok(Number.isFinite(r.basisCarriedForward));
});

test("negative and garbage inputs are clamped, not propagated", () => {
  const r = proRata({ nondeductibleContribution: -5, conversion: "abc", yearEndIraValue: NaN });
  assert.equal(r.taxableConversion, 0);
  assert.equal(r.basis, 0);
});

test("outcome: tax at the marginal rate and the avoidable part", () => {
  const o = backdoorRothOutcome({ nondeductibleContribution: 7_500, conversion: 7_500, yearEndIraValue: 92_500, marginalRate: 24, age: 40 });
  close(o.taxableConversion, 6_937.5);
  close(o.estimatedTax, 1_665);
  close(o.cleanTaxableConversion, 0);
  close(o.proRataExtraTaxable, 6_937.5);
  close(o.proRataTaxCost, 1_665);
  assert.ok(o.findings.some((f) => f.severity === "high" && /taxable/.test(f.title)));
  assert.ok(o.findings.some((f) => /401\(k\)/.test(f.title)));
});

test("outcome: a clean backdoor gets the tax-free finding and no rollover advice", () => {
  const o = backdoorRothOutcome({ nondeductibleContribution: 7_500, conversion: 7_500, marginalRate: 32 });
  assert.equal(o.taxableConversion, 0);
  assert.ok(o.findings.some((f) => /entirely tax-free/.test(f.title)));
  assert.ok(!o.findings.some((f) => /401\(k\)/.test(f.title)));
});

test("outcome: warns when the contribution exceeds the age-based limit", () => {
  const over = backdoorRothOutcome({ nondeductibleContribution: 8_000, conversion: 8_000, age: 40 });
  assert.ok(over.findings.some((f) => /above the 2026 IRA limit/.test(f.title)));
  const okAt50 = backdoorRothOutcome({ nondeductibleContribution: 8_000, conversion: 8_000, age: 55 });
  assert.ok(!okAt50.findings.some((f) => /above the 2026 IRA limit/.test(f.title)));
});

test("outcome: basis left inside the IRA is not treated as rollable pre-tax money", () => {
  // $10,000 basis, only $4,000 converted: $6,000 of basis stays in the IRA.
  const o = backdoorRothOutcome({ nondeductibleContribution: 7_500, priorBasis: 2_500, conversion: 4_000, yearEndIraValue: 6_000 });
  assert.equal(o.taxableConversion, 0);
  assert.equal(o.proRataExtraTaxable, 0);
});

test("money formats dollars and cents", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.001), "$0.00");
});
