// Pure Shopify fee/profit arithmetic. No network, no state: every rate is an
// input so the result stays a transparent calculation the merchant can check
// against their own Shopify and processor statements, not a claim about
// Shopify's current published schedule.

export const PLAN_PRESETS = {
  basic: {
    label: "Basic",
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    posPaymentsRate: 2.6,
    posPaymentsFixed: 0.1,
    shopifyTxnRate: 2,
    monthlyPlan: 39,
  },
  grow: {
    label: "Grow",
    paymentsRate: 2.7,
    paymentsFixed: 0.3,
    posPaymentsRate: 2.5,
    posPaymentsFixed: 0.1,
    shopifyTxnRate: 1,
    monthlyPlan: 105,
  },
  advanced: {
    label: "Advanced",
    paymentsRate: 2.5,
    paymentsFixed: 0.3,
    posPaymentsRate: 2.4,
    posPaymentsFixed: 0.1,
    shopifyTxnRate: 0.5,
    monthlyPlan: 399,
  },
  plus: {
    label: "Plus",
    paymentsRate: 2.4,
    paymentsFixed: 0.3,
    posPaymentsRate: 2.4,
    posPaymentsFixed: 0.1,
    shopifyTxnRate: 0,
    monthlyPlan: 2300,
  },
};

const PAYMENT_METHODS = new Set(["shopify_payments", "third_party"]);

function number(value, name, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    const result = Number(fallback);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

export function applyPlanPreset(input, planId) {
  const preset = PLAN_PRESETS[planId];
  if (!preset) throw new Error(`Unknown Shopify plan: ${planId}`);
  return {
    ...input,
    paymentsRate: preset.paymentsRate,
    paymentsFixed: preset.paymentsFixed,
    posPaymentsRate: preset.posPaymentsRate,
    posPaymentsFixed: preset.posPaymentsFixed,
    shopifyTxnRate: preset.shopifyTxnRate,
    monthlyPlan: preset.monthlyPlan,
  };
}

function pathResult({
  revenue,
  percentRate,
  processorFixed,
  cashInvested,
  shippingCharged,
  targetMarginRate,
  feeParts,
}) {
  const feeTotal = Object.values(feeParts).reduce((sum, value) => sum + value, 0);
  const costs = feeTotal + cashInvested;
  const profit = revenue - costs;
  const fixedCash = processorFixed + cashInvested;
  const targetRevenueDenominator = 1 - percentRate - targetMarginRate;
  return {
    fees: feeParts,
    feeTotal,
    cashInvested,
    costs,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    breakEvenPrice:
      percentRate >= 1 ? Infinity : Math.max(0, fixedCash / (1 - percentRate) - shippingCharged),
    targetMarginPrice:
      targetRevenueDenominator <= 0
        ? Infinity
        : Math.max(0, fixedCash / targetRevenueDenominator - shippingCharged),
  };
}

export function calculateOrder(input) {
  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const paymentsRate = number(input.paymentsRate, "Shopify Payments rate", 2.9);
  const paymentsFixed = number(input.paymentsFixed, "Shopify Payments fixed fee", 0.3);
  const shopifyTxnRate = number(input.shopifyTxnRate, "Shopify third-party transaction rate", 2);
  const processorRate = number(input.processorRate, "Third-party processor rate", 3.49);
  const processorFixed = number(input.processorFixed, "Third-party processor fixed fee", 0.49);
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const shippingCost = number(input.shippingCost, "Shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");
  const monthlyPlan = number(input.monthlyPlan, "Monthly plan cost");
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);
  const targetMargin = number(input.targetMargin, "Target margin");
  const paymentMethod = input.paymentMethod ?? "shopify_payments";

  if (targetMargin >= 100) throw new Error("Target margin must be less than 100%");
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw new Error("Payment method must be shopify_payments or third_party");
  }
  if (monthlyOrders === 0 && monthlyPlan > 0) {
    throw new Error("Monthly orders must be greater than zero when a plan cost is included");
  }

  const revenue = price + shippingCharged;
  const allocatedPlanCost = monthlyOrders === 0 ? 0 : monthlyPlan / monthlyOrders;
  const cashInvested = costOfGoods + shippingCost + packagingCost + otherCost + allocatedPlanCost;
  const targetMarginRate = targetMargin / 100;

  const shopifyPayments = pathResult({
    revenue,
    percentRate: paymentsRate / 100,
    processorFixed: paymentsFixed,
    cashInvested,
    shippingCharged,
    targetMarginRate,
    feeParts: {
      shopifyPayments: revenue * (paymentsRate / 100) + paymentsFixed,
      shopifyThirdParty: 0,
      processor: 0,
    },
  });

  const thirdParty = pathResult({
    revenue,
    percentRate: (processorRate + shopifyTxnRate) / 100,
    processorFixed,
    cashInvested,
    shippingCharged,
    targetMarginRate,
    feeParts: {
      shopifyPayments: 0,
      shopifyThirdParty: revenue * (shopifyTxnRate / 100),
      processor: revenue * (processorRate / 100) + processorFixed,
    },
  });

  const selected = paymentMethod === "shopify_payments" ? shopifyPayments : thirdParty;
  return {
    revenue,
    allocatedPlanCost,
    paymentMethod,
    selected,
    shopifyPayments,
    thirdParty,
    extraCostVsShopifyPayments: thirdParty.feeTotal - shopifyPayments.feeTotal,
    extraCostVsThirdParty: shopifyPayments.feeTotal - thirdParty.feeTotal,
  };
}

