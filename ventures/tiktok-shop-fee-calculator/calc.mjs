// Pure TikTok Shop unit-economics arithmetic. No network, no state.
//
// Every rate is an input. The presets below are illustrative starting
// points a seller is expected to replace with the numbers on their own
// Seller Center fee preview and creator-marketplace settings. The result
// is a transparent calculation from those inputs — not TikTok's live
// schedule, and not advice about what to charge or which creators to use.
//
// The product exists because the headline referral percentage is not the
// number that decides whether a SKU makes money. Affiliate commission is
// seller-set and often kept by the creator on a return; return rate then
// turns a "fine on paper" listing into a loss. Creator facilitation, when
// it applies, stacks on top of that. Organic and affiliate-sourced orders
// of the same SKU therefore have different unit economics, which a single
// "TikTok takes 6%" page cannot show.

export const FEE_SCHEDULE_PRESETS = Object.freeze({
  new_seller: {
    id: "new_seller",
    label: "US new seller (first ~30 days after first sale)",
    note: "Promotional referral rate some new US shops see. It expires. Do not price a catalogue against it.",
    referralRate: 3,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  us_standard: {
    id: "us_standard",
    label: "US standard (most categories, mid-2026)",
    note: "Unified US referral that already covers payment processing for domestic orders. Category exceptions exist.",
    referralRate: 6,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  us_jewelry: {
    id: "us_jewelry",
    label: "US jewelry (select items)",
    note: "Some jewelry SKUs have been listed at a lower referral than the standard US rate. Confirm on the SKU.",
    referralRate: 5,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  oct_2026: {
    id: "oct_2026",
    label: "US from 1 Oct 2026 (announced: 8% + 1.5% facilitation on affiliate)",
    note: "Announced schedule, not a guarantee it ships unchanged. Facilitation applies to affiliate-sourced orders in this model.",
    referralRate: 8,
    facilitationRate: 1.5,
    paymentRate: 0,
    paymentFixed: 0,
  },
});

export const DAYS_PER_MONTH = 365 / 12;

function number(value, name, { min = 0, allowZero = true } = {}) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is required`);
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function optionalNumber(value, name, fallback, opts) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return number(value, name, opts);
}

export function applyFeePreset(input, presetId) {
  const preset = FEE_SCHEDULE_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown fee schedule: ${presetId}`);
  return {
    ...input,
    referralRate: preset.referralRate,
    facilitationRate: preset.facilitationRate,
    paymentRate: preset.paymentRate,
    paymentFixed: preset.paymentFixed,
  };
}

function refundAdminFee(referralFee, quantity, refundAdminRate, refundAdminCap) {
  return Math.min(refundAdminCap * quantity, referralFee * (refundAdminRate / 100));
}

/**
 * Expected unit economics for one TikTok Shop order.
 *
 * @param {object} input
 * @param {number} input.itemPrice              What the buyer pays for the item.
 * @param {number} [input.shippingCharged]      Shipping the buyer pays.
 * @param {number} [input.platformDiscount]     Seller- or platform-funded discount
 *   included in TikTok's published fee base. Defaults to 0.
 * @param {number} [input.tax]                  Sales tax subtracted from the fee
 *   base. Defaults to 0; most sellers leave this 0 and work pre-tax.
 * @param {number} [input.quantity]             Units on the order. Default 1.
 * @param {number} input.cogs                   What the unit cost you.
 * @param {number} [input.fulfillmentCost]      Pick/pack/label you pay per unit
 *   (Fulfilled by TikTok, 3PL, or your own postage).
 * @param {number} [input.otherPerOrder]        Packaging, inserts, payment-out
 *   fees that do not scale with a published rate.
 * @param {number} [input.adSpend]              Spark / product-shopping ads
 *   allocated to this order.
 * @param {number} input.referralRate           TikTok referral %, of fee base.
 * @param {number} [input.paymentRate]          Separate processing %, if any.
 * @param {number} [input.paymentFixed]         Separate fixed processing fee.
 * @param {number} [input.facilitationRate]     Creator facilitation % on
 *   affiliate-sourced orders.
 * @param {number} [input.affiliateRate]        Creator commission you set.
 * @param {boolean} [input.affiliateOnItemOnly] Commission on item price only
 *   (default true). Set false to apply it to item + shipping charged.
 * @param {boolean} [input.affiliateRefundedOnReturn] Whether the creator
 *   commission is clawed back on a return. Default false — the usual trap.
 * @param {boolean} [input.forceAffiliate]      Treat the order as affiliate-
 *   sourced even when the commission rate is 0 (so facilitation still applies).
 * @param {number} [input.returnRate]           % of orders that come back.
 * @param {number} [input.unsellableRate]       % of returned units you cannot
 *   sell again (opened cosmetics, damaged, not worth restocking).
 * @param {number} [input.returnShipping]       What you pay to get a return
 *   back, per unit.
 * @param {number} [input.refundAdminRate]      Share of the original referral
 *   TikTok keeps on a refund. Default 20.
 * @param {number} [input.refundAdminCap]       Cap on that admin fee, per unit.
 *   Default 5.
 * @param {number} [input.targetMargin]         Desired net margin on expected
 *   kept revenue, as a % of that revenue.
 * @param {number} [input.unitsPerDay]          For the monthly roll-up.
 */
export function calculateOrder(input) {
  const itemPrice = number(input.itemPrice, "Item price");
  const shippingCharged = optionalNumber(input.shippingCharged, "Shipping charged", 0);
  const platformDiscount = optionalNumber(input.platformDiscount, "Platform discount", 0);
  const tax = optionalNumber(input.tax, "Tax", 0);
  const quantity = optionalNumber(input.quantity, "Quantity", 1, { allowZero: false });
  const cogs = number(input.cogs ?? 0, "Cost of goods");
  const fulfillmentCost = optionalNumber(input.fulfillmentCost, "Fulfillment cost", 0);
  const otherPerOrder = optionalNumber(input.otherPerOrder, "Other per-order cost", 0);
  const adSpend = optionalNumber(input.adSpend, "Ad spend", 0);
  const referralRate = number(input.referralRate ?? 0, "Referral rate");
  const paymentRate = optionalNumber(input.paymentRate, "Payment processing rate", 0);
  const paymentFixed = optionalNumber(input.paymentFixed, "Payment fixed fee", 0);
  const facilitationRate = optionalNumber(input.facilitationRate, "Creator facilitation rate", 0);
  const affiliateRate = optionalNumber(input.affiliateRate, "Affiliate commission", 0);
  const returnRate = optionalNumber(input.returnRate, "Return rate", 0);
  if (returnRate > 100) throw new Error("Return rate cannot exceed 100%");
  const unsellableRate = optionalNumber(input.unsellableRate, "Unsellable rate", 0);
  if (unsellableRate > 100) throw new Error("Unsellable rate cannot exceed 100%");
  const returnShipping = optionalNumber(input.returnShipping, "Return shipping", 0);
  const targetMargin = optionalNumber(input.targetMargin, "Target margin", 0);
  if (targetMargin >= 100) throw new Error("Target margin must be less than 100%");
  const refundAdminRate = optionalNumber(input.refundAdminRate, "Refund admin rate", 20);
  const refundAdminCap = optionalNumber(input.refundAdminCap, "Refund admin cap", 5);
  const unitsPerDay = optionalNumber(input.unitsPerDay, "Units per day", 0);

  const affiliateOnItemOnly = input.affiliateOnItemOnly !== false;
  const affiliateRefundedOnReturn = Boolean(input.affiliateRefundedOnReturn);
  const isAffiliate = affiliateRate > 0 || Boolean(input.forceAffiliate);

  const customerPayment = itemPrice + shippingCharged;
  const feeBase = (customerPayment + platformDiscount - tax) * quantity;
  if (feeBase < 0) throw new Error("Fee base cannot be negative — check tax and discount");
  const revenue = customerPayment * quantity;

  const referralFee = feeBase * (referralRate / 100);
  const paymentFee = feeBase * (paymentRate / 100) + paymentFixed;
  const facilitationFee = isAffiliate ? feeBase * (facilitationRate / 100) : 0;
  const affiliateBase = affiliateOnItemOnly ? itemPrice * quantity : revenue;
  const affiliateFee = affiliateBase * (affiliateRate / 100);
  const productCost = cogs * quantity;
  const fulfill = fulfillmentCost * quantity;
  const ads = adSpend * quantity;

  const keptProfit =
    revenue -
    referralFee -
    paymentFee -
    facilitationFee -
    affiliateFee -
    productCost -
    fulfill -
    otherPerOrder -
    ads;

  const adminOnReturn = refundAdminFee(referralFee, quantity, refundAdminRate, refundAdminCap);
  const affiliateOnReturn = affiliateRefundedOnReturn ? 0 : affiliateFee;
  const lostCogsOnReturn = productCost * (unsellableRate / 100);
  // A returned order refunds the buyer. Referral and (when charged)
  // facilitation and processing are treated as refunded except the refund
  // admin fee. Outbound fulfillment, packaging, ads, and typically the
  // creator commission have already been spent.
  const returnedProfit =
    0 -
    adminOnReturn -
    affiliateOnReturn -
    lostCogsOnReturn -
    fulfill -
    returnShipping * quantity -
    otherPerOrder -
    ads;

  const keepRate = 1 - returnRate / 100;
  const returnShare = returnRate / 100;
  const expectedProfit = keepRate * keptProfit + returnShare * returnedProfit;
  const expectedRevenue = keepRate * revenue;
  const expectedMargin = expectedRevenue === 0 ? null : (expectedProfit / expectedRevenue) * 100;

  const cashInUnit = productCost + fulfill + otherPerOrder + ads;
  const expectedRoi = cashInUnit === 0 ? null : (expectedProfit / cashInUnit) * 100;

  const ordersPerMonth = unitsPerDay * DAYS_PER_MONTH;
  const monthlyProfit = expectedProfit * ordersPerMonth;
  const monthlyRevenue = expectedRevenue * ordersPerMonth;

  return {
    quantity,
    isAffiliate,
    customerPayment,
    feeBase,
    revenue,
    referralFee,
    paymentFee,
    facilitationFee,
    affiliateFee,
    productCost,
    fulfill,
    ads,
    otherPerOrder,
    keptProfit,
    returnedProfit,
    adminOnReturn,
    affiliateOnReturn,
    lostCogsOnReturn,
    keepRate,
    expectedProfit,
    expectedRevenue,
    expectedMargin,
    expectedRoi,
    cashInUnit,
    targetMargin,
    monthlyOrders: ordersPerMonth,
    monthlyProfit,
    monthlyRevenue,
    belowBreakEven: expectedProfit < 0,
    hitsTargetMargin:
      expectedMargin === null ? false : expectedMargin + 1e-9 >= targetMargin,
  };
}

export function compareOrganicVsAffiliate(input) {
  const organic = calculateOrder({
    ...input,
    affiliateRate: 0,
    forceAffiliate: false,
  });
  const affiliate = calculateOrder({
    ...input,
    forceAffiliate: true,
  });
  return {
    organic,
    affiliate,
    affiliateCostsExtra: organic.expectedProfit - affiliate.expectedProfit,
  };
}

export function compareFeeSchedules(input, fromId = "us_standard", toId = "oct_2026") {
  const current = calculateOrder(applyFeePreset(input, fromId));
  const upcoming = calculateOrder(applyFeePreset(input, toId));
  return {
    current,
    upcoming,
    extraCost: current.expectedProfit - upcoming.expectedProfit,
  };
}

function searchPrice(input, goodEnough) {
  let lo = 0;
  let hi = Math.max(
    1,
    (Number(input.cogs) || 0) +
      (Number(input.fulfillmentCost) || 0) +
      (Number(input.adSpend) || 0) +
      (Number(input.otherPerOrder) || 0) +
      1,
  );
  let found = false;
  for (let expand = 0; expand < 24; expand += 1) {
    if (goodEnough(calculateOrder({ ...input, itemPrice: hi }))) {
      found = true;
      break;
    }
    hi *= 2;
    if (hi > 1e7) break;
  }
  if (!found) return null;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (goodEnough(calculateOrder({ ...input, itemPrice: mid }))) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function breakEvenPrice(input) {
  return searchPrice(input, (result) => result.expectedProfit >= 0);
}

export function priceForTargetMargin(input) {
  const target = optionalNumber(input.targetMargin, "Target margin", 0);
  if (target <= 0) return breakEvenPrice(input);
  return searchPrice(
    input,
    (result) => result.expectedMargin !== null && result.expectedMargin >= target,
  );
}

/**
 * Extra monthly orders a weaker path needs to match a stronger path's
 * expected leftover. Null when the weaker path cannot catch up (zero or
 * negative leftover while the stronger path is still positive).
 */
export function extraOrdersToMatch(stronger, weaker) {
  const strongMonthly = stronger.monthlyProfit;
  const weakPerOrder = weaker.expectedProfit;
  if (strongMonthly <= weaker.monthlyProfit + 1e-9) return 0;
  if (weakPerOrder <= 1e-9) return null;
  return strongMonthly / weakPerOrder - weaker.monthlyOrders;
}

/**
 * Three ways to handle postage on the same TikTok Shop SKU.
 *
 * Charging shipping and baking that charge into the item price look like
 * a tie on referral: the published fee base is item + shipping charged.
 * They are not a tie when creator commission is on item price only —
 * moving the label into the item raises the affiliate payout. Eating the
 * label (free shipping, same item price) drops the fee base and leaves
 * postage as a cost you already pay.
 *
 * `freeShipPrice` is the list price you would actually put on a
 * free-shipping listing. It defaults to item + shipping charged (same
 * customer total) so the affiliate-on-item-only trap is visible without
 * inventing a second price.
 */
export function compareFreeShipping(input = {}) {
  const itemPrice = number(input.itemPrice, "Item price");
  const shippingCharged = optionalNumber(input.shippingCharged, "Shipping charged", 0);
  const freeShipPrice = optionalNumber(
    input.freeShipPrice,
    "Free-shipping item price",
    itemPrice + shippingCharged,
  );
  const affiliateOnItemOnly = input.affiliateOnItemOnly !== false;

  const charged = calculateOrder(input);
  const eatLabel = calculateOrder({ ...input, shippingCharged: 0 });
  const absorbPrice = itemPrice + shippingCharged;
  const absorb = calculateOrder({ ...input, itemPrice: absorbPrice, shippingCharged: 0 });
  const raised = calculateOrder({ ...input, itemPrice: freeShipPrice, shippingCharged: 0 });

  const paths = [
    { id: "charged", label: "Charge shipping", itemPrice, shippingCharged, result: charged },
    { id: "eat", label: "Free shipping, same item price", itemPrice, shippingCharged: 0, result: eatLabel },
    { id: "absorb", label: "Free shipping, same customer total", itemPrice: absorbPrice, shippingCharged: 0, result: absorb },
    { id: "raised", label: "Free shipping at typed price", itemPrice: freeShipPrice, shippingCharged: 0, result: raised },
  ];
  const unique = [];
  const seen = new Set();
  for (const path of paths) {
    const key = `${path.itemPrice.toFixed(4)}+${path.shippingCharged.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(path);
  }

  const winner = unique.reduce((best, path) =>
    path.result.expectedProfit > best.result.expectedProfit ? path : best,
  );

  return {
    affiliateOnItemOnly,
    absorbPrice,
    freeShipPrice,
    charged: paths[0],
    eatLabel: paths[1],
    absorb: paths[2],
    raised: paths[3],
    paths: unique,
    winner: winner.id,
    absorbRaisesAffiliate: absorb.affiliateFee - charged.affiliateFee,
    referralTie: Math.abs(absorb.referralFee - charged.referralFee) < 1e-9,
    extraOrdersForEat: extraOrdersToMatch(charged, eatLabel),
    extraOrdersForRaised: extraOrdersToMatch(charged, raised),
  };
}

export function freeShippingNote(comparison) {
  const money = (value) => {
    const sign = value < 0 ? "−" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const charged = comparison.charged.result;
  const raised = comparison.raised.result;
  const delta = raised.expectedProfit - charged.expectedProfit;
  if (comparison.affiliateOnItemOnly && comparison.absorbRaisesAffiliate > 1e-9 && comparison.referralTie) {
    const extra = money(comparison.absorbRaisesAffiliate);
    if (Math.abs(comparison.raised.itemPrice - comparison.absorbPrice) < 1e-9) {
      return `Referral is a tie (same fee base), but moving the label into the item price pays creators ${extra} more because commission is on item price only.`;
    }
  }
  if (delta >= -1e-9) {
    return `Free shipping at ${money(comparison.freeShipPrice)} keeps ${money(delta)} more per order after returns than charging shipping.`;
  }
  const extra = comparison.extraOrdersForRaised;
  if (extra == null) {
    return `Free shipping at ${money(comparison.freeShipPrice)} loses ${money(-delta)} per order and cannot catch up at a non-positive leftover.`;
  }
  return `Free shipping at ${money(comparison.freeShipPrice)} keeps ${money(-delta)} less per order. About ${extra.toFixed(1)} extra orders per month would match charging shipping.`;
}

export function maxBuyCost(input) {
  const probe = { ...input, cogs: 0 };
  const atZero = calculateOrder(probe);
  if (atZero.expectedProfit < 0) return 0;
  let lo = 0;
  let hi = Math.max(1, Number(input.itemPrice) || 1);
  let found = false;
  for (let expand = 0; expand < 16; expand += 1) {
    if (calculateOrder({ ...probe, cogs: hi }).expectedProfit < 0) {
      found = true;
      break;
    }
    hi *= 2;
    if (hi > 1e7) break;
  }
  if (!found) return hi;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (calculateOrder({ ...probe, cogs: mid }).expectedProfit >= 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
