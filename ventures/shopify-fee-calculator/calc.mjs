// Pure Shopify fee/profit arithmetic. No network, no state: every rate is an
// input so the result stays a transparent calculation the merchant can check
// against their own Shopify and processor statements, not a claim about
// Shopify's current published schedule.

export const PLAN_PRESETS = {
  basic: {
    label: "Basic",
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    shopifyTxnRate: 2,
    monthlyPlan: 39,
  },
  grow: {
    label: "Grow",
    paymentsRate: 2.7,
    paymentsFixed: 0.3,
    shopifyTxnRate: 1,
    monthlyPlan: 105,
  },
  advanced: {
    label: "Advanced",
    paymentsRate: 2.5,
    paymentsFixed: 0.3,
    shopifyTxnRate: 0.5,
    monthlyPlan: 399,
  },
  plus: {
    label: "Plus",
    paymentsRate: 2.4,
    paymentsFixed: 0.3,
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

function percent(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be between 0 and 100`);
  return result;
}

function refundedProfit({
  remainingFees,
  costOfGoods,
  restockableRate,
  shippingCost,
  packagingCost,
  otherCost,
  allocatedPlanCost,
  returnShippingCost,
}) {
  // Full refund: the customer payment comes back, so revenue on that order is 0.
  // Remaining processor/Shopify fees, unsalvaged goods, outbound fulfillment,
  // return postage, and the allocated plan share are still cash out.
  const lostGoods = costOfGoods * (1 - restockableRate);
  return 0 - remainingFees - lostGoods - shippingCost - packagingCost - otherCost
    - allocatedPlanCost - returnShippingCost;
}

function breakEvenRefundRate(completedProfit, refundOutcomeProfit) {
  if (completedProfit <= 0) return 0;
  const gap = completedProfit - refundOutcomeProfit;
  if (gap <= 0) return null;
  const rate = (completedProfit / gap) * 100;
  return rate > 100 ? null : rate;
}

function pathAfterRefunds(path, remainingFees, refundRate, sunk) {
  const completedProfit = path.profit;
  const refundOutcomeProfit = refundedProfit({ remainingFees, ...sunk });
  const expectedProfit = (1 - refundRate) * completedProfit + refundRate * refundOutcomeProfit;
  return {
    completedProfit,
    refundOutcomeProfit,
    expectedProfit,
    remainingFeesOnRefund: remainingFees,
    breakEvenRefundRate: breakEvenRefundRate(completedProfit, refundOutcomeProfit),
  };
}

function winner(shopifyProfit, thirdPartyProfit) {
  if (shopifyProfit > thirdPartyProfit) return "shopify_payments";
  if (thirdPartyProfit > shopifyProfit) return "third_party";
  return "tie";
}

/**
 * Mix completed-order profit with a full-refund outcome so a merchant can see
 * whether a refund rate still leaves money — and whether PayPal keeping its
 * fee on refunds flips the payment-path comparison.
 *
 * Defaults match the usual statements: Shopify Payments returns its processing
 * fee on a full refund; a third-party processor often keeps its fee; Shopify's
 * own third-party transaction fee is treated as reversing with the order.
 * Every rate stays an input. This is not a claim about a live refund policy.
 */
export function expectedProfitAfterRefunds(input) {
  const order = calculateOrder(input);
  const refundRate = percent(input.refundRatePercent, "Refund rate", 0) / 100;
  const returnShippingCost = number(input.returnShippingCost, "Return shipping", 0);
  const restockableRate = percent(input.restockablePercent, "Restockable percent", 100) / 100;
  const shopifyPaymentsFeeRefundRate = percent(
    input.shopifyPaymentsFeeRefundPercent,
    "Shopify Payments fee refund percent",
    100,
  ) / 100;
  const thirdPartyFeeRefundRate = percent(
    input.thirdPartyFeeRefundPercent,
    "Third-party fee refund percent",
    0,
  ) / 100;
  const shopifyThirdPartyFeeRefundRate = percent(
    input.shopifyThirdPartyFeeRefundPercent,
    "Shopify third-party fee refund percent",
    100,
  ) / 100;

  const sunk = {
    costOfGoods: number(input.costOfGoods, "Cost of goods"),
    restockableRate,
    shippingCost: number(input.shippingCost, "Shipping cost"),
    packagingCost: number(input.packagingCost, "Packaging cost"),
    otherCost: number(input.otherCost, "Other cost"),
    allocatedPlanCost: order.allocatedPlanCost,
    returnShippingCost,
  };

  const shopifyPayments = pathAfterRefunds(
    order.shopifyPayments,
    order.shopifyPayments.fees.shopifyPayments * (1 - shopifyPaymentsFeeRefundRate),
    refundRate,
    sunk,
  );
  const thirdParty = pathAfterRefunds(
    order.thirdParty,
    order.thirdParty.fees.shopifyThirdParty * (1 - shopifyThirdPartyFeeRefundRate)
      + order.thirdParty.fees.processor * (1 - thirdPartyFeeRefundRate),
    refundRate,
    sunk,
  );

  const selected = order.paymentMethod === "shopify_payments" ? shopifyPayments : thirdParty;
  const completedWinner = winner(shopifyPayments.completedProfit, thirdParty.completedProfit);
  const expectedWinner = winner(shopifyPayments.expectedProfit, thirdParty.expectedProfit);

  return {
    revenue: order.revenue,
    refundRatePercent: refundRate * 100,
    monthlyOrders: number(input.monthlyOrders, "Monthly orders", 1),
    paymentMethod: order.paymentMethod,
    selected,
    shopifyPayments,
    thirdParty,
    expectedExtraVsShopifyPayments: thirdParty.expectedProfit - shopifyPayments.expectedProfit,
    completedWinner,
    expectedWinner,
    refundsFlipPath: completedWinner !== expectedWinner,
    monthlyExpectedProfit: selected.expectedProfit * number(input.monthlyOrders, "Monthly orders", 1),
  };
}

/** Same mix at a few refund rates so the page can show when profit crosses zero. */
export function refundRateSweep(input, rates = [0, 5, 10, 15, 20]) {
  return rates.map((refundRatePercent) => {
    const mix = expectedProfitAfterRefunds({ ...input, refundRatePercent });
    return {
      refundRatePercent,
      shopifyPayments: mix.shopifyPayments.expectedProfit,
      thirdParty: mix.thirdParty.expectedProfit,
      selected: mix.selected.expectedProfit,
      expectedWinner: mix.expectedWinner,
    };
  });
}
