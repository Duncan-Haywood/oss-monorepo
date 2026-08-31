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

export const PLAN_IDS = Object.freeze(Object.keys(PLAN_PRESETS));

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
  targetProfit,
  feeParts,
}) {
  const feeTotal = Object.values(feeParts).reduce((sum, value) => sum + value, 0);
  const costs = feeTotal + cashInvested;
  const profit = revenue - costs;
  const fixedCash = processorFixed + cashInvested;
  const targetRevenueDenominator = 1 - percentRate - targetMarginRate;
  const profitPriceDenominator = 1 - percentRate;
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
    targetProfitPrice:
      profitPriceDenominator <= 0
        ? Infinity
        : Math.max(0, (targetProfit + fixedCash) / profitPriceDenominator - shippingCharged),
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
  const targetProfit = number(input.targetProfit, "Target net profit");
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
    targetProfit,
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
    targetProfit,
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
 * percent_off and amount_off cut the item price. free_shipping zeros
 * shippingCharged and leaves shippingCost alone — the label still has to
 * be paid. Percentage fees then run on the new revenue.
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
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
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

/**
 * Illustrative Shop Pay Installments (Affirm) rate when the merchant has
 * not typed one. Edit it from the Shop Pay Installments line on a Shopify
 * Payments payout — not a published Affirm or Shopify schedule.
 */
export const DEFAULT_INSTALLMENT_RATE = 5.99;
export const DEFAULT_INSTALLMENT_FIXED = 0.3;

function winnerFromInstallmentDelta(delta) {
  if (delta > 1e-9) return "card";
  if (delta < -1e-9) return "installments";
  return "tie";
}

function installmentSummary({
  extraFeePerInstallment,
  extraKeptOnCard,
  installmentSharePct,
  monthlyExtraCost,
  breakEvenLiftPct,
  breakEvenExtraOrders,
  extraOrdersFromInstallments,
  liftPays,
  winner,
}) {
  const extraFee = moneyLabel(extraFeePerInstallment);
  const extraProfit = moneyLabel(extraKeptOnCard);
  const month = moneyLabel(monthlyExtraCost);
  if (winner === "tie") {
    return `Shop Pay Installments and a regular Shopify Payments card leave the same profit on these rates.`;
  }
  if (winner === "installments") {
    return `Shop Pay Installments keeps ${extraProfit} more per order than a regular card at these rates.`;
  }
  const liftLine =
    breakEvenLiftPct == null
      ? `The blended mix does not earn, so extra installment-driven orders cannot cover the extra fee.`
      : breakEvenLiftPct === 0
        ? `No extra conversion is needed at a ${installmentSharePct}% installment share.`
        : `You need about ${breakEvenLiftPct.toFixed(2)}% more orders (${breakEvenExtraOrders.toFixed(1)} / month) for the mix to match turning installments off.`;
  const typedLift =
    extraOrdersFromInstallments > 0
      ? liftPays
        ? ` The ${extraOrdersFromInstallments} extra orders you typed more than cover that.`
        : ` The ${extraOrdersFromInstallments} extra orders you typed do not cover that.`
      : "";
  return `An installment checkout costs ${extraFee} more in fees (${extraProfit} less profit) than a regular Shopify Payments card. At a ${installmentSharePct}% share that is ${month} / month if volume stays put. ${liftLine}${typedLift}`;
}

/**
 * Same checkout ticket: regular Shopify Payments / Shop Pay card vs
 * Shop Pay Installments, then a blended month at the typed installment
 * share.
 *
 * Installments usually cost more per order (illustrative 5.99% + $0.30
 * vs the card rate). The merchant question is whether the extra fee is
 * covered by extra conversion. Rates are inputs. Empty installment rate
 * uses DEFAULT_INSTALLMENT_RATE so the table is immediately useful.
 *
 * Always priced on the Shopify Payments path — Shop Pay Installments is
 * not available on PayPal / Stripe checkout.
 */
export function compareShopPayInstallments(input) {
  const installmentRate = emptyField(input.installmentRate)
    ? DEFAULT_INSTALLMENT_RATE
    : number(input.installmentRate, "Shop Pay Installments rate");
  const installmentFixed = emptyField(input.installmentFixed)
    ? DEFAULT_INSTALLMENT_FIXED
    : number(input.installmentFixed, "Shop Pay Installments fixed fee");
  const installmentSharePct = number(input.installmentSharePct, "Installment share", 15);
  if (installmentSharePct > 100) throw new Error("Installment share must be at most 100%");
  const extraOrdersFromInstallments = number(
    input.extraOrdersFromInstallments,
    "Extra monthly orders from installments",
    0,
  );
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);
  const cardRate = number(input.paymentsRate, "Shopify Payments rate", 2.9);
  const cardFixed = number(input.paymentsFixed, "Shopify Payments fixed fee", 0.3);

  const share = installmentSharePct / 100;

  const cardOrder = calculateOrder({ ...input, paymentMethod: "shopify_payments" });
  const installmentOrder = calculateOrder({
    ...input,
    paymentMethod: "shopify_payments",
    paymentsRate: installmentRate,
    paymentsFixed: installmentFixed,
  });

  const card = {
    id: "card",
    label: "Shopify Payments / Shop Pay card",
    rate: cardRate,
    fixed: cardFixed,
    revenue: cardOrder.revenue,
    ...cardOrder.shopifyPayments,
  };
  const installment = {
    id: "installments",
    label: "Shop Pay Installments",
    rate: installmentRate,
    fixed: installmentFixed,
    revenue: installmentOrder.revenue,
    ...installmentOrder.shopifyPayments,
  };

  const extraFeePerInstallment = installment.feeTotal - card.feeTotal;
  const extraKeptOnCard = card.profit - installment.profit;
  const blendProfitPerOrder = (1 - share) * card.profit + share * installment.profit;
  const blendFeePerOrder = (1 - share) * card.feeTotal + share * installment.feeTotal;
  const monthlyExtraCost = extraKeptOnCard * share * monthlyOrders;
  const cardOnlyMonthly = card.profit * monthlyOrders;
  const blendedMonthly = blendProfitPerOrder * monthlyOrders;
  const blendedWithLiftMonthly = blendProfitPerOrder * (monthlyOrders + extraOrdersFromInstallments);

  let breakEvenLiftPct = null;
  let breakEvenExtraOrders = null;
  if (share === 0 || extraKeptOnCard <= 1e-9) {
    breakEvenLiftPct = 0;
    breakEvenExtraOrders = 0;
  } else if (blendProfitPerOrder > 1e-9) {
    const ratio = card.profit / blendProfitPerOrder;
    breakEvenLiftPct = (ratio - 1) * 100;
    breakEvenExtraOrders = monthlyOrders * (ratio - 1);
  }

  const liftPays = blendedWithLiftMonthly + 1e-9 >= cardOnlyMonthly;
  const winner = winnerFromInstallmentDelta(extraKeptOnCard);

  return {
    rows: [
      { ...card, profitDelta: 0 },
      { ...installment, profitDelta: installment.profit - card.profit },
    ],
    card,
    installment,
    installmentRate,
    installmentFixed,
    installmentSharePct,
    extraOrdersFromInstallments,
    extraFeePerInstallment,
    extraKeptOnCard,
    blendProfitPerOrder,
    blendFeePerOrder,
    monthlyExtraCost,
    cardOnlyMonthly,
    blendedMonthly,
    blendedWithLiftMonthly,
    breakEvenLiftPct,
    breakEvenExtraOrders,
    liftPays,
    winner,
    cardWinner: winner,
    summary: installmentSummary({
      extraFeePerInstallment,
      extraKeptOnCard,
      installmentSharePct,
      monthlyExtraCost,
      breakEvenLiftPct,
      breakEvenExtraOrders,
      extraOrdersFromInstallments,
      liftPays,
      winner,
    }),
  };
}

function ratePercent(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be between 0 and 100`);
  return result;
}

function truthyFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === undefined || value === null || value === "") {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

/**
 * Illustrative return-label and redemption defaults so the table is
 * immediately useful. Replace the label from a Pirate Ship / USPS quote
 * and the redemption rate from your own gift-card report — these are
 * not Shopify policy.
 */
export const DEFAULT_RETURN_LABEL_COST = 7;
export const DEFAULT_RESTOCKABLE_PCT = 85;
export const DEFAULT_CREDIT_REDEMPTION_PCT = 70;
export const DEFAULT_PROCESSOR_FEE_KEPT_PCT = 100;

function returnResolutionSummary({ winner, refund, credit, exchange }) {
  const creditKeep = moneyLabel(credit.kept);
  const refundKeep = moneyLabel(refund.kept);
  const exchangeKeep = moneyLabel(exchange.kept);
  const vsRefund = moneyLabel(credit.kept - refund.kept);
  if (winner === "credit") {
    return `Store credit keeps ${creditKeep} after this return — ${vsRefund} more than refunding cash at ${refundKeep}. Exchange keeps ${exchangeKeep}. Credit only spends the next item if they come back; a cash refund leaves now.`;
  }
  if (winner === "exchange") {
    return `An exchange keeps ${exchangeKeep} after this return — ${moneyLabel(exchange.kept - refund.kept)} more than refunding cash at ${refundKeep}. Store credit keeps ${creditKeep}.`;
  }
  if (winner === "refund") {
    return `Refunding cash keeps ${refundKeep} on these rates, ahead of store credit at ${creditKeep} and an exchange at ${exchangeKeep}.`;
  }
  return `Refund, store credit, and exchange leave the same amount after this return.`;
}

/**
 * Same returned order, three ways to close it.
 *
 *   - Refund cash — give back the item (and optionally shipping charged).
 *     Processor-fee keep is an input: PayPal often keeps the original
 *     fee; Shopify Payments often returns it. Inventory comes back only
 *     at the restockable rate.
 *   - Store credit — no cash leaves. Same return label and restock.
 *     Expected next-item cost is redemption rate × (COGS + pack +
 *     replacement postage). Unused credit is breakage, not a refund.
 *   - Exchange — keep the original payment, pay the return label plus a
 *     replacement outbound and pack. Extra COGS only on the unrestockable
 *     share, because a restocked unit plus a replacement is one unit net.
 *
 * Completed-sale profit is the baseline. This table is the decision
 * after a return is requested, not a mix-rate overlay. Complementary
 * to open refund-rate work (#1552) and to landed Shop Pay Installments.
 * Rates are inputs.
 */
export function compareReturnResolution(input) {
  const order = calculateOrder(input);
  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const shippingCost = number(input.shippingCost, "Shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const restockingFee = number(input.restockingFee, "Restocking fee", 0);
  const returnLabelCost = emptyField(input.returnLabelCost)
    ? DEFAULT_RETURN_LABEL_COST
    : number(input.returnLabelCost, "Return label");
  const replacementShippingCost = emptyField(input.replacementShippingCost)
    ? shippingCost
    : number(input.replacementShippingCost, "Replacement shipping");
  const replacementPackagingCost = emptyField(input.replacementPackagingCost)
    ? packagingCost
    : number(input.replacementPackagingCost, "Replacement packaging");
  const restockablePct = emptyField(input.restockablePct)
    ? DEFAULT_RESTOCKABLE_PCT
    : ratePercent(input.restockablePct, "Restockable percent");
  const creditRedemptionPct = emptyField(input.creditRedemptionPct)
    ? DEFAULT_CREDIT_REDEMPTION_PCT
    : ratePercent(input.creditRedemptionPct, "Credit redemption percent");
  const processorFeeKeptPct = emptyField(input.processorFeeKeptPct)
    ? DEFAULT_PROCESSOR_FEE_KEPT_PCT
    : ratePercent(input.processorFeeKeptPct, "Processor fee kept percent");
  const monthlyReturns = number(input.monthlyReturns, "Monthly returns", 0);
  const refundShippingCharged = truthyFlag(input.refundShippingCharged);

  const refundBase = (refundShippingCharged ? price + shippingCharged : price);
  if (restockingFee > refundBase) {
    throw new Error("Restocking fee cannot exceed the refund amount");
  }

  const refundPaid = refundBase - restockingFee;
  const feeReturned = order.selected.feeTotal * (1 - processorFeeKeptPct / 100);
  const restockableRate = restockablePct / 100;
  const redemptionRate = creditRedemptionPct / 100;
  const recoveredCogs = costOfGoods * restockableRate;
  const nextItemCost = costOfGoods + replacementPackagingCost + replacementShippingCost;
  const expectedNextItemCost = nextItemCost * redemptionRate;
  const extraUnrestockableCogs = costOfGoods * (1 - restockableRate);
  const completedProfit = order.selected.profit;

  const refundKept = completedProfit - refundPaid + feeReturned + recoveredCogs - returnLabelCost;
  const creditKept = completedProfit + recoveredCogs - returnLabelCost - expectedNextItemCost;
  const exchangeKept =
    completedProfit - returnLabelCost - replacementShippingCost - replacementPackagingCost
    - extraUnrestockableCogs;

  const refund = {
    id: "refund",
    label: "Refund cash",
    cashBack: refundPaid,
    extraPostage: returnLabelCost,
    nextItemCost: 0,
    kept: refundKept,
  };
  const credit = {
    id: "credit",
    label: "Store credit",
    cashBack: 0,
    extraPostage: returnLabelCost,
    nextItemCost: expectedNextItemCost,
    kept: creditKept,
  };
  const exchange = {
    id: "exchange",
    label: "Exchange",
    cashBack: 0,
    extraPostage: returnLabelCost + replacementShippingCost,
    nextItemCost: extraUnrestockableCogs + replacementPackagingCost,
    kept: exchangeKept,
  };

  const rows = [refund, credit, exchange].map((row) => ({
    ...row,
    vsRefund: row.kept - refundKept,
    vsCompleted: row.kept - completedProfit,
  }));
  const maxKept = Math.max(...rows.map((row) => row.kept));
  const leaders = rows.filter((row) => Math.abs(row.kept - maxKept) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  return {
    rows,
    refund: rows[0],
    credit: rows[1],
    exchange: rows[2],
    completedProfit,
    refundPaid,
    feeReturned,
    recoveredCogs,
    expectedNextItemCost,
    returnLabelCost,
    restockablePct,
    creditRedemptionPct,
    processorFeeKeptPct,
    refundShippingCharged,
    restockingFee,
    extraKeptOnCredit: creditKept - refundKept,
    extraKeptOnExchange: exchangeKept - refundKept,
    monthlyExtraOnCredit: (creditKept - refundKept) * monthlyReturns,
    winner,
    summary: returnResolutionSummary({
      winner,
      refund: rows[0],
      credit: rows[1],
      exchange: rows[2],
    }),
  };
}

/**
 * Illustrative Shopify Capital offer so the table is immediately useful.
 * Replace the advance, repayment, and holdback from the offer email —
 * these are not Shopify Capital's current schedule.
 */
export const DEFAULT_CAPITAL_ADVANCE = 10000;
export const DEFAULT_CAPITAL_REPAY = 11400;
export const DEFAULT_CAPITAL_HOLDBACK_PCT = 10;
export const DEFAULT_CAPITAL_MONTHLY_SALES = 30000;
export const DEFAULT_BANK_APR_PCT = 12;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

function capitalSummary({
  winner,
  fee,
  daysToRepay,
  simpleAnnualizedPct,
  breakEvenExtraMonthly,
  extraMonthlyProfit,
  extraCoversFee,
}) {
  const feeLabel = moneyLabel(fee);
  const days = daysToRepay.toFixed(1);
  const annual = simpleAnnualizedPct.toFixed(1);
  const breakEven = moneyLabel(breakEvenExtraMonthly);
  if (winner === "wait") {
    const liftLine =
      extraMonthlyProfit > 1e-9
        ? extraCoversFee
          ? ` The extra monthly profit you typed already covers that fee.`
          : ` The extra monthly profit you typed does not cover that fee.`
        : ` You need about ${breakEven} extra profit / month during the holdback for Capital to match waiting.`;
    return `Waiting and self-funding keeps more than this Shopify Capital offer. The ${feeLabel} fee over ${days} days is about ${annual}% simple annualized.${liftLine}`;
  }
  if (winner === "bank") {
    return `A bank or line of credit at the typed APR keeps more than this Shopify Capital offer. Capital's ${feeLabel} fee over ${days} days is about ${annual}% simple annualized.`;
  }
  if (winner === "capital") {
    return `Shopify Capital keeps more than waiting after the extra inventory profit you typed. The ${feeLabel} fee over ${days} days is about ${annual}% simple annualized.`;
  }
  return `Shopify Capital, waiting, and a bank line leave the same leftover on these rates.`;
}

