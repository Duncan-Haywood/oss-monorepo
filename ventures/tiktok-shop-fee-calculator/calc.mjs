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
    short: "New-seller 3%",
    note: "Promotional referral rate some new US shops see. It expires. Do not price a catalogue against it.",
    referralRate: 3,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  us_standard: {
    id: "us_standard",
    label: "US standard (most categories, mid-2026)",
    short: "Today (6%)",
    note: "Unified US referral that already covers payment processing for domestic orders. Category exceptions exist.",
    referralRate: 6,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  us_jewelry: {
    id: "us_jewelry",
    label: "US jewelry (select items)",
    short: "US jewelry 5%",
    note: "Some jewelry SKUs have been listed at a lower referral than the standard US rate. Confirm on the SKU.",
    referralRate: 5,
    facilitationRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
  oct_2026: {
    id: "oct_2026",
    label: "US from 1 Oct 2026 (announced: 8% + 1.5% facilitation on affiliate)",
    short: "From 1 Oct 2026 (8% + 1.5%)",
    note: "Announced schedule, not a guarantee it ships unchanged. As of 16 Oct 2026 third-party guides date the 8% rate to 4 Aug 2026 and none mention the 1.5% facilitation fee, so confirm in Seller Center. Facilitation applies to affiliate-sourced orders in this model.",
    referralRate: 8,
    facilitationRate: 1.5,
    paymentRate: 0,
    paymentFixed: 0,
  },
});

export const DAYS_PER_MONTH = 365 / 12;

/**
 * Every input id this page offers, and so every name a link may fill in.
 *
 * It lives here rather than inline in `index.html` because it is a *contract*
 * with the rest of the portfolio, not a detail of this page. Sibling
 * comparison tools build "continue with these numbers" links into this
 * calculator, and a name they send that this list does not carry is dropped
 * silently by `restoreScenario()` — the reader then prices an item they never
 * entered, with no error anywhere. Exporting the list lets those tools assert
 * their mapping against it instead of hard-coding names that can drift, which
 * is what the five other deep calculators in this portfolio already do.
 */
export const FIELD_IDS = Object.freeze([
  "itemPrice", "shippingCharged", "referralRate", "facilitationRate",
  "affiliateRate", "returnRate", "cogs", "fulfillmentCost", "otherPerOrder",
  "adSpend", "unsellableRate", "returnShipping", "targetMargin",
  "unitsPerDay", "paymentRate", "platformDiscount", "freeShipPrice",
]);

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

/**
 * The margin a seller is trying to hold, as a target `calculateOrder` will
 * accept. Returns null when there is nothing to hold: a SKU already losing
 * money has no margin worth restoring (the break-even price is the honest
 * answer there instead), and a 100% margin is not a target the validator
 * takes — nor one any real order produces, since it would mean zero cost.
 */
function holdableMargin(margin) {
  if (margin === null || margin <= 0 || margin >= 100) return null;
  return margin;
}

/**
 * What a fee-schedule change does to one SKU, and what it would take to hold
 * the line.
 *
 * `compareFeeSchedules` answers "how much worse". That is only half of a
 * decision: a seller reading it still has to work out what to *do*. The two
 * levers are the list price and the unit cost, so this adds both — the price
 * under the new schedule that restores today's margin, and the most the unit
 * can cost before the SKU stops clearing at all.
 *
 * The organic and affiliate splits are separate because a facilitation rate
 * only lands on affiliate-sourced orders. A schedule that adds one does not
 * cost every order the same amount, and a seller whose volume is mostly
 * organic can be reading a number that is not theirs.
 */
