import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPreset,
  calculateOrder,
  expectedProfitAfterRefunds,
  PLAN_PRESETS,
  refundRateSweep,
} from "./calc.mjs";

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

test("computes Shopify Payments fees, profit, margin and ROI", () => {
  // $48 item + $6 shipping = $54 revenue. 2.9% + $0.30 = 1.866.
  // Cash: $14 goods + $5 label + $1 pack + $39/100 plan = $20.39.
  const r = calculateOrder({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
  });
  near(r.revenue, 54, "revenue");
  near(r.allocatedPlanCost, 0.39, "allocated plan");
  near(r.shopifyPayments.fees.shopifyPayments, 1.866, "Shopify Payments fee");
  near(r.shopifyPayments.feeTotal, 1.866, "Shopify Payments fee total");
  near(r.selected.cashInvested, 20.39, "cash invested");
  near(r.selected.profit, 54 - 1.866 - 20.39, "profit");
  near(r.selected.margin, ((54 - 1.866 - 20.39) / 54) * 100, "margin");
  near(r.selected.roi, ((54 - 1.866 - 20.39) / 20.39) * 100, "roi");
});

test("third-party path adds the Shopify transaction fee on top of the processor", () => {
  const r = calculateOrder({
    price: 100,
    shippingCharged: 0,
    shopifyTxnRate: 2,
    processorRate: 3.49,
    processorFixed: 0.49,
    paymentMethod: "third_party",
  });
  near(r.thirdParty.fees.shopifyThirdParty, 2, "Shopify third-party fee");
  near(r.thirdParty.fees.processor, 3.49 + 0.49, "processor fee");
  near(r.thirdParty.feeTotal, 5.98, "third-party fee total");
  assert.equal(r.selected.feeTotal, r.thirdParty.feeTotal);
});

test("reports how much more a third-party processor costs than Shopify Payments", () => {
  const r = calculateOrder({
    price: 50,
    shippingCharged: 0,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    shopifyTxnRate: 2,
    processorRate: 3.49,
    processorFixed: 0.49,
  });
  const shopifyFees = 50 * 0.029 + 0.3;
  const thirdPartyFees = 50 * 0.02 + 50 * 0.0349 + 0.49;
  near(r.extraCostVsShopifyPayments, thirdPartyFees - shopifyFees, "PayPal premium");
  assert.ok(r.extraCostVsShopifyPayments > 0, "third-party should cost more on Basic defaults");
});

test("break-even price makes profit exactly zero on the selected path", () => {
  const input = {
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
  };
  const r = calculateOrder(input);
  const atBreakEven = calculateOrder({ ...input, price: r.selected.breakEvenPrice });
  near(atBreakEven.selected.profit, 0, "profit at break-even");
});

test("calculates the item price required for a target net margin", () => {
  const input = {
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
    targetMargin: 40,
    paymentMethod: "shopify_payments",
  };
  const r = calculateOrder(input);
  const atTarget = calculateOrder({ ...input, price: r.selected.targetMarginPrice });
  near(atTarget.selected.margin, 40, "margin at target price");
});

test("reports an unreachable target margin when fees leave no margin room", () => {
  const r = calculateOrder({
    price: 10,
    paymentsRate: 80,
    targetMargin: 30,
    paymentMethod: "shopify_payments",
  });
  assert.equal(r.selected.targetMarginPrice, Infinity);
});

test("ROI is null when no cash was invested", () => {
  const r = calculateOrder({
    price: 20,
    costOfGoods: 0,
    shippingCost: 0,
    packagingCost: 0,
    otherCost: 0,
    monthlyPlan: 0,
  });
  assert.equal(r.selected.roi, null);
});

test("margin is zero rather than NaN when revenue is zero", () => {
  const r = calculateOrder({ price: 0, shippingCharged: 0 });
  assert.equal(r.selected.margin, 0);
});

test("applyPlanPreset fills illustrative Basic rates", () => {
  const filled = applyPlanPreset({ price: 40 }, "basic");
  assert.equal(filled.paymentsRate, PLAN_PRESETS.basic.paymentsRate);
  assert.equal(filled.shopifyTxnRate, 2);
  assert.equal(filled.monthlyPlan, 39);
});

test("rejects unknown plans and invalid inputs", () => {
  assert.throws(() => applyPlanPreset({}, "starter"), /Unknown Shopify plan/);
  assert.throws(() => calculateOrder({ price: -1 }), /Item price/);
  assert.throws(() => calculateOrder({ price: "abc" }), /Item price/);
  assert.throws(() => calculateOrder({ price: 10, targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateOrder({ price: 10, paymentMethod: "klarna" }), /Payment method/);
  assert.throws(
    () => calculateOrder({ price: 10, monthlyPlan: 39, monthlyOrders: 0 }),
    /Monthly orders/,
  );
});

const refundBase = {
  price: 48,
  shippingCharged: 6,
  paymentsRate: 2.9,
  paymentsFixed: 0.3,
  shopifyTxnRate: 2,
  processorRate: 3.49,
  processorFixed: 0.49,
  costOfGoods: 14,
  shippingCost: 5,
  packagingCost: 1,
  otherCost: 0,
  monthlyPlan: 39,
  monthlyOrders: 100,
  paymentMethod: "shopify_payments",
};

test("a 0% refund rate leaves completed-order profit unchanged", () => {
  const order = calculateOrder(refundBase);
  const mix = expectedProfitAfterRefunds({ ...refundBase, refundRatePercent: 0 });
  near(mix.shopifyPayments.expectedProfit, order.shopifyPayments.profit, "Shopify expected");
  near(mix.thirdParty.expectedProfit, order.thirdParty.profit, "third-party expected");
  assert.equal(mix.refundsFlipPath, false);
  assert.equal(mix.completedWinner, "shopify_payments");
  assert.equal(mix.expectedWinner, "shopify_payments");
});

test("a 100% refund with fee refunds still loses outbound shipping and packaging", () => {
  // Shopify Payments fee refunded in full; goods restocked; return label $4.
  // Remaining cash out: $5 outbound + $1 pack + $0.39 plan + $4 return = $10.39.
  const mix = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 100,
    returnShippingCost: 4,
    restockablePercent: 100,
    shopifyPaymentsFeeRefundPercent: 100,
  });
  near(mix.shopifyPayments.remainingFeesOnRefund, 0, "Shopify fees refunded");
  near(mix.shopifyPayments.refundOutcomeProfit, -10.39, "refunded order cash");
  near(mix.shopifyPayments.expectedProfit, -10.39, "100% refund expected");
});

