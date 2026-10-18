import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeMonthProfit, incomeGap, priceForProfit, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.effectiveSellerFeePct, 9);
  close(r.sellerFeeAmount, 13.5);
  close(r.paymentProcessingFeeAmount, 4.5);
  close(r.totalFees, 24);
  close(r.netPayout, 126);
  close(r.netProfit, 26);
  close(r.effectiveFeeRatePct, 16);
  close(r.profitMarginPct, 17.3333, 0.01);
  close(r.roiPct, 26);
});

test('other per-sale costs come straight off net profit, like shipping and unlike a fee', () => {
  const base = calculate(DEFAULTS);
  const withSupplies = calculate({ ...DEFAULTS, otherCost: 2.5 });
  close(withSupplies.otherCost, 2.5);
  close(withSupplies.sellerFeeAmount, base.sellerFeeAmount, 0.0001);
  close(withSupplies.paymentProcessingFeeAmount, base.paymentProcessingFeeAmount, 0.0001);
  close(withSupplies.totalFees, base.totalFees + 2.5);
  close(withSupplies.netPayout, base.netPayout - 2.5);
  close(withSupplies.netProfit, base.netProfit - 2.5);
});

test('an input that predates the other-cost field prices exactly as it did before', () => {
  // The field defaults to 0 and is optional on the way in, so a saved draft
  // or a shared link written before it existed must not arrive as NaN.
  const { otherCost, ...older } = DEFAULTS;
  const r = calculate(older);
  assert.equal(Number.isFinite(r.netProfit), true);
  close(r.netProfit, calculate(DEFAULTS).netProfit);
  close(r.otherCost, 0);
});

test('a negative other-cost is refused rather than paying the seller to ship', () => {
  assert.throws(() => calculate({ ...DEFAULTS, otherCost: -1 }), /Other per-sale costs/);
});

test('other per-sale costs eat a bigger share of a cheap sale than a dear one', () => {
  // The same arithmetic the page already makes about shipping, and the reason
  // the bucket is a dollar figure rather than a percentage.
  const cheap = calculate({ ...DEFAULTS, salePrice: 40, itemCostBasis: 20, otherCost: 3 });
  const dear = calculate({ ...DEFAULTS, salePrice: 400, itemCostBasis: 200, otherCost: 3 });
  const cheapNoSupplies = calculate({ ...DEFAULTS, salePrice: 40, itemCostBasis: 20, otherCost: 0 });
  const dearNoSupplies = calculate({ ...DEFAULTS, salePrice: 400, itemCostBasis: 200, otherCost: 0 });
  assert.ok(
    cheap.effectiveFeeRatePct - cheapNoSupplies.effectiveFeeRatePct
      > dear.effectiveFeeRatePct - dearNoSupplies.effectiveFeeRatePct,
  );
});

test('a Fast Shipping discount reduces the effective seller fee and raises net profit', () => {
  const withoutDiscount = calculate(DEFAULTS);
  const withDiscount = calculate({ ...DEFAULTS, sellerFeePct: 4, fastShippingDiscountPct: 1 });
  close(withDiscount.effectiveSellerFeePct, 3);
  close(withDiscount.sellerFeeAmount, 4.5);
  close(withDiscount.netProfit, 35);
  assert.ok(withDiscount.netProfit > withoutDiscount.netProfit);
});

test('a Fast Shipping discount larger than the seller fee clamps at zero rather than going negative', () => {
  const r = calculate({ ...DEFAULTS, sellerFeePct: 3, fastShippingDiscountPct: 10 });
  assert.equal(r.effectiveSellerFeePct, 0);
  assert.equal(r.sellerFeeAmount, 0);
});

test('a zero sale price still charges the flat shipping cost, and percentage-of-price outputs are null-safe', () => {
  const r = calculate({ ...DEFAULTS, salePrice: 0 });
  assert.equal(r.sellerFeeAmount, 0);
  assert.equal(r.paymentProcessingFeeAmount, 0);
  close(r.totalFees, DEFAULTS.shippingCost);
  close(r.netPayout, -DEFAULTS.shippingCost);
  close(r.netProfit, -DEFAULTS.shippingCost - DEFAULTS.itemCostBasis);
  assert.equal(r.effectiveFeeRatePct, null, 'cannot express a rate of a zero sale price');
  assert.equal(r.profitMarginPct, null, 'cannot express a margin of a zero sale price');
  assert.ok(r.roiPct < 0, 'ROI is still computable against a nonzero cost basis');
});