/**
 * Same cash need, three ways to fund it.
 *
 *   - Shopify Capital — a merchant cash advance. Fee is repayment minus
 *     advance. Holdback is a percent of daily sales until repaid. Simple
 *     annualized cost is (fee / advance) × (365 / days to repay). That
 *     is not APR-of-record and not a Truth-in-Lending figure.
 *   - Wait / self-fund — save the advance from leftover monthly profit
 *     (typed, or this SKU's profit × monthly orders). Miss the extra
 *     monthly profit during those save-up days.
 *   - Bank / LOC — interest at the typed APR over the same repay days,
 *     with the same extra monthly profit as having the cash now.
 *
 * Extra monthly profit is the inventory or campaign that only happens
 * if the cash arrives now. Default 0 so the table does not invent a
 * lift. Rates and the offer are inputs, not Shopify Capital policy.
 * Complementary to landed Shop Pay Installments (customer BNPL, not
 * merchant funding) and to open plan-upgrade work.
 */
export function compareShopifyCapital(input) {
  const advance = emptyField(input.advanceAmount)
    ? DEFAULT_CAPITAL_ADVANCE
    : number(input.advanceAmount, "Capital advance");
  const repayment = emptyField(input.repaymentAmount)
    ? DEFAULT_CAPITAL_REPAY
    : number(input.repaymentAmount, "Capital repayment");
  const holdbackPct = emptyField(input.holdbackPct)
    ? DEFAULT_CAPITAL_HOLDBACK_PCT
    : ratePercent(input.holdbackPct, "Holdback percent");
  const monthlySales = emptyField(input.monthlySales)
    ? DEFAULT_CAPITAL_MONTHLY_SALES
    : number(input.monthlySales, "Monthly sales");
  const extraMonthlyProfit = number(input.extraMonthlyProfit, "Extra monthly profit from having the cash now", 0);
  const bankAprPct = emptyField(input.bankAprPct)
    ? DEFAULT_BANK_APR_PCT
    : number(input.bankAprPct, "Bank APR");
  if (advance <= 0) throw new Error("Capital advance must be greater than zero");
  if (repayment < advance) throw new Error("Capital repayment cannot be less than the advance");
  if (holdbackPct <= 0) throw new Error("Holdback percent must be greater than zero");
  if (monthlySales <= 0) throw new Error("Monthly sales must be greater than zero");

  const fee = repayment - advance;
  const dailySales = monthlySales / DAYS_PER_MONTH;
  const dailyHoldback = dailySales * (holdbackPct / 100);
  if (dailyHoldback <= 1e-12) throw new Error("Holdback must take some daily sales");
  const daysToRepay = repayment / dailyHoldback;
  const simpleAnnualizedPct = (fee / advance) * (DAYS_PER_YEAR / daysToRepay) * 100;
  const extraProfitDuringRepay = extraMonthlyProfit * (daysToRepay / DAYS_PER_MONTH);
  const breakEvenExtraMonthly = daysToRepay > 1e-12 ? fee / (daysToRepay / DAYS_PER_MONTH) : null;

  let leftoverMonthlyProfit;
  if (emptyField(input.leftoverMonthlyProfit)) {
    const order = calculateOrder(input);
    leftoverMonthlyProfit = order.selected.profit * number(input.monthlyOrders, "Monthly orders", 1);
  } else {
    leftoverMonthlyProfit = number(input.leftoverMonthlyProfit, "Leftover monthly profit");
  }

  const dailyLeftover = leftoverMonthlyProfit / DAYS_PER_MONTH;
  const daysToSelfFund = dailyLeftover > 1e-12 ? advance / dailyLeftover : null;
  const missedWhileWaiting =
    daysToSelfFund == null ? extraMonthlyProfit : extraMonthlyProfit * (daysToSelfFund / DAYS_PER_MONTH);
  const bankInterest = advance * (bankAprPct / 100) * (daysToRepay / DAYS_PER_YEAR);

  const capitalKept = extraProfitDuringRepay - fee;
  const waitKept = -missedWhileWaiting;
  const bankKept = extraProfitDuringRepay - bankInterest;
  const extraCoversFee = extraProfitDuringRepay + 1e-9 >= fee;

  const capital = {
    id: "capital",
    label: "Shopify Capital",
    cashNow: advance,
    cost: fee,
    extraProfit: extraProfitDuringRepay,
    days: daysToRepay,
    kept: capitalKept,
  };
  const wait = {
    id: "wait",
    label: "Wait and self-fund",
    cashNow: 0,
    cost: missedWhileWaiting,
    extraProfit: 0,
    days: daysToSelfFund,
    kept: waitKept,
  };
  const bank = {
    id: "bank",
    label: "Bank / line of credit",
    cashNow: advance,
    cost: bankInterest,
    extraProfit: extraProfitDuringRepay,
    days: daysToRepay,
    kept: bankKept,
  };

  const rows = [capital, wait, bank].map((row) => ({
    ...row,
    vsWait: row.kept - waitKept,
  }));
  const maxKept = Math.max(...rows.map((row) => row.kept));
  const leaders = rows.filter((row) => Math.abs(row.kept - maxKept) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  return {
    rows,
    capital: rows[0],
    wait: rows[1],
    bank: rows[2],
    advance,
    repayment,
    fee,
    holdbackPct,
    monthlySales,
    dailySales,
    dailyHoldback,
    daysToRepay,
    simpleAnnualizedPct,
    extraMonthlyProfit,
    extraProfitDuringRepay,
    leftoverMonthlyProfit,
    daysToSelfFund,
    missedWhileWaiting,
    bankAprPct,
    bankInterest,
    breakEvenExtraMonthly,
    extraCoversFee,
    extraKeptOnCapital: capitalKept - waitKept,
    extraKeptOnBank: bankKept - waitKept,
    winner,
    summary: capitalSummary({
      winner,
      fee,
      daysToRepay,
      simpleAnnualizedPct,
      breakEvenExtraMonthly,
      extraMonthlyProfit,
      extraCoversFee,
    }),
  };
}

/**
 * Illustrative unpaid-invoice rate so the table is immediately useful.
 * Replace it from your own aged-receivables report — not a Shopify
 * published collection figure.
 */
export const DEFAULT_COLLECTION_PCT = 95;
export const DEFAULT_MANUAL_DISCOUNT_PCT = 0;
export const DEFAULT_CHASE_COST = 0;

function manualPaymentSummary({
  winner,
  extraIfPaid,
  breakEvenHoldPct,
  breakEvenShippedPct,
  collectionPct,
  monthlyExtraIfPaid,
}) {
  const save = moneyLabel(extraIfPaid);
  const month = moneyLabel(monthlyExtraIfPaid);
  const holdFloor = breakEvenHoldPct == null ? null : breakEvenHoldPct.toFixed(1);
  const shipFloor = breakEvenShippedPct == null ? null : breakEvenShippedPct.toFixed(1);
  if (winner === "card") {
    const floor = holdFloor == null ? "a higher collection rate" : `at least ${holdFloor}% collected`;
    return `Taking the card still keeps more than bank transfer at a ${collectionPct}% collection rate. The ${save} fee save only survives if ${floor} before you ship.`;
  }
  if (winner === "hold") {
    return `Holding the order until the bank transfer clears keeps more than the card at a ${collectionPct}% collection rate. The ${save} fee save (${month} / month if they all pay) survives down to about ${holdFloor}% collected. Shipping first needs about ${shipFloor}% collected.`;
  }
  if (winner === "shipped") {
    return `Bank transfer still keeps more than the card even if you ship first, at a ${collectionPct}% collection rate. The ${save} fee save survives down to about ${shipFloor}% collected after you have already spent cash.`;
  }
  return `The card and bank transfer leave the same leftover on these rates.`;
}

/**
 * Same SKU, three ways the cash actually arrives.
 *
 *   - Card — Shopify Payments or the typed third-party path. The
 *     processor collects; you keep profit after fees.
 *   - Hold until paid — Shopify manual payment / bank deposit / Mark
 *     as paid. No processor fee and no Shopify third-party transaction
 *     fee. You only spend COGS and postage on the invoices that clear.
 *   - Ship first — same zero-fee path, but the unpaid slice still
 *     consumed cash (goods + label + packaging + allocated plan).
 *
 * The usual pitch is “save 2.9%.” The missing piece is collection.
 * A 5% unpaid rate can wipe a 2.9% + $0.30 save on a $54 ticket.
 * Rates, the invoice discount, chase cost, and collection percent are
 * inputs — not Shopify policy. Complementary to landed Payments vs
 * PayPal, POS, and Shop Pay Installments (those are still card rails).
 */
export function compareManualPayment(input) {
  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const collectionPct = emptyField(input.collectionPct)
    ? DEFAULT_COLLECTION_PCT
    : ratePercent(input.collectionPct, "Collection percent");
  const manualDiscountPct = emptyField(input.manualDiscountPct)
    ? DEFAULT_MANUAL_DISCOUNT_PCT
    : ratePercent(input.manualDiscountPct, "Manual payment discount");
  const chaseCost = emptyField(input.chaseCost)
    ? DEFAULT_CHASE_COST
    : number(input.chaseCost, "Chase / matching cost");
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);

  const cardOrder = calculateOrder(input);
  const cardFees = cardOrder.selected.feeTotal;
  const cashInvested = cardOrder.selected.cashInvested;
  const cardProfit = cardOrder.selected.profit;

  const manualPrice = price * (1 - manualDiscountPct / 100);
  const manualRevenue = manualPrice + shippingCharged;
  const paidProfit = manualRevenue - cashInvested - chaseCost;
  const extraIfPaid = paidProfit - cardProfit;
  const collectionRate = collectionPct / 100;
  const unpaidRate = 1 - collectionRate;

  const holdKept = collectionRate * paidProfit;
  const shippedKept = collectionRate * paidProfit + unpaidRate * (-cashInvested - chaseCost);
  const monthlyExtraIfPaid = extraIfPaid * monthlyOrders;
  const monthlyHoldExtra = (holdKept - cardProfit) * monthlyOrders;
  const monthlyShippedExtra = (shippedKept - cardProfit) * monthlyOrders;

  // paidProfit can be negative -- holding for a bank transfer can lose money
  // at 100% collection, not just cost more -- and the ratio still finds the
  // real collection rate where holdKept ties the card path, whatever its
  // sign (a card path that also loses money still ties a losing hold path
  // at a real, positive collection rate). Gating on paidProfit > 0 (as this
  // used to) always returned null in that case, even when a real crossing
  // existed.
  let breakEvenHoldPct = null;
  if (Math.abs(paidProfit) > 1e-12) {
    const rate = (cardProfit / paidProfit) * 100;
    if (rate >= -1e-9 && rate <= 100 + 1e-9) breakEvenHoldPct = Math.max(0, rate);
  }
  const shippedDenominator = manualRevenue;
  const breakEvenShippedPct =
    shippedDenominator > 1e-12
      ? ((cardProfit + cashInvested + chaseCost) / shippedDenominator) * 100
      : null;

  const card = {
    id: "card",
    label: "Card / Shopify Payments",
    revenue: cardOrder.revenue,
    fees: cardFees,
    cashAtRisk: cashInvested,
    kept: cardProfit,
  };
  const hold = {
    id: "hold",
    label: "Bank transfer, hold until paid",
    revenue: manualRevenue,
    fees: 0,
    cashAtRisk: 0,
    kept: holdKept,
  };
  const shipped = {
    id: "shipped",
    label: "Bank transfer, ship first",
    revenue: manualRevenue,
    fees: 0,
    cashAtRisk: cashInvested + chaseCost,
    kept: shippedKept,
  };

  const rows = [card, hold, shipped].map((row) => ({
    ...row,
    vsCard: row.kept - cardProfit,
  }));
  const maxKept = Math.max(...rows.map((row) => row.kept));
  const leaders = rows.filter((row) => Math.abs(row.kept - maxKept) < 1e-9);
  // 100% collection makes hold and ship-first the same leftover. Prefer
  // hold — you do not need to spend cash to earn that save.
  let winner;
  if (leaders.length === 1) {
    winner = leaders[0].id;
  } else if (leaders.every((row) => row.id !== "card")) {
    winner = "hold";
  } else {
    winner = "tie";
  }

  return {
    rows,
    card: rows[0],
    hold: rows[1],
    shipped: rows[2],
    collectionPct,
    manualDiscountPct,
    chaseCost,
    manualPrice,
    manualRevenue,
    paidProfit,
    extraIfPaid,
    cardFees,
    cashInvested,
    holdKept,
    shippedKept,
    breakEvenHoldPct,
    breakEvenShippedPct,
    monthlyExtraIfPaid,
    monthlyHoldExtra,
    monthlyShippedExtra,
    extraKeptOnHold: holdKept - cardProfit,
    extraKeptOnShipped: shippedKept - cardProfit,
    winner,
    summary: manualPaymentSummary({
      winner,
      extraIfPaid,
      breakEvenHoldPct,
      breakEvenShippedPct,
      collectionPct,
      monthlyExtraIfPaid,
    }),
  };
}

