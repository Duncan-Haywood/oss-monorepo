import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPreset,
  calculateOrder,
  compareOnlineVsPos,
  compareShippingLabels,
  compareReturnResolution,
  compareShopPayInstallments,
  compareShopifyCapital,
  compareManualPayment,
  compareChargeback,
  compareLocalDelivery,
  localDeliveryCost,
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
  PLAN_PRESETS,
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