export function feeChangeImpact(input, fromId = "us_standard", toId = "oct_2026") {
  if (!FEE_SCHEDULE_PRESETS[fromId]) throw new Error(`Unknown fee schedule: ${fromId}`);
  if (!FEE_SCHEDULE_PRESETS[toId]) throw new Error(`Unknown fee schedule: ${toId}`);

  const itemPrice = number(input.itemPrice, "Item price");
  const beforeInput = applyFeePreset(input, fromId);
  const afterInput = applyFeePreset(input, toId);

  const before = calculateOrder(beforeInput);
  const after = calculateOrder(afterInput);

  const organic = (base) => calculateOrder({ ...base, affiliateRate: 0, forceAffiliate: false });
  const affiliate = (base) => calculateOrder({ ...base, forceAffiliate: true });

  const organicBefore = organic(beforeInput);
  const organicAfter = organic(afterInput);
  const affiliateBefore = affiliate(beforeInput);
  const affiliateAfter = affiliate(afterInput);

  const hold = holdableMargin(before.expectedMargin);
  const priceToHoldMargin =
    hold === null ? null : priceForTargetMargin({ ...afterInput, targetMargin: hold });

  return {
    from: FEE_SCHEDULE_PRESETS[fromId],
    to: FEE_SCHEDULE_PRESETS[toId],
    itemPrice,
    before,
    after,
    // Positive means the change costs the seller, matching `compareFeeSchedules`.
    extraCostPerOrder: before.expectedProfit - after.expectedProfit,
    extraCostPerMonth: before.monthlyProfit - after.monthlyProfit,
    organic: {
      before: organicBefore,
      after: organicAfter,
      extraCostPerOrder: organicBefore.expectedProfit - organicAfter.expectedProfit,
    },
    affiliate: {
      before: affiliateBefore,
      after: affiliateAfter,
      extraCostPerOrder: affiliateBefore.expectedProfit - affiliateAfter.expectedProfit,
    },
    marginBefore: before.expectedMargin,
    marginAfter: after.expectedMargin,
    heldMargin: hold,
    priceToHoldMargin,
    priceRise: priceToHoldMargin === null ? null : priceToHoldMargin - itemPrice,
    breakEvenPriceAfter: breakEvenPrice(afterInput),
    maxBuyCostBefore: maxBuyCost(beforeInput),
    maxBuyCostAfter: maxBuyCost(afterInput),
    stillClears: after.expectedProfit >= 0,
    // Whether the SKU was already under water before the change. Without this
    // the note blames the new schedule for a loss the old one was already
    // making, which is the one thing a seller must not be told wrongly here.
    clearedBefore: before.expectedProfit >= 0,
  };
}