/**
 * Illustrative chargeback fee and win rate so the table is immediately
 * useful. Replace the fee from your Shopify Payments / processor
 * statement and the win rate from your own representment history —
 * these are not Shopify's current dispute schedule.
 */
export const DEFAULT_CHARGEBACK_FEE = 15;
export const DEFAULT_CHARGEBACK_WIN_PCT = 25;
export const DEFAULT_FIGHT_COST = 0;
export const DEFAULT_MONTHLY_CHARGEBACKS = 2;
export const DEFAULT_REFUND_FEE_KEPT_PCT = 0;
export const DEFAULT_CHARGEBACK_RESTOCKABLE_PCT = 0;

function chargebackSummary({
  winner,
  extraVsAccept,
  extraVsFight,
  breakEvenWinPct,
  chargebackFee,
  winPct,
  monthlyExtraVsAccept,
}) {
  const save = moneyLabel(extraVsAccept);
  const vsFight = moneyLabel(Math.abs(extraVsFight));
  const fee = moneyLabel(chargebackFee);
  const floor = breakEvenWinPct == null ? null : `${breakEvenWinPct.toFixed(1)}%`;
  const month = moneyLabel(monthlyExtraVsAccept);
  if (winner === "refund") {
    const fightLine =
      extraVsFight > 1e-9
        ? ` It also keeps ${vsFight} more than fighting at a ${winPct}% win rate` +
          (floor == null ? "." : ` — you need about ${floor} wins for representment to match a refund.`)
        : ` Fighting at a ${winPct}% win rate leaves the same leftover.`;
    return `Refunding before the chargeback lands keeps ${save} more than accepting it (the ${fee} fee plus the processing fees that a refund can still return).${fightLine} At this volume that gap is ${month} / month versus accepting.`;
  }
  if (winner === "fight") {
    return `Fighting the chargeback at a ${winPct}% win rate keeps more than refunding now. Representment still has to beat a refund after the ${fee} fee; the typed win rate already does.`;
  }
  if (winner === "accept") {
    return `Accepting the chargeback keeps more on these rates. That is unusual — check that the refund amount or restock recovery is not larger than the pulled funds plus the ${fee} fee.`;
  }
  return `Refunding, fighting, and accepting the chargeback leave the same leftover on these rates.`;
}

/**
 * Same completed Shopify order, three responses to a payment dispute.
 *
 *   - Refund now — send the ticket back before (or instead of) a
 *     chargeback. Percentage processing fees often come back; there is
 *     no $15 network fee. Goods come back only at
 *     the typed restockable percent (default 0: they already have the
 *     item).
 *   - Accept the chargeback — the processor pulls the original charge
 *     and adds the chargeback fee. Processing fees stay. Goods almost
 *     never come back.
 *   - Fight / representment — expected leftover at the typed win rate.
 *     The chargeback fee is paid either way (the usual card-network
 *     default). Evidence time is the typed fight cost.
 *
 * The usual pitch is “always fight, you might win.” On a $54 ticket the
 * $15 fee plus fees that a refund can still return means a 25% win rate
 * still loses to refunding. Rates and the win percent are inputs — not
 * Shopify Payments dispute policy. Complementary to landed store-credit
 * vs refund (a requested return, not a card-network pull).
 */
