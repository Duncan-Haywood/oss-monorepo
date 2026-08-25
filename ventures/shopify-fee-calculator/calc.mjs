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

const PROMO_KINDS = new Set(["list", "percent_off", "amount_off", "free_shipping"]);

/**
 * Apply one checkout offer to a calculateOrder input.
 *
 * percent_off / amount_off cut the item price (amount floors at $0).
 * free_shipping zeros shippingCharged and leaves shippingCost alone — the
 * label still has to be paid. Percentage fees then run on the new revenue.
 */
export function applyPromo(input, promo = {}) {
  const kind = promo.kind ?? "list";
  if (!PROMO_KINDS.has(kind)) throw new Error(`Unknown promo kind: ${kind}`);
  if (kind === "list") return { ...input };

  const price = number(input.price, "Item price");

  if (kind === "percent_off") {
    const percent = number(promo.percent, "Promo percent");
    if (percent > 100) throw new Error("Promo percent must be at most 100");
    return { ...input, price: price * (1 - percent / 100) };
  }
  if (kind === "amount_off") {
    const amount = number(promo.amount, "Promo amount");
    return { ...input, price: Math.max(0, price - amount) };
  }
  return { ...input, price, shippingCharged: 0 };
}

export function defaultPromoSet({ percentOff = 10, amountOff = 10 } = {}) {
  const percent = number(percentOff, "Promo percent");
  const amount = number(amountOff, "Promo amount");
  if (percent > 100) throw new Error("Promo percent must be at most 100");
  const amountLabel = Number.isInteger(amount) ? `$${amount} off item` : `$${amount.toFixed(2)} off item`;
  return [
    { id: "list", kind: "list", label: "List price" },
    { id: "percent_off", kind: "percent_off", percent, label: `${percent}% off item` },
    { id: "amount_off", kind: "amount_off", amount, label: amountLabel },
    { id: "free_shipping", kind: "free_shipping", label: "Free shipping" },
  ];
}

function promoRow(input, promo, listProfit) {
  const applied = applyPromo(input, promo);
  const order = calculateOrder(applied);
  return {
    id: promo.id ?? promo.kind ?? "list",
    label: promo.label ?? promo.kind ?? "list",
    kind: promo.kind ?? "list",
    price: number(applied.price, "Item price"),
    shippingCharged: number(applied.shippingCharged, "Shipping charged"),
    revenue: order.revenue,
    feeTotal: order.selected.feeTotal,
    cashInvested: order.selected.cashInvested,
    profit: order.selected.profit,
    margin: order.selected.margin,
    profitDelta: order.selected.profit - listProfit,
    isLoss: order.selected.profit < 0,
  };
}

/**
 * Rank checkout offers on the selected payment path. List price is the
 * baseline; cash invested does not change when shipping charged goes to $0.
 */
export function comparePromos(input, promos = defaultPromoSet()) {
  if (!Array.isArray(promos) || promos.length === 0) {
    throw new Error("At least one promo is required");
  }
  const listProfit = calculateOrder(input).selected.profit;
  const rows = promos.map((promo) => promoRow(input, promo, listProfit));
  const ranked = [...rows].sort((a, b) => b.profit - a.profit || a.label.localeCompare(b.label));
  return { listProfit, rows, ranked, best: ranked[0] };
}

export function promoComparisonSummary(comparison) {
  const money = (value) =>
    `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const promoRows = comparison.rows.filter((row) => row.kind !== "list");
  if (promoRows.length === 0) return "Enter a promo to compare it against list price.";

  const bestPromo = [...promoRows].sort((a, b) => b.profit - a.profit)[0];
  const freeShipping = promoRows.find((row) => row.kind === "free_shipping");
  const vsList = `${money(Math.abs(bestPromo.profitDelta))} ${bestPromo.profitDelta >= 0 ? "above" : "below"} list`;

  let sentence = `${bestPromo.label} keeps the most of the compared promos (${money(bestPromo.profit)}, ${vsList}).`;
  if (promoRows.every((row) => row.isLoss)) {
    sentence = `Every compared promo loses money. ${bestPromo.label} loses the least (${money(bestPromo.profit)}).`;
  }
  if (freeShipping && bestPromo.kind !== "free_shipping") {
    sentence += ` Free shipping keeps ${money(bestPromo.profit - freeShipping.profit)} less than ${bestPromo.label}.`;
    if (freeShipping.isLoss) sentence += " Free shipping turns the order into a loss.";
  }
  return sentence;
}
