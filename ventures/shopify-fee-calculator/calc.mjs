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

export const PLAN_IDS = Object.freeze(Object.keys(PLAN_PRESETS));

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

/**
 * Processing fees on one order with a plan's rates, excluding the monthly
 * subscription. Used so an upgrade's break-even volume is "extra plan cost
 * divided by per-order fee savings" rather than a circular function of the
 * volume being asked about.
 */
export function perOrderProcessingFee(input, planId) {
  const filled = applyPlanPreset(input, planId);
  const result = calculateOrder({
    ...input,
    ...filled,
    monthlyPlan: 0,
    monthlyOrders: 1,
  });
  return result.selected.feeTotal;
}

/**
 * Monthly orders at which `toPlanId` starts leaving more cash than
 * `fromPlanId` on the selected payment path. The answer is volume, not
 * advice: higher plans also change Shopify features the merchant may want
 * for reasons this arithmetic cannot see.
 */
export function upgradeBreakEvenOrders(fromPlanId, toPlanId, input = {}) {
  if (!PLAN_PRESETS[fromPlanId]) throw new Error(`Unknown Shopify plan: ${fromPlanId}`);
  if (!PLAN_PRESETS[toPlanId]) throw new Error(`Unknown Shopify plan: ${toPlanId}`);
  const extraMonthly = PLAN_PRESETS[toPlanId].monthlyPlan - PLAN_PRESETS[fromPlanId].monthlyPlan;
  const feeFrom = perOrderProcessingFee(input, fromPlanId);
  const feeTo = perOrderProcessingFee(input, toPlanId);
  const feeSavings = feeFrom - feeTo;
  if (extraMonthly <= 0) {
    return {
      fromPlanId,
      toPlanId,
      extraMonthly,
      feeSavings,
      breakEvenOrders: 0,
      alreadyCheaper: true,
      neverPays: false,
    };
  }
  if (feeSavings <= 0) {
    return {
      fromPlanId,
      toPlanId,
      extraMonthly,
      feeSavings,
      breakEvenOrders: Infinity,
      alreadyCheaper: false,
      neverPays: true,
    };
  }
  const exact = extraMonthly / feeSavings;
  return {
    fromPlanId,
    toPlanId,
    extraMonthly,
    feeSavings,
    breakEvenOrders: exact,
    alreadyCheaper: false,
    neverPays: false,
  };
}

/**
 * Rank every illustrative plan at the merchant's order volume and payment
 * path. Each row uses that plan's preset rates and monthly fee; every other
 * input (price, costs, processor rates) stays shared so the only variable is
 * the plan.
 */
export function comparePlans(input = {}) {
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);
  if (monthlyOrders === 0) {
    throw new Error("Monthly orders must be greater than zero to compare plans");
  }
  const paymentMethod = input.paymentMethod ?? "shopify_payments";
  const currentPlanId = input.planId && PLAN_PRESETS[input.planId] ? input.planId : null;

  const plans = PLAN_IDS.map((id) => {
    const preset = PLAN_PRESETS[id];
    const filled = applyPlanPreset(input, id);
    const result = calculateOrder({
      ...input,
      ...filled,
      monthlyOrders,
      paymentMethod,
    });
    return {
      id,
      label: preset.label,
      monthlyPlan: preset.monthlyPlan,
      paymentsRate: preset.paymentsRate,
      paymentsFixed: preset.paymentsFixed,
      shopifyTxnRate: preset.shopifyTxnRate,
      perOrderFees: result.selected.feeTotal,
      perOrderProfit: result.selected.profit,
      monthlyProfit: result.selected.profit * monthlyOrders,
      monthlyFeeTotal: result.selected.feeTotal * monthlyOrders,
    };
  });

  const best = plans.reduce((winner, plan) =>
    plan.monthlyProfit > winner.monthlyProfit ? plan : winner,
  );
  const current = currentPlanId ? plans.find((plan) => plan.id === currentPlanId) : plans[0];

  const upgrades = [];
  for (let i = 0; i < PLAN_IDS.length; i += 1) {
    for (let j = i + 1; j < PLAN_IDS.length; j += 1) {
      const step = upgradeBreakEvenOrders(PLAN_IDS[i], PLAN_IDS[j], input);
      upgrades.push({
        ...step,
        worthItAtVolume:
          !step.neverPays &&
          Number.isFinite(step.breakEvenOrders) &&
          monthlyOrders + 1e-9 >= step.breakEvenOrders,
      });
    }
  }

  return {
    currentPlanId,
    paymentMethod,
    monthlyOrders,
    plans: plans.map((plan) => ({
      ...plan,
      isBest: plan.id === best.id,
      isCurrent: current ? plan.id === current.id : false,
      vsCurrentMonthly: current ? plan.monthlyProfit - current.monthlyProfit : 0,
    })),
    bestPlanId: best.id,
    upgrades,
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