export function compareChargeback(input) {
  const order = calculateOrder(input);
  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const chargebackFee = emptyField(input.chargebackFee)
    ? DEFAULT_CHARGEBACK_FEE
    : number(input.chargebackFee, "Chargeback fee");
  const winPct = emptyField(input.chargebackWinPct)
    ? DEFAULT_CHARGEBACK_WIN_PCT
    : ratePercent(input.chargebackWinPct, "Chargeback win percent");
  const fightCost = emptyField(input.fightCost)
    ? DEFAULT_FIGHT_COST
    : number(input.fightCost, "Fight / evidence cost");
  const monthlyChargebacks = emptyField(input.monthlyChargebacks)
    ? DEFAULT_MONTHLY_CHARGEBACKS
    : number(input.monthlyChargebacks, "Monthly chargebacks");
  const refundFeeKeptPct = emptyField(input.refundFeeKeptPct)
    ? DEFAULT_REFUND_FEE_KEPT_PCT
    : ratePercent(input.refundFeeKeptPct, "Refund fee kept percent");
  const restockablePct = emptyField(input.chargebackRestockablePct)
    ? DEFAULT_CHARGEBACK_RESTOCKABLE_PCT
    : ratePercent(input.chargebackRestockablePct, "Restockable percent");
  const refundShippingCharged = input.refundShippingCharged === undefined
    ? true
    : truthyFlag(input.refundShippingCharged);

  const pulledAmount = price + shippingCharged;
  const refundPaid = refundShippingCharged ? pulledAmount : price;
  const completedProfit = order.selected.profit;
  const feeReturned = order.selected.feeTotal * (1 - refundFeeKeptPct / 100);
  const recoveredCogs = costOfGoods * (restockablePct / 100);
  const winRate = winPct / 100;
  const loseRate = 1 - winRate;

  const refundKept = completedProfit - refundPaid + feeReturned + recoveredCogs;
  const acceptKept = completedProfit - pulledAmount - chargebackFee;
  const fightKept =
    winRate * completedProfit + loseRate * (completedProfit - pulledAmount) - chargebackFee - fightCost;

  const extraVsAccept = refundKept - acceptKept;
  const extraVsFight = refundKept - fightKept;
  const monthlyExtraVsAccept = extraVsAccept * monthlyChargebacks;
  const monthlyExtraVsFight = extraVsFight * monthlyChargebacks;

  // fightKept = refundKept
  // completed - (1-w)*pulled - fee - fightCost = refundKept
  // (1-w)*pulled = completed - fee - fightCost - refundKept
  const recoverNeeded = completedProfit - chargebackFee - fightCost - refundKept;
  const breakEvenWinPct =
    pulledAmount > 1e-12 ? (1 - recoverNeeded / pulledAmount) * 100 : null;
  const usableBreakEven =
    breakEvenWinPct == null || breakEvenWinPct < 0 || breakEvenWinPct > 100
      ? null
      : breakEvenWinPct;

  const refund = {
    id: "refund",
    label: "Refund now",
    pulled: refundPaid,
    extraFee: 0,
    kept: refundKept,
  };
  const fight = {
    id: "fight",
    label: "Fight the chargeback",
    pulled: loseRate * pulledAmount,
    extraFee: chargebackFee + fightCost,
    kept: fightKept,
  };
  const accept = {
    id: "accept",
    label: "Accept the chargeback",
    pulled: pulledAmount,
    extraFee: chargebackFee,
    kept: acceptKept,
  };

  const rows = [refund, fight, accept].map((row) => ({
    ...row,
    vsAccept: row.kept - acceptKept,
    vsRefund: row.kept - refundKept,
  }));
  const maxKept = Math.max(...rows.map((row) => row.kept));
  const leaders = rows.filter((row) => Math.abs(row.kept - maxKept) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  return {
    rows,
    refund: rows[0],
    fight: rows[1],
    accept: rows[2],
    completedProfit,
    pulledAmount,
    refundPaid,
    feeReturned,
    recoveredCogs,
    chargebackFee,
    winPct,
    fightCost,
    refundFeeKeptPct,
    restockablePct,
    refundShippingCharged,
    monthlyChargebacks,
    extraVsAccept,
    extraVsFight,
    extraKeptOnFight: fightKept - acceptKept,
    monthlyExtraVsAccept,
    monthlyExtraVsFight,
    breakEvenWinPct: usableBreakEven,
    winner,
    summary: chargebackSummary({
      winner,
      extraVsAccept,
      extraVsFight,
      breakEvenWinPct: usableBreakEven,
      chargebackFee,
      winPct,
      monthlyExtraVsAccept,
    }),
  };
}

/**
 * Illustrative local-delivery defaults. Minutes, hourly, miles, and the
 * IRS-style mileage rate are inputs — not a Shopify Local Delivery
 * schedule. $8 charged / 25 minutes / $18 hour / 8 miles / $0.70 mile
 * is a city drop-off a merchant overwrites from their last run.
 */
export const DEFAULT_LOCAL_DELIVERY_FEE = 8;
export const DEFAULT_LOCAL_DELIVERY_MINUTES = 25;
export const DEFAULT_LOCAL_HOURLY_RATE = 18;
export const DEFAULT_LOCAL_MILES = 8;
export const DEFAULT_LOCAL_MILEAGE_RATE = 0.7;

export function localDeliveryCost({ minutes, hourlyRate, miles, mileageRate }) {
  return (minutes / 60) * hourlyRate + miles * mileageRate;
}

function localDeliverySummary({
  winner,
  extraKeptOnLocal,
  deliveryCost,
  breakEvenDeliveryCost,
  monthlyExtraOnLocal,
}) {
  const gap = moneyLabel(Math.abs(extraKeptOnLocal));
  const ahead = extraKeptOnLocal >= 0 ? "more" : "less";
  const localLine = `Local delivery at a ${moneyLabel(deliveryCost)} run cost keeps ${gap} ${ahead} than the carrier label.`;
  const ceiling = Number.isFinite(breakEvenDeliveryCost)
    ? ` The run has to cost about ${moneyLabel(breakEvenDeliveryCost)} before local delivery matches the label.`
    : " No local-delivery run cost on these rates can match the label.";
  const month = monthlyExtraOnLocal === 0
    ? ""
    : ` Across the typed month that is ${moneyLabel(monthlyExtraOnLocal)}.`;
  if (winner === "tie") {
    return `Local delivery and the carrier label leave the same profit on these rates.${month}`;
  }
  return `${localLine}${ceiling}${month}`;
}

/**
 * Same SKU, three ways to get it to the buyer.
 *
 *   - Carrier / Shopify label — typed shipping charged and shipping you
 *     pay. This is the landed label path.
 *   - Local delivery — typed delivery fee, driver minutes × hourly,
 *     plus miles × mileage. Card fees sit on the delivery fee.
 *   - Charge shipping, deliver yourself — keep the typed postage
 *     charged, still pay the driver run. The usual “I’ll just drop
 *     it off and keep the shipping” trap.
 *
 * Complementary to landed Shopify Shipping vs own label (two labels,
 * same checkout postage) and to POS pickup (buyer comes in). Rates
 * and the run are inputs, not Shopify Local Delivery policy.
 */
export function compareLocalDelivery(input) {
  const deliveryFee = emptyField(input.localDeliveryFee)
    ? DEFAULT_LOCAL_DELIVERY_FEE
    : number(input.localDeliveryFee, "Local delivery fee");
  const minutes = emptyField(input.localDeliveryMinutes)
    ? DEFAULT_LOCAL_DELIVERY_MINUTES
    : number(input.localDeliveryMinutes, "Local delivery minutes");
  const hourlyRate = emptyField(input.localHourlyRate)
    ? DEFAULT_LOCAL_HOURLY_RATE
    : number(input.localHourlyRate, "Local hourly rate");
  const miles = emptyField(input.localMiles)
    ? DEFAULT_LOCAL_MILES
    : number(input.localMiles, "Local delivery miles");
  const mileageRate = emptyField(input.localMileageRate)
    ? DEFAULT_LOCAL_MILEAGE_RATE
    : number(input.localMileageRate, "Local mileage rate");
  const monthlyOrders = number(input.monthlyOrders, "Monthly orders", 1);

  const deliveryCost = localDeliveryCost({ minutes, hourlyRate, miles, mileageRate });
  const shipOrder = calculateOrder(input);
  const localOrder = calculateOrder({
    ...input,
    shippingCharged: deliveryFee,
    shippingCost: deliveryCost,
  });
  const chargeShipDeliverOrder = calculateOrder({
    ...input,
    shippingCost: deliveryCost,
  });

  const shipProfit = shipOrder.selected.profit;
  const localProfit = localOrder.selected.profit;
  const chargeShipDeliverProfit = chargeShipDeliverOrder.selected.profit;

  const ship = {
    id: "ship",
    label: "Carrier / Shopify label",
    charged: number(input.shippingCharged, "Shipping charged"),
    fulfillmentCost: number(input.shippingCost, "Shipping cost"),
    fees: shipOrder.selected.feeTotal,
    profit: shipProfit,
  };
  const local = {
    id: "local",
    label: "Local delivery",
    charged: deliveryFee,
    fulfillmentCost: deliveryCost,
    fees: localOrder.selected.feeTotal,
    profit: localProfit,
  };
  const chargeShipDeliver = {
    id: "charge_ship_deliver",
    label: "Charge shipping, deliver yourself",
    charged: ship.charged,
    fulfillmentCost: deliveryCost,
    fees: chargeShipDeliverOrder.selected.feeTotal,
    profit: chargeShipDeliverProfit,
  };

  const extraKeptOnLocal = localProfit - shipProfit;
  const extraKeptOnChargeShipDeliver = chargeShipDeliverProfit - shipProfit;
  const monthlyExtraOnLocal = extraKeptOnLocal * monthlyOrders;

  const rows = [ship, local, chargeShipDeliver].map((row) => ({
    ...row,
    vsShip: row.profit - shipProfit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.profit));
  const leaders = rows.filter((row) => Math.abs(row.profit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const localRevenue = number(input.price, "Item price") + deliveryFee;
  const paymentsRate = number(input.paymentsRate, "Shopify Payments rate", 2.9);
  const paymentsFixed = number(input.paymentsFixed, "Shopify Payments fixed fee", 0.3);
  const processorRate = number(input.processorRate, "Third-party processor rate", 3.49);
  const processorFixed = number(input.processorFixed, "Third-party processor fixed fee", 0.49);
  const shopifyTxnRate = number(input.shopifyTxnRate, "Shopify third-party transaction rate", 2);
  const paymentMethod = input.paymentMethod ?? "shopify_payments";
  const localPercentRate = paymentMethod === "third_party"
    ? (processorRate + shopifyTxnRate) / 100
    : paymentsRate / 100;
  const localFixed = paymentMethod === "third_party" ? processorFixed : paymentsFixed;
  const localFeesAtFee = localRevenue * localPercentRate + localFixed;
  const cashWithoutFulfillment = localOrder.selected.cashInvested - deliveryCost;
  let breakEvenDeliveryCost = Infinity;
  if (Number.isFinite(shipProfit)) {
    breakEvenDeliveryCost = localRevenue - localFeesAtFee - cashWithoutFulfillment - shipProfit;
  }
  let breakEvenMinutes = Infinity;
  if (hourlyRate > 1e-12) {
    breakEvenMinutes = ((breakEvenDeliveryCost - miles * mileageRate) / hourlyRate) * 60;
  }

  return {
    rows,
    ship: rows[0],
    local: rows[1],
    chargeShipDeliver: rows[2],
    deliveryFee,
    minutes,
    hourlyRate,
    miles,
    mileageRate,
    deliveryCost,
    extraKeptOnLocal,
    extraKeptOnChargeShipDeliver,
    monthlyExtraOnLocal,
    breakEvenDeliveryCost,
    breakEvenMinutes,
    winner,
    summary: localDeliverySummary({
      winner,
      extraKeptOnLocal,
      deliveryCost,
      breakEvenDeliveryCost,
      monthlyExtraOnLocal,
    }),
  };
}

/**
 * Illustrative gift-card defaults so the table is immediately useful.
 * Face, what they pay, and redemption rate are inputs — not Shopify
 * gift-card policy or a published breakage schedule. $50 face / $50
 * paid / 80% redeem is a digital card a merchant overwrites from
 * their own gift-card report.
 */
export const DEFAULT_GIFT_CARD_FACE = 50;
export const DEFAULT_GIFT_CARD_PRICE = 50;
export const DEFAULT_GIFT_CARD_REDEMPTION_PCT = 80;
export const DEFAULT_MONTHLY_GIFT_CARDS = 20;

function cardFeesOnAmount(amount, input) {
  if (amount <= 1e-12) return 0;
  const paymentsRate = number(input.paymentsRate, "Shopify Payments rate", 2.9);
  const paymentsFixed = number(input.paymentsFixed, "Shopify Payments fixed fee", 0.3);
  const shopifyTxnRate = number(input.shopifyTxnRate, "Shopify third-party transaction rate", 2);
  const processorRate = number(input.processorRate, "Third-party processor rate", 3.49);
  const processorFixed = number(input.processorFixed, "Third-party processor fixed fee", 0.49);
  const paymentMethod = input.paymentMethod ?? "shopify_payments";
  if (paymentMethod === "third_party") {
    return amount * ((processorRate + shopifyTxnRate) / 100) + processorFixed;
  }
  return amount * (paymentsRate / 100) + paymentsFixed;
}

function giftCardSummary({
  winner,
  extraOnRedeem,
  saleFees,
  remainderFees,
  promoDiscount,
  face,
  cardPrice,
  redemptionPct,
  expectedKept,
  monthlyExtraOnRedeem,
}) {
  const gap = moneyLabel(Math.abs(extraOnRedeem));
  const ahead = extraOnRedeem >= 0 ? "more" : "less";
  const paid = moneyLabel(cardPrice);
  const faceLabel = moneyLabel(face);
  const swipe = remainderFees > 1e-9
    ? ` The extra ${moneyLabel(remainderFees)} is the second card swipe on the leftover after the card.`
    : "";
  const promo = promoDiscount > 1e-9
    ? ` They paid ${paid} for a ${faceLabel} card (${moneyLabel(promoDiscount)} off).`
    : "";
  const month = monthlyExtraOnRedeem === 0
    ? ""
    : extraOnRedeem >= 0
      ? ` Across the typed month that is ${moneyLabel(monthlyExtraOnRedeem)} more.`
      : ` Across the typed month that gap is ${moneyLabel(Math.abs(monthlyExtraOnRedeem))}.`;
  if (winner === "tie") {
    return `Selling the SKU now and a gift card they later redeem leave the same leftover on these rates.${promo}${month}`;
  }
  const redeemLine = winner === "redeem"
    ? `A ${paid} gift card they later redeem on this SKU keeps ${gap} more than selling the item now.`
    : `Selling the SKU now keeps ${gap} more than a ${paid} gift card they later redeem on this order.`;
  return `${redeemLine}${promo}${swipe} Sale-day card fees are ${moneyLabel(saleFees)}. An ${redemptionPct}% redemption mix would leave ${moneyLabel(expectedKept)} — that includes unredeemed cards, not a forecast you should plan on.${month}`;
}

/**
 * Same typical SKU, three views of a Shopify gift-card sale.
 *
 *   - Sell the SKU now — landed checkout on the typed item + shipping.
 *   - Gift card, they redeem — fees hit what they pay for the card
 *     today. On redeem they apply the face to the same order; any
 *     leftover ticket is a second card swipe (another fixed fee).
 *     Unused face stays a liability, not leftover.
 *   - Expected mix — blends the redeem cycle with breakage at the
 *     typed redemption rate. Shown so merchants can see the temptation;
 *     it is not the winner. Breakage is unredeemed liability, not a
 *     plan.
 *
 * Complementary to landed store-credit vs refund (a return, not a
 * sold card) and to Shop Pay Installments (a card-rail mix). Face,
 * purchase price, and redemption percent are inputs — not Shopify
 * gift-card policy.
 */
export function compareGiftCard(input) {
  const face = emptyField(input.giftCardFace)
    ? DEFAULT_GIFT_CARD_FACE
    : number(input.giftCardFace, "Gift card face");
  if (face <= 0) throw new Error("Gift card face must be greater than zero");
  const cardPrice = emptyField(input.giftCardPrice)
    ? DEFAULT_GIFT_CARD_PRICE
    : number(input.giftCardPrice, "Gift card price");
  const redemptionPct = emptyField(input.giftCardRedemptionPct)
    ? DEFAULT_GIFT_CARD_REDEMPTION_PCT
    : ratePercent(input.giftCardRedemptionPct, "Gift card redemption percent");
  const monthlyGiftCards = emptyField(input.monthlyGiftCards)
    ? DEFAULT_MONTHLY_GIFT_CARDS
    : number(input.monthlyGiftCards, "Monthly gift cards");

  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const shippingCost = number(input.shippingCost, "Shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");

  const sellNowOrder = calculateOrder(input);
  const sellNowProfit = sellNowOrder.selected.profit;
  const allocatedPlan = sellNowOrder.allocatedPlanCost;
  const fulfillment = costOfGoods + shippingCost + packagingCost + otherCost;
  const orderTotal = price + shippingCharged;
  const applied = Math.min(face, orderTotal);
  const remainder = Math.max(0, orderTotal - face);
  const leftoverCredit = Math.max(0, face - orderTotal);

  const saleFees = cardFeesOnAmount(cardPrice, input);
  const remainderFees = cardFeesOnAmount(remainder, input);
  const cycleRevenue = cardPrice + remainder;
  const cycleFees = saleFees + remainderFees;
  const cycleKept = cycleRevenue - cycleFees - allocatedPlan - fulfillment - leftoverCredit;
  const breakageKept = cardPrice - saleFees - allocatedPlan;
  const cashToday = breakageKept;
  const redemptionRate = redemptionPct / 100;
  const expectedKept = (1 - redemptionRate) * breakageKept + redemptionRate * cycleKept;
  const promoDiscount = Math.max(0, face - cardPrice);

  const extraOnRedeem = cycleKept - sellNowProfit;
  const extraOnExpected = expectedKept - sellNowProfit;
  const monthlyExtraOnRedeem = extraOnRedeem * monthlyGiftCards;
  const monthlyExtraOnExpected = extraOnExpected * monthlyGiftCards;

  const sell = {
    id: "sell",
    label: "Sell the SKU now",
    charged: orderTotal,
    fees: sellNowOrder.selected.feeTotal,
    fulfillment,
    kept: sellNowProfit,
  };
  const redeem = {
    id: "redeem",
    label: "Gift card, they redeem",
    charged: cycleRevenue,
    fees: cycleFees,
    fulfillment,
    kept: cycleKept,
  };
  const expected = {
    id: "expected",
    label: `Gift card, ${redemptionPct}% redeem`,
    charged: cycleRevenue,
    fees: cycleFees,
    fulfillment,
    kept: expectedKept,
  };

  const rows = [sell, redeem, expected].map((row) => ({
    ...row,
    vsSell: row.kept - sellNowProfit,
  }));

  let winner = "tie";
  if (extraOnRedeem > 1e-9) winner = "redeem";
  else if (extraOnRedeem < -1e-9) winner = "sell";

  return {
    rows,
    sell: rows[0],
    redeem: rows[1],
    expected: rows[2],
    face,
    cardPrice,
    redemptionPct,
    monthlyGiftCards,
    orderTotal,
    applied,
    remainder,
    leftoverCredit,
    saleFees,
    remainderFees,
    cycleFees,
    cycleRevenue,
    cycleKept,
    breakageKept,
    cashToday,
    expectedKept,
    promoDiscount,
    allocatedPlan,
    fulfillment,
    extraOnRedeem,
    extraOnExpected,
    extraKeptOnRedeem: extraOnRedeem,
    monthlyExtraOnRedeem,
    monthlyExtraOnExpected,
    winner,
    summary: giftCardSummary({
      winner,
      extraOnRedeem,
      saleFees,
      remainderFees,
      promoDiscount,
      face,
      cardPrice,
      redemptionPct,
      expectedKept,
      monthlyExtraOnRedeem,
    }),
  };
}

/**
 * Illustrative Shopify Markets duty defaults so the table is immediately
 * useful. 15% of item-plus-shipping is a blended VAT/duty starting
 * point a merchant overwrites from their own landed-cost quote — not
 * Shopify Markets policy or a published duty schedule. DAP take 55% /
 * DDP take 42% / DAP refuse 18% / DDP refuse 6% are conversion and
 * door-refusal guesses the merchant replaces from their own Markets
 * report. International return labels are usually dearer than a
 * domestic $7 — $8 is a starting point, not a carrier quote.
 */
export const DEFAULT_DUTY_RATE_PCT = 15;
export const DEFAULT_DAP_TAKE_PCT = 55;
export const DEFAULT_DDP_TAKE_PCT = 42;
export const DEFAULT_DAP_REFUSE_PCT = 18;
export const DEFAULT_DDP_REFUSE_PCT = 6;
export const DEFAULT_DUTY_RETURN_LABEL = 8;
export const DEFAULT_DUTY_RESTOCKABLE_PCT = 80;
export const DEFAULT_DUTY_REFUND_FEE_LEFTOVER = 0.3;
export const DEFAULT_MONTHLY_INTL_VISITORS = 20;

function marketsPathExpected({
  takePct,
  refusePct,
  deliveredProfit,
  refusedProfit,
}) {
  const take = takePct / 100;
  const refuse = refusePct / 100;
  const perPlaced = (1 - refuse) * deliveredProfit + refuse * refusedProfit;
  return {
    perPlaced,
    expected: take * perPlaced,
    placedDelivered: take * (1 - refuse),
    placedRefused: take * refuse,
  };
}

function marketsDutiesSummary({
  dutyAmount,
  feeOnDuty,
  dap,
  ddp,
  extraOnDapVsDdp,
  monthlyExtraOnDapVsDdp,
  breakEvenDapRefusePct,
  breakEvenDdpTakePct,
}) {
  const skipLine = `Skipping international leaves $0.00 from this visitor.`;
  const dapGap = moneyLabel(Math.abs(dap.expected));
  const dapAhead = dap.expected >= 0 ? "more" : "less";
  const dapLine = ` DAP at a ${dap.takePct}% take and ${dap.refusePct}% door-refuse rate expects ${moneyLabel(dap.expected)} — ${dapGap} ${dapAhead} than skip. A delivered DAP order keeps ${moneyLabel(dap.deliveredProfit)}; a refuse leaves ${moneyLabel(dap.refusedProfit)}.`;
  const ddpGap = moneyLabel(Math.abs(ddp.expected - dap.expected));
  const ddpAhead = ddp.expected >= dap.expected ? "more" : "less";
  const ddpLine = ` DDP collects ${moneyLabel(dutyAmount)} at checkout (${moneyLabel(feeOnDuty)} extra card fee on the duty) at a ${ddp.takePct}% take and ${ddp.refusePct}% refuse rate and expects ${moneyLabel(ddp.expected)} — ${ddpGap} ${ddpAhead} than DAP.`;
  const refuseFloor = Number.isFinite(breakEvenDapRefusePct)
    ? ` DAP refuses have to reach about ${breakEvenDapRefusePct.toFixed(1)}% before DDP matches DAP.`
    : " No DAP refuse rate on these takes can match DDP.";
  const takeFloor = Number.isFinite(breakEvenDdpTakePct)
    ? ` DDP take has to reach about ${breakEvenDdpTakePct.toFixed(1)}% before it matches DAP.`
    : "";
  const month = Math.abs(monthlyExtraOnDapVsDdp) > 1e-9
    ? ` That is ${moneyLabel(Math.abs(monthlyExtraOnDapVsDdp))} / month ${extraOnDapVsDdp >= 0 ? "more on DAP" : "more on DDP"} at this visitor count.`
    : "";
  return `${skipLine}${dapLine}${ddpLine}${refuseFloor}${takeFloor}${month}`;
}

/**
 * Same typical SKU, three views of one international-interested visitor
 * on Shopify Markets:
 *   - skip — do not sell internationally; leftover from this visitor is $0
 *   - DAP — they pay item + shipping at checkout, duties at the door;
 *     more of them buy, more of them refuse the package
 *   - DDP — you collect duties at checkout (Shopify Markets / Duties);
 *     card fees sit on the duty amount; fewer buy, fewer refuse
 *
 * A refused package refunds the checkout, leaves the leftover card
 * fixed fee, eats outbound + return postage, and keeps only the
 * restockable share of cost of goods. Duty is assumed remitted only
 * on a delivered DDP order. Rates are inputs — not Shopify Markets
 * policy or a customs quote.
 */
export function compareMarketsDuties(input) {
  const dutyRatePct = emptyField(input.dutyRatePct)
    ? DEFAULT_DUTY_RATE_PCT
    : ratePercent(input.dutyRatePct, "Duty rate");
  const dapTakePct = emptyField(input.dapTakePct)
    ? DEFAULT_DAP_TAKE_PCT
    : ratePercent(input.dapTakePct, "DAP take percent");
  const ddpTakePct = emptyField(input.ddpTakePct)
    ? DEFAULT_DDP_TAKE_PCT
    : ratePercent(input.ddpTakePct, "DDP take percent");
  const dapRefusePct = emptyField(input.dapRefusePct)
    ? DEFAULT_DAP_REFUSE_PCT
    : ratePercent(input.dapRefusePct, "DAP refuse percent");
  const ddpRefusePct = emptyField(input.ddpRefusePct)
    ? DEFAULT_DDP_REFUSE_PCT
    : ratePercent(input.ddpRefusePct, "DDP refuse percent");
  const returnLabel = emptyField(input.dutyReturnLabel)
    ? DEFAULT_DUTY_RETURN_LABEL
    : number(input.dutyReturnLabel, "International return label");
  const restockablePct = emptyField(input.dutyRestockablePct)
    ? DEFAULT_DUTY_RESTOCKABLE_PCT
    : ratePercent(input.dutyRestockablePct, "Duty restockable percent");
  const refundFeeLeftover = emptyField(input.dutyRefundFeeLeftover)
    ? DEFAULT_DUTY_REFUND_FEE_LEFTOVER
    : number(input.dutyRefundFeeLeftover, "Refund fee leftover");
  const monthlyVisitors = emptyField(input.monthlyIntlVisitors)
    ? DEFAULT_MONTHLY_INTL_VISITORS
    : number(input.monthlyIntlVisitors, "Monthly international visitors");

  const price = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const shippingCost = number(input.shippingCost, "Shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");

  const soldOrder = calculateOrder(input);
  const allocatedPlan = soldOrder.allocatedPlanCost;
  const ticket = price + shippingCharged;
  const dutyAmount = ticket * (dutyRatePct / 100);
  const dapFees = cardFeesOnAmount(ticket, input);
  const ddpFees = cardFeesOnAmount(ticket + dutyAmount, input);
  const feeOnDuty = Math.max(0, ddpFees - dapFees);
  const fulfillment = costOfGoods + shippingCost + packagingCost + otherCost;
  const unrestocked = costOfGoods * (1 - restockablePct / 100);
  const refusedCost = shippingCost + returnLabel + packagingCost + unrestocked
    + otherCost + allocatedPlan + refundFeeLeftover;
  const refusedProfit = -refusedCost;
  const dapDeliveredProfit = ticket - dapFees - fulfillment - allocatedPlan;
  const ddpDeliveredProfit = ticket + dutyAmount - ddpFees - fulfillment
    - allocatedPlan - dutyAmount;

  const skipMix = marketsPathExpected({
    takePct: 0,
    refusePct: 0,
    deliveredProfit: 0,
    refusedProfit: 0,
  });
  const dapMix = marketsPathExpected({
    takePct: dapTakePct,
    refusePct: dapRefusePct,
    deliveredProfit: dapDeliveredProfit,
    refusedProfit,
  });
  const ddpMix = marketsPathExpected({
    takePct: ddpTakePct,
    refusePct: ddpRefusePct,
    deliveredProfit: ddpDeliveredProfit,
    refusedProfit,
  });

  const skip = {
    id: "skip",
    label: "Don't sell internationally",
    takePct: 0,
    refusePct: 0,
    charged: 0,
    duty: 0,
    fees: 0,
    deliveredProfit: 0,
    refusedProfit: 0,
    expected: 0,
  };
  const dap = {
    id: "dap",
    label: "DAP — duties at the door",
    takePct: dapTakePct,
    refusePct: dapRefusePct,
    charged: ticket,
    duty: dutyAmount,
    fees: dapFees,
    deliveredProfit: dapDeliveredProfit,
    refusedProfit,
    expected: dapMix.expected,
    perPlaced: dapMix.perPlaced,
  };
  const ddp = {
    id: "ddp",
    label: "DDP — collect duties at checkout",
    takePct: ddpTakePct,
    refusePct: ddpRefusePct,
    charged: ticket + dutyAmount,
    duty: dutyAmount,
    fees: ddpFees,
    deliveredProfit: ddpDeliveredProfit,
    refusedProfit,
    expected: ddpMix.expected,
    perPlaced: ddpMix.perPlaced,
  };

  const extraOnDapVsDdp = dap.expected - ddp.expected;
  const extraOnDapVsSkip = dap.expected;
  const extraOnDdpVsSkip = ddp.expected;
  const monthlyExtraOnDapVsDdp = extraOnDapVsDdp * monthlyVisitors;
  const monthlyExtraOnDapVsSkip = extraOnDapVsSkip * monthlyVisitors;
  const monthlyExtraOnDdpVsSkip = extraOnDdpVsSkip * monthlyVisitors;

  const rows = [skip, dap, ddp].map((row) => ({
    ...row,
    vsSkip: row.expected,
    vsDap: row.expected - dap.expected,
  }));

  const expectedValues = [skip.expected, dap.expected, ddp.expected];
  const bestExpected = Math.max(...expectedValues);
  const winners = [
    skip.expected,
    dap.expected,
    ddp.expected,
  ].map((value, index) => ({ value, id: ["skip", "dap", "ddp"][index] }))
    .filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = winners.length === 1 ? winners[0].id : "tie";

  const dapGap = dapDeliveredProfit - refusedProfit;
  let breakEvenDapRefusePct = Infinity;
  if (dapTakePct > 1e-12 && dapGap > 1e-12) {
    const neededPerPlaced = ddp.expected / (dapTakePct / 100);
    const rate = (dapDeliveredProfit - neededPerPlaced) / dapGap * 100;
    breakEvenDapRefusePct = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  let breakEvenDdpTakePct = Infinity;
  if (Math.abs(ddpMix.perPlaced) > 1e-12) {
    const needed = dap.expected / ddpMix.perPlaced * 100;
    breakEvenDdpTakePct = needed < -1e-9 || needed > 100 + 1e-9
      ? Infinity
      : Math.max(0, needed);
  }

  return {
    rows,
    skip: rows[0],
    dap: rows[1],
    ddp: rows[2],
    ticket,
    dutyRatePct,
    dutyAmount,
    feeOnDuty,
    dapFees,
    ddpFees,
    fulfillment,
    allocatedPlan,
    unrestocked,
    refusedCost,
    dapTakePct,
    ddpTakePct,
    dapRefusePct,
    ddpRefusePct,
    returnLabel,
    restockablePct,
    refundFeeLeftover,
    monthlyVisitors,
    extraOnDapVsDdp,
    extraOnDapVsSkip,
    extraOnDdpVsSkip,
    monthlyExtraOnDapVsDdp,
    monthlyExtraOnDapVsSkip,
    monthlyExtraOnDdpVsSkip,
    breakEvenDapRefusePct,
    breakEvenDdpTakePct,
    winner,
    summary: marketsDutiesSummary({
      dutyAmount,
      feeOnDuty,
      dap,
      ddp,
      extraOnDapVsDdp,
      monthlyExtraOnDapVsDdp,
      breakEvenDapRefusePct,
      breakEvenDdpTakePct,
    }),
  };
}

/**
 * Illustrative abandoned-checkout recovery defaults. Recover rates and
 * the allocated email cost are inputs — not Shopify Email, Shopify
 * Inbox, or Klaviyo policy. 6% / 12% / 18% is a clothing-adjacent
 * mix a merchant overwrites from their own abandoned-checkout report.
 */
export const DEFAULT_ORGANIC_RECOVER_PCT = 6;
export const DEFAULT_EMAIL_RECOVER_PCT = 12;
export const DEFAULT_DISCOUNT_RECOVER_PCT = 18;
export const DEFAULT_RECOVERY_DISCOUNT_PCT = 10;
export const DEFAULT_EMAIL_COST_PER_ABANDONED = 0.08;
export const DEFAULT_MONTHLY_ABANDONED = 80;

function abandonedPath({ id, label, recoverPct, completedProfit, emailCost }) {
  return {
    id,
    label,
    recoverPct,
    completedProfit,
    emailCost,
    expected: completedProfit * (recoverPct / 100) - emailCost,
  };
}

function abandonedCheckoutSummary({
  leave,
  email,
  discount,
  extraOnEmailVsLeave,
  extraOnDiscountVsEmail,
  monthlyExtraOnDiscountVsLeave,
  breakEvenEmailRecoverPct,
  breakEvenDiscountRecoverPct,
  breakEvenEmailCostVsLeave,
  discountPct,
  emailCost,
}) {
  const leaveLine = `Leaving the checkout, with a ${leave.recoverPct}% organic bounce-back, expects ${moneyLabel(leave.expected)}.`;
  const emailGap = moneyLabel(Math.abs(extraOnEmailVsLeave));
  const emailAhead = extraOnEmailVsLeave >= 0 ? "more" : "less";
  const emailLine = ` Recovery emails at a ${email.recoverPct}% recover rate and ${moneyLabel(emailCost)} allocated cost expect ${moneyLabel(email.expected)} — ${emailGap} ${emailAhead}.`;
  const discountGap = moneyLabel(Math.abs(extraOnDiscountVsEmail));
  const discountAhead = extraOnDiscountVsEmail >= 0 ? "more" : "less";
  const discountLine = ` Emails plus a ${discountPct}% item coupon at a ${discount.recoverPct}% recover rate expect ${moneyLabel(discount.expected)} — ${discountGap} ${discountAhead} than emails alone. A recovered discounted order keeps ${moneyLabel(discount.completedProfit)} versus ${moneyLabel(leave.completedProfit)} at the list.`;
  const emailFloor = Number.isFinite(breakEvenEmailRecoverPct)
    ? ` Emails have to recover about ${breakEvenEmailRecoverPct.toFixed(1)}% before they match leaving it.`
    : " No email recover rate on this leftover can match leaving it.";
  const discountFloor = Number.isFinite(breakEvenDiscountRecoverPct)
    ? ` The coupon has to recover about ${breakEvenDiscountRecoverPct.toFixed(1)}% before it matches emails alone.`
    : " No coupon recover rate on this leftover can match emails alone.";
  const costFloor = Number.isFinite(breakEvenEmailCostVsLeave)
    ? ` Email cost can rise to about ${moneyLabel(breakEvenEmailCostVsLeave)} before emails match leaving it.`
    : "";
  const month = Math.abs(monthlyExtraOnDiscountVsLeave) > 1e-9
    ? ` Across the typed month the coupon path keeps ${moneyLabel(Math.abs(monthlyExtraOnDiscountVsLeave))} ${monthlyExtraOnDiscountVsLeave >= 0 ? "more" : "less"} than leaving it.`
    : "";
  return `${leaveLine}${emailLine}${discountLine}${emailFloor}${discountFloor}${costFloor}${month}`;
}

// Solve rate/100 * profitAtFullRate - fixedCost = target for a recover rate
// in [0, 100]. profitAtFullRate is the completed-order profit the rate
// scales, and it can be negative -- a path can lose money on every
// recovered checkout, not just cost more, and the straight ratio still
// finds the real crossing whatever its sign. Gating the division on
// profitAtFullRate > 0 (as this used to) silently reports "no rate can
// match" whenever the order itself is already a loss, even when the
// target is also negative and a real, positive rate ties the two together
// (e.g. a -$0.89 completed order needing a -$0.18 leftover ties at 14.4%
// recovery, not "unreachable").
function breakEvenRecoverRate(target, fixedCost, profitAtFullRate) {
  if (Math.abs(profitAtFullRate) <= 1e-12) {
    return Math.abs(target + fixedCost) <= 1e-12 ? 0 : Infinity;
  }
  const rate = ((target + fixedCost) / profitAtFullRate) * 100;
  if (rate < -1e-9 || rate > 100 + 1e-9) return Infinity;
  return Math.max(0, rate);
}

/**
 * Same already-abandoned checkout, three ways leftover can still land.
 *
 *   - Leave it — typed organic bounce-back, no email cost.
 *   - Recovery emails — typed recover rate minus allocated send cost.
 *   - Emails + item coupon — higher recover rate on a cheaper ticket
 *     (the percent sits on the item; shipping charged stays).
 *
 * Complementary to checkout promos (they already completed), Shop Pay
 * Installments (they already paid), and Markets duties (they already
 * placed an international order). Rates and the email cost are inputs,
 * not Shopify Email / Inbox policy.
 */
export function compareAbandonedCheckout(input) {
  const organicRecoverPct = emptyField(input.organicRecoverPct)
    ? DEFAULT_ORGANIC_RECOVER_PCT
    : ratePercent(input.organicRecoverPct, "Organic recover percent");
  const emailRecoverPct = emptyField(input.emailRecoverPct)
    ? DEFAULT_EMAIL_RECOVER_PCT
    : ratePercent(input.emailRecoverPct, "Email recover percent");
  const discountRecoverPct = emptyField(input.discountRecoverPct)
    ? DEFAULT_DISCOUNT_RECOVER_PCT
    : ratePercent(input.discountRecoverPct, "Discount recover percent");
  const discountPct = emptyField(input.recoveryDiscountPct)
    ? DEFAULT_RECOVERY_DISCOUNT_PCT
    : ratePercent(input.recoveryDiscountPct, "Recovery discount percent");
  const emailCost = emptyField(input.emailCostPerAbandoned)
    ? DEFAULT_EMAIL_COST_PER_ABANDONED
    : number(input.emailCostPerAbandoned, "Email cost per abandoned checkout");
  const monthlyAbandoned = emptyField(input.monthlyAbandonedCheckouts)
    ? DEFAULT_MONTHLY_ABANDONED
    : number(input.monthlyAbandonedCheckouts, "Monthly abandoned checkouts");
  if (monthlyAbandoned === 0) {
    throw new Error("Monthly abandoned checkouts must be greater than zero");
  }

  const listedPrice = number(input.price, "Item price");
  const discountedPrice = listedPrice * (1 - discountPct / 100);
  const fullOrder = calculateOrder(input);
  const discountOrder = calculateOrder({ ...input, price: discountedPrice });
  const fullProfit = fullOrder.selected.profit;
  const discountProfit = discountOrder.selected.profit;

  const leave = abandonedPath({
    id: "leave",
    label: "Leave the checkout",
    recoverPct: organicRecoverPct,
    completedProfit: fullProfit,
    emailCost: 0,
  });
  const email = abandonedPath({
    id: "email",
    label: "Recovery emails",
    recoverPct: emailRecoverPct,
    completedProfit: fullProfit,
    emailCost,
  });
  const discount = abandonedPath({
    id: "discount",
    label: "Emails + item coupon",
    recoverPct: discountRecoverPct,
    completedProfit: discountProfit,
    emailCost,
  });

  const extraOnEmailVsLeave = email.expected - leave.expected;
  const extraOnDiscountVsEmail = discount.expected - email.expected;
  const extraOnDiscountVsLeave = discount.expected - leave.expected;
  const monthlyExtraOnEmailVsLeave = extraOnEmailVsLeave * monthlyAbandoned;
  const monthlyExtraOnDiscountVsEmail = extraOnDiscountVsEmail * monthlyAbandoned;
  const monthlyExtraOnDiscountVsLeave = extraOnDiscountVsLeave * monthlyAbandoned;

  const rows = [leave, email, discount].map((row) => ({
    ...row,
    vsLeave: row.expected - leave.expected,
  }));

  const expectedValues = [leave.expected, email.expected, discount.expected];
  const bestExpected = Math.max(...expectedValues);
  const winnerIds = [
    { id: "leave", value: leave.expected },
    { id: "email", value: email.expected },
    { id: "discount", value: discount.expected },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = winnerIds.length === 1 ? winnerIds[0].id : "tie";

  const breakEvenEmailRecoverPct = breakEvenRecoverRate(leave.expected, emailCost, fullProfit);
  const breakEvenDiscountRecoverPct = breakEvenRecoverRate(email.expected, emailCost, discountProfit);

  let breakEvenEmailCostVsLeave = Infinity;
  const recoverLift = (emailRecoverPct - organicRecoverPct) / 100;
  if (recoverLift > 1e-12) {
    const needed = recoverLift * fullProfit;
    breakEvenEmailCostVsLeave = needed < -1e-9 ? Infinity : needed;
  }

  return {
    rows,
    leave: rows[0],
    email: rows[1],
    discount: rows[2],
    ticket: fullOrder.revenue,
    discountedTicket: discountOrder.revenue,
    discountPct,
    discountedPrice,
    emailCost,
    monthlyAbandoned,
    organicRecoverPct,
    emailRecoverPct,
    discountRecoverPct,
    extraOnEmailVsLeave,
    extraOnDiscountVsEmail,
    extraOnDiscountVsLeave,
    monthlyExtraOnEmailVsLeave,
    monthlyExtraOnDiscountVsEmail,
    monthlyExtraOnDiscountVsLeave,
    breakEvenEmailRecoverPct,
    breakEvenDiscountRecoverPct,
    breakEvenEmailCostVsLeave,
    winner,
    summary: abandonedCheckoutSummary({
      leave: rows[0],
      email: rows[1],
      discount: rows[2],
      extraOnEmailVsLeave,
      extraOnDiscountVsEmail,
      monthlyExtraOnDiscountVsLeave,
      breakEvenEmailRecoverPct,
      breakEvenDiscountRecoverPct,
      breakEvenEmailCostVsLeave,
      discountPct,
      emailCost,
    }),
  };
}

/**
 * Illustrative Shopify subscription defaults. The subscribe-and-save
 * percent, prepaid percent, app / billing fee, stay length, and skip
 * rate are inputs — not Recharge, Skio, or Shopify Selling Plan
 * policy. 10% / 15% / 1% / 5 months / 20% skip is a consumable-adjacent
 * mix a merchant overwrites from their own subscription report.
 */
export const DEFAULT_SUBSCRIBE_DISCOUNT_PCT = 10;
export const DEFAULT_PREPAID_DISCOUNT_PCT = 15;
export const DEFAULT_PREPAID_MONTHS = 3;
export const DEFAULT_SUBSCRIPTION_FEE_PCT = 1;
export const DEFAULT_EXPECTED_CYCLES = 5;
export const DEFAULT_SKIP_PCT = 20;
export const DEFAULT_SUBSCRIBE_ENROLL_PCT = 25;
export const DEFAULT_MONTHLY_SUB_BUYERS = 80;

function subscriptionPath({ id, label, units, cycleProfit, lifetime, appFee }) {
  return {
    id,
    label,
    units,
    cycleProfit,
    lifetime,
    appFee,
  };
}

function subscriptionsSummary({
  oneTime,
  monthly,
  prepaid,
  extraOnMonthlyVsOneTime,
  extraOnPrepaidVsMonthly,
  monthlyExtraOnEnrollVsOneTime,
  breakEvenPaidCycles,
  breakEvenSkipPct,
  breakEvenAppFeePct,
  subscribeDiscountPct,
  prepaidDiscountPct,
  prepaidMonths,
  subscriptionFeePct,
  paidCycles,
}) {
  const oneLine = `A one-time checkout keeps ${moneyLabel(oneTime.lifetime)}.`;
  const monthlyGap = moneyLabel(Math.abs(extraOnMonthlyVsOneTime));
  const monthlyAhead = extraOnMonthlyVsOneTime >= 0 ? "more" : "less";
  const monthlyLine = ` Monthly subscribe at ${subscribeDiscountPct}% off plus a ${subscriptionFeePct}% billing fee keeps ${moneyLabel(monthly.cycleProfit)} a paid cycle — ${moneyLabel(monthly.lifetime)} across ${paidCycles.toFixed(1)} paid cycles (${monthlyGap} ${monthlyAhead}).`;
  const prepaidGap = moneyLabel(Math.abs(extraOnPrepaidVsMonthly));
  const prepaidAhead = extraOnPrepaidVsMonthly >= 0 ? "more" : "less";
  const prepaidLine = ` A prepaid ${prepaidMonths}-month pack at ${prepaidDiscountPct}% off keeps ${moneyLabel(prepaid.lifetime)} — ${prepaidGap} ${prepaidAhead} than monthly.`;
  const cycleFloor = Number.isFinite(breakEvenPaidCycles)
    ? ` Monthly has to land about ${breakEvenPaidCycles.toFixed(1)} paid cycles before it matches one-time.`
    : " No stay length on this leftover can match one-time.";
  const skipCeil = Number.isFinite(breakEvenSkipPct)
    ? ` Skip can rise to about ${breakEvenSkipPct.toFixed(1)}% before monthly matches one-time.`
    : "";
  const feeCeil = Number.isFinite(breakEvenAppFeePct)
    ? ` The billing fee can rise to about ${breakEvenAppFeePct.toFixed(1)}% before monthly matches one-time.`
    : "";
  const month = Math.abs(monthlyExtraOnEnrollVsOneTime) > 1e-9
    ? ` Across the typed month the enroll mix keeps ${moneyLabel(Math.abs(monthlyExtraOnEnrollVsOneTime))} ${monthlyExtraOnEnrollVsOneTime >= 0 ? "more" : "less"} than selling every buyer one-time.`
    : "";
  return `${oneLine}${monthlyLine}${prepaidLine}${cycleFloor}${skipCeil}${feeCeil}${month}`;
}

/**
 * Same SKU, three ways leftover can land when a merchant turns on
 * subscriptions.
 *
 *   - One-time — leftover of one completed checkout.
 *   - Monthly subscribe — typed percent off plus a billing / app fee
 *     on each paid cycle, times stay length after skip.
 *   - Prepaid pack — deeper percent off, one swipe for N units, one
 *     plan allocation, N fulfillments.
 *
 * Complementary to Shop Pay Installments (those are one checkout),
 * abandoned-checkout recovery (they already left), and gift cards
 * (stored value, not a recurring SKU). Rates and the billing fee are
 * inputs, not Recharge / Skio / Shopify Selling Plan policy.
 */
export function compareSubscriptions(input) {
  const subscribeDiscountPct = emptyField(input.subscribeDiscountPct)
    ? DEFAULT_SUBSCRIBE_DISCOUNT_PCT
    : ratePercent(input.subscribeDiscountPct, "Subscribe discount percent");
  const prepaidDiscountPct = emptyField(input.prepaidDiscountPct)
    ? DEFAULT_PREPAID_DISCOUNT_PCT
    : ratePercent(input.prepaidDiscountPct, "Prepaid discount percent");
  const prepaidMonths = emptyField(input.prepaidMonths)
    ? DEFAULT_PREPAID_MONTHS
    : number(input.prepaidMonths, "Prepaid months");
  const subscriptionFeePct = emptyField(input.subscriptionFeePct)
    ? DEFAULT_SUBSCRIPTION_FEE_PCT
    : ratePercent(input.subscriptionFeePct, "Subscription fee percent");
  const expectedCycles = emptyField(input.expectedCycles)
    ? DEFAULT_EXPECTED_CYCLES
    : number(input.expectedCycles, "Expected cycles");
  const skipPct = emptyField(input.skipPct)
    ? DEFAULT_SKIP_PCT
    : ratePercent(input.skipPct, "Skip percent");
  const enrollPct = emptyField(input.subscribeEnrollPct)
    ? DEFAULT_SUBSCRIBE_ENROLL_PCT
    : ratePercent(input.subscribeEnrollPct, "Subscribe enroll percent");
  const monthlyBuyers = emptyField(input.monthlySubscriptionBuyers)
    ? DEFAULT_MONTHLY_SUB_BUYERS
    : number(input.monthlySubscriptionBuyers, "Monthly buyers");
  if (prepaidMonths < 1) {
    throw new Error("Prepaid months must be at least 1");
  }
  if (expectedCycles === 0) {
    throw new Error("Expected cycles must be greater than zero");
  }
  if (monthlyBuyers === 0) {
    throw new Error("Monthly buyers must be greater than zero");
  }

  const listedPrice = number(input.price, "Item price");
  const shippingCharged = number(input.shippingCharged, "Shipping charged");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const shippingCost = number(input.shippingCost, "Shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");

  const oneTimeOrder = calculateOrder(input);
  const oneTimeProfit = oneTimeOrder.selected.profit;
  const paidCycles = expectedCycles * (1 - skipPct / 100);

  const monthlyPrice = listedPrice * (1 - subscribeDiscountPct / 100);
  const monthlyOrder = calculateOrder({ ...input, price: monthlyPrice });
  const monthlyTicket = monthlyOrder.revenue;
  const monthlyAppFee = monthlyTicket * (subscriptionFeePct / 100);
  const monthlyCycleProfit = monthlyOrder.selected.profit - monthlyAppFee;
  const monthlyLifetime = monthlyCycleProfit * paidCycles;

  const prepaidPrice = listedPrice * (1 - prepaidDiscountPct / 100);
  const prepaidOrder = calculateOrder({
    ...input,
    price: prepaidPrice * prepaidMonths,
    shippingCharged: shippingCharged * prepaidMonths,
    costOfGoods: costOfGoods * prepaidMonths,
    shippingCost: shippingCost * prepaidMonths,
    packagingCost: packagingCost * prepaidMonths,
    otherCost: otherCost * prepaidMonths,
  });
  const prepaidTicket = prepaidOrder.revenue;
  const prepaidAppFee = prepaidTicket * (subscriptionFeePct / 100);
  const prepaidProfit = prepaidOrder.selected.profit - prepaidAppFee;

  const oneTime = subscriptionPath({
    id: "one_time",
    label: "One-time checkout",
    units: 1,
    cycleProfit: oneTimeProfit,
    lifetime: oneTimeProfit,
    appFee: 0,
  });
  const monthly = subscriptionPath({
    id: "monthly",
    label: "Monthly subscribe",
    units: paidCycles,
    cycleProfit: monthlyCycleProfit,
    lifetime: monthlyLifetime,
    appFee: monthlyAppFee,
  });
  const prepaid = subscriptionPath({
    id: "prepaid",
    label: `Prepaid ${prepaidMonths}-month pack`,
    units: prepaidMonths,
    cycleProfit: prepaidProfit / prepaidMonths,
    lifetime: prepaidProfit,
    appFee: prepaidAppFee,
  });

  const extraOnMonthlyVsOneTime = monthly.lifetime - oneTime.lifetime;
  const extraOnPrepaidVsMonthly = prepaid.lifetime - monthly.lifetime;
  const extraOnPrepaidVsOneTime = prepaid.lifetime - oneTime.lifetime;
  const mixedLifetime = oneTime.lifetime * (1 - enrollPct / 100)
    + monthly.lifetime * (enrollPct / 100);
  const extraOnEnrollVsOneTime = mixedLifetime - oneTime.lifetime;
  const monthlyExtraOnEnrollVsOneTime = extraOnEnrollVsOneTime * monthlyBuyers;
  const monthlyExtraOnMonthlyVsOneTime = extraOnMonthlyVsOneTime * monthlyBuyers;

  const rows = [oneTime, monthly, prepaid].map((row) => ({
    ...row,
    vsOneTime: row.lifetime - oneTime.lifetime,
  }));

  const lifetimeValues = [oneTime.lifetime, monthly.lifetime, prepaid.lifetime];
  const bestLifetime = Math.max(...lifetimeValues);
  const winnerIds = [
    { id: "one_time", value: oneTime.lifetime },
    { id: "monthly", value: monthly.lifetime },
    { id: "prepaid", value: prepaid.lifetime },
  ].filter((row) => Math.abs(row.value - bestLifetime) <= 1e-9);
  const winner = winnerIds.length === 1 ? winnerIds[0].id : "tie";

  // monthlyCycleProfit can be negative -- a subscription can lose money on
  // every paid cycle, not just cost more, and the ratio still finds the
  // real crossing cycle count whatever its sign (a losing one-time order
  // and a losing subscription still tie at a positive cycle count). Gating
  // on monthlyCycleProfit > 0 (as this used to) silently reported
  // "no stay length can match" whenever the subscription itself lost money,
  // even when the one-time path was also a loss and a real crossing existed.
  let breakEvenPaidCycles = Infinity;
  if (Math.abs(monthlyCycleProfit) > 1e-12) {
    const needed = oneTimeProfit / monthlyCycleProfit;
    breakEvenPaidCycles = needed < -1e-9 ? Infinity : needed;
  }

  let breakEvenSkipPct = Infinity;
  if (Math.abs(monthlyCycleProfit) > 1e-12 && expectedCycles > 1e-12) {
    const paidNeeded = oneTimeProfit / monthlyCycleProfit;
    const rate = (1 - paidNeeded / expectedCycles) * 100;
    breakEvenSkipPct = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  let breakEvenAppFeePct = Infinity;
  if (paidCycles > 1e-12 && monthlyTicket > 1e-12) {
    const neededCycle = oneTimeProfit / paidCycles;
    const maxAppFee = monthlyTicket - monthlyOrder.selected.feeTotal
      - monthlyOrder.selected.cashInvested - neededCycle;
    const rate = maxAppFee / monthlyTicket * 100;
    breakEvenAppFeePct = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  return {
    rows,
    oneTime: rows[0],
    monthly: rows[1],
    prepaid: rows[2],
    ticket: oneTimeOrder.revenue,
    monthlyTicket,
    prepaidTicket,
    monthlyPrice,
    prepaidPrice,
    subscribeDiscountPct,
    prepaidDiscountPct,
    prepaidMonths,
    subscriptionFeePct,
    expectedCycles,
    skipPct,
    paidCycles,
    enrollPct,
    monthlyBuyers,
    monthlyAppFee,
    prepaidAppFee,
    extraOnMonthlyVsOneTime,
    extraOnPrepaidVsMonthly,
    extraOnPrepaidVsOneTime,
    mixedLifetime,
    extraOnEnrollVsOneTime,
    monthlyExtraOnEnrollVsOneTime,
    monthlyExtraOnMonthlyVsOneTime,
    breakEvenPaidCycles,
    breakEvenSkipPct,
    breakEvenAppFeePct,
    winner,
    summary: subscriptionsSummary({
      oneTime: rows[0],
      monthly: rows[1],
      prepaid: rows[2],
      extraOnMonthlyVsOneTime,
      extraOnPrepaidVsMonthly,
      monthlyExtraOnEnrollVsOneTime,
      breakEvenPaidCycles,
      breakEvenSkipPct,
      breakEvenAppFeePct,
      subscribeDiscountPct,
      prepaidDiscountPct,
      prepaidMonths,
      subscriptionFeePct,
      paidCycles,
    }),
  };
}

/**
 * Illustrative Shopify pickup defaults. Minutes, wage, bag cost, pickup
 * fee, and no-show rate are inputs — not Shopify Local Pickup policy
 * or a published labor schedule. 8 minutes at $18 / $0.40 bag / $3
 * paid pickup / 12% no-show is a retail-adjacent mix a merchant
 * overwrites from their own hold and refund report.
 */
export const DEFAULT_PICKUP_FEE = 3;
export const DEFAULT_PICKUP_MINUTES = 8;
export const DEFAULT_PICKUP_HOURLY_RATE = 18;
export const DEFAULT_PICKUP_PACKAGING = 0.4;
export const DEFAULT_PICKUP_NO_SHOW_PCT = 12;
export const DEFAULT_MONTHLY_PICKUP_ORDERS = 40;

export function pickupStaffCost({ minutes, hourlyRate }) {
  return (number(minutes, "Pickup minutes") / 60) * number(hourlyRate, "Pickup hourly rate");
}

function pickupPath({
  id,
  label,
  charged,
  fulfillmentCost,
  fees,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    charged,
    fulfillmentCost,
    fees,
    completedProfit,
    expectedProfit,
  };
}

function pickupExpected(completedProfit, noShowPct, noShowResult) {
  const showFrac = 1 - noShowPct / 100;
  return showFrac * completedProfit + (1 - showFrac) * noShowResult;
}

function pickupSummary({
  winner,
  ship,
  free,
  paid,
  extraKeptOnFree,
  extraKeptOnPaid,
  timeCost,
  pickupPack,
  noShowPct,
  breakEvenNoShowPct,
  breakEvenMinutes,
  breakEvenShippingCost,
  monthlyExtraOnFree,
}) {
  const shipLine = `The carrier label keeps ${moneyLabel(ship.expectedProfit)}.`;
  const freeGap = moneyLabel(Math.abs(extraKeptOnFree));
  const freeAhead = extraKeptOnFree >= 0 ? "more" : "less";
  const freeLine = ` Free pickup after a ${noShowPct}% no-show keeps ${moneyLabel(free.expectedProfit)} — ${freeGap} ${freeAhead} (${moneyLabel(free.completedProfit)} if they show).`;
  const paidGap = moneyLabel(Math.abs(extraKeptOnPaid));
  const paidAhead = extraKeptOnPaid >= 0 ? "more" : "less";
  const paidLine = ` A paid pickup keeps ${moneyLabel(paid.expectedProfit)} — ${paidGap} ${paidAhead} than the label.`;
  const labor = ` Staff time and the bag are ${moneyLabel(timeCost + pickupPack)}.`;
  const noShowCeil = Number.isFinite(breakEvenNoShowPct)
    ? ` No-show can rise to about ${breakEvenNoShowPct.toFixed(1)}% before free pickup matches the label.`
    : " Even a 0% no-show on these rates cannot match the label.";
  const minuteCeil = Number.isFinite(breakEvenMinutes)
    ? ` Pickup can take about ${breakEvenMinutes.toFixed(1)} minutes before it matches the label.`
    : "";
  const labelFloor = Number.isFinite(breakEvenShippingCost)
    ? ` The outbound label has to cost about ${moneyLabel(breakEvenShippingCost)} before shipping matches free pickup.`
    : "";
  const month = monthlyExtraOnFree === 0
    ? ""
    : extraKeptOnFree >= 0
      ? ` Across the typed month that is ${moneyLabel(monthlyExtraOnFree)} more.`
      : ` Across the typed month that gap is ${moneyLabel(Math.abs(monthlyExtraOnFree))}.`;
  const winnerLine = winner === "tie"
    ? " The label and pickup keep the same leftover on these rates."
    : winner === "ship"
      ? " The label keeps more on these rates."
      : winner === "free"
        ? " Free pickup keeps more on these rates."
        : " Paid pickup keeps more on these rates.";
  return `${shipLine}${freeLine}${paidLine}${labor}${winnerLine}${noShowCeil}${minuteCeil}${labelFloor}${month}`;
}

/**
 * Same prepaid Shopify checkout, three ways it leaves the shop.
 *
 *   - Carrier / Shopify label — leftover of the typed shipped order.
 *   - Free pickup — $0 postage charged, no label, staff pick / hand-off
 *     time plus a lighter bag, then expected leftover after a typed
 *     no-show refund (fees reversed, inventory restocked, labor and
 *     bag stay spent).
 *   - Paid pickup — typed pickup fee instead of postage, same staff
 *     time and no-show mix.
 *
 * Complementary to local delivery (you drive) and to POS vs online
 * (a counter tap, not an online BOPIS checkout). Minutes, wage, bag,
 * fee, and no-show are inputs — not Shopify Local Pickup policy.
 */
export function comparePickup(input) {
  const pickupFee = emptyField(input.pickupFee)
    ? DEFAULT_PICKUP_FEE
    : number(input.pickupFee, "Pickup fee");
  const minutes = emptyField(input.pickupMinutes)
    ? DEFAULT_PICKUP_MINUTES
    : number(input.pickupMinutes, "Pickup minutes");
  const hourlyRate = emptyField(input.pickupHourlyRate)
    ? DEFAULT_PICKUP_HOURLY_RATE
    : number(input.pickupHourlyRate, "Pickup hourly rate");
  const pickupPack = emptyField(input.pickupPackagingCost)
    ? DEFAULT_PICKUP_PACKAGING
    : number(input.pickupPackagingCost, "Pickup packaging");
  const noShowPct = emptyField(input.pickupNoShowPct)
    ? DEFAULT_PICKUP_NO_SHOW_PCT
    : ratePercent(input.pickupNoShowPct, "Pickup no-show percent");
  const monthlyPickupOrders = emptyField(input.monthlyPickupOrders)
    ? DEFAULT_MONTHLY_PICKUP_ORDERS
    : number(input.monthlyPickupOrders, "Monthly pickup orders");
  if (monthlyPickupOrders === 0) {
    throw new Error("Monthly pickup orders must be greater than zero");
  }

  const timeCost = pickupStaffCost({ minutes, hourlyRate });
  const pickupFulfillment = timeCost + pickupPack;
  const noShowResult = -pickupFulfillment;

  const shipOrder = calculateOrder(input);
  const freeOrder = calculateOrder({
    ...input,
    shippingCharged: 0,
    shippingCost: timeCost,
    packagingCost: pickupPack,
  });
  const paidOrder = calculateOrder({
    ...input,
    shippingCharged: pickupFee,
    shippingCost: timeCost,
    packagingCost: pickupPack,
  });

  const shipCompleted = shipOrder.selected.profit;
  const freeCompleted = freeOrder.selected.profit;
  const paidCompleted = paidOrder.selected.profit;
  const shipExpected = shipCompleted;
  const freeExpected = pickupExpected(freeCompleted, noShowPct, noShowResult);
  const paidExpected = pickupExpected(paidCompleted, noShowPct, noShowResult);

  const ship = pickupPath({
    id: "ship",
    label: "Carrier / Shopify label",
    charged: number(input.shippingCharged, "Shipping charged"),
    fulfillmentCost: number(input.shippingCost, "Shipping cost")
      + number(input.packagingCost, "Packaging cost"),
    fees: shipOrder.selected.feeTotal,
    completedProfit: shipCompleted,
    expectedProfit: shipExpected,
  });
  const free = pickupPath({
    id: "free",
    label: "Free pickup",
    charged: 0,
    fulfillmentCost: pickupFulfillment,
    fees: freeOrder.selected.feeTotal,
    completedProfit: freeCompleted,
    expectedProfit: freeExpected,
  });
  const paid = pickupPath({
    id: "paid",
    label: "Paid pickup",
    charged: pickupFee,
    fulfillmentCost: pickupFulfillment,
    fees: paidOrder.selected.feeTotal,
    completedProfit: paidCompleted,
    expectedProfit: paidExpected,
  });

  const extraKeptOnFree = freeExpected - shipExpected;
  const extraKeptOnPaid = paidExpected - shipExpected;
  const extraKeptOnPaidVsFree = paidExpected - freeExpected;
  const monthlyExtraOnFree = extraKeptOnFree * monthlyPickupOrders;
  const monthlyExtraOnPaid = extraKeptOnPaid * monthlyPickupOrders;

  const rows = [ship, free, paid].map((row) => ({
    ...row,
    vsShip: row.expectedProfit - shipExpected,
  }));

  const expectedValues = [shipExpected, freeExpected, paidExpected];
  const bestExpected = Math.max(...expectedValues);
  const winnerIds = [
    { id: "ship", value: shipExpected },
    { id: "free", value: freeExpected },
    ...(pickupFee > 1e-12 || Math.abs(paidExpected - freeExpected) > 1e-9
      ? [{ id: "paid", value: paidExpected }]
      : []),
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = winnerIds.length === 1 ? winnerIds[0].id : "tie";

  // freeDenom (and freeCompleted - shipExpected) can each be negative -- a
  // no-show can be the *better* outcome than completing when cost of goods
  // makes a completed free-pickup sale a bigger loss than the labor/bag
  // cost of a no-show, in which case a higher no-show rate is what lifts
  // free pickup up to match shipping, not down. Requiring freeCompleted to
  // already lead at 0% no-show (as this used to) missed that crossing
  // whenever the free path started behind but rose with no-show.
  let breakEvenNoShowPct = Infinity;
  const freeDenom = freeCompleted - noShowResult;
  if (Math.abs(freeDenom) > 1e-12) {
    const needed = (freeCompleted - shipExpected) / freeDenom * 100;
    breakEvenNoShowPct = needed < -1e-9 || needed > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, needed));
  }

  const freeCashWithoutLabor = freeCompleted + timeCost;
  const showFrac = 1 - noShowPct / 100;
  const neededTime = showFrac * freeCashWithoutLabor - noShowPct / 100 * pickupPack - shipExpected;
  let breakEvenMinutes = Infinity;
  if (hourlyRate > 1e-12 && neededTime >= -1e-12) {
    breakEvenMinutes = (neededTime / hourlyRate) * 60;
  }

  const shipAtZeroLabel = calculateOrder({ ...input, shippingCost: 0 }).selected.profit;
  let breakEvenShippingCost = Infinity;
  if (Number.isFinite(shipAtZeroLabel)) {
    breakEvenShippingCost = shipAtZeroLabel - freeExpected;
  }

  return {
    rows,
    ship: rows[0],
    free: rows[1],
    paid: rows[2],
    pickupFee,
    minutes,
    hourlyRate,
    pickupPack,
    timeCost,
    pickupFulfillment,
    noShowPct,
    noShowResult,
    monthlyPickupOrders,
    extraKeptOnFree,
    extraKeptOnPaid,
    extraKeptOnPaidVsFree,
    monthlyExtraOnFree,
    monthlyExtraOnPaid,
    breakEvenNoShowPct,
    breakEvenMinutes,
    breakEvenShippingCost,
    winner,
    summary: pickupSummary({
      winner,
      ship: rows[0],
      free: rows[1],
      paid: rows[2],
      extraKeptOnFree,
      extraKeptOnPaid,
      timeCost,
      pickupPack,
      noShowPct,
      breakEvenNoShowPct,
      breakEvenMinutes,
      breakEvenShippingCost,
      monthlyExtraOnFree,
    }),
  };
}

/**
 * Illustrative Shopify upsell defaults. Add-on price, cost, offer
 * percent, take rates, and checkout-drop are inputs — not Shopify
 * checkout-extensibility or Rebuy / Zipify / AfterSell policy. $18
 * add-on / 10% off / 18% checkout take / 12% one-click take / 2%
 * extra abandon is a consumable-adjacent mix a merchant overwrites
 * from their own offer report.
 */
export const DEFAULT_ADDON_PRICE = 18;
export const DEFAULT_ADDON_COST = 6;
export const DEFAULT_ADDON_DISCOUNT_PCT = 10;
export const DEFAULT_CHECKOUT_TAKE_PCT = 18;
export const DEFAULT_POST_PURCHASE_TAKE_PCT = 12;
export const DEFAULT_CHECKOUT_DROP_PCT = 2;
export const DEFAULT_ADDON_PACKAGING = 0.5;
export const DEFAULT_ADDON_LABEL = 0;
export const DEFAULT_MONTHLY_UPSELL_CHECKOUTS = 80;

function upsellPath({ id, label, takePct, completedProfit, expectedProfit, extraSwipe }) {
  return {
    id,
    label,
    takePct,
    completedProfit,
    expectedProfit,
    extraSwipe,
  };
}

function upsellSummary({
  skip,
  checkout,
  post,
  extraOnCheckout,
  extraOnPost,
  extraOnPostVsCheckout,
  monthlyExtraOnPost,
  breakEvenCheckoutTakePct,
  breakEvenPostTakeVsCheckout,
  breakEvenCheckoutDropPct,
  addOnDiscountPct,
  checkoutDropPct,
  discountedAddOn,
}) {
  const skipLine = `Skipping the offer keeps ${moneyLabel(skip.expectedProfit)}.`;
  const checkoutGap = moneyLabel(Math.abs(extraOnCheckout));
  const checkoutAhead = extraOnCheckout >= 0 ? "more" : "less";
  const checkoutLine = ` A checkout add-on at ${checkout.takePct}% take after a ${checkoutDropPct}% extra abandon keeps ${moneyLabel(checkout.expectedProfit)} — ${checkoutGap} ${checkoutAhead} (${moneyLabel(checkout.completedProfit)} if they add on the first swipe).`;
  const postGap = moneyLabel(Math.abs(extraOnPost));
  const postAhead = extraOnPost >= 0 ? "more" : "less";
  const postLine = ` A post-purchase one-click at ${post.takePct}% take keeps ${moneyLabel(post.expectedProfit)} — ${postGap} ${postAhead} (${moneyLabel(post.completedProfit)} on the second swipe for a ${addOnDiscountPct}% off ${moneyLabel(discountedAddOn)} add-on).`;
  const vsCheckout = extraOnPostVsCheckout === 0
    ? ""
    : extraOnPostVsCheckout > 0
      ? ` One-click keeps ${moneyLabel(extraOnPostVsCheckout)} more than the checkout offer.`
      : ` The checkout offer keeps ${moneyLabel(-extraOnPostVsCheckout)} more than one-click.`;
  const takeFloor = Number.isFinite(breakEvenCheckoutTakePct)
    ? ` Checkout take has to land about ${breakEvenCheckoutTakePct.toFixed(1)}% before it matches skipping.`
    : " No checkout take on this leftover can match skipping.";
  const postFloor = Number.isFinite(breakEvenPostTakeVsCheckout)
    ? ` One-click take has to land about ${breakEvenPostTakeVsCheckout.toFixed(1)}% before it matches the checkout offer.`
    : "";
  const dropCeil = Number.isFinite(breakEvenCheckoutDropPct)
    ? ` Extra checkout abandon can rise to about ${breakEvenCheckoutDropPct.toFixed(1)}% before the checkout offer matches one-click.`
    : "";
  const month = monthlyExtraOnPost === 0
    ? ""
    : extraOnPost >= 0
      ? ` Across the typed month one-click keeps ${moneyLabel(monthlyExtraOnPost)} more than skipping.`
      : ` Across the typed month one-click keeps ${moneyLabel(-monthlyExtraOnPost)} less than skipping.`;
  return `${skipLine}${checkoutLine}${postLine}${vsCheckout}${takeFloor}${postFloor}${dropCeil}${month}`;
}

/**
 * Same prepaid Shopify checkout, three ways leftover can land when
 * a merchant offers an add-on.
 *
 *   - Skip — leftover of the typed completed hero order.
 *   - Checkout add-on — they add before they pay: one swipe, one
 *     $0.30, one plan allocation, same box unless a second label is
 *     typed. A typed extra-abandon rate zeros the whole ticket for
 *     that share (the usual checkout-upsell risk).
 *   - Post-purchase one-click — second swipe after they already paid.
 *     The hero leftover stays; take rate applies only to the add-on
 *     (another $0.30, extra pack, optional extra label, no second
 *     plan share).
 *
 * Complementary to abandoned-checkout recovery (they already left),
 * subscriptions (the same SKU again), and checkout promos (a discount
 * on the item they already wanted). Rates and the drop are inputs,
 * not Shopify checkout-extensibility or an upsell-app schedule.
 */
export function compareUpsell(input) {
  const addOnPrice = emptyField(input.addOnPrice)
    ? DEFAULT_ADDON_PRICE
    : number(input.addOnPrice, "Add-on price");
  const addOnCost = emptyField(input.addOnCost)
    ? DEFAULT_ADDON_COST
    : number(input.addOnCost, "Add-on cost");
  const addOnDiscountPct = emptyField(input.addOnDiscountPct)
    ? DEFAULT_ADDON_DISCOUNT_PCT
    : ratePercent(input.addOnDiscountPct, "Add-on discount percent");
  const checkoutTakePct = emptyField(input.checkoutTakePct)
    ? DEFAULT_CHECKOUT_TAKE_PCT
    : ratePercent(input.checkoutTakePct, "Checkout take percent");
  const postPurchaseTakePct = emptyField(input.postPurchaseTakePct)
    ? DEFAULT_POST_PURCHASE_TAKE_PCT
    : ratePercent(input.postPurchaseTakePct, "Post-purchase take percent");
  const checkoutDropPct = emptyField(input.checkoutDropPct)
    ? DEFAULT_CHECKOUT_DROP_PCT
    : ratePercent(input.checkoutDropPct, "Checkout drop percent");
  const extraPack = emptyField(input.addOnPackagingCost)
    ? DEFAULT_ADDON_PACKAGING
    : number(input.addOnPackagingCost, "Add-on packaging");
  const extraLabel = emptyField(input.addOnShippingCost)
    ? DEFAULT_ADDON_LABEL
    : number(input.addOnShippingCost, "Add-on shipping");
  const monthlyCheckouts = emptyField(input.monthlyUpsellCheckouts)
    ? DEFAULT_MONTHLY_UPSELL_CHECKOUTS
    : number(input.monthlyUpsellCheckouts, "Monthly checkouts");
  if (monthlyCheckouts === 0) {
    throw new Error("Monthly checkouts must be greater than zero");
  }

  const heroPrice = number(input.price, "Item price");
  const heroCost = number(input.costOfGoods, "Cost of goods");
  const heroPack = number(input.packagingCost, "Packaging cost");
  const heroLabel = number(input.shippingCost, "Shipping cost");
  const discountedAddOn = addOnPrice * (1 - addOnDiscountPct / 100);

  const heroOrder = calculateOrder(input);
  const heroProfit = heroOrder.selected.profit;

  const combinedOrder = calculateOrder({
    ...input,
    price: heroPrice + discountedAddOn,
    costOfGoods: heroCost + addOnCost,
    packagingCost: heroPack + extraPack,
    shippingCost: heroLabel + extraLabel,
  });
  const combinedProfit = combinedOrder.selected.profit;

  const addOnOrder = calculateOrder({
    ...input,
    price: discountedAddOn,
    shippingCharged: 0,
    costOfGoods: addOnCost,
    packagingCost: extraPack,
    shippingCost: extraLabel,
    otherCost: 0,
    monthlyPlan: 0,
  });
  const addOnProfit = addOnOrder.selected.profit;

  const completeFrac = 1 - checkoutDropPct / 100;
  const checkoutIfComplete = (checkoutTakePct / 100) * combinedProfit
    + (1 - checkoutTakePct / 100) * heroProfit;
  const checkoutExpected = completeFrac * checkoutIfComplete;
  const postExpected = heroProfit + (postPurchaseTakePct / 100) * addOnProfit;

  const skip = upsellPath({
    id: "skip",
    label: "Skip the offer",
    takePct: 0,
    completedProfit: heroProfit,
    expectedProfit: heroProfit,
    extraSwipe: 0,
  });
  const checkout = upsellPath({
    id: "checkout",
    label: "Checkout add-on",
    takePct: checkoutTakePct,
    completedProfit: combinedProfit,
    expectedProfit: checkoutExpected,
    extraSwipe: 0,
  });
  const post = upsellPath({
    id: "post",
    label: "Post-purchase one-click",
    takePct: postPurchaseTakePct,
    completedProfit: addOnProfit,
    expectedProfit: postExpected,
    extraSwipe: 1,
  });

  const extraOnCheckout = checkoutExpected - heroProfit;
  const extraOnPost = postExpected - heroProfit;
  const extraOnPostVsCheckout = postExpected - checkoutExpected;
  const monthlyExtraOnCheckout = extraOnCheckout * monthlyCheckouts;
  const monthlyExtraOnPost = extraOnPost * monthlyCheckouts;
  const monthlyExtraOnPostVsCheckout = extraOnPostVsCheckout * monthlyCheckouts;

  const rows = [skip, checkout, post].map((row) => ({
    ...row,
    vsSkip: row.expectedProfit - heroProfit,
  }));

  const expectedValues = [heroProfit, checkoutExpected, postExpected];
  const bestExpected = Math.max(...expectedValues);
  const winnerIds = [
    { id: "skip", value: heroProfit },
    { id: "checkout", value: checkoutExpected },
    { id: "post", value: postExpected },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = winnerIds.length === 1 ? winnerIds[0].id : "tie";

  const combinedExtra = combinedProfit - heroProfit;
  let breakEvenCheckoutTakePct = Infinity;
  if (completeFrac > 1e-12 && combinedExtra > 1e-12) {
    const needed = (heroProfit * (checkoutDropPct / 100)) / (completeFrac * combinedExtra) * 100;
    breakEvenCheckoutTakePct = needed < -1e-9 || needed > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, needed));
  } else if (checkoutDropPct <= 1e-12 && combinedExtra > 1e-12) {
    breakEvenCheckoutTakePct = 0;
  }

  // addOnProfit can be negative -- the add-on itself can lose money on
  // every take, not just cost more -- and the ratio still finds the real
  // crossing take rate whatever its sign. Gating on addOnProfit > 0 (as
  // this used to) silently reported "no take rate can match" whenever the
  // add-on was a loss leader, even when a real crossing existed because the
  // checkout path was a bigger loss still.
  let breakEvenPostTakeVsCheckout = Infinity;
  if (Math.abs(addOnProfit) > 1e-12) {
    const needed = (checkoutExpected - heroProfit) / addOnProfit * 100;
    breakEvenPostTakeVsCheckout = needed < -1e-9 || needed > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, needed));
  }

  let breakEvenCheckoutDropPct = Infinity;
  if (checkoutIfComplete > 1e-12) {
    const completeNeeded = postExpected / checkoutIfComplete;
    const rate = (1 - completeNeeded) * 100;
    breakEvenCheckoutDropPct = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  return {
    rows,
    skip: rows[0],
    checkout: rows[1],
    post: rows[2],
    ticket: heroOrder.revenue,
    combinedTicket: combinedOrder.revenue,
    addOnTicket: addOnOrder.revenue,
    addOnPrice,
    addOnCost,
    addOnDiscountPct,
    discountedAddOn,
    checkoutTakePct,
    postPurchaseTakePct,
    checkoutDropPct,
    extraPack,
    extraLabel,
    monthlyCheckouts,
    combinedProfit,
    addOnProfit,
    checkoutIfComplete,
    extraOnCheckout,
    extraOnPost,
    extraOnPostVsCheckout,
    monthlyExtraOnCheckout,
    monthlyExtraOnPost,
    monthlyExtraOnPostVsCheckout,
    breakEvenCheckoutTakePct,
    breakEvenPostTakeVsCheckout,
    breakEvenCheckoutDropPct,
    winner,
    summary: upsellSummary({
      skip: rows[0],
      checkout: rows[1],
      post: rows[2],
      extraOnCheckout,
      extraOnPost,
      extraOnPostVsCheckout,
      monthlyExtraOnPost,
      breakEvenCheckoutTakePct,
      breakEvenPostTakeVsCheckout,
      breakEvenCheckoutDropPct,
      addOnDiscountPct,
      checkoutDropPct,
      discountedAddOn,
    }),
  };
}

export function upsellNote(comparison) {
  return comparison.summary;
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

// Solve (1-rate)*completedProfit + rate*refundOutcomeProfit = 0 for a refund
// rate in [0, 1]. completedProfit can be negative -- the order can already
// be a loss before any refunds -- and "0" is not the break-even in that
// case: at 0% refunds the order is already below zero, not sitting at it.
// The old `completedProfit <= 0 -> return 0` branch reported a completed
// loss as an already-break-even 0% refund rate, which is simply wrong (it
// told a merchant losing money on every sale that refunds were a non-issue
// at 0%). refundOutcomeProfit is a sum of costs so it is never positive, so
// a convex mix of two non-positive numbers can never reach exactly zero
// once completedProfit is negative -- the honest answer there is that no
// refund rate reaches break-even, not "already there".
function breakEvenRefundRate(completedProfit, refundOutcomeProfit) {
  const gap = completedProfit - refundOutcomeProfit;
  if (Math.abs(gap) <= 1e-12) {
    return Math.abs(completedProfit) <= 1e-12 ? 0 : null;
  }
  const rate = (completedProfit / gap) * 100;
  if (rate < -1e-9 || rate > 100 + 1e-9) return null;
  return Math.max(0, rate);
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

function refundPathWinner(shopifyProfit, thirdPartyProfit) {
  if (shopifyProfit > thirdPartyProfit) return "shopify_payments";
  if (thirdPartyProfit > shopifyProfit) return "third_party";
  return "tie";
}

/**
 * Mix completed-order profit with a full-refund outcome so a merchant can see
 * whether a refund rate still leaves money — and whether PayPal keeping its
 * fee on refunds flips the payment-path comparison.
 *
 * Distinct from compareReturnResolution (one requested return: cash vs store
 * credit vs exchange). This is the expected mix across a refund *rate*.
 *
 * Defaults match the usual statements: Shopify Payments returns its processing
 * fee on a full refund; a third-party processor often keeps its fee; Shopify's
 * own third-party transaction fee is treated as reversing with the order.
 * Every rate stays an input. This is not a claim about a live refund policy.
 */
export function expectedProfitAfterRefunds(input) {
  const order = calculateOrder(input);
  const refundRate = ratePercent(input.refundRatePercent, "Refund rate", 0) / 100;
  const returnShippingCost = number(input.returnShippingCost, "Return shipping", 0);
  const restockableRate = ratePercent(input.restockablePercent, "Restockable percent", 100) / 100;
  const shopifyPaymentsFeeRefundRate = ratePercent(
    input.shopifyPaymentsFeeRefundPercent,
    "Shopify Payments fee refund percent",
    100,
  ) / 100;
  const thirdPartyFeeRefundRate = ratePercent(
    input.thirdPartyFeeRefundPercent,
    "Third-party fee refund percent",
    0,
  ) / 100;
  const shopifyThirdPartyFeeRefundRate = ratePercent(
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
  const completedWinner = refundPathWinner(shopifyPayments.completedProfit, thirdParty.completedProfit);
  const expectedWinner = refundPathWinner(shopifyPayments.expectedProfit, thirdParty.expectedProfit);

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