test("PayPal keeping its fee makes a refund cost more than Shopify Payments", () => {
  const mix = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 100,
    returnShippingCost: 4,
    restockablePercent: 100,
    shopifyPaymentsFeeRefundPercent: 100,
    thirdPartyFeeRefundPercent: 0,
    shopifyThirdPartyFeeRefundPercent: 100,
  });
  const processorKept = 54 * 0.0349 + 0.49;
  near(mix.thirdParty.remainingFeesOnRefund, processorKept, "PayPal keeps processor fee");
  assert.ok(
    mix.thirdParty.expectedProfit < mix.shopifyPayments.expectedProfit,
    "third-party refund outcome should be worse when the processor keeps its fee",
  );
  near(
    mix.expectedExtraVsShopifyPayments,
    mix.thirdParty.expectedProfit - mix.shopifyPayments.expectedProfit,
    "expected extra",
  );
});

test("expected profit is the mix of completed and refunded outcomes", () => {
  const mix = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 10,
    returnShippingCost: 4,
    restockablePercent: 100,
  });
  const expected = 0.9 * mix.shopifyPayments.completedProfit + 0.1 * mix.shopifyPayments.refundOutcomeProfit;
  near(mix.selected.expectedProfit, expected, "10% mix");
  near(mix.monthlyExpectedProfit, expected * 100, "monthly mix");
});

test("unsellable returns keep cost of goods in the refunded loss", () => {
  const restocked = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 100,
    restockablePercent: 100,
    returnShippingCost: 0,
  });
  const discarded = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 100,
    restockablePercent: 0,
    returnShippingCost: 0,
  });
  near(
    discarded.shopifyPayments.expectedProfit - restocked.shopifyPayments.expectedProfit,
    -14,
    "lost goods",
  );
});

test("break-even refund rate is the mix that zeros expected profit", () => {
  const mix = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: 0,
    returnShippingCost: 4,
  });
  const rate = mix.shopifyPayments.breakEvenRefundRate;
  assert.ok(rate > 0 && rate < 100, `rate should be inside 0-100, got ${rate}`);
  const atEdge = expectedProfitAfterRefunds({
    ...refundBase,
    refundRatePercent: rate,
    returnShippingCost: 4,
  });
  near(atEdge.shopifyPayments.expectedProfit, 0, "profit at break-even refund rate");
});

test("refunds can flip which payment path still wins", () => {
  // Completed order slightly prefers third-party. PayPal keeps its fee on
  // refunds, so a high refund rate prefers Shopify Payments.
  const input = {
    price: 40,
    shippingCharged: 0,
    paymentsRate: 5,
    paymentsFixed: 0.3,
    shopifyTxnRate: 0,
    processorRate: 2.9,
    processorFixed: 0.3,
    costOfGoods: 8,
    shippingCost: 4,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
    returnShippingCost: 0,
    restockablePercent: 100,
    shopifyPaymentsFeeRefundPercent: 100,
    thirdPartyFeeRefundPercent: 0,
    shopifyThirdPartyFeeRefundPercent: 100,
  };
  const none = expectedProfitAfterRefunds({ ...input, refundRatePercent: 0 });
  const many = expectedProfitAfterRefunds({ ...input, refundRatePercent: 50 });
  assert.equal(none.completedWinner, "third_party");
  assert.equal(many.expectedWinner, "shopify_payments");
  assert.equal(many.refundsFlipPath, true);
});

test("refund rate sweep keeps 0% aligned with completed profit", () => {
  const order = calculateOrder(refundBase);
  const sweep = refundRateSweep(refundBase, [0, 10]);
  assert.equal(sweep.length, 2);
  near(sweep[0].shopifyPayments, order.shopifyPayments.profit, "sweep 0%");
  assert.ok(sweep[1].shopifyPayments < sweep[0].shopifyPayments, "higher refund rate lowers expected profit");
});

test("rejects refund rates outside 0-100", () => {
  assert.throws(
    () => expectedProfitAfterRefunds({ ...refundBase, refundRatePercent: 101 }),
    /Refund rate/,
  );
  assert.throws(
    () => expectedProfitAfterRefunds({ ...refundBase, restockablePercent: -1 }),
    /Restockable/,
  );
});
