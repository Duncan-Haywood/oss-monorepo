import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanPreset, calculateOrder, formatOrderSummary, PLAN_PRESETS } from "./calc.mjs";

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

test("formats a handoff summary from derived results", () => {
  const input = { price: 48, shippingCharged: 6, paymentMethod: "shopify_payments" };
  const result = calculateOrder(input);
  const summary = formatOrderSummary(input, result);
  assert.match(summary, /Shopify fee calculator summary/);
  assert.match(summary, /Estimated net profit: \$52\.13/);
  assert.match(summary, /Rates and costs are user-entered assumptions/);
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
