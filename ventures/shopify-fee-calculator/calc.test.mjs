import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPreset,
  applyPromo,
  calculateOrder,
  comparePlans,
  comparePromos,
  defaultPromoSet,
  promoComparisonSummary,
  compareOnlineVsPos,
  compareShippingLabels,
  compareReturnResolution,
  compareShopPayInstallments,
  compareShopifyCapital,
  compareManualPayment,
  compareChargeback,
  compareLocalDelivery,
  compareGiftCard,
  compareMarketsDuties,
  compareAbandonedCheckout,
  compareSubscriptions,
  comparePickup,
  localDeliveryCost,
  pickupStaffCost,
  DEFAULT_BANK_APR_PCT,
  DEFAULT_CAPITAL_ADVANCE,
  DEFAULT_CAPITAL_HOLDBACK_PCT,
  DEFAULT_CAPITAL_MONTHLY_SALES,
  DEFAULT_CAPITAL_REPAY,
  DEFAULT_CREDIT_REDEMPTION_PCT,
  DEFAULT_OWN_LABEL_COST,
  DEFAULT_INSTALLMENT_RATE,
  DEFAULT_INSTALLMENT_FIXED,
  DEFAULT_PROCESSOR_FEE_KEPT_PCT,
  DEFAULT_RESTOCKABLE_PCT,
  DEFAULT_RETURN_LABEL_COST,
  DEFAULT_COLLECTION_PCT,
  DEFAULT_MANUAL_DISCOUNT_PCT,
  DEFAULT_CHASE_COST,
  DEFAULT_CHARGEBACK_FEE,
  DEFAULT_CHARGEBACK_WIN_PCT,
  DEFAULT_FIGHT_COST,
  DEFAULT_MONTHLY_CHARGEBACKS,
  DEFAULT_REFUND_FEE_KEPT_PCT,
  DEFAULT_CHARGEBACK_RESTOCKABLE_PCT,
  DEFAULT_LOCAL_DELIVERY_FEE,
  DEFAULT_LOCAL_DELIVERY_MINUTES,
  DEFAULT_LOCAL_HOURLY_RATE,
  DEFAULT_LOCAL_MILES,
  DEFAULT_LOCAL_MILEAGE_RATE,
  DEFAULT_GIFT_CARD_FACE,
  DEFAULT_GIFT_CARD_PRICE,
  DEFAULT_GIFT_CARD_REDEMPTION_PCT,
  DEFAULT_MONTHLY_GIFT_CARDS,
  DEFAULT_DUTY_RATE_PCT,
  DEFAULT_DAP_TAKE_PCT,
  DEFAULT_DDP_TAKE_PCT,
  DEFAULT_DAP_REFUSE_PCT,
  DEFAULT_DDP_REFUSE_PCT,
  DEFAULT_DUTY_RETURN_LABEL,
  DEFAULT_DUTY_RESTOCKABLE_PCT,
  DEFAULT_DUTY_REFUND_FEE_LEFTOVER,
  DEFAULT_MONTHLY_INTL_VISITORS,
  DEFAULT_ORGANIC_RECOVER_PCT,
  DEFAULT_EMAIL_RECOVER_PCT,
  DEFAULT_DISCOUNT_RECOVER_PCT,
  DEFAULT_RECOVERY_DISCOUNT_PCT,
  DEFAULT_EMAIL_COST_PER_ABANDONED,
  DEFAULT_MONTHLY_ABANDONED,
  DEFAULT_SUBSCRIBE_DISCOUNT_PCT,
  DEFAULT_PREPAID_DISCOUNT_PCT,
  DEFAULT_PREPAID_MONTHS,
  DEFAULT_SUBSCRIPTION_FEE_PCT,
  DEFAULT_EXPECTED_CYCLES,
  DEFAULT_SKIP_PCT,
  DEFAULT_SUBSCRIBE_ENROLL_PCT,
  DEFAULT_MONTHLY_SUB_BUYERS,
  DEFAULT_PICKUP_FEE,
  DEFAULT_PICKUP_MINUTES,
  DEFAULT_PICKUP_HOURLY_RATE,
  DEFAULT_PICKUP_PACKAGING,
  DEFAULT_PICKUP_NO_SHOW_PCT,
  DEFAULT_MONTHLY_PICKUP_ORDERS,
  compareUpsell,
  upsellNote,
  DEFAULT_ADDON_PRICE,
  DEFAULT_ADDON_COST,
  DEFAULT_ADDON_DISCOUNT_PCT,
  DEFAULT_CHECKOUT_TAKE_PCT,
  DEFAULT_POST_PURCHASE_TAKE_PCT,
  DEFAULT_CHECKOUT_DROP_PCT,
  DEFAULT_ADDON_PACKAGING,
  DEFAULT_ADDON_LABEL,
  DEFAULT_MONTHLY_UPSELL_CHECKOUTS,
  PLAN_PRESETS,
  perOrderProcessingFee,
  upgradeBreakEvenOrders,
  expectedProfitAfterRefunds,
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

test("calculates the item price required for a target net profit", () => {
  const input = {
    price: 48, shippingCharged: 6, paymentsRate: 2.9, paymentsFixed: 0.3,
    costOfGoods: 14, shippingCost: 5, packagingCost: 1, monthlyPlan: 39,
    monthlyOrders: 100, targetProfit: 20, paymentMethod: "shopify_payments",
  };
  const r = calculateOrder(input);
  const atTarget = calculateOrder({ ...input, price: r.selected.targetProfitPrice });
  near(atTarget.selected.profit, 20, "profit at target price");
});