function winnerFromDelta(delta) {
  if (delta > 1e-9) return "in_person";
  if (delta < -1e-9) return "online";
  return "tie";
}

/**
 * Online Shopify Payments vs tapping the same SKU in person.
 *
 * Two in-person rows, because merchants mix them up:
 *   - same ticket at the counter still ships, so postage stays — this isolates
 *     the cheaper card rate;
 *   - pickup zeros shipping charged and shipping you pay — postage markup can
 *     beat the cheaper tap, which is the usual surprise on a $5–$6 label.
 *
 * Rates are inputs. Plan presets fill illustrative US defaults only.
 */
export function compareOnlineVsPos(input) {
  const posPaymentsRate = number(input.posPaymentsRate, "In-person card rate", 2.6);
  const posPaymentsFixed = number(input.posPaymentsFixed, "In-person fixed fee", 0.1);
  const posHardwareCost = number(input.posHardwareCost, "Card reader cost", 0);

  const onlineOrder = calculateOrder({ ...input, paymentMethod: "shopify_payments" });
  const sameTicketOrder = calculateOrder({
    ...input,
    paymentMethod: "shopify_payments",
    paymentsRate: posPaymentsRate,
    paymentsFixed: posPaymentsFixed,
  });
  const pickupOrder = calculateOrder({
    ...input,
    paymentMethod: "shopify_payments",
    paymentsRate: posPaymentsRate,
    paymentsFixed: posPaymentsFixed,
    shippingCharged: 0,
    shippingCost: 0,
  });

  const extraKeptOnSameTicket = sameTicketOrder.shopifyPayments.profit - onlineOrder.shopifyPayments.profit;
  const extraKeptOnPickup = pickupOrder.shopifyPayments.profit - onlineOrder.shopifyPayments.profit;
  const recoveryGap = extraKeptOnPickup > 0 ? extraKeptOnPickup : extraKeptOnSameTicket;
  const ordersToRecoverHardware =
    posHardwareCost > 0 && recoveryGap > 1e-9 ? posHardwareCost / recoveryGap : null;

  return {
    online: {
      label: "Online checkout",
      revenue: onlineOrder.revenue,
      ...onlineOrder.shopifyPayments,
    },
    inPersonSameTicket: {
      label: "Same order tapped in person",
      revenue: sameTicketOrder.revenue,
      ...sameTicketOrder.shopifyPayments,
    },
    inPersonPickup: {
      label: "In-person pickup",
      revenue: pickupOrder.revenue,
      ...pickupOrder.shopifyPayments,
    },
    extraKeptOnSameTicket,
    extraKeptOnPickup,
    pickupWinner: winnerFromDelta(extraKeptOnPickup),
    sameTicketWinner: winnerFromDelta(extraKeptOnSameTicket),
    posHardwareCost,
    ordersToRecoverHardware,
  };
}

function emptyField(value) {
  return value === undefined || value === null || value === "";
}

function winnerFromLabelDelta(delta) {
  if (delta > 1e-9) return "own";
  if (delta < -1e-9) return "shopify";
  return "tie";
}

