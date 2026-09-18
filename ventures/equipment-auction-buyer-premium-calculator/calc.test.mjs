import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAuction, DEFAULTS } from './calc.mjs';

function close(actual, expected, epsilon = 0.02) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be close to ${expected}`);
}

test('default worked example: cap binds, no online bid, no card, taxable', () => {
  const result = analyzeAuction(DEFAULTS);
  assert.equal(result.uncappedPremium, 4500);
  assert.equal(result.capApplies, true);
  assert.equal(result.buyerPremium, 2500);
  assert.equal(result.onlinePremium, 0);
  assert.equal(result.purchasePrice, 47500);
  assert.equal(result.salesTax, 2850);
  assert.equal(result.docFee, 25);
  assert.equal(result.cardSurcharge, 0);
  assert.equal(result.total, 50375);
  close(result.effectiveCostPercent, 11.94);
  assert.ok(result.findings.some((f) => /cap applied/i.test(f.title)));
});

test('premium under the cap is charged at the full percentage, no cap finding', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 10000, buyerPremiumCap: 2500 });
  assert.equal(result.uncappedPremium, 1000);
  assert.equal(result.capApplies, false);
  assert.equal(result.buyerPremium, 1000);
  assert.ok(!result.findings.some((f) => /cap applied/i.test(f.title)));
});

test('a zero or blank cap never caps the premium', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 200000, buyerPremiumCap: 0 });
  assert.equal(result.capApplies, false);
  assert.equal(result.buyerPremium, 20000);
});

test('bidding online adds a separate, stacking premium', () => {
  const result = analyzeAuction({
    ...DEFAULTS, hammerPrice: 10000, buyerPremiumCap: 2500, biddingOnline: true, onlinePremiumPercent: 2.5,
  });
  assert.equal(result.onlinePremium, 250);
  assert.equal(result.purchasePrice, 10000 + 1000 + 250);
  assert.ok(result.findings.some((f) => /online-bidding premium/i.test(f.title)));
});

test('paying by card surcharges the whole invoice, not the hammer price', () => {
  const result = analyzeAuction({
    ...DEFAULTS, hammerPrice: 10000, buyerPremiumCap: 2500, payingByCard: true, cardSurchargePercent: 3,
  });
  // purchasePrice 11000, tax 660, invoice-before-card 11685, surcharge 3% of 11685
  assert.equal(result.salesTax, 660);
  close(result.cardSurcharge, 350.55);
  close(result.total, 11685 + 350.55);
  assert.ok(result.findings.some((f) => /card surcharge/i.test(f.title)));
});

test('tax exemption zeroes the tax line and fires a verify-eligibility finding', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 10000, buyerPremiumCap: 2500, taxExempt: true });
  assert.equal(result.salesTax, 0);
  assert.equal(result.total, 10000 + 1000 + 25);
  assert.ok(result.findings.some((f) => /exemption is assumed/i.test(f.title)));
  assert.ok(!result.findings.some((f) => /full purchase price/i.test(f.title)));
});

test('without exemption, the tax-base assumption is always disclosed', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 10000 });
  assert.ok(result.findings.some((f) => /full purchase price/i.test(f.title)));
});

test('max bid: solves back to the hammer price that produced the budget, cap not binding', () => {
  const terms = {
    hammerPrice: 0, buyerPremiumPercent: 10, buyerPremiumCap: 0, biddingOnline: false,
    payingByCard: false, taxExempt: false, taxRate: 6, docFee: 25,
  };
  // Forward: hammerPrice 10000 -> purchasePrice 11000, tax 660, total 11685.
  const result = analyzeAuction({ ...terms, maxBudget: 11685 });
  assert.ok(result.maxBid);
  close(result.maxBid.hammerPrice, 10000, 1);
  close(result.maxBid.total, 11685, 1);
  assert.equal(result.maxBid.unreachable, false);
});

test('max bid: solves correctly when the premium cap binds at the solved price', () => {
  // Forward at hammerPrice 45000 with the defaults' terms totals 50375
  // (see the first test above) and the cap binds there.
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 0, maxBudget: 50375 });
  assert.ok(result.maxBid);
  close(result.maxBid.hammerPrice, 45000, 1);
  assert.equal(result.maxBid.capApplies, true);
  close(result.maxBid.total, 50375, 1);
});

test('max bid: a budget too small for the fixed fees is reported unreachable, not negative', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 0, docFee: 500, maxBudget: 10 });
  assert.ok(result.maxBid);
  assert.equal(result.maxBid.hammerPrice, 0);
  assert.equal(result.maxBid.unreachable, true);
  assert.ok(result.findings.some((f) => /does not cover the fixed costs/i.test(f.title)));
});

test('no maxBudget entered means no max-bid section at all', () => {
  const result = analyzeAuction({ ...DEFAULTS, maxBudget: 0 });
  assert.equal(result.maxBid, null);
});

test('effectiveCostPercent is 0 when the hammer price is 0, never NaN or Infinity', () => {
  const result = analyzeAuction({ ...DEFAULTS, hammerPrice: 0 });
  assert.equal(result.effectiveCostPercent, 0);
});

test('blank and non-numeric fields fall back to defaults or zero rather than producing NaN', () => {
  const result = analyzeAuction({ hammerPrice: '', buyerPremiumCap: 'nope', taxRate: undefined });
  assert.ok(Number.isFinite(result.total));
  assert.ok(Number.isFinite(result.effectiveCostPercent));
});