test("reports an unreachable target profit when the fee rate is 100%", () => {
  const r = calculateOrder({ price: 10, paymentsRate: 100, targetProfit: 20, paymentMethod: "shopify_payments" });
  assert.equal(r.selected.targetProfitPrice, Infinity);
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

const LABEL_BASE = {
  price: 48,
  shippingCharged: 6,
  shippingCost: 5,
  shopifyLabelCost: 5.49,
  ownLabelCost: 4.25,
  paymentsRate: 2.9,
  paymentsFixed: 0.3,
  costOfGoods: 14,
  packagingCost: 1,
  monthlyPlan: 39,
  monthlyOrders: 100,
  paymentMethod: "shopify_payments",
};

test("a cheaper own label keeps the label spread when checkout shipping stays put", () => {
  // Same $54 ticket, same 2.9%+$0.30 fees. Cash drops by $1.24 when the
  // label falls from $5.49 to $4.25. Card fees do not move.
  const r = compareShippingLabels(LABEL_BASE);
  const shopifyCash = 14 + 5.49 + 1 + 0.39;
  const ownCash = 14 + 4.25 + 1 + 0.39;
  near(r.shopify.revenue, 54, "Shopify-label revenue");
  near(r.own.revenue, 54, "own-label revenue");
  near(r.shopify.labelCost, 5.49, "Shopify label");
  near(r.own.labelCost, 4.25, "own label");
  near(r.shopify.cashInvested, shopifyCash, "Shopify cash");
  near(r.own.cashInvested, ownCash, "own cash");
  near(r.extraKeptOnOwn, 1.24, "label spread");
  near(r.pocketedSpread, 1.24, "raw label spread");
  near(r.monthlyExtraOnOwn, 124, "monthly gap");
  assert.equal(r.ownWinner, "own");
  assert.equal(r.winner, "own");
});

test("charging the Shopify quote and buying own is not the raw label spread", () => {
  // Revenue falls from $54 to $53.49, so Shopify Payments falls with it.
  // Cash still uses the $4.25 label. The leftover vs buying Shopify
  // Shipping is label savings minus lost postage markup plus the fee drop.
  const r = compareShippingLabels(LABEL_BASE);
  near(r.chargeShopifyBuyOwn.revenue, 48 + 5.49, "matched-quote revenue");
  near(r.chargeShopifyBuyOwn.shippingCharged, 5.49, "charged Shopify quote");
  near(r.chargeShopifyBuyOwn.labelCost, 4.25, "still buys own");
  near(r.chargeShopifyBuyOwn.feeTotal, 53.49 * 0.029 + 0.3, "fees on lower ticket");
  assert.ok(
    r.extraKeptOnChargeShopifyBuyOwn < r.extraKeptOnOwn - 1e-9,
    "matched quote should keep less than charging $6 and buying own",
  );
  assert.ok(r.extraKeptOnChargeShopifyBuyOwn > 0, "still beats buying Shopify Shipping");
});

test("Shopify Shipping wins when the own label is more expensive", () => {
  const r = compareShippingLabels({ ...LABEL_BASE, ownLabelCost: 8 });
  assert.equal(r.ownWinner, "shopify");
  assert.equal(r.winner, "shopify");
  near(r.extraKeptOnOwn, 5.49 - 8, "own costs more");
  assert.match(r.summary, /Shopify Shipping label keeps/);
});

test("equal labels tie the buy-Shopify vs buy-own rows", () => {
  const r = compareShippingLabels({
    ...LABEL_BASE,
    shopifyLabelCost: 5,
    ownLabelCost: 5,
    shippingCharged: 5,
  });
  assert.equal(r.ownWinner, "tie");
  near(r.extraKeptOnOwn, 0, "no label spread");
  near(r.chargeShopifyBuyOwn.profit, r.shopify.profit, "matched quote equals Shopify row");
  assert.equal(r.winner, "tie");
});

test("empty Shopify label falls back to shipping you pay; empty own uses the default", () => {
  const r = compareShippingLabels({
    price: 48,
    shippingCharged: 6,
    shippingCost: 5.49,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.shopifyLabelCost, 5.49, "fallback Shopify label");
  near(r.ownLabelCost, DEFAULT_OWN_LABEL_COST, "default own label");
  near(r.extraKeptOnOwn, 5.49 - DEFAULT_OWN_LABEL_COST, "spread vs default");
});

test("label comparison follows the selected PayPal path", () => {
  const r = compareShippingLabels({
    ...LABEL_BASE,
    paymentMethod: "third_party",
    shopifyTxnRate: 2,
    processorRate: 3.49,
    processorFixed: 0.49,
  });
  const revenue = 54;
  const thirdPartyFees = revenue * 0.02 + revenue * 0.0349 + 0.49;
  near(r.shopify.feeTotal, thirdPartyFees, "PayPal + Shopify txn fee");
  near(r.own.feeTotal, thirdPartyFees, "same ticket, same fees");
  near(r.extraKeptOnOwn, 1.24, "label spread still cash");
});

test("compareShippingLabels rejects a negative label quote", () => {
  assert.throws(() => compareShippingLabels({ ...LABEL_BASE, shopifyLabelCost: -1 }), /Shopify Shipping label/);
  assert.throws(() => compareShippingLabels({ ...LABEL_BASE, ownLabelCost: -0.01 }), /Own \/ third-party label/);
});

test("summary names the cheaper own label and the monthly gap", () => {
  const text = compareShippingLabels(LABEL_BASE).summary;
  assert.match(text, /\$4\.25/);
  assert.match(text, /\$5\.49/);
  assert.match(text, /\$124\.00 \/ month/);
});

const INSTALLMENT_BASE = {
  price: 88,
  shippingCharged: 6,
  shippingCost: 5,
  paymentsRate: 2.9,
  paymentsFixed: 0.3,
  costOfGoods: 28,
  packagingCost: 1,
  monthlyPlan: 39,
  monthlyOrders: 100,
  installmentRate: 5.99,
  installmentFixed: 0.3,
  installmentSharePct: 15,
};

test("an installment checkout costs the rate gap on the same ticket", () => {
  // $88 + $6 = $94. Card 2.9%+$0.30 = $3.026. Installments 5.99%+$0.30 = $5.9306.
  // Cash is the same ($28 + $5 + $1 + $39/100 = $34.39), so the profit gap
  // is the extra fee.
  const r = compareShopPayInstallments(INSTALLMENT_BASE);
  near(r.card.revenue, 94, "card revenue");
  near(r.installment.revenue, 94, "installment revenue");
  near(r.card.feeTotal, 94 * 0.029 + 0.3, "card fees");
  near(r.installment.feeTotal, 94 * 0.0599 + 0.3, "installment fees");
  near(r.extraFeePerInstallment, 94 * (0.0599 - 0.029), "rate gap");
  near(r.extraKeptOnCard, r.extraFeePerInstallment, "profit gap is the fee gap");
  near(r.card.cashInvested, 28 + 5 + 1 + 0.39, "same cash");
  near(r.installment.cashInvested, 28 + 5 + 1 + 0.39, "same cash on installments");
  assert.equal(r.winner, "card");
  assert.equal(r.cardWinner, "card");
});

test("a 15% installment share prices the blended month and the lift to break even", () => {
  const r = compareShopPayInstallments(INSTALLMENT_BASE);
  const extra = 94 * (0.0599 - 0.029);
  near(r.monthlyExtraCost, extra * 0.15 * 100, "monthly extra at 15% of 100");
  near(r.blendProfitPerOrder, 0.85 * r.card.profit + 0.15 * r.installment.profit, "blend");
  near(r.cardOnlyMonthly, r.card.profit * 100, "card-only month");
  near(r.blendedMonthly, r.blendProfitPerOrder * 100, "blended month");
  const ratio = r.card.profit / r.blendProfitPerOrder;
  near(r.breakEvenLiftPct, (ratio - 1) * 100, "lift percent");
  near(r.breakEvenExtraOrders, 100 * (ratio - 1), "extra orders");
  assert.ok(r.breakEvenLiftPct > 0, "installments should need some lift");
  assert.ok(r.breakEvenLiftPct < 2, "15% of a 3-point rate gap should be a small lift");
  assert.equal(r.liftPays, false);
});

test("typed extra orders cover the installment mix when they beat the lift", () => {
  const short = compareShopPayInstallments({
    ...INSTALLMENT_BASE,
    extraOrdersFromInstallments: 0.2,
  });
  const enough = compareShopPayInstallments({
    ...INSTALLMENT_BASE,
    extraOrdersFromInstallments: 2,
  });
  assert.equal(short.liftPays, false);
  assert.equal(enough.liftPays, true);
  assert.ok(enough.blendedWithLiftMonthly > enough.cardOnlyMonthly);
  assert.match(enough.summary, /2 extra orders you typed more than cover/);
});

test("empty installment rate uses the illustrative default", () => {
  const r = compareShopPayInstallments({
    price: 88,
    shippingCharged: 6,
    shippingCost: 5,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 28,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.installmentRate, DEFAULT_INSTALLMENT_RATE, "default rate");
  near(r.installmentFixed, DEFAULT_INSTALLMENT_FIXED, "default fixed");
  near(r.installmentSharePct, 15, "default share");
  near(r.extraFeePerInstallment, 94 * (DEFAULT_INSTALLMENT_RATE - 2.9) / 100, "default gap");
});

test("equal rates tie and need no conversion lift", () => {
  const r = compareShopPayInstallments({
    ...INSTALLMENT_BASE,
    installmentRate: 2.9,
    installmentFixed: 0.3,
  });
  assert.equal(r.winner, "tie");
  near(r.extraFeePerInstallment, 0, "no extra fee");
  near(r.breakEvenLiftPct, 0, "no lift");
  near(r.breakEvenExtraOrders, 0, "no extra orders");
  assert.match(r.summary, /leave the same profit/);
});

test("zero installment share needs no lift even when the rate is higher", () => {
  const r = compareShopPayInstallments({ ...INSTALLMENT_BASE, installmentSharePct: 0 });
  near(r.monthlyExtraCost, 0, "no mix");
  near(r.breakEvenLiftPct, 0, "no lift at 0% share");
  near(r.blendProfitPerOrder, r.card.profit, "blend is the card");
});

test("installments win if the typed installment rate is cheaper", () => {
  const r = compareShopPayInstallments({ ...INSTALLMENT_BASE, installmentRate: 1.5 });
  assert.equal(r.winner, "installments");
  assert.ok(r.extraFeePerInstallment < 0);
  assert.match(r.summary, /keeps/);
});

test("a losing blend cannot recover with more of the same mix", () => {
  const r = compareShopPayInstallments({
    ...INSTALLMENT_BASE,
    price: 20,
    shippingCharged: 0,
    shippingCost: 8,
    costOfGoods: 18,
    packagingCost: 2,
    monthlyPlan: 39,
    monthlyOrders: 10,
    installmentSharePct: 100,
    installmentRate: 80,
  });
  assert.ok(r.blendProfitPerOrder < 0, "blend should lose money");
  assert.equal(r.breakEvenLiftPct, null);
  assert.equal(r.breakEvenExtraOrders, null);
  assert.match(r.summary, /does not earn/);
});

test("compareShopPayInstallments rejects a share over 100 and a negative rate", () => {
  assert.throws(
    () => compareShopPayInstallments({ ...INSTALLMENT_BASE, installmentSharePct: 101 }),
    /Installment share must be at most 100/,
  );
  assert.throws(
    () => compareShopPayInstallments({ ...INSTALLMENT_BASE, installmentRate: -1 }),
    /Shop Pay Installments rate/,
  );
  assert.throws(
    () => compareShopPayInstallments({ ...INSTALLMENT_BASE, extraOrdersFromInstallments: -2 }),
    /Extra monthly orders from installments/,
  );
});

test("summary names the extra fee and the monthly gap", () => {
  const text = compareShopPayInstallments(INSTALLMENT_BASE).summary;
  assert.match(text, /\$2\.90/);
  assert.match(text, /15%/);
  assert.match(text, /\$43\.57 \/ month/);
});

const RETURN_BASE = {
  price: 48,
  shippingCharged: 6,
  paymentsRate: 2.9,
  paymentsFixed: 0.3,
  costOfGoods: 14,
  shippingCost: 5,
  packagingCost: 1,
  monthlyPlan: 39,
  monthlyOrders: 100,
  monthlyReturns: 12,
  paymentMethod: "shopify_payments",
};

test("defaults match the published return-label / restock / redemption example", () => {
  assert.equal(DEFAULT_RETURN_LABEL_COST, 7);
  assert.equal(DEFAULT_RESTOCKABLE_PCT, 85);
  assert.equal(DEFAULT_CREDIT_REDEMPTION_PCT, 70);
  assert.equal(DEFAULT_PROCESSOR_FEE_KEPT_PCT, 100);
});

test("store credit keeps more than a cash refund on the default return", () => {
  // Completed sale: $54 − $1.866 fees − $20.39 cash = $31.744.
  // Refund $48, recover 85% of $14 COGS, pay a $7 label, processor keeps the fee.
  const r = compareReturnResolution(RETURN_BASE);
  near(r.completedProfit, 54 - 1.866 - 20.39, "completed sale");
  near(r.refundPaid, 48, "item-only refund");
  near(r.feeReturned, 0, "processor keeps the original fee");
  near(r.recoveredCogs, 14 * 0.85, "restockable inventory");
  near(r.refund.kept, 31.744 - 48 + 11.9 - 7, "refund keep");
  near(r.credit.kept, 31.744 + 11.9 - 7 - 0.7 * 20, "credit keep");
  near(r.exchange.kept, 31.744 - 7 - 5 - 1 - 14 * 0.15, "exchange keep");
  near(r.extraKeptOnCredit, 34, "credit vs refund");
  near(r.extraKeptOnExchange, 28, "exchange vs refund");
  near(r.monthlyExtraOnCredit, 34 * 12, "twelve returns");
  assert.equal(r.winner, "credit");
  assert.equal(r.refundShippingCharged, false);
});

test("refunding shipping charged too makes the cash path worse", () => {
  const r = compareReturnResolution({ ...RETURN_BASE, refundShippingCharged: true });
  near(r.refundPaid, 54, "item plus postage");
  near(r.refund.kept, 31.744 - 54 + 11.9 - 7, "full refund");
  assert.ok(r.extraKeptOnCredit > 34, "keeping the $6 postage widens the credit gap");
});

test("returning the processor fee shrinks the refund loss", () => {
  const r = compareReturnResolution({ ...RETURN_BASE, processorFeeKeptPct: 0 });
  near(r.feeReturned, 1.866, "Shopify Payments often returns the fee");
  near(r.refund.kept, 31.744 - 48 + 1.866 + 11.9 - 7, "refund with fee back");
  assert.equal(r.winner, "credit");
});

test("full redemption and a restockable unit make credit match exchange costs", () => {
  const r = compareReturnResolution({
    ...RETURN_BASE,
    restockablePct: 100,
    creditRedemptionPct: 100,
  });
  near(r.credit.kept, r.exchange.kept, "always-redeem + full restock");
  assert.equal(r.winner, "tie");
});

test("a restocking fee reduces the cash refund, not the credit liability", () => {
  const r = compareReturnResolution({ ...RETURN_BASE, restockingFee: 8 });
  near(r.refundPaid, 40, "refund net of restocking fee");
  near(r.refund.kept, 31.744 - 40 + 11.9 - 7, "smaller cash-out");
  near(r.credit.kept, 31.744 + 11.9 - 7 - 14, "credit still expects the next item");
});

test("empty return fields use the published defaults", () => {
  const r = compareReturnResolution({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.returnLabelCost, DEFAULT_RETURN_LABEL_COST, "default label");
  near(r.restockablePct, DEFAULT_RESTOCKABLE_PCT, "default restock");
  near(r.creditRedemptionPct, DEFAULT_CREDIT_REDEMPTION_PCT, "default redemption");
  near(r.processorFeeKeptPct, DEFAULT_PROCESSOR_FEE_KEPT_PCT, "default fee keep");
});

test("compareReturnResolution rejects impossible rates and fees", () => {
  assert.throws(() => compareReturnResolution({ ...RETURN_BASE, restockablePct: 101 }), /Restockable percent/);
  assert.throws(() => compareReturnResolution({ ...RETURN_BASE, creditRedemptionPct: -1 }), /Credit redemption percent/);
  assert.throws(() => compareReturnResolution({ ...RETURN_BASE, restockingFee: 49 }), /Restocking fee cannot exceed/);
  assert.throws(() => compareReturnResolution({ ...RETURN_BASE, returnLabelCost: -1 }), /Return label/);
});

test("summary names store credit and the gap versus a cash refund", () => {
  const text = compareReturnResolution(RETURN_BASE).summary;
  assert.match(text, /Store credit keeps/);
  assert.match(text, /\$22\.64/);
  assert.match(text, /\$34\.00 more/);
  assert.match(text, /-\$11\.36/);
});

const CAPITAL_BASE = {
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

test("defaults match the published Capital offer example", () => {
  assert.equal(DEFAULT_CAPITAL_ADVANCE, 10000);
  assert.equal(DEFAULT_CAPITAL_REPAY, 11400);
  assert.equal(DEFAULT_CAPITAL_HOLDBACK_PCT, 10);
  assert.equal(DEFAULT_CAPITAL_MONTHLY_SALES, 30000);
  assert.equal(DEFAULT_BANK_APR_PCT, 12);
});

test("waiting beats Capital when no extra inventory profit is typed", () => {
  // $10,000 now, repay $11,400, 10% of $30,000 / 30 = $100 / day, 114 days.
  // Simple annualized: 14% × 365/114. Leftover from the $48 SKU × 100 orders.
  const r = compareShopifyCapital(CAPITAL_BASE);
  near(r.advance, 10000, "advance");
  near(r.fee, 1400, "fee");
  near(r.dailyHoldback, 100, "daily holdback");
  near(r.daysToRepay, 114, "days to repay");
  near(r.simpleAnnualizedPct, (1400 / 10000) * (365 / 114) * 100, "simple annualized");
  near(r.leftoverMonthlyProfit, 31.744 * 100, "SKU leftover");
  near(r.daysToSelfFund, 10000 / (3174.4 / 30), "days to save");
  near(r.bankInterest, 10000 * 0.12 * (114 / 365), "bank interest");
  near(r.capital.kept, -1400, "capital leftover");
  near(r.wait.kept, 0, "wait leftover");
  near(r.breakEvenExtraMonthly, 1400 / (114 / 30), "break-even extra / month");
  assert.equal(r.winner, "wait");
  assert.equal(r.extraCoversFee, false);
});

test("typed extra monthly profit can make Capital beat waiting", () => {
  const r = compareShopifyCapital({ ...CAPITAL_BASE, extraMonthlyProfit: 500 });
  near(r.extraProfitDuringRepay, 500 * (114 / 30), "extra during holdback");
  near(r.capital.kept, 1900 - 1400, "capital after lift");
  assert.ok(r.wait.kept < 0, "waiting misses that lift");
  assert.equal(r.extraCoversFee, true);
  assert.equal(r.winner, "bank");
  assert.ok(r.bank.kept > r.capital.kept, "same cash now, smaller bank cost");
});

test("a 12% bank line costs less than the 14% Capital fee over the same days", () => {
  const r = compareShopifyCapital(CAPITAL_BASE);
  assert.ok(r.bankInterest < r.fee, "bank interest below Capital fee");
  near(r.extraKeptOnBank, r.bank.kept - r.wait.kept, "bank vs wait");
});

test("empty Capital fields use the published defaults", () => {
  const r = compareShopifyCapital({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.advance, DEFAULT_CAPITAL_ADVANCE, "default advance");
  near(r.repayment, DEFAULT_CAPITAL_REPAY, "default repay");
  near(r.holdbackPct, DEFAULT_CAPITAL_HOLDBACK_PCT, "default holdback");
  near(r.monthlySales, DEFAULT_CAPITAL_MONTHLY_SALES, "default sales");
  near(r.bankAprPct, DEFAULT_BANK_APR_PCT, "default bank APR");
});

test("compareShopifyCapital rejects impossible offers", () => {
  assert.throws(() => compareShopifyCapital({ ...CAPITAL_BASE, advanceAmount: 0 }), /Capital advance/);
  assert.throws(() => compareShopifyCapital({ ...CAPITAL_BASE, repaymentAmount: 9000 }), /Capital repayment/);
  assert.throws(() => compareShopifyCapital({ ...CAPITAL_BASE, holdbackPct: 0 }), /Holdback percent/);
  assert.throws(() => compareShopifyCapital({ ...CAPITAL_BASE, monthlySales: 0 }), /Monthly sales/);
  assert.throws(() => compareShopifyCapital({ ...CAPITAL_BASE, holdbackPct: 101 }), /Holdback percent/);
});

test("summary names the Capital fee and the wait as the default winner", () => {
  const text = compareShopifyCapital(CAPITAL_BASE).summary;
  assert.match(text, /Waiting and self-funding/);
  assert.match(text, /\$1400\.00/);
  assert.match(text, /44\.8%/);
  assert.match(text, /\$368\.42 extra profit/);
});

const MANUAL_BASE = {
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

test("defaults match the published bank-transfer collection example", () => {
  assert.equal(DEFAULT_COLLECTION_PCT, 95);
  assert.equal(DEFAULT_MANUAL_DISCOUNT_PCT, 0);
  assert.equal(DEFAULT_CHASE_COST, 0);
});

test("holding until paid still barely beats the card at 95% collection", () => {
  // $54 revenue. Card fees 2.9% + $0.30 = $1.866.
  // Cash: $14 + $5 + $1 + $39/100 = $20.39. Card profit $31.744.
  // Manual paid: $54 − $20.39 = $33.61. Extra if they pay: $1.866.
  // Hold at 95%: 0.95 × $33.61 = $31.9295.
  // Ship first, 5% ghost: $31.9295 + 0.05 × (−$20.39) = $30.910.
  const r = compareManualPayment(MANUAL_BASE);
  near(r.cardFees, 1.866, "card fees");
  near(r.cashInvested, 20.39, "cash");
  near(r.card.kept, 31.744, "card leftover");
  near(r.paidProfit, 33.61, "paid bank transfer");
  near(r.extraIfPaid, 1.866, "fee save if they pay");
  near(r.hold.kept, 0.95 * 33.61, "hold expected");
  near(r.shipped.kept, 0.95 * 33.61 + 0.05 * -20.39, "shipped expected");
  near(r.breakEvenHoldPct, (31.744 / 33.61) * 100, "hold floor");
  near(r.breakEvenShippedPct, ((31.744 + 20.39) / 54) * 100, "shipped floor");
  near(r.monthlyExtraIfPaid, 1.866 * 100, "monthly if they all pay");
  assert.equal(r.winner, "hold");
  assert.ok(r.hold.kept > r.card.kept, "95% hold still beats the card");
  assert.ok(r.shipped.kept < r.card.kept, "shipping first loses at 95%");
});

test("a 90% collection rate makes the card beat holding the invoice", () => {
  const r = compareManualPayment({ ...MANUAL_BASE, collectionPct: 90 });
  near(r.hold.kept, 0.9 * 33.61, "90% hold");
  assert.ok(r.hold.kept < r.card.kept, "card wins once unpaid invoices stack");
  assert.equal(r.winner, "card");
});

test("100% collection makes hold and ship-first match, and names hold as the winner", () => {
  const r = compareManualPayment({ ...MANUAL_BASE, collectionPct: 100 });
  near(r.hold.kept, 33.61, "all invoices pay");
  near(r.shipped.kept, 33.61, "nothing ghosted");
  near(r.extraKeptOnHold, 1.866, "full fee save");
  assert.equal(r.winner, "hold");
});

test("a 2% pay-by-transfer discount shrinks the fee save", () => {
  const r = compareManualPayment({ ...MANUAL_BASE, collectionPct: 100, manualDiscountPct: 2 });
  near(r.manualPrice, 48 * 0.98, "discounted item");
  near(r.manualRevenue, 48 * 0.98 + 6, "discounted ticket");
  near(r.paidProfit, 48 * 0.98 + 6 - 20.39, "paid after discount");
  near(r.extraIfPaid, 48 * 0.98 + 6 - 20.39 - 31.744, "save after 2% off");
  assert.ok(r.extraIfPaid < 1.866, "the discount eats part of the processor save");
  assert.ok(r.extraIfPaid > 0, "2% off still cheaper than 2.9% + $0.30 here");
});

test("shipping first needs a higher collection floor than holding the order", () => {
  const r = compareManualPayment(MANUAL_BASE);
  assert.ok(r.breakEvenShippedPct > r.breakEvenHoldPct, "cash already spent is less forgiving");
  assert.ok(r.breakEvenShippedPct > 95, "defaults should lose if you ship first");
});

test("break-even hold rate solves when both the card and the bank-transfer hold are losses", () => {
  // A steep manual-payment discount on a thin-margin SKU makes paidProfit
  // negative -- holding for a bank transfer loses money even at 100%
  // collection, not just costs more. The card path is a bigger loss still,
  // so a real, positive collection rate ties the two. A guard that requires
  // paidProfit > 0 before dividing would report the floor as null instead.
  const input = {
    price: 10,
    shippingCharged: 0,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 8,
    shippingCost: 3,
    packagingCost: 0.3,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 1,
    paymentMethod: "shopify_payments",
    collectionPct: 95,
    manualDiscountPct: 20,
    chaseCost: 0,
  };
  const r = compareManualPayment(input);
  assert.ok(r.card.kept < 0, "the card path already loses money");
  assert.ok(r.paidProfit < 0, "holding for the bank transfer loses money even if everyone pays");
  assert.ok(
    r.breakEvenHoldPct !== null && Number.isFinite(r.breakEvenHoldPct),
    `hold floor should be reachable, got ${r.breakEvenHoldPct}`,
  );
  // Independently confirm the reported rate is really where holding ties
  // the card, using the pipeline's own card/paidProfit rather than
  // re-invoking the formula under test.
  const holdKeptAtEdge = (r.breakEvenHoldPct / 100) * r.paidProfit;
  near(holdKeptAtEdge, r.card.kept, "holding ties the card at the reported collection rate");
});

test("empty collection fields use the published defaults", () => {
  const r = compareManualPayment({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.collectionPct, DEFAULT_COLLECTION_PCT, "default collection");
  near(r.manualDiscountPct, DEFAULT_MANUAL_DISCOUNT_PCT, "default discount");
  near(r.chaseCost, DEFAULT_CHASE_COST, "default chase");
});

test("compareManualPayment rejects impossible rates and costs", () => {
  assert.throws(() => compareManualPayment({ ...MANUAL_BASE, collectionPct: 101 }), /Collection percent/);
  assert.throws(() => compareManualPayment({ ...MANUAL_BASE, manualDiscountPct: -1 }), /Manual payment discount/);
  assert.throws(() => compareManualPayment({ ...MANUAL_BASE, chaseCost: -2 }), /Chase \/ matching cost/);
});

test("summary names the hold winner and the collection floor", () => {
  const text = compareManualPayment(MANUAL_BASE).summary;
  assert.match(text, /Holding the order until the bank transfer clears/);
  assert.match(text, /\$1\.87/);
  assert.match(text, /94\.4%/);
  assert.match(text, /96\.5%/);
});

const CHARGEBACK_BASE = {
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

test("default chargeback table refunds now, then fight, then accept", () => {
  const r = compareChargeback(CHARGEBACK_BASE);
  near(r.completedProfit, 31.744, "completed sale");
  near(r.pulledAmount, 54, "processor pull");
  near(r.feeReturned, 1.866, "refunded processing fee");
  near(r.refund.kept, -20.39, "refund leftover is the cash already spent");
  near(r.fight.kept, -23.756, "25% win still pays the $15 fee");
  near(r.accept.kept, -37.256, "accept loses the ticket plus the fee");
  near(r.extraVsAccept, 16.866, "refund vs accept");
  near(r.extraVsFight, 3.366, "refund vs fight");
  near(r.breakEvenWinPct, (1 - (31.744 - 15 - 0 - -20.39) / 54) * 100, "win floor");
  assert.ok(r.breakEvenWinPct > 31 && r.breakEvenWinPct < 31.3, "about 31.2%");
  assert.equal(r.winner, "refund");
  near(r.chargebackFee, DEFAULT_CHARGEBACK_FEE, "default fee");
  near(r.winPct, DEFAULT_CHARGEBACK_WIN_PCT, "default win rate");
});

test("a high enough win rate makes fighting beat a refund", () => {
  const r = compareChargeback({ ...CHARGEBACK_BASE, chargebackWinPct: 40 });
  assert.ok(r.fight.kept > r.refund.kept, "40% already clears the 31.2% floor");
  assert.equal(r.winner, "fight");
  near(r.fight.kept, 0.4 * 31.744 + 0.6 * (31.744 - 54) - 15, "40% expected leftover");
});

test("accepting is the $15 fee plus fees a refund can still return", () => {
  const r = compareChargeback(CHARGEBACK_BASE);
  near(r.accept.kept, r.refund.kept - 15 - 1.866, "accept vs refund");
  near(r.extraKeptOnFight, r.fight.kept - r.accept.kept, "fight vs accept");
});

test("restocking the item on a refund shrinks the cash already spent", () => {
  const r = compareChargeback({ ...CHARGEBACK_BASE, chargebackRestockablePct: 100 });
  near(r.recoveredCogs, 14, "full COGS back");
  near(r.refund.kept, -20.39 + 14, "refund after restock");
  assert.equal(r.winner, "refund");
});

test("keeping the processing fee on a refund still beats accepting", () => {
  const r = compareChargeback({ ...CHARGEBACK_BASE, refundFeeKeptPct: 100 });
  near(r.feeReturned, 0, "no fee comes back");
  near(r.refund.kept, 31.744 - 54, "refund without fee return");
  assert.ok(r.refund.kept > r.accept.kept, "the $15 fee still makes accept worse");
  assert.equal(r.winner, "refund");
});

test("monthly chargebacks scale the refund-vs-accept gap", () => {
  const r = compareChargeback({ ...CHARGEBACK_BASE, monthlyChargebacks: 2 });
  near(r.monthlyExtraVsAccept, 16.866 * 2, "two disputes a month");
  near(r.monthlyChargebacks, DEFAULT_MONTHLY_CHARGEBACKS, "default volume");
});

test("empty chargeback fields use the published defaults", () => {
  const r = compareChargeback({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  near(r.chargebackFee, DEFAULT_CHARGEBACK_FEE, "default fee");
  near(r.winPct, DEFAULT_CHARGEBACK_WIN_PCT, "default win");
  near(r.fightCost, DEFAULT_FIGHT_COST, "default evidence cost");
  near(r.refundFeeKeptPct, DEFAULT_REFUND_FEE_KEPT_PCT, "default refunded fees");
  near(r.restockablePct, DEFAULT_CHARGEBACK_RESTOCKABLE_PCT, "default restock");
});

test("compareChargeback rejects impossible rates and costs", () => {
  assert.throws(() => compareChargeback({ ...CHARGEBACK_BASE, chargebackWinPct: 101 }), /Chargeback win percent/);
  assert.throws(() => compareChargeback({ ...CHARGEBACK_BASE, chargebackFee: -1 }), /Chargeback fee/);
  assert.throws(() => compareChargeback({ ...CHARGEBACK_BASE, fightCost: -2 }), /Fight \/ evidence cost/);
});

test("summary names the refund winner and the win-rate floor", () => {
  const text = compareChargeback(CHARGEBACK_BASE).summary;
  assert.match(text, /Refunding before the chargeback lands/);
  assert.match(text, /\$16\.87/);
  assert.match(text, /\$15\.00/);
  assert.match(text, /31\.2%/);
});

const LOCAL_BASE = {
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

test("defaults match the published local-delivery run", () => {
  assert.equal(DEFAULT_LOCAL_DELIVERY_FEE, 8);
  assert.equal(DEFAULT_LOCAL_DELIVERY_MINUTES, 25);
  assert.equal(DEFAULT_LOCAL_HOURLY_RATE, 18);
  assert.equal(DEFAULT_LOCAL_MILES, 8);
  assert.equal(DEFAULT_LOCAL_MILEAGE_RATE, 0.7);
  near(localDeliveryCost({ minutes: 25, hourlyRate: 18, miles: 8, mileageRate: 0.7 }), 13.1, "default run");
});

test("a 25-minute 8-mile drop-off loses to a $5 label on the default ticket", () => {
  // Ship: $54 revenue, $1.866 fees, $20.39 cash → $31.744.
  // Local: $8 fee, $13.10 run. $56 revenue, $1.924 fees, $28.49 cash → $25.586.
  // Charge shipping / deliver: $54 revenue, $1.866 fees, $28.49 cash → $23.644.
  const r = compareLocalDelivery(LOCAL_BASE);
  near(r.deliveryCost, 13.1, "run cost");
  near(r.ship.profit, 31.744, "label leftover");
  near(r.local.profit, 25.586, "local leftover");
  near(r.chargeShipDeliver.profit, 23.644, "keep-postage leftover");
  near(r.extraKeptOnLocal, 25.586 - 31.744, "local vs label");
  near(r.monthlyExtraOnLocal, (25.586 - 31.744) * 100, "hundred orders");
  near(r.breakEvenDeliveryCost, 6.942, "run ceiling");
  assert.equal(r.winner, "ship");
  assert.ok(r.ship.profit > r.local.profit, "label beats the long run");
  assert.ok(r.local.profit > r.chargeShipDeliver.profit, "charging a delivery fee beats keeping $6 postage");
});

test("a short nearby run flips local delivery ahead", () => {
  const r = compareLocalDelivery({
    ...LOCAL_BASE,
    localDeliveryMinutes: 12,
    localMiles: 3,
  });
  near(r.deliveryCost, 12 / 60 * 18 + 3 * 0.7, "12 min / 3 mi");
  near(r.local.profit, 32.986, "short-run leftover");
  assert.equal(r.winner, "local");
  assert.ok(r.extraKeptOnLocal > 0, "nearby drop-off beats the label");
});

test("empty local-delivery fields use the published defaults", () => {
  const r = compareLocalDelivery(LOCAL_BASE);
  near(r.deliveryFee, DEFAULT_LOCAL_DELIVERY_FEE, "default fee");
  near(r.minutes, DEFAULT_LOCAL_DELIVERY_MINUTES, "default minutes");
  near(r.miles, DEFAULT_LOCAL_MILES, "default miles");
});

test("compareLocalDelivery rejects a negative run input", () => {
  assert.throws(() => compareLocalDelivery({ ...LOCAL_BASE, localDeliveryMinutes: -1 }), /Local delivery minutes/);
  assert.throws(() => compareLocalDelivery({ ...LOCAL_BASE, localMiles: -2 }), /Local delivery miles/);
});

test("summary names the label winner and the run ceiling", () => {
  const text = compareLocalDelivery(LOCAL_BASE).summary;
  assert.match(text, /\$13\.10 run cost/);
  assert.match(text, /\$6\.16 less/);
  assert.match(text, /\$6\.94/);
  assert.doesNotMatch(text, /should offer|must deliver|turn on local/i);
});

const GIFT_BASE = {
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

test("defaults match the published gift-card face and redemption", () => {
  assert.equal(DEFAULT_GIFT_CARD_FACE, 50);
  assert.equal(DEFAULT_GIFT_CARD_PRICE, 50);
  assert.equal(DEFAULT_GIFT_CARD_REDEMPTION_PCT, 80);
  assert.equal(DEFAULT_MONTHLY_GIFT_CARDS, 20);
});

test("a $50 card they redeem on the $54 ticket loses the second swipe", () => {
  // Sell now: $54 revenue, $1.866 fees + $0.39 plan + $20 cash → $31.744.
  // Gift card sale: $50 × 2.9% + $0.30 = $1.75. $4 leftover swipe = $0.416.
  // Cycle: $54 collected − $2.166 fees − $0.39 plan − $20 = $31.444.
  const r = compareGiftCard(GIFT_BASE);
  near(r.saleFees, 1.75, "sale-day fees");
  near(r.remainder, 4, "top-up");
  near(r.remainderFees, 0.416, "second swipe");
  near(r.sell.kept, 31.744, "sell now");
  near(r.redeem.kept, 31.444, "redeem cycle");
  near(r.expected.kept, 34.7272, "80% mix includes breakage");
  near(r.cashToday, 47.86, "cash after sale-day fees and plan");
  near(r.extraOnRedeem, -0.3, "second $0.30 is the gap");
  near(r.monthlyExtraOnRedeem, -6, "20 cards");
  assert.equal(r.winner, "sell");
  assert.ok(r.sell.kept > r.redeem.kept, "selling the SKU beats a later redeem");
  assert.ok(r.expected.kept > r.sell.kept, "breakage makes the mix look better");
});

test("a $45 sale on a $50 card they redeem loses the discount plus the swipe", () => {
  const r = compareGiftCard({ ...GIFT_BASE, giftCardPrice: 45 });
  near(r.promoDiscount, 5, "ten percent off");
  near(r.saleFees, 1.605, "fees on $45");
  near(r.redeem.kept, 26.589, "promo redeem leftover");
  near(r.extraOnRedeem, -5.155, "discount plus second swipe");
  assert.equal(r.winner, "sell");
});

test("empty gift-card fields use the published defaults", () => {
  const r = compareGiftCard(GIFT_BASE);
  near(r.face, DEFAULT_GIFT_CARD_FACE, "default face");
  near(r.cardPrice, DEFAULT_GIFT_CARD_PRICE, "default price");
  near(r.redemptionPct, DEFAULT_GIFT_CARD_REDEMPTION_PCT, "default redeem");
  near(r.monthlyGiftCards, DEFAULT_MONTHLY_GIFT_CARDS, "default volume");
});

test("compareGiftCard rejects a zero face and an over-100 redemption", () => {
  assert.throws(() => compareGiftCard({ ...GIFT_BASE, giftCardFace: 0 }), /Gift card face/);
  assert.throws(() => compareGiftCard({ ...GIFT_BASE, giftCardFace: -5 }), /Gift card face/);
  assert.throws(() => compareGiftCard({ ...GIFT_BASE, giftCardRedemptionPct: 101 }), /Gift card redemption percent/);
  assert.throws(() => compareGiftCard({ ...GIFT_BASE, giftCardPrice: -1 }), /Gift card price/);
});

test("summary names the sell-now winner and does not treat breakage as a plan", () => {
  const text = compareGiftCard(GIFT_BASE).summary;
  assert.match(text, /\$0\.30 more/);
  assert.match(text, /\$0\.42/);
  assert.match(text, /\$1\.75/);
  assert.match(text, /\$34\.73/);
  assert.match(text, /unredeemed cards/);
  assert.match(text, /\$6\.00/);
  assert.doesNotMatch(text, /should sell|must offer|turn on gift/i);
});

const MARKETS_BASE = {
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

test("defaults match the published Markets duty starting points", () => {
  assert.equal(DEFAULT_DUTY_RATE_PCT, 15);
  assert.equal(DEFAULT_DAP_TAKE_PCT, 55);
  assert.equal(DEFAULT_DDP_TAKE_PCT, 42);
  assert.equal(DEFAULT_DAP_REFUSE_PCT, 18);
  assert.equal(DEFAULT_DDP_REFUSE_PCT, 6);
  assert.equal(DEFAULT_DUTY_RETURN_LABEL, 8);
  assert.equal(DEFAULT_DUTY_RESTOCKABLE_PCT, 80);
  assert.equal(DEFAULT_DUTY_REFUND_FEE_LEFTOVER, 0.3);
  assert.equal(DEFAULT_MONTHLY_INTL_VISITORS, 20);
});

test("DAP on the $54 ticket keeps more than DDP after the fee on duty", () => {
  // Ticket $54. Duty 15% = $8.10. DAP fees $1.866. Delivered leftover
  // $54 − $1.866 − $20.39 = $31.744. Refuse eats $0.30 leftover fee +
  // $5 outbound + $8 return + $1 pack + 20% of $14 + $0.39 plan = $17.49.
  // DAP mix 55% take / 18% refuse → $12.585 / visitor.
  // DDP checkout $62.10, fees $2.1009, remits $8.10 → delivered $31.5091.
  // DDP mix 42% / 6% → $11.999 / visitor.
  const r = compareMarketsDuties(MARKETS_BASE);
  near(r.ticket, 54, "ticket");
  near(r.dutyAmount, 8.1, "duty");
  near(r.feeOnDuty, 8.1 * 0.029, "fee on duty");
  near(r.dap.deliveredProfit, 31.744, "DAP delivered");
  near(r.dap.refusedProfit, -17.49, "refuse leftover");
  near(r.ddp.deliveredProfit, 31.5091, "DDP delivered");
  near(r.dap.expected, 12.585034, "DAP expected");
  near(r.ddp.expected, 11.99904468, "DDP expected");
  near(r.skip.expected, 0, "skip");
  near(r.extraOnDapVsDdp, 0.58598932, "DAP minus DDP");
  near(r.monthlyExtraOnDapVsDdp, 11.7197864, "20 visitors");
  near(r.breakEvenDapRefusePct, 20.16402309, "DAP refuse floor");
  near(r.breakEvenDdpTakePct, 44.05112591, "DDP take floor");
  assert.equal(r.winner, "dap");
  assert.ok(r.dap.expected > r.ddp.expected, "DAP wins the default mix");
  assert.ok(r.ddp.expected > r.skip.expected, "offering international still beats skip");
});

test("a 25% DAP door-refuse rate flips the table to DDP", () => {
  const r = compareMarketsDuties({ ...MARKETS_BASE, dapRefusePct: 25 });
  near(r.dap.expected, 10.689525, "DAP at 25% refuse");
  assert.ok(r.ddp.expected > r.dap.expected, "DDP keeps more when DAP refuse rises");
  assert.equal(r.winner, "ddp");
});

test("empty Markets fields use the published defaults", () => {
  const r = compareMarketsDuties(MARKETS_BASE);
  near(r.dutyRatePct, DEFAULT_DUTY_RATE_PCT, "default duty");
  near(r.dapTakePct, DEFAULT_DAP_TAKE_PCT, "default DAP take");
  near(r.ddpTakePct, DEFAULT_DDP_TAKE_PCT, "default DDP take");
  near(r.dapRefusePct, DEFAULT_DAP_REFUSE_PCT, "default DAP refuse");
  near(r.ddpRefusePct, DEFAULT_DDP_REFUSE_PCT, "default DDP refuse");
  near(r.returnLabel, DEFAULT_DUTY_RETURN_LABEL, "default return");
  near(r.monthlyVisitors, DEFAULT_MONTHLY_INTL_VISITORS, "default visitors");
});

test("compareMarketsDuties rejects a duty rate over 100 and a negative label", () => {
  assert.throws(() => compareMarketsDuties({ ...MARKETS_BASE, dutyRatePct: 101 }), /Duty rate/);
  assert.throws(() => compareMarketsDuties({ ...MARKETS_BASE, dapTakePct: 120 }), /DAP take percent/);
  assert.throws(() => compareMarketsDuties({ ...MARKETS_BASE, dutyReturnLabel: -1 }), /International return label/);
  assert.throws(() => compareMarketsDuties({ ...MARKETS_BASE, dutyRefundFeeLeftover: -0.3 }), /Refund fee leftover/);
});

test("summary names the DAP leftover and does not tell you to turn Markets on", () => {
  const text = compareMarketsDuties(MARKETS_BASE).summary;
  assert.match(text, /\$12\.59/);
  assert.match(text, /\$12\.00/);
  assert.match(text, /\$8\.10/);
  assert.match(text, /\$0\.23/);
  assert.match(text, /20\.2%/);
  assert.match(text, /44\.1%/);
  assert.match(text, /\$11\.72/);
  assert.doesNotMatch(text, /should collect|must offer|turn on markets|turn on duties/i);
});

const ABANDONED_BASE = {
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

test("defaults match the published abandoned-checkout starting points", () => {
  assert.equal(DEFAULT_ORGANIC_RECOVER_PCT, 6);
  assert.equal(DEFAULT_EMAIL_RECOVER_PCT, 12);
  assert.equal(DEFAULT_DISCOUNT_RECOVER_PCT, 18);
  assert.equal(DEFAULT_RECOVERY_DISCOUNT_PCT, 10);
  assert.equal(DEFAULT_EMAIL_COST_PER_ABANDONED, 0.08);
  assert.equal(DEFAULT_MONTHLY_ABANDONED, 80);
});

test("emails plus a 10% coupon keep more than leaving an abandoned checkout", () => {
  // Full ticket $54. Fees $1.866. Cash $20.39. Completed leftover $31.744.
  // Leave 6% → $1.90464. Emails 12% × $31.744 − $0.08 → $3.72928.
  // Coupon ticket $49.20. Fees $1.7268. Leftover $27.0832.
  // Discount 18% × $27.0832 − $0.08 → $4.794976.
  const r = compareAbandonedCheckout(ABANDONED_BASE);
  near(r.ticket, 54, "ticket");
  near(r.discountedTicket, 49.2, "discounted ticket");
  near(r.discountedPrice, 43.2, "discounted item");
  near(r.leave.completedProfit, 31.744, "list leftover");
  near(r.discount.completedProfit, 27.0832, "coupon leftover");
  near(r.leave.expected, 1.90464, "leave expected");
  near(r.email.expected, 3.72928, "email expected");
  near(r.discount.expected, 4.794976, "discount expected");
  near(r.extraOnEmailVsLeave, 1.82464, "email minus leave");
  near(r.extraOnDiscountVsEmail, 1.065696, "discount minus email");
  near(r.extraOnDiscountVsLeave, 2.890336, "discount minus leave");
  near(r.monthlyExtraOnDiscountVsLeave, 231.22688, "80 abandoned");
  near(r.breakEvenEmailRecoverPct, 6.25201613, "email recover floor");
  near(r.breakEvenDiscountRecoverPct, 14.06510309, "coupon recover floor");
  near(r.breakEvenEmailCostVsLeave, 1.90464, "email cost ceiling");
  assert.equal(r.winner, "discount");
  assert.ok(r.discount.expected > r.email.expected, "coupon wins the default mix");
  assert.ok(r.email.expected > r.leave.expected, "emails still beat leaving it");
});

test("a matched 12% recover rate on the coupon flips the table to emails", () => {
  const r = compareAbandonedCheckout({ ...ABANDONED_BASE, discountRecoverPct: 12 });
  near(r.discount.expected, 3.169984, "matched-rate coupon");
  assert.ok(r.email.expected > r.discount.expected, "emails keep more without a lift");
  assert.equal(r.winner, "email");
});

test("a $3 allocated send cost flips the table back to leaving it", () => {
  const r = compareAbandonedCheckout({ ...ABANDONED_BASE, emailCostPerAbandoned: 3 });
  near(r.email.expected, 0.80928, "emails at $3");
  near(r.discount.expected, 1.874976, "coupon at $3");
  assert.ok(r.leave.expected > r.discount.expected, "leave keeps more when send cost is high");
  assert.equal(r.winner, "leave");
});

test("empty abandoned-checkout fields use the published defaults", () => {
  const r = compareAbandonedCheckout(ABANDONED_BASE);
  near(r.organicRecoverPct, DEFAULT_ORGANIC_RECOVER_PCT, "default organic");
  near(r.emailRecoverPct, DEFAULT_EMAIL_RECOVER_PCT, "default email recover");
  near(r.discountRecoverPct, DEFAULT_DISCOUNT_RECOVER_PCT, "default coupon recover");
  near(r.discountPct, DEFAULT_RECOVERY_DISCOUNT_PCT, "default coupon");
  near(r.emailCost, DEFAULT_EMAIL_COST_PER_ABANDONED, "default email cost");
  near(r.monthlyAbandoned, DEFAULT_MONTHLY_ABANDONED, "default month");
});

test("compareAbandonedCheckout rejects a recover rate over 100 and a zero month", () => {
  assert.throws(() => compareAbandonedCheckout({ ...ABANDONED_BASE, emailRecoverPct: 101 }), /Email recover percent/);
  assert.throws(() => compareAbandonedCheckout({ ...ABANDONED_BASE, recoveryDiscountPct: 120 }), /Recovery discount percent/);
  assert.throws(() => compareAbandonedCheckout({ ...ABANDONED_BASE, emailCostPerAbandoned: -1 }), /Email cost/);
  assert.throws(() => compareAbandonedCheckout({ ...ABANDONED_BASE, monthlyAbandonedCheckouts: 0 }), /greater than zero/);
});

test("summary names the abandoned leftover and does not tell you to send emails", () => {
  const text = compareAbandonedCheckout(ABANDONED_BASE).summary;
  assert.match(text, /\$1\.90/);
  assert.match(text, /\$3\.73/);
  assert.match(text, /\$4\.79/);
  assert.match(text, /\$31\.74/);
  assert.match(text, /\$27\.08/);
  assert.match(text, /6\.3%/);
  assert.match(text, /14\.1%/);
  assert.match(text, /\$231\.23/);
  assert.doesNotMatch(text, /should send|must offer|turn on emails|turn on recovery/i);
});

test("break-even recover rates still solve when the completed order is already a loss", () => {
  // Cost of goods eats most of a $10 ticket, so the completed order (and the
  // discounted one) both lose money before any recovery is applied. A
  // hard-code that treats "completed profit <= 0" as "no rate can match"
  // would report both floors as unreachable even though the leave/email
  // baselines are also negative and a real, positive rate ties them.
  const input = {
    price: 10,
    shippingCharged: 0,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 9,
    shippingCost: 1,
    packagingCost: 0.3,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
    organicRecoverPct: 20,
    emailRecoverPct: 40,
    discountRecoverPct: 60,
    recoveryDiscountPct: 5,
    emailCostPerAbandoned: 0.05,
    monthlyAbandonedCheckouts: 80,
  };
  const r = compareAbandonedCheckout(input);
  assert.ok(r.leave.completedProfit < 0, "full-price completed order already loses money");
  assert.ok(r.discount.completedProfit < 0, "discounted completed order also loses money");
  assert.ok(
    Number.isFinite(r.breakEvenEmailRecoverPct),
    `email recover floor should be reachable, got ${r.breakEvenEmailRecoverPct}`,
  );
  assert.ok(
    Number.isFinite(r.breakEvenDiscountRecoverPct),
    `discount recover floor should be reachable, got ${r.breakEvenDiscountRecoverPct}`,
  );
  // Independently confirm the reported rate is really where the two paths
  // tie, by recomputing through the primary calculateOrder-backed pipeline
  // at that rate rather than trusting the formula that produced it.
  const atEmailEdge = compareAbandonedCheckout({ ...input, emailRecoverPct: r.breakEvenEmailRecoverPct });
  near(atEmailEdge.email.expected, atEmailEdge.leave.expected, "email ties leave at its reported break-even rate");
  const atDiscountEdge = compareAbandonedCheckout({ ...input, discountRecoverPct: r.breakEvenDiscountRecoverPct });
  near(atDiscountEdge.discount.expected, atDiscountEdge.email.expected, "discount ties email at its reported break-even rate");
});

const SUB_BASE = {
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

test("defaults match the published subscription starting points", () => {
  assert.equal(DEFAULT_SUBSCRIBE_DISCOUNT_PCT, 10);
  assert.equal(DEFAULT_PREPAID_DISCOUNT_PCT, 15);
  assert.equal(DEFAULT_PREPAID_MONTHS, 3);
  assert.equal(DEFAULT_SUBSCRIPTION_FEE_PCT, 1);
  assert.equal(DEFAULT_EXPECTED_CYCLES, 5);
  assert.equal(DEFAULT_SKIP_PCT, 20);
  assert.equal(DEFAULT_SUBSCRIBE_ENROLL_PCT, 25);
  assert.equal(DEFAULT_MONTHLY_SUB_BUYERS, 80);
});

test("monthly subscribe keeps more than one-time after four paid cycles", () => {
  // List ticket $54. Fees $1.866. Cash $20.39. One-time leftover $31.744.
  // Subscribe item $43.20, ticket $49.20. Fees $1.7268. 1% billing $0.492.
  // Cycle leftover $26.5912. 5 months × 20% skip → 4 paid cycles → $106.3648.
  // Prepaid 15% item $40.80 × 3 + $18 shipping = $140.40. Fees $4.3716.
  // Billing $1.404. Cash $60.39 (3 fulfillments, one plan share). Leftover $74.2344.
  const r = compareSubscriptions(SUB_BASE);
  near(r.ticket, 54, "ticket");
  near(r.monthlyTicket, 49.2, "monthly ticket");
  near(r.prepaidTicket, 140.4, "prepaid ticket");
  near(r.monthlyPrice, 43.2, "monthly item");
  near(r.prepaidPrice, 40.8, "prepaid item");
  near(r.oneTime.lifetime, 31.744, "one-time leftover");
  near(r.monthly.cycleProfit, 26.5912, "monthly cycle");
  near(r.monthly.lifetime, 106.3648, "monthly lifetime");
  near(r.prepaid.lifetime, 74.2344, "prepaid leftover");
  near(r.paidCycles, 4, "paid cycles");
  near(r.monthlyAppFee, 0.492, "monthly billing fee");
  near(r.prepaidAppFee, 1.404, "prepaid billing fee");
  near(r.extraOnMonthlyVsOneTime, 74.6208, "monthly minus one-time");
  near(r.extraOnPrepaidVsMonthly, -32.1304, "prepaid minus monthly");
  near(r.extraOnPrepaidVsOneTime, 42.4904, "prepaid minus one-time");
  near(r.mixedLifetime, 50.3992, "25% enroll mix");
  near(r.extraOnEnrollVsOneTime, 18.6552, "enroll minus one-time");
  near(r.monthlyExtraOnEnrollVsOneTime, 1492.416, "80 buyers");
  near(r.breakEvenPaidCycles, 1.1937783928517705, "paid-cycle floor");
  near(r.breakEvenSkipPct, 76.1244321429646, "skip ceiling");
  near(r.breakEvenAppFeePct, 38.91707317073171, "billing-fee ceiling");
  assert.equal(r.winner, "monthly");
  assert.ok(r.monthly.lifetime > r.prepaid.lifetime, "monthly wins the default stay");
  assert.ok(r.prepaid.lifetime > r.oneTime.lifetime, "prepaid still beats one-time");
});

test("one paid cycle with a 20% one-month prepaid flips the table to one-time", () => {
  const r = compareSubscriptions({
    ...SUB_BASE,
    expectedCycles: 1,
    skipPct: 0,
    prepaidMonths: 1,
    prepaidDiscountPct: 20,
  });
  near(r.monthly.lifetime, 26.5912, "one-cycle monthly");
  near(r.prepaid.lifetime, 21.9784, "one-month 20% prepaid");
  assert.ok(r.oneTime.lifetime > r.monthly.lifetime, "one-time keeps more after one cycle");
  assert.equal(r.winner, "one_time");
});

test("an 80% skip rate flips the table to the prepaid pack", () => {
  const r = compareSubscriptions({ ...SUB_BASE, skipPct: 80 });
  near(r.paidCycles, 1, "one paid cycle after skip");
  near(r.monthly.lifetime, 26.5912, "monthly at one paid cycle");
  assert.ok(r.prepaid.lifetime > r.oneTime.lifetime, "prepaid still beats one-time");
  assert.ok(r.prepaid.lifetime > r.monthly.lifetime, "prepaid beats a one-cycle stay");
  assert.equal(r.winner, "prepaid");
});

test("empty subscription fields use the published defaults", () => {
  const r = compareSubscriptions(SUB_BASE);
  near(r.subscribeDiscountPct, DEFAULT_SUBSCRIBE_DISCOUNT_PCT, "default subscribe discount");
  near(r.prepaidDiscountPct, DEFAULT_PREPAID_DISCOUNT_PCT, "default prepaid discount");
  near(r.prepaidMonths, DEFAULT_PREPAID_MONTHS, "default prepaid months");
  near(r.subscriptionFeePct, DEFAULT_SUBSCRIPTION_FEE_PCT, "default billing fee");
  near(r.expectedCycles, DEFAULT_EXPECTED_CYCLES, "default stay");
  near(r.skipPct, DEFAULT_SKIP_PCT, "default skip");
  near(r.enrollPct, DEFAULT_SUBSCRIBE_ENROLL_PCT, "default enroll");
  near(r.monthlyBuyers, DEFAULT_MONTHLY_SUB_BUYERS, "default buyers");
});

test("compareSubscriptions rejects a discount over 100 and a zero stay", () => {
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, subscribeDiscountPct: 101 }), /Subscribe discount percent/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, prepaidDiscountPct: 120 }), /Prepaid discount percent/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, subscriptionFeePct: 101 }), /Subscription fee percent/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, skipPct: 120 }), /Skip percent/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, expectedCycles: 0 }), /greater than zero/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, prepaidMonths: 0 }), /at least 1/);
  assert.throws(() => compareSubscriptions({ ...SUB_BASE, monthlySubscriptionBuyers: 0 }), /greater than zero/);
});

test("summary names the subscription leftover and does not tell you to turn subscriptions on", () => {
  const text = compareSubscriptions(SUB_BASE).summary;
  assert.match(text, /\$31\.74/);
  assert.match(text, /\$26\.59/);
  assert.match(text, /\$106\.36/);
  assert.match(text, /\$74\.62/);
  assert.match(text, /\$74\.23/);
  assert.match(text, /\$32\.13/);
  assert.match(text, /1\.2/);
  assert.match(text, /76\.1%/);
  assert.match(text, /38\.9%/);
  assert.match(text, /\$1492\.42/);
  assert.doesNotMatch(text, /should offer|must offer|turn on subscriptions|turn on selling plans/i);
});

test("break-even paid cycles and skip rate still solve when the subscription itself loses money", () => {
  // A shallow subscribe discount plus a billing fee on a thin-margin SKU
  // makes monthlyCycleProfit negative -- the subscription loses money on
  // every paid cycle, not just costs more. The one-time order is also a
  // loss here, so a real, positive cycle count still ties them; a hard-code
  // that requires monthlyCycleProfit > 0 before dividing would report both
  // floors as unreachable instead.
  const input = {
    price: 10,
    shippingCharged: 0,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 9.5,
    shippingCost: 1,
    packagingCost: 0.2,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
    subscribeDiscountPct: 5,
    prepaidDiscountPct: 15,
    prepaidMonths: 3,
    subscriptionFeePct: 1,
    expectedCycles: 5,
    skipPct: 20,
    subscribeEnrollPct: 25,
    monthlySubscriptionBuyers: 80,
  };
  const r = compareSubscriptions(input);
  assert.ok(r.oneTime.cycleProfit < 0, "one-time order already loses money");
  assert.ok(r.monthly.cycleProfit < 0, "subscription cycle also loses money");
  assert.ok(
    Number.isFinite(r.breakEvenPaidCycles),
    `paid-cycles floor should be reachable, got ${r.breakEvenPaidCycles}`,
  );
  assert.ok(
    Number.isFinite(r.breakEvenSkipPct),
    `skip-rate floor should be reachable, got ${r.breakEvenSkipPct}`,
  );
  // Independently confirm the reported cycle count is really where the two
  // paths tie: it is defined by monthlyCycleProfit * cycles == oneTimeProfit,
  // checked here with plain arithmetic on the pipeline's own outputs rather
  // than by re-invoking the formula under test.
  near(
    r.monthly.cycleProfit * r.breakEvenPaidCycles,
    r.oneTime.cycleProfit,
    "monthly lifetime at the reported cycle count matches one-time",
  );
  const paidCyclesAtReportedSkip = r.expectedCycles * (1 - r.breakEvenSkipPct / 100);
  near(
    r.monthly.cycleProfit * paidCyclesAtReportedSkip,
    r.oneTime.cycleProfit,
    "monthly lifetime at the reported skip rate matches one-time",
  );
});

const PICKUP_BASE = {
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

test("defaults match the published pickup starting points", () => {
  assert.equal(DEFAULT_PICKUP_FEE, 3);
  assert.equal(DEFAULT_PICKUP_MINUTES, 8);
  assert.equal(DEFAULT_PICKUP_HOURLY_RATE, 18);
  assert.equal(DEFAULT_PICKUP_PACKAGING, 0.4);
  assert.equal(DEFAULT_PICKUP_NO_SHOW_PCT, 12);
  assert.equal(DEFAULT_MONTHLY_PICKUP_ORDERS, 40);
});

test("pickup staff cost is minutes at the typed wage", () => {
  near(pickupStaffCost({ minutes: 8, hourlyRate: 18 }), 2.4, "default pick");
  near(pickupStaffCost({ minutes: 5, hourlyRate: 18 }), 1.5, "short pick");
});

test("the label keeps more than free pickup after a 12% no-show", () => {
  // Ship: $54 ticket, fees $1.866, cash $20.39, leftover $31.744.
  // Free pickup: $48 ticket, fees $1.692, labor $2.40 + $0.40 bag + $14 + $0.39
  // = $17.19 cash, leftover $29.118 if they show.
  // No-show refund: −$2.80 (fees reversed, inventory back). 12% mix → $25.28784.
  // Paid $3 pickup: $51 ticket, fees $1.779, leftover $32.031 show / $27.85128 mix.
  const r = comparePickup(PICKUP_BASE);
  near(r.timeCost, 2.4, "staff time");
  near(r.pickupFulfillment, 2.8, "staff plus bag");
  near(r.ship.completedProfit, 31.744, "label leftover");
  near(r.free.completedProfit, 29.118, "free if they show");
  near(r.paid.completedProfit, 32.031, "paid if they show");
  near(r.free.expectedProfit, 25.28784, "free after no-show");
  near(r.paid.expectedProfit, 27.85128, "paid after no-show");
  near(r.extraKeptOnFree, -6.45616, "free minus label");
  near(r.extraKeptOnPaid, -3.89272, "paid minus label");
  near(r.monthlyExtraOnFree, -258.2464, "40 pickups");
  near(r.noShowResult, -2.8, "refunded no-show");
  near(r.breakEvenShippingCost, 11.45616, "label that ties free pickup");
  assert.equal(r.breakEvenNoShowPct, Infinity);
  assert.equal(r.breakEvenMinutes, Infinity);
  assert.equal(r.winner, "ship");
});

test("already-free shipping with a short pick flips free pickup ahead", () => {
  const r = comparePickup({
    ...PICKUP_BASE,
    shippingCharged: 0,
    shippingCost: 8,
    pickupFee: 0,
    pickupMinutes: 5,
    pickupNoShowPct: 5,
  });
  near(r.ship.expectedProfit, 22.918, "free-ship $8 label");
  near(r.free.completedProfit, 30.018, "5-minute show");
  near(r.free.expectedProfit, 28.4221, "5% no-show mix");
  assert.ok(r.free.expectedProfit > r.ship.expectedProfit, "pickup beats the baked label");
  assert.equal(r.winner, "free");
});

test("empty pickup fields use the published defaults", () => {
  const r = comparePickup(PICKUP_BASE);
  near(r.pickupFee, DEFAULT_PICKUP_FEE, "default fee");
  near(r.minutes, DEFAULT_PICKUP_MINUTES, "default minutes");
  near(r.hourlyRate, DEFAULT_PICKUP_HOURLY_RATE, "default wage");
  near(r.pickupPack, DEFAULT_PICKUP_PACKAGING, "default bag");
  near(r.noShowPct, DEFAULT_PICKUP_NO_SHOW_PCT, "default no-show");
  near(r.monthlyPickupOrders, DEFAULT_MONTHLY_PICKUP_ORDERS, "default month");
});

test("comparePickup rejects a no-show over 100 and a zero month", () => {
  assert.throws(() => comparePickup({ ...PICKUP_BASE, pickupNoShowPct: 101 }), /Pickup no-show percent/);
  assert.throws(() => comparePickup({ ...PICKUP_BASE, pickupMinutes: -1 }), /Pickup minutes/);
  assert.throws(() => comparePickup({ ...PICKUP_BASE, monthlyPickupOrders: 0 }), /greater than zero/);
});

test("summary names the pickup leftover and does not tell you to turn pickup on", () => {
  const text = comparePickup(PICKUP_BASE).summary;
  assert.match(text, /\$31\.74/);
  assert.match(text, /\$25\.29/);
  assert.match(text, /\$29\.12/);
  assert.match(text, /\$27\.85/);
  assert.match(text, /\$6\.46/);
  assert.match(text, /\$2\.80/);
  assert.match(text, /\$11\.46/);
  assert.match(text, /\$258\.25/);
  assert.match(text, /Even a 0% no-show/);
  assert.doesNotMatch(text, /should offer|must offer|turn on pickup|turn on local pickup/i);
});

test("break-even no-show rate solves when a no-show is the better outcome than completing", () => {
  // High cost of goods relative to price makes a completed free-pickup sale
  // a much bigger loss than the fixed labor/bag cost of a no-show -- so a
  // no-show is the *better* outcome here, and a higher no-show rate is what
  // lifts free pickup up to match shipping, not down. A guard that requires
  // free pickup to already lead at 0% no-show misses this crossing entirely.
  const input = {
    price: 10,
    shippingCharged: 5,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 50,
    shippingCost: 4,
    packagingCost: 0.5,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 1,
    paymentMethod: "shopify_payments",
    pickupFee: 3,
    pickupMinutes: 8,
    pickupHourlyRate: 18,
    pickupPackagingCost: 0.4,
    pickupNoShowPct: 12,
    monthlyPickupOrders: 40,
  };
  const r = comparePickup(input);
  assert.ok(r.free.completedProfit < r.ship.expectedProfit, "free pickup starts behind shipping if everyone shows");
  assert.ok(
    Number.isFinite(r.breakEvenNoShowPct),
    `no-show floor should be reachable, got ${r.breakEvenNoShowPct}`,
  );
  // Independently confirm the reported rate is really where free pickup
  // rises to meet shipping, using the pipeline's own completedProfit and
  // noShowResult rather than re-invoking the formula under test.
  const showFrac = 1 - r.breakEvenNoShowPct / 100;
  const freeExpectedAtEdge = showFrac * r.free.completedProfit + (1 - showFrac) * r.noShowResult;
  near(freeExpectedAtEdge, r.ship.expectedProfit, "free pickup ties shipping at the reported no-show rate");
});

const UPSELL_BASE = {
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

test("defaults match the published upsell starting points", () => {
  assert.equal(DEFAULT_ADDON_PRICE, 18);
  assert.equal(DEFAULT_ADDON_COST, 6);
  assert.equal(DEFAULT_ADDON_DISCOUNT_PCT, 10);
  assert.equal(DEFAULT_CHECKOUT_TAKE_PCT, 18);
  assert.equal(DEFAULT_POST_PURCHASE_TAKE_PCT, 12);
  assert.equal(DEFAULT_CHECKOUT_DROP_PCT, 2);
  assert.equal(DEFAULT_ADDON_PACKAGING, 0.5);
  assert.equal(DEFAULT_ADDON_LABEL, 0);
  assert.equal(DEFAULT_MONTHLY_UPSELL_CHECKOUTS, 80);
});

test("one-click keeps a hair more than checkout after a 2% extra abandon", () => {
  // Hero: $54 ticket, leftover $31.744.
  // Combined first swipe: $48 + $16.20 add-on + $6 ship = $70.20,
  // fees $2.3358, cash $26.89, leftover $40.9742.
  // Checkout mix at 18% take / 2% drop: $32.73732728.
  // Second swipe: $16.20, fees $0.7698, cash $6.50, leftover $8.9302.
  // Post at 12% take: $31.744 + $1.071624 = $32.815624.
  const r = compareUpsell(UPSELL_BASE);
  near(r.skip.expectedProfit, 31.744, "skip leftover");
  near(r.discountedAddOn, 16.2, "10% off $18");
  near(r.combinedTicket, 70.2, "combined ticket");
  near(r.combinedProfit, 40.9742, "if they add at checkout");
  near(r.addOnProfit, 8.9302, "second swipe leftover");
  near(r.checkoutIfComplete, 33.405436, "checkout if they still pay");
  near(r.checkout.expectedProfit, 32.73732728, "checkout after drop");
  near(r.post.expectedProfit, 32.815624, "one-click mix");
  near(r.extraOnCheckout, 0.99332728, "checkout minus skip");
  near(r.extraOnPost, 1.071624, "one-click minus skip");
  near(r.extraOnPostVsCheckout, 0.07829672, "one-click minus checkout");
  near(r.monthlyExtraOnPost, 85.72992, "80 checkouts");
  near(r.breakEvenCheckoutTakePct, 7.018664110137129, "checkout take floor");
  near(r.breakEvenPostTakeVsCheckout, 11.123236657633678, "one-click take vs checkout");
  near(r.breakEvenCheckoutDropPct, 1.7656168295483443, "drop that ties one-click");
  assert.equal(r.winner, "post");
});

test("zero extra abandon flips the checkout add-on ahead", () => {
  const r = compareUpsell({ ...UPSELL_BASE, checkoutDropPct: 0 });
  near(r.checkout.expectedProfit, 33.405436, "no-drop checkout mix");
  near(r.post.expectedProfit, 32.815624, "one-click unchanged");
  assert.ok(r.checkout.expectedProfit > r.post.expectedProfit, "first swipe wins without drop");
  assert.equal(r.winner, "checkout");
});

test("empty upsell fields use the published defaults", () => {
  const r = compareUpsell(UPSELL_BASE);
  near(r.addOnPrice, DEFAULT_ADDON_PRICE, "default add-on");
  near(r.addOnCost, DEFAULT_ADDON_COST, "default add-on cost");
  near(r.addOnDiscountPct, DEFAULT_ADDON_DISCOUNT_PCT, "default discount");
  near(r.checkoutTakePct, DEFAULT_CHECKOUT_TAKE_PCT, "default checkout take");
  near(r.postPurchaseTakePct, DEFAULT_POST_PURCHASE_TAKE_PCT, "default one-click take");
  near(r.checkoutDropPct, DEFAULT_CHECKOUT_DROP_PCT, "default drop");
  near(r.extraPack, DEFAULT_ADDON_PACKAGING, "default extra pack");
  near(r.extraLabel, DEFAULT_ADDON_LABEL, "default extra label");
  near(r.monthlyCheckouts, DEFAULT_MONTHLY_UPSELL_CHECKOUTS, "default month");
});

test("compareUpsell rejects a take over 100 and a zero month", () => {
  assert.throws(() => compareUpsell({ ...UPSELL_BASE, checkoutTakePct: 101 }), /Checkout take percent/);
  assert.throws(() => compareUpsell({ ...UPSELL_BASE, postPurchaseTakePct: 101 }), /Post-purchase take percent/);
  assert.throws(() => compareUpsell({ ...UPSELL_BASE, addOnPrice: -1 }), /Add-on price/);
  assert.throws(() => compareUpsell({ ...UPSELL_BASE, monthlyUpsellCheckouts: 0 }), /greater than zero/);
});

test("summary names the upsell leftover and does not tell you to turn an offer on", () => {
  const text = compareUpsell(UPSELL_BASE).summary;
  assert.equal(text, upsellNote(compareUpsell(UPSELL_BASE)));
  assert.match(text, /\$31\.74/);
  assert.match(text, /\$32\.74/);
  assert.match(text, /\$40\.97/);
  assert.match(text, /\$32\.82/);
  assert.match(text, /\$1\.07/);
  assert.match(text, /\$8\.93/);
  assert.match(text, /\$0\.08/);
  assert.match(text, /\$85\.73/);
  assert.match(text, /7\.0%/);
  assert.match(text, /11\.1%/);
  assert.match(text, /1\.8%/);
  assert.doesNotMatch(text, /should offer|must offer|turn on upsells|install rebuy/i);
});

test("break-even post-purchase take rate solves when the add-on itself loses money", () => {
  // The add-on is priced under its own cost, so addOnProfit is negative --
  // every one-click take loses money, not just costs more. The checkout
  // path is a bigger loss still (from the drop rate), so a real, positive
  // take rate ties the two. A guard that requires addOnProfit > 0 before
  // dividing would report the floor as unreachable instead.
  const input = {
    price: 30,
    shippingCharged: 5,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 10,
    shippingCost: 3,
    packagingCost: 0.5,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 1,
    paymentMethod: "shopify_payments",
    addOnPrice: 1,
    addOnCost: 2,
    addOnDiscountPct: 0,
    checkoutTakePct: 10,
    postPurchaseTakePct: 20,
    checkoutDropPct: 10,
    addOnPackagingCost: 0.2,
    addOnShippingCost: 1,
    monthlyUpsellCheckouts: 50,
  };
  const r = compareUpsell(input);
  assert.ok(r.addOnProfit < 0, "the add-on loses money on every take");
  assert.ok(
    Number.isFinite(r.breakEvenPostTakeVsCheckout),
    `post-purchase take floor should be reachable, got ${r.breakEvenPostTakeVsCheckout}`,
  );
  // Independently confirm the reported rate is really where one-click ties
  // the checkout offer, using the pipeline's own heroProfit/addOnProfit
  // rather than re-invoking the formula under test.
  const postExpectedAtEdge = r.skip.completedProfit + (r.breakEvenPostTakeVsCheckout / 100) * r.addOnProfit;
  near(postExpectedAtEdge, r.checkout.expectedProfit, "one-click ties the checkout offer at the reported rate");
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

test("break-even refund rate is null, not 0%, when the order already loses money before any refunds", () => {
  // Cost of goods eats most of the ticket, so completedProfit is negative
  // even at 0% refunds. refundOutcomeProfit is a sum of pure costs (never
  // positive), so the mix of the two is a weighted average of two
  // non-positive numbers -- it can never land on exactly zero. The correct
  // answer is "unreachable" (null); reporting "0%" instead falsely tells a
  // merchant already losing money on every sale that they are already at
  // break-even before any refunds.
  const input = {
    price: 10,
    shippingCharged: 0,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    shopifyTxnRate: 2,
    processorRate: 3.49,
    processorFixed: 0.49,
    costOfGoods: 8,
    shippingCost: 3,
    packagingCost: 0.2,
    otherCost: 0,
    monthlyPlan: 0,
    monthlyOrders: 1,
    paymentMethod: "shopify_payments",
  };
  const mix = expectedProfitAfterRefunds({ ...input, refundRatePercent: 0 });
  assert.ok(mix.shopifyPayments.completedProfit < 0, "the order already loses money at 0% refunds");
  assert.ok(mix.shopifyPayments.refundOutcomeProfit <= 0, "the refund outcome is a pure cost, never a gain");
  assert.equal(mix.shopifyPayments.breakEvenRefundRate, null);
  // Independently confirm no refund rate reaches break-even by sampling the
  // primary pipeline across the whole range, rather than trusting the
  // formula that produced the null.
  for (const rate of [0, 10, 25, 50, 75, 90, 100]) {
    const sample = expectedProfitAfterRefunds({ ...input, refundRatePercent: rate });
    assert.ok(
      sample.shopifyPayments.expectedProfit < -1e-9,
      `expected profit should stay negative at ${rate}% refunds, got ${sample.shopifyPayments.expectedProfit}`,
    );
  }
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

const BASIC_PROMO_ORDER = {
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

test("10% off keeps more than free shipping on the same Basic order", () => {
  const comparison = comparePromos(BASIC_PROMO_ORDER);
  const byId = Object.fromEntries(comparison.rows.map((row) => [row.id, row]));

  near(byId.list.revenue, 54, "list revenue");
  near(byId.list.feeTotal, 1.866, "list fees");
  near(byId.list.profit, 31.744, "list profit");
  near(byId.list.cashInvested, 20.39, "list cash");

  near(byId.percent_off.price, 43.2, "10% price");
  near(byId.percent_off.revenue, 49.2, "10% revenue");
  near(byId.percent_off.feeTotal, 1.7268, "10% fees");
  near(byId.percent_off.profit, 27.0832, "10% profit");
  near(byId.percent_off.profitDelta, 27.0832 - 31.744, "10% vs list");

  near(byId.free_shipping.shippingCharged, 0, "free-ship charged");
  near(byId.free_shipping.revenue, 48, "free-ship revenue");
  near(byId.free_shipping.feeTotal, 1.692, "free-ship fees");
  near(byId.free_shipping.profit, 25.918, "free-ship profit");
  near(byId.free_shipping.cashInvested, 20.39, "label still paid");

  near(byId.amount_off.price, 38, "$10 price");
  near(byId.amount_off.revenue, 44, "$10 revenue");
  near(byId.amount_off.feeTotal, 1.576, "$10 fees");
  near(byId.amount_off.profit, 22.034, "$10 profit");

  assert.equal(comparison.best.id, "list");
  const promoRank = comparison.ranked.filter((row) => row.kind !== "list").map((row) => row.id);
  assert.deepEqual(promoRank, ["percent_off", "free_shipping", "amount_off"]);
  near(byId.percent_off.profit - byId.free_shipping.profit, 1.1652, "10% vs free ship");
});

test("free shipping can flip a thin order to a loss when 10% off does not", () => {
  const thin = {
    price: 24,
    shippingCharged: 10,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 15,
    shippingCost: 9,
    packagingCost: 1,
    monthlyPlan: 0,
    paymentMethod: "shopify_payments",
  };
  const comparison = comparePromos(thin, defaultPromoSet({ percentOff: 10, amountOff: 5 }));
  const byId = Object.fromEntries(comparison.rows.map((row) => [row.id, row]));

  near(byId.list.profit, 7.714, "thin list");
  near(byId.percent_off.profit, 5.3836, "thin 10%");
  near(byId.amount_off.profit, 2.859, "thin $5");
  near(byId.free_shipping.profit, -1.996, "thin free ship");
  assert.equal(byId.percent_off.isLoss, false);
  assert.equal(byId.free_shipping.isLoss, true);
  assert.match(promoComparisonSummary(comparison), /Free shipping turns the order into a loss/);
  assert.match(promoComparisonSummary(comparison), /10% off item keeps the most/);
});

test("applyPromo floors an amount-off below the item price at zero", () => {
  const applied = applyPromo({ price: 8, shippingCharged: 4 }, { kind: "amount_off", amount: 20 });
  assert.equal(applied.price, 0);
  assert.equal(applied.shippingCharged, 4);
});

test("rejects unknown promo kinds and percents above 100", () => {
  assert.throws(() => applyPromo({ price: 10 }, { kind: "bogo" }), /Unknown promo kind/);
  assert.throws(() => applyPromo({ price: 10 }, { kind: "percent_off", percent: 110 }), /at most 100/);
  assert.throws(() => comparePromos({ price: 10 }, []), /At least one promo/);
});
