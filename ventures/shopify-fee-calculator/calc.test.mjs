import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPreset,
  calculateOrder,
  comparePlans,
  perOrderProcessingFee,
  PLAN_PRESETS,
  upgradeBreakEvenOrders,
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
  assert.throws(() => upgradeBreakEvenOrders("starter", "grow"), /Unknown Shopify plan/);
  assert.throws(() => comparePlans({ price: 48, monthlyOrders: 0 }), /Monthly orders/);
});

const PLAN_COMPARE_INPUT = {
  price: 48,
  shippingCharged: 6,
  processorRate: 3.49,
  processorFixed: 0.49,
  costOfGoods: 14,
  shippingCost: 5,
  packagingCost: 1,
  monthlyOrders: 100,
  paymentMethod: "shopify_payments",
  planId: "basic",
};

test("per-order processing fee ignores the monthly plan so volume is not circular", () => {
  const basic = perOrderProcessingFee(PLAN_COMPARE_INPUT, "basic");
  const grow = perOrderProcessingFee(PLAN_COMPARE_INPUT, "grow");
  near(basic, 54 * 0.029 + 0.3, "Basic Shopify Payments fee");
  near(grow, 54 * 0.027 + 0.3, "Grow Shopify Payments fee");
  assert.ok(basic > grow, "Grow's lower rate should save on the same order");
});

test("Grow vs Basic break-even is extra plan cost divided by per-order fee savings", () => {
  const step = upgradeBreakEvenOrders("basic", "grow", PLAN_COMPARE_INPUT);
  const feeSavings = (54 * 0.029 + 0.3) - (54 * 0.027 + 0.3);
  near(step.extraMonthly, 105 - 39, "extra monthly");
  near(step.feeSavings, feeSavings, "per-order savings");
  near(step.breakEvenOrders, 66 / feeSavings, "break-even orders");
  assert.equal(step.neverPays, false);
  assert.equal(step.alreadyCheaper, false);
  // The SEO page quotes this worked example: $54 order, 2.9%→2.7%, $66 extra.
  assert.equal(Math.ceil(step.breakEvenOrders - 1e-9), 612);
});

test("PayPal path reaches Grow sooner because the third-party fee also drops", () => {
  const shopifyPath = upgradeBreakEvenOrders("basic", "grow", PLAN_COMPARE_INPUT);
  const paypalPath = upgradeBreakEvenOrders("basic", "grow", {
    ...PLAN_COMPARE_INPUT,
    paymentMethod: "third_party",
  });
  const shopifySavings = (54 * 0.029 + 0.3) - (54 * 0.027 + 0.3);
  const paypalSavings =
    (54 * 0.02 + 54 * 0.0349 + 0.49) - (54 * 0.01 + 54 * 0.0349 + 0.49);
  near(paypalPath.feeSavings, paypalSavings, "PayPal path savings include the 2%→1% drop");
  assert.ok(paypalSavings > shopifySavings, "third-party path should save more per order");
  assert.ok(
    paypalPath.breakEvenOrders < shopifyPath.breakEvenOrders,
    "PayPal path should need fewer orders to cover Grow",
  );
});

test("downgrading to a cheaper plan is already cheaper on the monthly fee", () => {
  const step = upgradeBreakEvenOrders("grow", "basic", PLAN_COMPARE_INPUT);
  assert.equal(step.alreadyCheaper, true);
  assert.equal(step.breakEvenOrders, 0);
});

test("an upgrade never pays from rates alone when there is no per-order fee to save", () => {
  const step = upgradeBreakEvenOrders("basic", "plus", {
    price: 0,
    shippingCharged: 0,
    paymentMethod: "shopify_payments",
  });
  assert.equal(step.neverPays, true);
  assert.equal(step.breakEvenOrders, Infinity);
  near(step.feeSavings, 0, "same $0.30 fixed fee on a $0 order");
});

test("comparePlans ranks every plan at the entered volume and marks the current one", () => {
  const comparison = comparePlans(PLAN_COMPARE_INPUT);
  assert.equal(comparison.plans.length, 4);
  assert.equal(comparison.currentPlanId, "basic");
  const basic = comparison.plans.find((plan) => plan.id === "basic");
  const grow = comparison.plans.find((plan) => plan.id === "grow");
  assert.equal(basic.isCurrent, true);
  near(basic.vsCurrentMonthly, 0, "current vs itself");
  const expectedGrowGap = grow.monthlyProfit - basic.monthlyProfit;
  near(grow.vsCurrentMonthly, expectedGrowGap, "Grow vs Basic monthly");
  const winner = comparison.plans.find((plan) => plan.isBest);
  assert.equal(winner.id, comparison.bestPlanId);
  assert.ok(comparison.plans.every((plan) => plan.id === winner.id || plan.monthlyProfit <= winner.monthlyProfit));
});

test("comparePlans monthly profit matches calculateOrder times volume", () => {
  const comparison = comparePlans(PLAN_COMPARE_INPUT);
  const growFilled = applyPlanPreset(PLAN_COMPARE_INPUT, "grow");
  const growOrder = calculateOrder({
    ...PLAN_COMPARE_INPUT,
    ...growFilled,
    monthlyOrders: 100,
  });
  const grow = comparison.plans.find((plan) => plan.id === "grow");
  near(grow.perOrderProfit, growOrder.selected.profit, "per-order profit");
  near(grow.monthlyProfit, growOrder.selected.profit * 100, "monthly profit");
});

test("at a high enough volume the next plan is marked worth it", () => {
  const low = comparePlans({ ...PLAN_COMPARE_INPUT, monthlyOrders: 10 });
  const high = comparePlans({ ...PLAN_COMPARE_INPUT, monthlyOrders: 2000 });
  const lowGrow = low.upgrades.find((step) => step.fromPlanId === "basic" && step.toPlanId === "grow");
  const highGrow = high.upgrades.find((step) => step.fromPlanId === "basic" && step.toPlanId === "grow");
  assert.equal(lowGrow.worthItAtVolume, false);
  assert.equal(highGrow.worthItAtVolume, true);
});