function moneyLabel(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function pathFromOrder(id, label, order, labelCost, shippingCharged) {
  return {
    id,
    label,
    labelCost,
    shippingCharged,
    revenue: order.revenue,
    ...order.selected,
  };
}

/**
 * Illustrative third-party / carrier-account label when the merchant
 * has not typed one. Edit it from a Pirate Ship, Shippo, or UPS quote —
 * not a published Shopify Shipping rate.
 */
export const DEFAULT_OWN_LABEL_COST = 4.25;

function shippingLabelsSummary({
  winner,
  shopify,
  own,
  chargeShopifyBuyOwn,
  shopifyLabelCost,
  ownLabelCost,
  monthlyExtraOnOwn,
}) {
  const shopifyFee = moneyLabel(shopifyLabelCost);
  const ownFee = moneyLabel(ownLabelCost);
  const ownProfit = moneyLabel(own.profit);
  const shopifyProfit = moneyLabel(shopify.profit);
  const pocket = moneyLabel(chargeShopifyBuyOwn.profit);
  const month = moneyLabel(monthlyExtraOnOwn);
  if (winner === "own") {
    return `Buying the ${ownFee} own / third-party label keeps ${ownProfit} — ${moneyLabel(Math.abs(own.profit - shopify.profit))} more than the ${shopifyFee} Shopify Shipping label at ${shopifyProfit}. At this volume that gap is ${month} / month.`;
  }
  if (winner === "charge_shopify_buy_own") {
    return `Charging the ${shopifyFee} Shopify quote and buying the ${ownFee} own label keeps ${pocket}, ahead of buying Shopify Shipping at ${shopifyProfit}. Card fees move with the shipping you charge, so this is not the raw label spread.`;
  }
  if (winner === "shopify") {
    return `The ${shopifyFee} Shopify Shipping label keeps ${shopifyProfit}, ahead of the ${ownFee} own / third-party label at ${ownProfit}. Buy the Shopify quote on these rates.`;
  }
  return `Shopify Shipping and the own / third-party label leave the same profit on these rates.`;
}

/**
 * Same checkout ticket, three ways to buy the label.
 *
 *   - Shopify Shipping — pay the Shopify quote, charge typed shipping
 *   - Own / third-party label — Pirate Ship, Shippo, or a carrier account
 *   - Charge the Shopify quote, buy the own label — the usual “leave
 *     Shopify's rate in checkout, buy cheaper postage” move
 *
 * Card fees sit on item + shipping charged, so changing what you charge
 * to ship is not a wash even when the label is cheaper. Rates are
 * inputs. Empty Shopify label falls back to shipping you pay; empty own
 * label uses DEFAULT_OWN_LABEL_COST so the table is immediately useful.
 */
export function compareShippingLabels(input) {
  const typedShippingCharged = number(input.shippingCharged, "Shipping charged");
  const shopifyLabelCost = emptyField(input.shopifyLabelCost)
    ? number(input.shippingCost, "Shipping you pay")
    : number(input.shopifyLabelCost, "Shopify Shipping label");
  const ownLabelCost = emptyField(input.ownLabelCost)
    ? DEFAULT_OWN_LABEL_COST
    : number(input.ownLabelCost, "Own / third-party label");
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);

  const shopifyOrder = calculateOrder({ ...input, shippingCost: shopifyLabelCost });
  const ownOrder = calculateOrder({ ...input, shippingCost: ownLabelCost });
  const chargeShopifyBuyOwnOrder = calculateOrder({
    ...input,
    shippingCharged: shopifyLabelCost,
    shippingCost: ownLabelCost,
  });

  const shopify = pathFromOrder(
    "shopify",
    "Shopify Shipping label",
    shopifyOrder,
    shopifyLabelCost,
    typedShippingCharged,
  );
  const own = pathFromOrder(
    "own",
    "Own / third-party label",
    ownOrder,
    ownLabelCost,
    typedShippingCharged,
  );
  const chargeShopifyBuyOwn = pathFromOrder(
    "charge_shopify_buy_own",
    "Charge Shopify quote, buy own label",
    chargeShopifyBuyOwnOrder,
    ownLabelCost,
    shopifyLabelCost,
  );

  const extraKeptOnOwn = own.profit - shopify.profit;
  const extraKeptOnChargeShopifyBuyOwn = chargeShopifyBuyOwn.profit - shopify.profit;
  const monthlyExtraOnOwn = extraKeptOnOwn * monthlyOrders;
  const rows = [shopify, own, chargeShopifyBuyOwn].map((row) => ({
    ...row,
    profitDelta: row.profit - shopify.profit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.profit));
  const leaders = rows.filter((row) => Math.abs(row.profit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  return {
    rows,
    shopify: rows[0],
    own: rows[1],
    chargeShopifyBuyOwn: rows[2],
    shopifyLabelCost,
    ownLabelCost,
    extraKeptOnOwn,
    extraKeptOnChargeShopifyBuyOwn,
    monthlyExtraOnOwn,
    pocketedSpread: shopifyLabelCost - ownLabelCost,
    ownWinner: winnerFromLabelDelta(extraKeptOnOwn),
    winner,
    summary: shippingLabelsSummary({
      winner,
      shopify: rows[0],
      own: rows[1],
      chargeShopifyBuyOwn: rows[2],
      shopifyLabelCost,
      ownLabelCost,
      monthlyExtraOnOwn,
    }),
  };
}
