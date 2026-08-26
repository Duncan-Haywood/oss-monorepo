import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanPreset, calculateOrder, compareOnlineVsPos, PLAN_PRESETS } from "./calc.mjs";

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
  assert.equal(filled.posPaymentsRate, 2.6);
  assert.equal(filled.posPaymentsFixed, 0.1);
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

const POS_BASE = {
  price: 48,
  shippingCharged: 6,
  shippingCost: 5,
  paymentsRate: 2.9,
  paymentsFixed: 0.3,
  posPaymentsRate: 2.6,
  posPaymentsFixed: 0.1,
  costOfGoods: 14,
  packagingCost: 1,
  monthlyPlan: 39,
  monthlyOrders: 100,
};

test("postage markup can beat the cheaper in-person card rate", () => {
  // Online: $54 revenue, 2.9%+$0.30 = $1.866, cash $20.39, profit $31.744.
  // Pickup: $48 revenue, 2.6%+$0.10 = $1.348, cash $15.39, profit $31.262.
  // The $1 postage markup (minus the fee on that $6) is larger than the
  // cheaper tap, so online keeps more on this ticket.
  const r = compareOnlineVsPos(POS_BASE);
  near(r.online.revenue, 54, "online revenue");
  near(r.online.feeTotal, 1.866, "online fees");
  near(r.online.profit, 54 - 1.866 - 20.39, "online profit");
  near(r.inPersonPickup.revenue, 48, "pickup revenue");
  near(r.inPersonPickup.feeTotal, 48 * 0.026 + 0.1, "pickup fees");
  near(r.inPersonPickup.cashInvested, 15.39, "pickup cash");
  near(r.inPersonPickup.profit, 48 - (48 * 0.026 + 0.1) - 15.39, "pickup profit");
  near(r.extraKeptOnPickup, r.inPersonPickup.profit - r.online.profit, "pickup extra");
  assert.equal(r.pickupWinner, "online");
  assert.ok(r.extraKeptOnPickup < 0, "pickup should lose when postage is marked up");
});

test("same-ticket tap isolates the cheaper in-person rate", () => {
  const r = compareOnlineVsPos(POS_BASE);
  near(r.inPersonSameTicket.revenue, 54, "same-ticket revenue");
  near(r.inPersonSameTicket.feeTotal, 54 * 0.026 + 0.1, "same-ticket fees");
  near(r.extraKeptOnSameTicket, r.inPersonSameTicket.profit - r.online.profit, "rate-only extra");
  assert.equal(r.sameTicketWinner, "in_person");
  assert.ok(r.extraKeptOnSameTicket > 0, "tapping the same ticket should keep more");
});

test("pickup wins when postage is a pass-through", () => {
  const r = compareOnlineVsPos({ ...POS_BASE, shippingCharged: 5 });
  assert.equal(r.pickupWinner, "in_person");
  assert.ok(r.extraKeptOnPickup > 0, "pickup should win without postage markup");
});

test("pickup wins on a no-postage ticket from the cheaper card rate alone", () => {
  const r = compareOnlineVsPos({ ...POS_BASE, shippingCharged: 0, shippingCost: 0 });
  near(r.online.feeTotal, 48 * 0.029 + 0.3, "online no-postage fees");
  near(r.inPersonPickup.feeTotal, 48 * 0.026 + 0.1, "pickup no-postage fees");
  near(r.extraKeptOnPickup, (48 * 0.029 + 0.3) - (48 * 0.026 + 0.1), "fee gap");
  assert.equal(r.pickupWinner, "in_person");
  assert.equal(r.sameTicketWinner, "in_person");
});

test("card-reader recovery uses pickup extra when pickup wins, else the rate gap", () => {
  const noPostage = compareOnlineVsPos({
    ...POS_BASE,
    shippingCharged: 0,
    shippingCost: 0,
    posHardwareCost: 49,
  });
  near(noPostage.ordersToRecoverHardware, 49 / noPostage.extraKeptOnPickup, "recover from pickup");

  const markedUp = compareOnlineVsPos({ ...POS_BASE, posHardwareCost: 49 });
  assert.ok(markedUp.extraKeptOnPickup < 0, "markup case still loses on pickup");
  near(markedUp.ordersToRecoverHardware, 49 / markedUp.extraKeptOnSameTicket, "recover from rate gap");

  const none = compareOnlineVsPos({ ...POS_BASE, posHardwareCost: 0 });
  assert.equal(none.ordersToRecoverHardware, null);
});

test("compareOnlineVsPos rejects negative in-person rates", () => {
  assert.throws(() => compareOnlineVsPos({ ...POS_BASE, posPaymentsRate: -1 }), /In-person card rate/);
  assert.throws(() => compareOnlineVsPos({ ...POS_BASE, posHardwareCost: -5 }), /Card reader cost/);
});