/** One sentence for the top of the fee-change page. */
export function feeChangeNote(impact) {
  const money = (value) => {
    const sign = value < 0 ? "−" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const cost = impact.extraCostPerOrder;

  if (cost <= 1e-9) {
    // A seller whose SKU is unaffected — or better off — should be told that
    // plainly rather than being sold a price rise they do not need.
    return `On these numbers the ${impact.to.label} schedule costs nothing extra on this SKU — there is nothing here to price against.`;
  }

  const head = `${impact.to.label} costs ${money(cost)} more per order on this SKU`;
  const monthly =
    impact.extraCostPerMonth > 1e-9
      ? `, about ${money(impact.extraCostPerMonth)} a month at your current volume`
      : "";

  if (!impact.stillClears && !impact.clearedBefore) {
    // Already losing money. Say so, rather than pinning it on the change.
    return `${head}${monthly} — but this SKU already loses money at today's rates. It needs ${money(impact.breakEvenPriceAfter)} to clear under the new ones.`;
  }
  if (!impact.stillClears) {
    return `${head}${monthly} — enough to tip this SKU from clearing to a loss. Break-even moves to ${money(impact.breakEvenPriceAfter)}.`;
  }
  if (impact.priceToHoldMargin === null) {
    return `${head}${monthly}. There is no positive margin to hold here — it needs ${money(impact.breakEvenPriceAfter)} just to clear.`;
  }
  return `${head}${monthly}. Listing at ${money(impact.priceToHoldMargin)} instead of ${money(impact.itemPrice)} holds your ${impact.heldMargin.toFixed(1)}% margin.`;
}

export function maxBuyCost(input) {
  const probe = { ...input, cogs: 0 };
  const atZero = calculateOrder(probe);
  // When the SKU loses money even on free goods, no purchase cost clears it.
  // Returning 0 here said "pay at most $0.00 and you break even", which is
  // false — at $0.00 it is still under water — and is indistinguishable from
  // the legitimate answer for a SKU that breaks even exactly at zero COGS.
  // The fee-change page presents this as "the number to take to a supplier",
  // so a 0 sent a seller to negotiate a price that was never going to work
  // when the real answer is that the listing price has to move. `null` is
  // what breakEvenPrice and priceForTargetMargin already return when no
  // input reaches the target.
  if (atZero.expectedProfit < 0) return null;
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

/**
 * Selling `bundleQuantity` units in one discounted order against selling
 * that many units as separate full-price orders.
 *
 * The two are not the same order scaled by a factor: a bundle pays the
 * fixed per-order costs (payment processing's flat fee, one shot at a
 * return) once, while `bundleQuantity` separate orders pay each of those
 * once per order. `calculateOrder`'s `quantity` already models "one order
 * of N units" correctly (`feeBase`/`referralFee`/`productCost` scale with
 * it, `paymentFixed` does not), so the honest separate-orders total is
 * `bundleQuantity` independent single-unit orders, not
 * `calculateOrder({ quantity: bundleQuantity })` at full price.
 */
export function compareBundleDiscount(input = {}) {
  const itemPrice = number(input.itemPrice, "Item price");
  const bundleQuantity = optionalNumber(input.bundleQuantity, "Bundle quantity", 2, {
    min: 2,
  });
  const bundleDiscountPct = optionalNumber(input.bundleDiscountPct, "Bundle discount", 10);
  if (bundleDiscountPct >= 100) throw new Error("Bundle discount must be less than 100%");

  const single = calculateOrder({ ...input, quantity: 1 });
  const separateTotal = single.expectedProfit * bundleQuantity;

  const bundlePrice = itemPrice * (1 - bundleDiscountPct / 100);
  const bundle = calculateOrder({ ...input, quantity: bundleQuantity, itemPrice: bundlePrice });

  const breakEvenBundlePrice = searchPrice(
    { ...input, quantity: bundleQuantity },
    (result) => result.expectedProfit >= separateTotal,
  );
  const breakEvenDiscountPct =
    breakEvenBundlePrice === null ? null : (1 - breakEvenBundlePrice / itemPrice) * 100;

  return {
    bundleQuantity,
    bundleDiscountPct,
    bundlePrice,
    single,
    separateTotal,
    bundle,
    bundleGain: bundle.expectedProfit - separateTotal,
    winner: bundle.expectedProfit >= separateTotal ? "bundle" : "separate",
    breakEvenBundlePrice,
    breakEvenDiscountPct,
  };
}

export function bundleDiscountNote(comparison) {
  const money = (value) => {
    const sign = value < 0 ? "−" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { bundleQuantity, bundleDiscountPct, bundleGain, winner, breakEvenDiscountPct } =
    comparison;
  if (winner === "bundle") {
    return `A ${bundleQuantity}-pack at ${bundleDiscountPct}% off keeps ${money(bundleGain)} more than ${bundleQuantity} separate full-price orders, mostly by paying flat per-order costs once instead of ${bundleQuantity} times.`;
  }
  if (breakEvenDiscountPct === null) {
    return `A ${bundleQuantity}-pack at ${bundleDiscountPct}% off keeps ${money(-bundleGain)} less than ${bundleQuantity} separate full-price orders, and no discount shallow enough recovers that — the separate orders' saved per-order fee is not worth the price cut here.`;
  }
  return `A ${bundleQuantity}-pack at ${bundleDiscountPct}% off keeps ${money(-bundleGain)} less than ${bundleQuantity} separate full-price orders. Dropping the discount to about ${breakEvenDiscountPct.toFixed(1)}% would match them.`;
}
