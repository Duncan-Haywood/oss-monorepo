import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPreset,
  calculateOrder,
  compareOnlineVsPos,
  compareShippingLabels,
  compareShopPayInstallments,
  DEFAULT_OWN_LABEL_COST,
  DEFAULT_INSTALLMENT_RATE,
  DEFAULT_INSTALLMENT_FIXED,
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
