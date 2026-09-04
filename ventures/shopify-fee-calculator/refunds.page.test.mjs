import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedProfitAfterRefunds, refundRateSweep } from "./calc.mjs";

const page = readFileSync(new URL("./refunds.html", import.meta.url), "utf8");

test("refunds page is a self-contained sibling, not a second order calculator", () => {
  assert.match(page, /expectedProfitAfterRefunds/);
  assert.match(page, /refundRateSweep/);
  assert.match(page, /refund_rate_compared/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /canonical" href="refunds.html"/);
  assert.doesNotMatch(page, /share\.mjs/);
});

test("default refunds.html inputs match the completed-vs-mix journey", () => {
  const input = {
    price: 48,
    shippingCharged: 6,
    refundRatePercent: 8,
    returnShippingCost: 4,
    restockablePercent: 100,
    shopifyPaymentsFeeRefundPercent: 100,
    thirdPartyFeeRefundPercent: 0,
    shopifyThirdPartyFeeRefundPercent: 100,
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
  const mix = expectedProfitAfterRefunds(input);
  assert.ok(mix.selected.expectedProfit < mix.selected.completedProfit);
  assert.ok(mix.thirdParty.expectedProfit < mix.shopifyPayments.expectedProfit);
  assert.equal(mix.refundsFlipPath, false);
  const sweep = refundRateSweep(input);
  assert.equal(sweep[0].refundRatePercent, 0);
  assert.ok(sweep.at(-1).shopifyPayments < sweep[0].shopifyPayments);
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders its hero figure and breakdown in place
  // on every keystroke, with no page reload, but had no aria-live -- so a
  // screen-reader user changing an input got no announcement that the
  // result had changed. Same gap already fixed fleet-wide (see #3125-#3127
  // and prior sessions' aria-live commits).
  assert.match(
    page,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});
