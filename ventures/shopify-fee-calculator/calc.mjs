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
