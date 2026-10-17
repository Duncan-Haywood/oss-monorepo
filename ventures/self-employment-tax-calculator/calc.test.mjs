import { test } from "node:test";
import assert from "node:assert/strict";
import { selfEmploymentTax, SS_WAGE_BASE } from "./calc.mjs";

const close = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("$100,000 profit, no W-2: 92.35% x 15.3%", () => {
  const r = selfEmploymentTax({ netProfit: 100000 });
  close(r.netEarnings, 92350);
  close(r.socialSecurity, 11451.4);
  close(r.medicare, 2678.15);
  close(r.seTax, 14129.55);
  close(r.halfDeduction, 7064.78, 0.02);
  close(r.effectiveRate, 0.1413, 0.0001);
  assert.equal(r.additionalMedicare, 0);
});

test("below the $400 net earnings threshold owes no SE tax", () => {
  const r = selfEmploymentTax({ netProfit: 430 }); // 397.1 net earnings
  assert.equal(r.seTax, 0);
  assert.ok(r.findings.some((f) => /\$400/.test(f.title)));
  assert.equal(selfEmploymentTax({ netProfit: 434 }).seTax > 0, true); // 400.8
});

test("income above the wage base only pays Medicare on the excess", () => {
  const r = selfEmploymentTax({ netProfit: 300000 });
  close(r.socialSecurity, SS_WAGE_BASE * 0.124);
  close(r.medicare, 300000 * 0.9235 * 0.029);
  close(r.marginalSeRate, 0.9235 * 0.029, 0.0001);
});

test("W-2 wages use up the Social Security wage base first", () => {
  const r = selfEmploymentTax({ netProfit: 50000, w2Wages: 160000 });
  const room = SS_WAGE_BASE - 160000; // 24,500
  close(r.socialSecurity, room * 0.124);
  assert.ok(r.findings.some((f) => /wage base/.test(f.title)));
  // wages over the base leave no Social Security room at all
  assert.equal(selfEmploymentTax({ netProfit: 50000, w2Wages: 200000 }).socialSecurity, 0);
});

test("Additional Medicare Tax: threshold reduced by wages, per filing status", () => {
  // single, $250k profit: net earnings 230,875 -> (230,875 - 200,000) x 0.9%
  close(selfEmploymentTax({ netProfit: 250000 }).additionalMedicare, 277.88, 0.02);
  // joint threshold is higher
  close(selfEmploymentTax({ netProfit: 250000, filingStatus: "mfj" }).additionalMedicare, 0);
  // wages of 150k cut the SE room to 50k: (92,350 - 50,000) x 0.9%
  close(selfEmploymentTax({ netProfit: 100000, w2Wages: 150000 }).additionalMedicare, 381.15, 0.02);
  // wages alone over the threshold also count
  close(selfEmploymentTax({ netProfit: 10000, w2Wages: 210000 }).additionalMedicare, 90 + 83.115, 0.02);
});

test("set-aside combines SE tax, additional Medicare and income tax", () => {
  const r = selfEmploymentTax({ netProfit: 100000, marginalRate: 0.22 });
  const expectedIncome = (100000 - r.seTax / 2) * 0.22;
  close(r.incomeTaxEstimate, expectedIncome, 0.05);
  close(r.totalSetAside, r.seTax + r.incomeTaxEstimate, 0.05);
  close(r.quarterlyPayment, r.totalSetAside / 4, 0.02);
});

test("zero, negative and garbage input is invalid rather than NaN", () => {
  for (const bad of [0, -5, "abc", undefined]) {
    assert.equal(selfEmploymentTax({ netProfit: bad }).invalid, true);
  }
  assert.equal(selfEmploymentTax().invalid, true);
});

test("S corporation prompt appears at higher profit only", () => {
  assert.ok(selfEmploymentTax({ netProfit: 120000 }).findings.some((f) => /S corporation/.test(f.title)));
  assert.ok(!selfEmploymentTax({ netProfit: 40000 }).findings.some((f) => /S corporation/.test(f.title)));
});

test("below $400 the result carries no Social Security amount and no SE-earnings Additional Medicare", () => {
  const r = selfEmploymentTax({ netProfit: 430 });
  assert.equal(r.socialSecurity, 0);
  assert.equal(r.medicare, 0);
  // Under $400 there are no SE earnings for Form 8959: only the wages over the threshold count.
  assert.equal(selfEmploymentTax({ netProfit: 100, w2Wages: 300000 }).additionalMedicare, 900);
});

test("exactly $400 of net earnings is taxed and gets no below-threshold notice", () => {
  const r = selfEmploymentTax({ netProfit: 400 / 0.9235 });
  assert.ok(r.seTax > 0);
  assert.ok(!r.findings.some((f) => /\$400/.test(f.title)));
});

test("wage-base finding appears only when the base is actually crossed", () => {
  const wage = (r) => r.findings.some((f) => /wage base/.test(f.title));
  assert.equal(wage(selfEmploymentTax({ netProfit: 50000 })), false);
  assert.equal(wage(selfEmploymentTax({ netProfit: 100 })), false); // under $400: not taxed at all
  assert.equal(wage(selfEmploymentTax({ netProfit: 300000 })), true);
});

test("S corporation prompt starts at exactly $80,000", () => {
  const s = (p) => selfEmploymentTax({ netProfit: p }).findings.some((f) => /S corporation/.test(f.title));
  assert.equal(s(80000), true);
  assert.equal(s(79999), false);
});