test('a zero item cost basis makes ROI null-safe without dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, itemCostBasis: 0 });
  assert.equal(r.roiPct, null);
  assert.ok(r.netProfit > 0, 'net profit is still a real number with no cost basis entered');
});

test('a wider seller fee lowers net profit by exactly the extra fee percentage times the sale price', () => {
  const low = calculate({ ...DEFAULTS, sellerFeePct: 9 });
  const high = calculate({ ...DEFAULTS, sellerFeePct: 12 });
  close(low.netProfit - high.netProfit, DEFAULTS.salePrice * 0.03);
});

test('shipping cost matters proportionally more on a cheap item than an expensive one', () => {
  const cheap = calculate({ ...DEFAULTS, salePrice: 40 });
  const expensive = calculate({ ...DEFAULTS, salePrice: 400 });
  const cheapShipShare = DEFAULTS.shippingCost / 40;
  const expensiveShipShare = DEFAULTS.shippingCost / 400;
  assert.ok(cheapShipShare > expensiveShipShare);
  close(cheap.effectiveFeeRatePct - (cheap.effectiveSellerFeePct + DEFAULTS.paymentProcessingFeePct), cheapShipShare * 100, 0.01);
});

test('rejects a negative sale price', () => {
  assert.throws(() => calculate({ ...DEFAULTS, salePrice: -1 }), /sale price/i);
});

test('rejects a negative item cost basis', () => {
  assert.throws(() => calculate({ ...DEFAULTS, itemCostBasis: -1 }), /item cost basis/i);
});

test('rejects a seller fee percentage above 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, sellerFeePct: 101 }), /seller fee percentage/i);
});

test('rejects a payment processing percentage above 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, paymentProcessingFeePct: 150 }), /payment processing fee percentage/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, salePrice: 'a lot' }), /sale price/i);
});

test('computeMonthProfit sums net profit across sales and averages it', () => {
  const month = computeMonthProfit([{ netProfit: 26 }, { netProfit: 35 }, { netProfit: -8 }]);
  assert.equal(month.totalMonthlyProfit, 53);
  assert.equal(month.saleCount, 3);
  close(month.averageProfitPerSale, 53 / 3);
});

test('computeMonthProfit on an empty month returns zero without dividing by zero', () => {
  const month = computeMonthProfit([]);
  assert.equal(month.totalMonthlyProfit, 0);
  assert.equal(month.saleCount, 0);
  assert.equal(month.averageProfitPerSale, 0);
});

test('incomeGap reports the shortfall and sales needed to close it', () => {
  const gap = incomeGap(1000, 700, 35);
  assert.equal(gap.gap, 300);
  assert.equal(gap.additionalSalesNeeded, 9);
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap reports goal met with zero additional sales needed once profit clears the target', () => {
  const gap = incomeGap(500, 620, 35);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalSalesNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap cannot compute additional sales needed when the average profit per sale is zero or negative', () => {
  const gap = incomeGap(1000, 0, 0);
  assert.equal(gap.additionalSalesNeeded, null);
  assert.equal(gap.meetsTarget, false);
});

test('priceForProfit() inverts calculate(): selling at the returned price nets the target', () => {
  for (const extra of [{}, { otherCost: 2.5 }, { fastShippingDiscountPct: 1.5, sellerFeePct: 8 }]) {
    const input = { ...DEFAULTS, ...extra };
    for (const target of [0, 20, 75.5]) {
      const price = priceForProfit(input, target);
      close(calculate({ ...input, salePrice: price }).netProfit, target, 0.0001);
    }
  }
});

test('priceForProfit() default break-even on the default inputs is (100 + 6) / 0.88', () => {
  close(priceForProfit(DEFAULTS), 106 / 0.88, 0.0001);
});

test('priceForProfit() is null when the percentage fees take the whole price', () => {
  assert.equal(priceForProfit({ ...DEFAULTS, sellerFeePct: 100, fastShippingDiscountPct: 0 }, 10), null);
  assert.equal(priceForProfit({ ...DEFAULTS, sellerFeePct: 60, paymentProcessingFeePct: 40, fastShippingDiscountPct: 0 }), null);
});
