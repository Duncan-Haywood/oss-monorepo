// Pure Walmart Marketplace WFS vs seller-fulfilled profit arithmetic.
// No network, no state. Category referral rates, size-tier WFS fulfillment,
// storage, and the $0.30 referral floor are illustrative defaults the seller
// can edit. The result is a transparent calculation from those inputs — not
// Walmart's live fee schedule.

export const CATEGORY_PRESETS = {
  apparel: { label: "Apparel", referralRate: 15 },
  auto: { label: "Auto & tires", referralRate: 12 },
  baby: { label: "Baby", referralRate: 15 },
  beauty: { label: "Beauty", referralRate: 12 },
  electronics: { label: "Electronics", referralRate: 8 },
  grocery: { label: "Grocery", referralRate: 8 },
  home: { label: "Home", referralRate: 15 },
  jewelry: { label: "Jewelry", referralRate: 20 },
  toys: { label: "Toys", referralRate: 15 },
  sports: { label: "Sporting goods", referralRate: 15 },
  everything_else: { label: "Everything else", referralRate: 15 },
};

export const STORAGE_PRESETS = {
  standard: { label: "Standard WFS storage", perCuFt: 0.75 },
  long_term: { label: "Aged / long-term WFS storage", perCuFt: 2.1 },
};

export const SIZE_TIER_LABELS = {
  standard: "Standard",
  oversize: "Oversize",
  extra_large: "Extra-large",
};

const FULFILLMENT_METHODS = new Set(["wfs", "seller"]);
export const FULFILLMENT_VALUES = [...FULFILLMENT_METHODS];

export const DEFAULT_REFERRAL_MINIMUM = 0.3;

// The numeric fields index.html's own `ids` array reads and writes, in the
// same order. share.mjs imports this list rather than keeping its own, so a
// new input field is shareable the day it ships instead of being silently
// dropped from a link — the failure ebay-fee-calculator's share module hit
// twice and where-to-sell-calculator's hit once, both by hand-maintaining a
// second copy of this list.
export const INPUT_FIELDS = [
  "salePrice", "matchPrice", "referralRate", "referralMinimum", "length",
  "width", "height", "weightLb", "monthsInStorage", "storageRate",
  "fulfillmentFee", "costOfGoods", "inboundPerUnit", "sellerShippingCost",
  "packagingCost", "adsPerUnit", "otherCost", "monthlySellerFee",
  "monthlyUnits", "targetMargin", "twoDayShippingCost", "twoDayMinutes",
  "twoDayHourlyWage", "wfsTakePct", "twoDayTakePct", "standardTakePct",
  "returnRatePct", "wfsReturnFee", "sellerReturnLabel", "restockMinutes",
  "restockHourlyWage", "unsellableReturnPct", "leftoverUnits",
  "monthlySellThroughPct", "horizonMonths", "agedStorageRate",
  "removalFee", "disposalFee", "acosPct", "extraAdUnits",
  "attributedOrganicPct", "highAcosPct", "highExtraAdUnits",
  "highAttributedOrganicPct", "holdTakePct", "matchTakePct",
  "promoTakePct", "promoDays", "monthDays",
];

function number(value, name, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    const result = Number(fallback);
    if (!Number.isFinite(result) || result < 0) {
      throw new Error(`${name} must be a non-negative number`);
    }
    return result;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return result;
}

export function applyCategoryPreset(input, categoryId) {
  const preset = CATEGORY_PRESETS[categoryId];
  if (!preset) throw new Error(`Unknown Walmart category: ${categoryId}`);
  return { ...input, referralRate: preset.referralRate };
}

export function applyStoragePreset(input, seasonId) {
  const preset = STORAGE_PRESETS[seasonId];
  if (!preset) throw new Error(`Unknown WFS storage preset: ${seasonId}`);
  return { ...input, storageRate: preset.perCuFt };
}

export function cubicFeet({ length, width, height }) {
  const l = number(length, "Length");
  const w = number(width, "Width");
  const h = number(height, "Height");
  return (l * w * h) / 1728;
}

export function classifySizeTier({ length, width, height, weightLb }) {
  const l = number(length, "Length");
  const w = number(width, "Width");
  const h = number(height, "Height");
  const weight = number(weightLb, "Weight");
  const [longest, median, shortest] = [l, w, h].sort((a, b) => b - a);

  if (weight <= 20 && longest <= 18 && median <= 14 && shortest <= 8) {
    return "standard";
  }
  if (weight <= 50 && longest <= 48) {
    return "oversize";
  }
  return "extra_large";
}

// Illustrative 2026 US WFS fulfillment defaults. Sellers should replace these
// with the fees on their current Walmart Seller Center preview.
export function defaultFulfillmentFee(tier, weightLb) {
  if (!SIZE_TIER_LABELS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const weight = number(weightLb, "Weight");
  const oz = weight * 16;

  if (tier === "standard") {
    if (oz <= 4) return 3.45;
    if (oz <= 8) return 3.65;
    if (oz <= 12) return 3.95;
    if (oz <= 16) return 4.25;
    if (weight <= 2) return 4.85;
    if (weight <= 3) return 5.35;
    return 5.35 + Math.ceil(weight - 3) * 0.4;
  }
  if (tier === "oversize") {
    return 8.75 + Math.max(0, weight - 2) * 0.45;
  }
  return 22.5 + Math.max(0, weight - 5) * 0.5;
}

export function referralFee(salePrice, referralRate, minimum = DEFAULT_REFERRAL_MINIMUM) {
  const price = number(salePrice, "Sale price");
  const rate = number(referralRate, "Referral rate");
  const floor = number(minimum, "Referral minimum");
  return Math.max(price * (rate / 100), floor);
}

export function breakEvenSalePrice({
  fixedCash,
  referralRate,
  referralMinimum = DEFAULT_REFERRAL_MINIMUM,
}) {
  const cash = number(fixedCash, "Fixed cash");
  const rate = number(referralRate, "Referral rate") / 100;
  const floor = number(referralMinimum, "Referral minimum");
  if (rate >= 1) return Infinity;

  const percentPrice = cash / (1 - rate);
  const floorThreshold = rate === 0 ? Infinity : floor / rate;
  if (percentPrice >= floorThreshold) return Math.max(0, percentPrice);

  const floorPrice = cash + floor;
  return Math.max(0, floorPrice);
}

function pathResult({
  revenue,
  referralRate,
  referralMinimum,
  cashInvested,
  targetMarginRate,
  feeParts,
}) {
  const feeTotal = Object.values(feeParts).reduce((sum, value) => sum + value, 0);
  const costs = feeTotal + cashInvested;
  const profit = revenue - costs;
  const percentRate = referralRate / 100;
  const fixedCash =
    cashInvested + feeTotal - referralFee(revenue, referralRate, referralMinimum);
  return {
    fees: feeParts,
    feeTotal,
    cashInvested,
    costs,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    breakEvenPrice: breakEvenSalePrice({
      fixedCash,
      referralRate,
      referralMinimum,
    }),
    targetMarginPrice: (() => {
      const denom = 1 - percentRate - targetMarginRate;
      if (denom <= 0) return Infinity;
      const percentPrice = fixedCash / denom;
      const floorThreshold = percentRate === 0 ? Infinity : referralMinimum / percentRate;
      if (percentPrice >= floorThreshold) return Math.max(0, percentPrice);
      const floorDenom = 1 - targetMarginRate;
      if (floorDenom <= 0) return Infinity;
      return Math.max(0, (fixedCash + referralMinimum) / floorDenom);
    })(),
  };
}

function listingAtPrice(input, salePrice) {
  const referralRate = number(input.referralRate, "Referral rate", 15);
  const referralMinimum = number(
    input.referralMinimum,
    "Referral minimum",
    DEFAULT_REFERRAL_MINIMUM,
  );
  const length = number(input.length, "Length", 8);
  const width = number(input.width, "Width", 6);
  const height = number(input.height, "Height", 2);
  const weightLb = number(input.weightLb, "Weight", 0.75);
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const inboundPerUnit = number(input.inboundPerUnit, "Inbound per unit");
  const monthsInStorage = number(input.monthsInStorage, "Months in storage", 1);
  const storageRate = number(input.storageRate, "Storage rate", STORAGE_PRESETS.standard.perCuFt);
  const sellerShippingCost = number(input.sellerShippingCost, "Seller shipping cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");
  const monthlySellerFee = number(input.monthlySellerFee, "Monthly seller fee");
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const targetMargin = number(input.targetMargin, "Target margin");
  const fulfillmentMethod = input.fulfillmentMethod ?? "wfs";

  if (targetMargin >= 100) throw new Error("Target margin must be less than 100%");
  if (!FULFILLMENT_METHODS.has(fulfillmentMethod)) {
    throw new Error("Fulfillment method must be wfs or seller");
  }
  if (monthlyUnits === 0 && monthlySellerFee > 0) {
    throw new Error("Monthly units must be greater than zero when a seller fee is included");
  }

  const sizeTier =
    input.sizeTier && SIZE_TIER_LABELS[input.sizeTier]
      ? input.sizeTier
      : classifySizeTier({ length, width, height, weightLb });
  const suggestedFulfillment = defaultFulfillmentFee(sizeTier, weightLb);
  const fulfillmentFee =
    input.fulfillmentFee === undefined || input.fulfillmentFee === null || input.fulfillmentFee === ""
      ? suggestedFulfillment
      : number(input.fulfillmentFee, "Fulfillment fee");

  const cuFt = cubicFeet({ length, width, height });
  const storagePerUnit = cuFt * monthsInStorage * storageRate;
  const allocatedSellerFee = monthlyUnits === 0 ? 0 : monthlySellerFee / monthlyUnits;
  const sharedCash = costOfGoods + packagingCost + otherCost + adsPerUnit + allocatedSellerFee;
  const referral = referralFee(salePrice, referralRate, referralMinimum);
  const targetMarginRate = targetMargin / 100;

  function finish(path, cogsInCash) {
    // The raw ceiling can be negative: fees and non-COGS cash costs alone
    // already exceed the sale price, so no sourcing cost -- not even $0 --
    // reaches break-even. Clamping that to 0 for display would read as "pay
    // at most $0.00" -- a real, if tight, break-even point -- when the truth
    // is that this listing loses money before a unit is even bought.
    // `breakEvenBuyCostRaw` keeps the signed figure so callers can tell the
    // two apart instead of reading a bare $0.00 as a genuine break-even.
    // Same bug class already fixed for amazon-fba-calculator's maxBuyCost.
    const rawBreakEvenBuyCost = salePrice - path.feeTotal - (path.cashInvested - cogsInCash);
    path.breakEvenBuyCostRaw = rawBreakEvenBuyCost;
    path.breakEvenBuyCost = Math.max(0, rawBreakEvenBuyCost);
    return path;
  }

  const wfsCash = sharedCash + inboundPerUnit + storagePerUnit;
  const wfs = finish(
    pathResult({
      revenue: salePrice,
      referralRate,
      referralMinimum,
      cashInvested: wfsCash,
      targetMarginRate,
      feeParts: { referral, fulfillment: fulfillmentFee },
    }),
    costOfGoods,
  );

  const sellerCash = sharedCash + sellerShippingCost;
  const seller = finish(
    pathResult({
      revenue: salePrice,
      referralRate,
      referralMinimum,
      cashInvested: sellerCash,
      targetMarginRate,
      feeParts: { referral, fulfillment: 0 },
    }),
    costOfGoods,
  );

  const selected = fulfillmentMethod === "wfs" ? wfs : seller;
  const wfsAdvantage = wfs.profit - seller.profit;
  return {
    salePrice,
    referral,
    referralMinimum,
    sizeTier,
    sizeTierLabel: SIZE_TIER_LABELS[sizeTier],
    cubicFeet: cuFt,
    storagePerUnit,
    allocatedSellerFee,
    suggestedFulfillment,
    fulfillmentFee,
    fulfillmentMethod,
    selected,
    wfs,
    seller,
    wfsAdvantage,
    cheaperPath: wfsAdvantage > 0 ? "wfs" : wfsAdvantage < 0 ? "seller" : "tie",
  };
}

function moneyLabel(value) {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function takePercent(value, name, fallback) {
  const result = number(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be at most 100`);
  return result;
}

function twoDayPath({
  id,
  label,
  takePct,
  shippingCost,
  laborCost,
  completedProfit,
  expectedProfit,
  monthlyProfit,
}) {
  return {
    id,
    label,
    takePct,
    shippingCost,
    laborCost,
    completedProfit,
    expectedProfit,
    monthlyProfit,
  };
}

/**
 * Where a take-rate path ties a rival whose expected profit is fixed, and
 * which side of that rate the path is the better one on.
 *
 * Expected profit on a take path is `take% × completed profit`, so the tie is
 * one division. The part worth spelling out is the direction, because it flips
 * and the old code did not: when a completed sale *loses* money, a higher take
 * rate books more of that loss, so the path is better BELOW the crossing
 * instead of above it.
 *
 * That is not a corner case here. WFS fees on a heavy item, or a seller label
 * plus pack time on a thin-margin one, routinely put both paths under water at
 * once — and two loss-making paths still cross at a real rate, the same way
 * two profitable ones do. The previous guard (`completed > 1e-12`) returned
 * `Infinity` for every one of them, so the page told a seller the rate was
 * "unreachable" when it was, say, 95.5% and directly actionable.
 *
 * `betterBelow` is what lets the sentence say "until take rises to" rather
 * than "if take rises to". Reporting the number without the direction would
 * hand the seller the right figure attached to the wrong advice.
 */
function takeRateCrossing(rivalExpected, completedProfit) {
  if (!Number.isFinite(completedProfit) || Math.abs(completedProfit) <= 1e-12) {
    return { rate: Infinity, betterBelow: false };
  }
  const betterBelow = completedProfit < 0;
  const rate = (rivalExpected / completedProfit) * 100;
  // A rate outside 0..100 is genuinely unreachable: take is a share of
  // sessions and cannot exceed all of them or fall below none.
  if (!Number.isFinite(rate) || rate < -1e-9 || rate > 100 + 1e-9) {
    return { rate: Infinity, betterBelow };
  }
  return { rate: Math.max(0, Math.min(100, rate)), betterBelow };
}

function twoDaySummary({
  winner,
  wfs,
  twoDay,
  standard,
  extraTwoDayVsWfs,
  extraStandardVsWfs,
  monthlyExtraOnTwoDay,
  monthlyUnits,
  breakEvenTwoDayShipping,
  breakEvenTwoDayTakePct,
  breakEvenStandardTakePct,
  twoDayTakeIsCeiling,
  standardTakeIsCeiling,
}) {
  const wfsKeep = moneyLabel(wfs.expectedProfit);
  const twoDayKeep = moneyLabel(twoDay.expectedProfit);
  const standardKeep = moneyLabel(standard.expectedProfit);
  const twoDayGap = moneyLabel(Math.abs(extraTwoDayVsWfs));
  const standardGap = moneyLabel(Math.abs(extraStandardVsWfs));
  const monthGap = moneyLabel(Math.abs(monthlyExtraOnTwoDay));
  const shipCeil = Number.isFinite(breakEvenTwoDayShipping)
    ? moneyLabel(breakEvenTwoDayShipping)
    : "an unreachable 2-day label";
  const twoDayFloor = Number.isFinite(breakEvenTwoDayTakePct)
    ? `${breakEvenTwoDayTakePct.toFixed(1)}%`
    : "an unreachable take rate";
  const standardFloor = Number.isFinite(breakEvenStandardTakePct)
    ? `${breakEvenStandardTakePct.toFixed(1)}%`
    : "an unreachable take rate";
  const volume = `${monthlyUnits} WFS unit${monthlyUnits === 1 ? "" : "s"}`;

  if (winner === "two_day") {
    return (
      `Seller-fulfilled 2-day keeps ${twoDayGap} more per session than WFS ` +
      `(${twoDayKeep} vs ${wfsKeep}), ${monthGap} on ${volume}. ` +
      `The 2-day label can rise to about ${shipCeil} before WFS matches.`
    );
  }
  if (winner === "standard") {
    // When standard's completed sale loses money, a higher take rate books
    // more of that loss — so the crossing is the point standard stops being
    // ahead, not the point it starts.
    const standardLine = standardTakeIsCeiling
      ? `Standard stays ahead of WFS until take rises to about ${standardFloor}.`
      : `Standard still needs about ${standardFloor} take to match WFS.`;
    return (
      `Seller-fulfilled standard shipping keeps ${standardGap} more per session than WFS ` +
      `(${standardKeep} vs ${wfsKeep}). 2-day is ${twoDayKeep}. ` +
      standardLine
    );
  }
  if (winner === "wfs") {
    const twoDayLine = twoDayTakeIsCeiling
      ? `or take falls to about ${twoDayFloor}`
      : `or take rises to about ${twoDayFloor}`;
    return (
      `WFS keeps ${twoDayGap} more per session than seller-fulfilled 2-day ` +
      `(${wfsKeep} vs ${twoDayKeep}), ${monthGap} on ${volume}. ` +
      `2-day matches if the label falls to about ${shipCeil} ` +
      `${twoDayLine}. Standard is ${standardKeep}.`
    );
  }
  return "WFS, seller-fulfilled 2-day, and standard shipping leave the same expected leftover on these rates.";
}

// Walmart's Buy Box heavily weights 2-day. WFS includes that promise.
// Seller-fulfilled 2-day buys a faster label and pack time. Standard
// seller-fulfilled is cheaper per completed sale but usually converts
// fewer sessions. Complementary to the completed-sale WFS vs seller
// table (which assumes the offer already won) and to price match
// (which holds take fixed). Defaults are illustrative — overwrite
// the label, minutes, and take rates from Seller Center.
export const TWO_DAY_DEFAULTS = {
  twoDayShippingCost: 8.95,
  twoDayMinutes: 6,
  twoDayHourlyWage: 18,
  wfsTakePct: 80,
  twoDayTakePct: 70,
  standardTakePct: 35,
};

/**
 * Same listing, three ways to keep 2-day (or give it up): WFS, you
 * buy a 2-day label, or you ship standard and accept a lower take.
 * Expected leftover is take% × completed-sale profit. monthlyUnits
 * is treated as WFS completed volume so sessions = units / WFS take.
 */
export function compareTwoDay(input = {}) {
  const twoDayShippingCost = number(
    input.twoDayShippingCost,
    "Two-day shipping cost",
    TWO_DAY_DEFAULTS.twoDayShippingCost,
  );
  const twoDayMinutes = number(
    input.twoDayMinutes,
    "Two-day minutes",
    TWO_DAY_DEFAULTS.twoDayMinutes,
  );
  const twoDayHourlyWage = number(
    input.twoDayHourlyWage,
    "Two-day hourly wage",
    TWO_DAY_DEFAULTS.twoDayHourlyWage,
  );
  const wfsTakePct = takePercent(
    input.wfsTakePct,
    "WFS take percent",
    TWO_DAY_DEFAULTS.wfsTakePct,
  );
  const twoDayTakePct = takePercent(
    input.twoDayTakePct,
    "Two-day take percent",
    TWO_DAY_DEFAULTS.twoDayTakePct,
  );
  const standardTakePct = takePercent(
    input.standardTakePct,
    "Standard take percent",
    TWO_DAY_DEFAULTS.standardTakePct,
  );
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 60);
  const sellerShippingCost = number(input.sellerShippingCost, "Seller shipping cost", 4.5);

  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");
  if (wfsTakePct === 0) throw new Error("WFS take percent must be greater than zero");

  const listing = calculateListing(input);
  const laborCost = (twoDayMinutes / 60) * twoDayHourlyWage;
  const wfsCompleted = listing.wfs.profit;
  const standardCompleted = listing.seller.profit;
  const twoDayCompleted = standardCompleted + sellerShippingCost - twoDayShippingCost - laborCost;

  const sessions = monthlyUnits / (wfsTakePct / 100);
  const wfsExpected = (wfsTakePct / 100) * wfsCompleted;
  const twoDayExpected = (twoDayTakePct / 100) * twoDayCompleted;
  const standardExpected = (standardTakePct / 100) * standardCompleted;
  const wfsMonthly = wfsExpected * sessions;
  const twoDayMonthly = twoDayExpected * sessions;
  const standardMonthly = standardExpected * sessions;

  const wfs = twoDayPath({
    id: "wfs",
    label: "WFS (2-day included)",
    takePct: wfsTakePct,
    shippingCost: listing.fulfillmentFee,
    laborCost: 0,
    completedProfit: wfsCompleted,
    expectedProfit: wfsExpected,
    monthlyProfit: wfsMonthly,
  });
  const twoDay = twoDayPath({
    id: "two_day",
    label: "Seller-fulfilled 2-day",
    takePct: twoDayTakePct,
    shippingCost: twoDayShippingCost,
    laborCost,
    completedProfit: twoDayCompleted,
    expectedProfit: twoDayExpected,
    monthlyProfit: twoDayMonthly,
  });
  const standard = twoDayPath({
    id: "standard",
    label: "Seller-fulfilled standard",
    takePct: standardTakePct,
    shippingCost: sellerShippingCost,
    laborCost: 0,
    completedProfit: standardCompleted,
    expectedProfit: standardExpected,
    monthlyProfit: standardMonthly,
  });

  const extraTwoDayVsWfs = twoDayExpected - wfsExpected;
  const extraStandardVsWfs = standardExpected - wfsExpected;
  const monthlyExtraOnTwoDay = extraTwoDayVsWfs * sessions;
  const monthlyExtraOnStandard = extraStandardVsWfs * sessions;

  const rows = [wfs, twoDay, standard].map((row) => ({
    ...row,
    vsWfs: row.expectedProfit - wfsExpected,
  }));

  const bestExpected = Math.max(wfsExpected, twoDayExpected, standardExpected);
  const leaders = [
    { id: "wfs", value: wfsExpected },
    { id: "two_day", value: twoDayExpected },
    { id: "standard", value: standardExpected },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenTwoDayShipping = Infinity;
  if (twoDayTakePct > 1e-12) {
    const neededCompleted = wfsExpected / (twoDayTakePct / 100);
    breakEvenTwoDayShipping = standardCompleted + sellerShippingCost - laborCost - neededCompleted;
    if (!Number.isFinite(breakEvenTwoDayShipping)) breakEvenTwoDayShipping = Infinity;
  }

  const twoDayCrossing = takeRateCrossing(wfsExpected, twoDayCompleted);
  const standardCrossing = takeRateCrossing(wfsExpected, standardCompleted);
  const breakEvenTwoDayTakePct = twoDayCrossing.rate;
  const breakEvenStandardTakePct = standardCrossing.rate;

  return {
    rows,
    wfs: rows[0],
    twoDay: rows[1],
    standard: rows[2],
    winner,
    sessions,
    monthlyUnits,
    wfsTakePct,
    twoDayTakePct,
    standardTakePct,
    twoDayShippingCost,
    twoDayMinutes,
    twoDayHourlyWage,
    laborCost,
    sellerShippingCost,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    extraTwoDayVsWfs,
    extraStandardVsWfs,
    monthlyExtraOnTwoDay,
    monthlyExtraOnStandard,
    breakEvenTwoDayShipping,
    breakEvenTwoDayTakePct,
    breakEvenStandardTakePct,
    // True when the path's completed sale loses money, so the rate above is a
    // ceiling the path stays ahead below, not a floor it has to climb to.
    twoDayTakeIsCeiling: twoDayCrossing.betterBelow,
    standardTakeIsCeiling: standardCrossing.betterBelow,
    summary: twoDaySummary({
      winner,
      wfs: rows[0],
      twoDay: rows[1],
      standard: rows[2],
      extraTwoDayVsWfs,
      extraStandardVsWfs,
      monthlyExtraOnTwoDay,
      monthlyUnits,
      breakEvenTwoDayShipping,
      breakEvenTwoDayTakePct,
      breakEvenStandardTakePct,
      twoDayTakeIsCeiling: twoDayCrossing.betterBelow,
      standardTakeIsCeiling: standardCrossing.betterBelow,
    }),
  };
}

export function twoDayNote(comparison) {
  if (!comparison?.wfs || !comparison?.twoDay) {
    throw new Error("Two-day comparison is missing rows");
  }
  return comparison.summary;
}

function flag(value, name, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function returnsPath({
  id,
  label,
  completedProfit,
  returnLeftover,
  expectedProfit,
  monthlyProfit,
}) {
  return {
    id,
    label,
    completedProfit,
    returnLeftover,
    expectedProfit,
    monthlyProfit,
  };
}

function returnsSummary({
  winner,
  wfs,
  seller,
  extraWfsVsSeller,
  monthlyExtraOnWfs,
  monthlyUnits,
  returnRatePct,
  breakEvenReturnPct,
  completedWinner,
}) {
  const wfsKeep = moneyLabel(wfs.expectedProfit);
  const sellerKeep = moneyLabel(seller.expectedProfit);
  const gap = moneyLabel(Math.abs(extraWfsVsSeller));
  const monthGap = moneyLabel(Math.abs(monthlyExtraOnWfs));
  const volume = `${monthlyUnits} unit${monthlyUnits === 1 ? "" : "s"}`;
  const rate = `${returnRatePct.toFixed(1)}%`;
  const floor = Number.isFinite(breakEvenReturnPct)
    ? `${breakEvenReturnPct.toFixed(1)}%`
    : "an unreachable return rate";
  const completedLine = completedWinner === winner
    ? ""
    : completedWinner === "wfs"
      ? " Completed-sale leftover prefers WFS; returns flip the mix."
      : completedWinner === "seller"
        ? " Completed-sale leftover prefers seller fulfilled; returns flip the mix."
        : "";

  if (winner === "wfs") {
    return (
      `After a ${rate} return mix, WFS keeps ${gap} more per unit than seller fulfilled ` +
      `(${wfsKeep} vs ${sellerKeep}), ${monthGap} on ${volume}. ` +
      `Seller fulfilled matches if returns fall to about ${floor}.${completedLine}`
    );
  }
  if (winner === "seller") {
    return (
      `After a ${rate} return mix, seller fulfilled keeps ${gap} more per unit than WFS ` +
      `(${sellerKeep} vs ${wfsKeep}), ${monthGap} on ${volume}. ` +
      `WFS matches if returns rise to about ${floor}.${completedLine}`
    );
  }
  return `WFS and seller fulfilled leave the same expected leftover after a ${rate} return mix.`;
}

// Walmart's completed-sale WFS vs seller table assumes the order sticks.
// Returns do not: WFS usually keeps the pick fee and adds a return-
// processing charge; seller fulfilled already spent the outbound label
// and buys a return label plus restock time. Unsellable returns also
// leave cost of goods on the table. Complementary to the completed-sale
// table and to 2-day take (Buy Box win vs miss, not a refund). Defaults
// are illustrative — overwrite the rate, WFS return fee, and return
// label from Seller Center.
export const RETURNS_DEFAULTS = {
  returnRatePct: 8,
  wfsReturnFee: 2.5,
  sellerReturnLabel: 5.5,
  restockMinutes: 8,
  restockHourlyWage: 18,
  unsellableReturnPct: 25,
  referralRefunded: true,
  fulfillmentRefunded: false,
};

/**
 * Same listing, two leftover mixes after returns: WFS (pick fee +
 * return processing) vs seller fulfilled (outbound label + return
 * label + restock time). Expected leftover is
 * (1 − return%) × completed profit + return% × return leftover.
 * Unsellable returns also keep cost of goods in the return leftover.
 */
export function compareReturns(input = {}) {
  const returnRatePct = takePercent(
    input.returnRatePct,
    "Return rate",
    RETURNS_DEFAULTS.returnRatePct,
  );
  const wfsReturnFee = number(
    input.wfsReturnFee,
    "WFS return fee",
    RETURNS_DEFAULTS.wfsReturnFee,
  );
  const sellerReturnLabel = number(
    input.sellerReturnLabel,
    "Seller return label",
    RETURNS_DEFAULTS.sellerReturnLabel,
  );
  const restockMinutes = number(
    input.restockMinutes,
    "Restock minutes",
    RETURNS_DEFAULTS.restockMinutes,
  );
  const restockHourlyWage = number(
    input.restockHourlyWage,
    "Restock hourly wage",
    RETURNS_DEFAULTS.restockHourlyWage,
  );
  const unsellableReturnPct = takePercent(
    input.unsellableReturnPct,
    "Unsellable return percent",
    RETURNS_DEFAULTS.unsellableReturnPct,
  );
  const referralRefunded = flag(
    input.referralRefunded,
    "Referral refunded",
    RETURNS_DEFAULTS.referralRefunded,
  );
  const fulfillmentRefunded = flag(
    input.fulfillmentRefunded,
    "Fulfillment refunded",
    RETURNS_DEFAULTS.fulfillmentRefunded,
  );
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 60);
  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");

  const listing = calculateListing(input);
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const restockLabor = (restockMinutes / 60) * restockHourlyWage;
  const unsellableFrac = unsellableReturnPct / 100;
  const returnFrac = returnRatePct / 100;
  const keptFrac = 1 - returnFrac;

  const wfsSunk = listing.wfs.cashInvested - costOfGoods
    + (fulfillmentRefunded ? 0 : listing.fulfillmentFee)
    + (referralRefunded ? 0 : listing.referral);
  const sellerSunk = listing.seller.cashInvested - costOfGoods
    + (referralRefunded ? 0 : listing.referral);
  const wfsRestockable = -wfsSunk - wfsReturnFee;
  const sellerRestockable = -sellerSunk - sellerReturnLabel - restockLabor;
  const wfsReturnLeftover = wfsRestockable - unsellableFrac * costOfGoods;
  const sellerReturnLeftover = sellerRestockable - unsellableFrac * costOfGoods;

  const wfsCompleted = listing.wfs.profit;
  const sellerCompleted = listing.seller.profit;
  const wfsExpected = keptFrac * wfsCompleted + returnFrac * wfsReturnLeftover;
  const sellerExpected = keptFrac * sellerCompleted + returnFrac * sellerReturnLeftover;
  const wfsMonthly = wfsExpected * monthlyUnits;
  const sellerMonthly = sellerExpected * monthlyUnits;
  const extraWfsVsSeller = wfsExpected - sellerExpected;
  const monthlyExtraOnWfs = extraWfsVsSeller * monthlyUnits;

  const wfs = returnsPath({
    id: "wfs",
    label: "WFS after returns",
    completedProfit: wfsCompleted,
    returnLeftover: wfsReturnLeftover,
    expectedProfit: wfsExpected,
    monthlyProfit: wfsMonthly,
  });
  const seller = returnsPath({
    id: "seller",
    label: "Seller fulfilled after returns",
    completedProfit: sellerCompleted,
    returnLeftover: sellerReturnLeftover,
    expectedProfit: sellerExpected,
    monthlyProfit: sellerMonthly,
  });

  const rows = [wfs, seller].map((row) => ({
    ...row,
    vsSeller: row.expectedProfit - sellerExpected,
  }));

  const bestExpected = Math.max(wfsExpected, sellerExpected);
  const leaders = [
    { id: "wfs", value: wfsExpected },
    { id: "seller", value: sellerExpected },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const completedGap = wfsCompleted - sellerCompleted;
  const completedWinner = completedGap > 1e-9
    ? "wfs"
    : completedGap < -1e-9
      ? "seller"
      : "tie";

  // (1-r)Pw + r Rw = (1-r)Ps + r Rs  →  r = (Pw-Ps) / ((Pw-Rw)-(Ps-Rs))
  const denom = (wfsCompleted - wfsReturnLeftover) - (sellerCompleted - sellerReturnLeftover);
  let breakEvenReturnPct = Infinity;
  if (Math.abs(denom) > 1e-12) {
    const raw = ((wfsCompleted - sellerCompleted) / denom) * 100;
    if (raw >= -1e-9 && raw <= 100 + 1e-9) {
      breakEvenReturnPct = Math.max(0, Math.min(100, raw));
    }
  }

  let breakEvenWfsReturnFee = Infinity;
  if (returnFrac > 1e-12) {
    const neededReturn = (sellerExpected - keptFrac * wfsCompleted) / returnFrac;
    breakEvenWfsReturnFee = wfsRestockable - unsellableFrac * costOfGoods - neededReturn;
    if (!Number.isFinite(breakEvenWfsReturnFee)) breakEvenWfsReturnFee = Infinity;
  }

  return {
    rows,
    wfs: rows[0],
    seller: rows[1],
    winner,
    completedWinner,
    monthlyUnits,
    returnRatePct,
    wfsReturnFee,
    sellerReturnLabel,
    restockMinutes,
    restockHourlyWage,
    restockLabor,
    unsellableReturnPct,
    referralRefunded,
    fulfillmentRefunded,
    extraWfsVsSeller,
    monthlyExtraOnWfs,
    breakEvenReturnPct,
    breakEvenWfsReturnFee,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    summary: returnsSummary({
      winner,
      wfs: rows[0],
      seller: rows[1],
      extraWfsVsSeller,
      monthlyExtraOnWfs,
      monthlyUnits,
      returnRatePct,
      breakEvenReturnPct,
      completedWinner,
    }),
  };
}

export function returnsNote(comparison) {
  if (!comparison?.wfs || !comparison?.seller) {
    throw new Error("Returns comparison is missing rows");
  }
  return comparison.summary;
}

function agedWfsKeepPath({
  units,
  sellThroughPct,
  horizonMonths,
  storagePerUnitMonth,
  contribution,
}) {
  let remaining = units;
  let cash = 0;
  let soldTotal = 0;
  let carryingFees = 0;
  for (let month = 0; month < horizonMonths; month += 1) {
    const fees = remaining * storagePerUnitMonth;
    cash -= fees;
    carryingFees += fees;
    const sold = remaining * (sellThroughPct / 100);
    cash += sold * contribution;
    soldTotal += sold;
    remaining -= sold;
  }
  return { cash, remaining, soldTotal, carryingFees };
}

function agedWfsBreakEvenSellThrough(targetCash, args) {
  if (agedWfsKeepPath({ ...args, sellThroughPct: 100 }).cash + 1e-9 < targetCash) {
    return Infinity;
  }
  if (agedWfsKeepPath({ ...args, sellThroughPct: 0 }).cash >= targetCash - 1e-9) {
    return 0;
  }
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (agedWfsKeepPath({ ...args, sellThroughPct: mid }).cash >= targetCash) hi = mid;
    else lo = mid;
  }
  return hi;
}

function agedWfsPath({
  id,
  label,
  cash,
  leftoverUnits,
  soldUnits,
  carryingFees,
}) {
  return { id, label, cash, leftoverUnits, soldUnits, carryingFees };
}

function agedWfsSummary({
  winner,
  keep,
  remove,
  dispose,
  extraRemoveVsKeep,
  leftoverUnits,
  horizonMonths,
  breakEvenSellThroughVsRemove,
  breakEvenAgedRateVsRemove,
}) {
  const keepCash = moneyLabel(keep.cash);
  const removeCash = moneyLabel(remove.cash);
  const disposeCash = moneyLabel(dispose.cash);
  const gap = moneyLabel(Math.abs(extraRemoveVsKeep));
  const pile = `${leftoverUnits} leftover unit${leftoverUnits === 1 ? "" : "s"}`;
  const months = `${horizonMonths} month${horizonMonths === 1 ? "" : "s"}`;
  const floor = Number.isFinite(breakEvenSellThroughVsRemove)
    ? `${breakEvenSellThroughVsRemove.toFixed(1)}%`
    : "an unreachable sell-through";
  const rateBit = Number.isFinite(breakEvenAgedRateVsRemove) && breakEvenAgedRateVsRemove > 1e-9
    ? ` Aged storage can fall to about $${breakEvenAgedRateVsRemove.toFixed(2)}/cu ft before keeping matches.`
    : "";

  if (winner === "remove") {
    return (
      `Pulling the ${pile} and selling them seller fulfilled keeps ${gap} more ` +
      `than leaving them in WFS over ${months} (${removeCash} vs ${keepCash}). ` +
      `Disposing is ${disposeCash}. Keeping matches if monthly sell-through ` +
      `rises to about ${floor}.${rateBit}`
    );
  }
  if (winner === "keep") {
    return (
      `Leaving the ${pile} in WFS keeps ${gap} more than pulling them over ` +
      `${months} (${keepCash} vs ${removeCash}). Disposing is ${disposeCash}. ` +
      `Keeping still wins down to about ${floor} monthly sell-through.`
    );
  }
  if (winner === "dispose") {
    return (
      `Disposing the ${pile} loses ${gap} less than leaving them in WFS over ` +
      `${months} (${disposeCash} vs ${keepCash}). Pulling them is ${removeCash}. ` +
      `Keeping needs about ${floor} monthly sell-through to match a removal.`
    );
  }
  return (
    `Keeping the ${pile} in WFS, pulling them to sell yourself, and disposing ` +
    `leave the same cash on these rates over ${months}.`
  );
}

// Units already inbound to WFS are a different decision from a new
// listing. Inbound, past storage, and cost of goods are sunk. Aged
// WFS storage is a higher per-cubic-foot rate on what is still there.
// Complementary to the completed-sale WFS vs seller table (which
// assumes you are about to inbound a fresh unit), to 2-day take
// (Buy Box win vs miss), and to returns (a sold order that comes
// back). Defaults are illustrative — overwrite the leftover count,
// sell-through, aged rate, and removal fee from Seller Center.
export const AGED_WFS_DEFAULTS = {
  leftoverUnits: 40,
  monthlySellThroughPct: 12,
  horizonMonths: 4,
  agedStorageRate: STORAGE_PRESETS.long_term.perCuFt,
  removalFee: 1.25,
  disposalFee: 0.35,
};

/**
 * Same leftover WFS pile, three cash paths:
 *   - Keep — expected WFS sales at the typed monthly sell-through,
 *     minus aged storage on what is still sitting.
 *   - Remove and sell yourself — pay the removal fee, then keep the
 *     seller-fulfilled leftover on every unit (inbound already paid).
 *   - Dispose — pay the cheaper disposal fee; the units are gone.
 * Contribution ignores sunk inbound, past storage, and cost of goods.
 */
export function compareAgedWfs(input = {}) {
  const leftoverUnits = number(
    input.leftoverUnits,
    "Leftover units",
    AGED_WFS_DEFAULTS.leftoverUnits,
  );
  if (leftoverUnits === 0) throw new Error("Leftover units must be greater than zero");
  const monthlySellThroughPct = takePercent(
    input.monthlySellThroughPct,
    "Monthly sell-through percent",
    AGED_WFS_DEFAULTS.monthlySellThroughPct,
  );
  const horizonMonths = number(
    input.horizonMonths,
    "Horizon months",
    AGED_WFS_DEFAULTS.horizonMonths,
  );
  if (horizonMonths === 0) throw new Error("Horizon months must be greater than zero");
  const agedStorageRate = number(
    input.agedStorageRate,
    "Aged storage rate",
    AGED_WFS_DEFAULTS.agedStorageRate,
  );
  const removalFee = number(
    input.removalFee,
    "Removal fee",
    AGED_WFS_DEFAULTS.removalFee,
  );
  const disposalFee = number(
    input.disposalFee,
    "Disposal fee",
    AGED_WFS_DEFAULTS.disposalFee,
  );

  const listing = calculateListing(input);
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const sellerShippingCost = number(input.sellerShippingCost, "Seller shipping cost", 4.5);
  const keepContribution = listing.salePrice - listing.referral - listing.fulfillmentFee - adsPerUnit;
  const sellerContribution = listing.salePrice - listing.referral - sellerShippingCost - packagingCost - adsPerUnit;
  const storagePerUnitMonth = listing.cubicFeet * agedStorageRate;

  const keepPath = agedWfsKeepPath({
    units: leftoverUnits,
    sellThroughPct: monthlySellThroughPct,
    horizonMonths,
    storagePerUnitMonth,
    contribution: keepContribution,
  });
  const removeCash = leftoverUnits * (sellerContribution - removalFee);
  const disposeCash = -disposalFee * leftoverUnits;

  const keep = agedWfsPath({
    id: "keep",
    label: "Keep in WFS",
    cash: keepPath.cash,
    leftoverUnits: keepPath.remaining,
    soldUnits: keepPath.soldTotal,
    carryingFees: keepPath.carryingFees,
  });
  const remove = agedWfsPath({
    id: "remove",
    label: "Remove and sell yourself",
    cash: removeCash,
    leftoverUnits: 0,
    soldUnits: leftoverUnits,
    carryingFees: 0,
  });
  const dispose = agedWfsPath({
    id: "dispose",
    label: "Dispose",
    cash: disposeCash,
    leftoverUnits: 0,
    soldUnits: 0,
    carryingFees: 0,
  });

  const rows = [keep, remove, dispose].map((row) => ({
    ...row,
    vsKeep: row.cash - keep.cash,
  }));

  const bestCash = Math.max(keep.cash, removeCash, disposeCash);
  const leaders = [
    { id: "keep", value: keep.cash },
    { id: "remove", value: removeCash },
    { id: "dispose", value: disposeCash },
  ].filter((row) => Math.abs(row.value - bestCash) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const keepArgs = {
    units: leftoverUnits,
    sellThroughPct: monthlySellThroughPct,
    horizonMonths,
    storagePerUnitMonth,
    contribution: keepContribution,
  };
  const breakEvenSellThroughVsRemove = agedWfsBreakEvenSellThrough(removeCash, keepArgs);
  const extraRemoveVsKeep = removeCash - keep.cash;

  let breakEvenAgedRateVsRemove = Infinity;
  if (listing.cubicFeet > 1e-12) {
    const atZero = agedWfsKeepPath({ ...keepArgs, storagePerUnitMonth: 0 });
    if (atZero.cash + 1e-9 < removeCash) {
      breakEvenAgedRateVsRemove = 0;
    } else {
      let lo = 0;
      let hi = 1;
      const rateArgs = (rate) => ({
        ...keepArgs,
        storagePerUnitMonth: listing.cubicFeet * rate,
      });
      while (agedWfsKeepPath(rateArgs(hi)).cash > removeCash && hi < 1e6) hi *= 2;
      if (agedWfsKeepPath(rateArgs(hi)).cash > removeCash) {
        breakEvenAgedRateVsRemove = Infinity;
      } else {
        for (let i = 0; i < 48; i += 1) {
          const mid = (lo + hi) / 2;
          if (agedWfsKeepPath(rateArgs(mid)).cash >= removeCash) lo = mid;
          else hi = mid;
        }
        breakEvenAgedRateVsRemove = lo;
      }
    }
  }

  return {
    rows,
    keep: rows[0],
    remove: rows[1],
    dispose: rows[2],
    winner,
    leftoverUnits,
    monthlySellThroughPct,
    horizonMonths,
    agedStorageRate,
    removalFee,
    disposalFee,
    keepContribution,
    sellerContribution,
    storagePerUnitMonth,
    cubicFeet: listing.cubicFeet,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    extraRemoveVsKeep,
    extraRemoveVsDispose: removeCash - disposeCash,
    extraKeepVsDispose: keep.cash - disposeCash,
    breakEvenSellThroughVsRemove,
    breakEvenAgedRateVsRemove,
    summary: agedWfsSummary({
      winner,
      keep: rows[0],
      remove: rows[1],
      dispose: rows[2],
      extraRemoveVsKeep,
      leftoverUnits,
      horizonMonths,
      breakEvenSellThroughVsRemove,
      breakEvenAgedRateVsRemove,
    }),
  };
}

export function agedWfsNote(comparison) {
  if (!comparison?.keep || !comparison?.remove || !comparison?.dispose) {
    throw new Error("Aged WFS comparison is missing rows");
  }
  return comparison.summary;
}

// Walmart Connect Sponsored Products is billed as CPC; sellers
// think in ACOS (ad spend / attributed sales). The listing
// adsPerUnit line is a flat leftover on a completed sale — it
// cannot show extra units ads buy, or last-click billing on
// organic sales you already had. Complementary to WFS vs seller
// (fulfillment), 2-day (Buy Box take), returns (a refund), and
// aged leftover (units already inbound). Defaults are
// illustrative — overwrite ACOS, extra units, and attribution
// from Ads Manager.
export const WALMART_ADS_DEFAULTS = {
  acosPct: 15,
  extraAdUnits: 12,
  attributedOrganicPct: 40,
  highAcosPct: 25,
  highExtraAdUnits: 22,
  highAttributedOrganicPct: 50,
};

function adsPath({
  id,
  label,
  acosPct,
  extraAdUnits,
  attributedOrganicUnits,
  adSpendPerUnit,
  billedUnits,
  adSpend,
  cash,
}) {
  return {
    id,
    label,
    acosPct,
    extraAdUnits,
    attributedOrganicUnits,
    adSpendPerUnit,
    billedUnits,
    adSpend,
    cash,
  };
}

function adsCash({
  organicUnits,
  organicProfit,
  extraAdUnits,
  attributedOrganicUnits,
  adSpendPerUnit,
}) {
  return (
    organicUnits * organicProfit +
    extraAdUnits * organicProfit -
    (attributedOrganicUnits + extraAdUnits) * adSpendPerUnit
  );
}

function adsSummary({
  winner,
  skip,
  sponsored,
  higher,
  extraSponsoredVsSkip,
  extraHigherVsSkip,
  organicUnits,
  breakEvenAcosPct,
  breakEvenExtraAdUnits,
  breakEvenAttributedOrganicPct,
}) {
  const skipKeep = moneyLabel(skip.cash);
  const adsKeep = moneyLabel(sponsored.cash);
  const highKeep = moneyLabel(higher.cash);
  const adsGap = moneyLabel(Math.abs(extraSponsoredVsSkip));
  const highGap = moneyLabel(Math.abs(extraHigherVsSkip));
  const acosCeil = Number.isFinite(breakEvenAcosPct)
    ? `${breakEvenAcosPct.toFixed(1)}%`
    : "an unreachable ACOS";
  const extraFloor = Number.isFinite(breakEvenExtraAdUnits)
    ? breakEvenExtraAdUnits.toFixed(1)
    : "an unreachable extra-unit count";
  const attrCeil = Number.isFinite(breakEvenAttributedOrganicPct)
    ? `${breakEvenAttributedOrganicPct.toFixed(1)}%`
    : "an unreachable attribution rate";
  const volume = `${organicUnits} organic unit${organicUnits === 1 ? "" : "s"}`;

  if (winner === "sponsored") {
    return (
      `Sponsored Products keeps ${adsGap} more than skipping ads ` +
      `(${adsKeep} vs ${skipKeep}) on ${volume}. ` +
      `ACOS can rise to about ${acosCeil} before skip matches. ` +
      `The higher-ACOS campaign is ${highKeep}.`
    );
  }
  if (winner === "higher") {
    return (
      `The higher-ACOS campaign keeps ${highGap} more than skipping ads ` +
      `(${highKeep} vs ${skipKeep}) on ${volume}. ` +
      `Sponsored Products is ${adsKeep}.`
    );
  }
  if (winner === "skip") {
    return (
      `Skipping Walmart Connect keeps ${adsGap} more than Sponsored Products ` +
      `(${skipKeep} vs ${adsKeep}) on ${volume}. ` +
      `Ads match if ACOS falls to about ${acosCeil}, extra units rise to ` +
      `about ${extraFloor}, or last-click attribution on organic falls to ` +
      `about ${attrCeil}. The higher-ACOS campaign is ${highKeep}.`
    );
  }
  return "Skipping Walmart Connect and running Sponsored Products leave the same leftover on these rates.";
}

/**
 * Same listing, three ways to buy Walmart traffic: skip ads,
 * run Sponsored Products at a typed ACOS, or spend harder at a
 * higher ACOS. Organic leftover is take-home on the selected
 * fulfillment path with adsPerUnit forced to zero so the page
 * form does not double-count. Ad spend is ACOS% × sale price
 * on last-click billed units (a share of organic plus extra
 * ad units). monthlyUnits is treated as organic completed volume.
 */
export function compareWalmartAds(input = {}) {
  const acosPct = takePercent(input.acosPct, "Sponsored Products ACOS", WALMART_ADS_DEFAULTS.acosPct);
  const extraAdUnits = number(
    input.extraAdUnits,
    "Extra ad units",
    WALMART_ADS_DEFAULTS.extraAdUnits,
  );
  const attributedOrganicPct = takePercent(
    input.attributedOrganicPct,
    "Attributed organic percent",
    WALMART_ADS_DEFAULTS.attributedOrganicPct,
  );
  const highAcosPct = takePercent(
    input.highAcosPct,
    "Higher ACOS",
    WALMART_ADS_DEFAULTS.highAcosPct,
  );
  const highExtraAdUnits = number(
    input.highExtraAdUnits,
    "Higher-ACOS extra units",
    WALMART_ADS_DEFAULTS.highExtraAdUnits,
  );
  const highAttributedOrganicPct = takePercent(
    input.highAttributedOrganicPct,
    "Higher-ACOS attributed organic percent",
    WALMART_ADS_DEFAULTS.highAttributedOrganicPct,
  );
  const organicUnits = number(input.monthlyUnits, "Monthly units", 60);
  if (organicUnits === 0) throw new Error("Monthly units must be greater than zero");

  const listing = calculateListing({ ...input, adsPerUnit: 0 });
  const organicProfit = listing.selected.profit;
  const salePrice = listing.salePrice;
  const adSpendPerUnit = salePrice * (acosPct / 100);
  const highAdSpendPerUnit = salePrice * (highAcosPct / 100);
  const attributedOrganicUnits = organicUnits * (attributedOrganicPct / 100);
  const highAttributedOrganicUnits = organicUnits * (highAttributedOrganicPct / 100);

  const skipCash = adsCash({
    organicUnits,
    organicProfit,
    extraAdUnits: 0,
    attributedOrganicUnits: 0,
    adSpendPerUnit: 0,
  });
  const sponsoredCash = adsCash({
    organicUnits,
    organicProfit,
    extraAdUnits,
    attributedOrganicUnits,
    adSpendPerUnit,
  });
  const higherCash = adsCash({
    organicUnits,
    organicProfit,
    extraAdUnits: highExtraAdUnits,
    attributedOrganicUnits: highAttributedOrganicUnits,
    adSpendPerUnit: highAdSpendPerUnit,
  });

  const skip = adsPath({
    id: "skip",
    label: "Skip Walmart Connect",
    acosPct: 0,
    extraAdUnits: 0,
    attributedOrganicUnits: 0,
    adSpendPerUnit: 0,
    billedUnits: 0,
    adSpend: 0,
    cash: skipCash,
  });
  const sponsored = adsPath({
    id: "sponsored",
    label: "Sponsored Products",
    acosPct,
    extraAdUnits,
    attributedOrganicUnits,
    adSpendPerUnit,
    billedUnits: attributedOrganicUnits + extraAdUnits,
    adSpend: (attributedOrganicUnits + extraAdUnits) * adSpendPerUnit,
    cash: sponsoredCash,
  });
  const higher = adsPath({
    id: "higher",
    label: "Higher ACOS campaign",
    acosPct: highAcosPct,
    extraAdUnits: highExtraAdUnits,
    attributedOrganicUnits: highAttributedOrganicUnits,
    adSpendPerUnit: highAdSpendPerUnit,
    billedUnits: highAttributedOrganicUnits + highExtraAdUnits,
    adSpend: (highAttributedOrganicUnits + highExtraAdUnits) * highAdSpendPerUnit,
    cash: higherCash,
  });

  const extraSponsoredVsSkip = sponsoredCash - skipCash;
  const extraHigherVsSkip = higherCash - skipCash;
  const rows = [skip, sponsored, higher].map((row) => ({
    ...row,
    vsSkip: row.cash - skipCash,
  }));

  const bestCash = Math.max(skipCash, sponsoredCash, higherCash);
  const leaders = [
    { id: "skip", value: skipCash },
    { id: "sponsored", value: sponsoredCash },
    { id: "higher", value: higherCash },
  ].filter((row) => Math.abs(row.value - bestCash) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const billedSponsored = attributedOrganicUnits + extraAdUnits;
  let breakEvenAcosPct = Infinity;
  if (billedSponsored > 1e-12 && salePrice > 1e-12) {
    breakEvenAcosPct = (extraAdUnits * organicProfit * 100) / (billedSponsored * salePrice);
    if (breakEvenAcosPct < -1e-9) breakEvenAcosPct = Infinity;
  } else if (extraAdUnits === 0 && attributedOrganicUnits === 0) {
    breakEvenAcosPct = Infinity;
  }

  let breakEvenExtraAdUnits = Infinity;
  const extraMargin = organicProfit - adSpendPerUnit;
  if (extraMargin > 1e-12) {
    breakEvenExtraAdUnits = (attributedOrganicUnits * adSpendPerUnit) / extraMargin;
    if (breakEvenExtraAdUnits < 0) breakEvenExtraAdUnits = 0;
  } else if (attributedOrganicUnits * adSpendPerUnit <= 1e-12) {
    breakEvenExtraAdUnits = 0;
  }

  let breakEvenAttributedOrganicPct = Infinity;
  if (organicUnits > 1e-12 && adSpendPerUnit > 1e-12) {
    breakEvenAttributedOrganicPct =
      (extraAdUnits * extraMargin * 100) / (organicUnits * adSpendPerUnit);
    // Attribution is a share of organic units, so a crossing above 100% is as
    // unreachable as one below 0%. Clamping the high side to exactly 100 used
    // to report a tie at full attribution when ads in fact still win there.
    if (
      breakEvenAttributedOrganicPct < -1e-9 ||
      breakEvenAttributedOrganicPct > 100 + 1e-9
    ) {
      breakEvenAttributedOrganicPct = Infinity;
    } else {
      breakEvenAttributedOrganicPct = Math.max(0, Math.min(100, breakEvenAttributedOrganicPct));
    }
  }
  // Free clicks (0% ACOS) have no attribution rate that ties skipping: with no
  // ad spend the gap is `extra units × organic leftover` whatever share of
  // organic the ads claim, so the two paths never cross. This used to report
  // exactly 100%, which reads as a real, reachable answer — the worst of the
  // three possible outputs, since "unreachable" at least tells the truth.

  return {
    rows,
    skip: rows[0],
    sponsored: rows[1],
    higher: rows[2],
    winner,
    organicUnits,
    organicProfit,
    salePrice,
    fulfillmentMethod: listing.fulfillmentMethod,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    acosPct,
    extraAdUnits,
    attributedOrganicPct,
    highAcosPct,
    highExtraAdUnits,
    highAttributedOrganicPct,
    extraSponsoredVsSkip,
    extraHigherVsSkip,
    breakEvenAcosPct,
    breakEvenExtraAdUnits,
    breakEvenAttributedOrganicPct,
    summary: adsSummary({
      winner,
      skip: rows[0],
      sponsored: rows[1],
      higher: rows[2],
      extraSponsoredVsSkip,
      extraHigherVsSkip,
      organicUnits,
      breakEvenAcosPct,
      breakEvenExtraAdUnits,
      breakEvenAttributedOrganicPct,
    }),
  };
}

export function walmartAdsNote(comparison) {
  if (!comparison?.skip || !comparison?.sponsored || !comparison?.higher) {
    throw new Error("Walmart ads comparison is missing rows");
  }
  return comparison.summary;
}

function matchTakePath({
  id,
  label,
  takePct,
  salePrice,
  completedProfit,
  expectedProfit,
  monthlyProfit,
}) {
  return {
    id,
    label,
    takePct,
    salePrice,
    completedProfit,
    expectedProfit,
    monthlyProfit,
  };
}

function matchTakeSummary({
  winner,
  hold,
  match,
  promo,
  extraMatchVsHold,
  extraPromoVsHold,
  extraMatchVsPromo,
  monthlyUnits,
  breakEvenMatchTakePct,
  breakEvenPromoDays,
  breakEvenMatchPrice,
  matchTakeIsCeiling,
}) {
  const holdKeep = moneyLabel(hold.monthlyProfit);
  const matchKeep = moneyLabel(match.monthlyProfit);
  const promoKeep = moneyLabel(promo.monthlyProfit);
  const matchGap = moneyLabel(Math.abs(extraMatchVsHold));
  const promoGap = moneyLabel(Math.abs(extraPromoVsHold));
  const vsPromo = moneyLabel(Math.abs(extraMatchVsPromo));
  const volume = `${monthlyUnits} completed sale${monthlyUnits === 1 ? "" : "s"} at the hold take`;
  const takeFloor = Number.isFinite(breakEvenMatchTakePct)
    ? `${breakEvenMatchTakePct.toFixed(1)}%`
    : "an unreachable match take";
  const dayFloor = Number.isFinite(breakEvenPromoDays)
    ? `${breakEvenPromoDays.toFixed(1)} promo days`
    : "an unreachable promo length";
  const priceFloor = Number.isFinite(breakEvenMatchPrice)
    ? moneyLabel(breakEvenMatchPrice)
    : "an unreachable match price";
  // A matched sale that loses money gets worse as take rises, so the crossing
  // is the rate matching stops winning at rather than the one it starts at.
  const matchTakeMoves = matchTakeIsCeiling ? "rises" : "falls";
  const holdTakeMoves = matchTakeIsCeiling ? "falls" : "rises";

  if (winner === "match") {
    return (
      `Permanently matching keeps ${matchGap} more than holding the list price ` +
      `(${matchKeep} vs ${holdKeep}) on ${volume}. ` +
      `A time-boxed promo is ${promoKeep}, ${vsPromo} behind the match. ` +
      `The promo matches a permanent drop at about ${dayFloor}. ` +
      `Holding matches if match take ${matchTakeMoves} to about ${takeFloor}.`
    );
  }
  if (winner === "promo") {
    return (
      `A time-boxed promo keeps ${promoGap} more than holding the list price ` +
      `(${promoKeep} vs ${holdKeep}) on ${volume}. ` +
      `A permanent match is ${matchKeep}. ` +
      `The promo still beats a permanent drop down to about ${dayFloor}. ` +
      `Holding matches if match take ${matchTakeMoves} to about ${takeFloor}.`
    );
  }
  if (winner === "hold") {
    return (
      `Holding the list price keeps ${matchGap} more than permanently matching ` +
      `(${holdKeep} vs ${matchKeep}) on ${volume}. ` +
      `A time-boxed promo is ${promoKeep}. ` +
      `Matching wins if take ${holdTakeMoves} to about ${takeFloor} ` +
      `or the match price stays above about ${priceFloor}.`
    );
  }
  return "Holding the list price, permanently matching, and a time-boxed promo leave the same leftover on these rates.";
}

// The main calculator's match view holds take fixed: same sessions,
// lower ticket. Walmart's Buy Box does not. A lower offer usually
// converts more of the people who already saw the listing; a
// permanent match also lets competitors react, so take often rises
// less than a short promo. Complementary to the unit-profit match
// (same take), to 2-day (fulfillment vs take, price held), to
// Connect ads (buying traffic, price held), to returns (a refund),
// and to aged leftover (units already inbound). Defaults are
// illustrative — overwrite the match price and take rates from
// Seller Center.
export const MATCH_TAKE_DEFAULTS = {
  holdTakePct: 40,
  matchPrice: 21.99,
  matchTakePct: 70,
  promoTakePct: 80,
  promoDays: 10,
  monthDays: 30,
};

/**
 * Same listing, three ways to answer a lower competing offer:
 *   - Hold the list price at the current (usually lower) take.
 *   - Permanently match — lower ticket every day, mid take after
 *     competitors react.
 *   - Time-boxed promo — match-price leftover at a higher take for
 *     N days, then revert to the hold mix.
 * monthlyUnits is treated as completed sales at the hold take, so
 * sessions = units / hold take. Expected leftover is
 * take% × completed-sale profit on the selected fulfillment path.
 */
export function compareMatchTake(input = {}) {
  const holdTakePct = takePercent(
    input.holdTakePct,
    "Hold take percent",
    MATCH_TAKE_DEFAULTS.holdTakePct,
  );
  const matchPrice = number(
    input.matchPrice,
    "Match price",
    MATCH_TAKE_DEFAULTS.matchPrice,
  );
  const matchTakePct = takePercent(
    input.matchTakePct,
    "Match take percent",
    MATCH_TAKE_DEFAULTS.matchTakePct,
  );
  const promoTakePct = takePercent(
    input.promoTakePct,
    "Promo take percent",
    MATCH_TAKE_DEFAULTS.promoTakePct,
  );
  const promoDays = number(
    input.promoDays,
    "Promo days",
    MATCH_TAKE_DEFAULTS.promoDays,
  );
  const monthDays = number(
    input.monthDays,
    "Month days",
    MATCH_TAKE_DEFAULTS.monthDays,
  );
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 60);

  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");
  if (holdTakePct === 0) throw new Error("Hold take percent must be greater than zero");
  if (monthDays === 0) throw new Error("Month days must be greater than zero");
  if (promoDays > monthDays) throw new Error("Promo days cannot exceed month days");

  const listing = calculateListing({ ...input, matchPrice: undefined });
  const matched = listingAtPrice(input, matchPrice);
  const holdCompleted = listing.selected.profit;
  const matchCompleted = matched.selected.profit;
  const sessions = monthlyUnits / (holdTakePct / 100);
  const holdExpected = (holdTakePct / 100) * holdCompleted;
  const matchExpected = (matchTakePct / 100) * matchCompleted;
  const promoPeriodExpected = (promoTakePct / 100) * matchCompleted;
  const promoFrac = promoDays / monthDays;
  const promoExpected = promoFrac * promoPeriodExpected + (1 - promoFrac) * holdExpected;
  const holdMonthly = holdExpected * sessions;
  const matchMonthly = matchExpected * sessions;
  const promoMonthly = promoExpected * sessions;

  const hold = matchTakePath({
    id: "hold",
    label: "Hold list price",
    takePct: holdTakePct,
    salePrice: listing.salePrice,
    completedProfit: holdCompleted,
    expectedProfit: holdExpected,
    monthlyProfit: holdMonthly,
  });
  const match = matchTakePath({
    id: "match",
    label: "Permanent match",
    takePct: matchTakePct,
    salePrice: matchPrice,
    completedProfit: matchCompleted,
    expectedProfit: matchExpected,
    monthlyProfit: matchMonthly,
  });
  const promo = matchTakePath({
    id: "promo",
    label: "Time-boxed promo",
    takePct: promoTakePct,
    salePrice: matchPrice,
    completedProfit: matchCompleted,
    expectedProfit: promoExpected,
    monthlyProfit: promoMonthly,
  });

  const extraMatchVsHold = matchMonthly - holdMonthly;
  const extraPromoVsHold = promoMonthly - holdMonthly;
  const extraMatchVsPromo = matchMonthly - promoMonthly;
  const rows = [hold, match, promo].map((row) => ({
    ...row,
    vsHold: row.monthlyProfit - holdMonthly,
  }));

  const bestMonthly = Math.max(holdMonthly, matchMonthly, promoMonthly);
  const leaders = [
    { id: "hold", value: holdMonthly },
    { id: "match", value: matchMonthly },
    { id: "promo", value: promoMonthly },
  ].filter((row) => Math.abs(row.value - bestMonthly) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const matchCrossing = takeRateCrossing(holdExpected, matchCompleted);
  const breakEvenMatchTakePct = matchCrossing.rate;

  let breakEvenPromoDays = Infinity;
  const promoLift = promoPeriodExpected - holdExpected;
  if (Math.abs(promoLift) > 1e-12) {
    const rawDays = ((matchExpected - holdExpected) / promoLift) * monthDays;
    if (rawDays >= -1e-9 && rawDays <= monthDays + 1e-9) {
      breakEvenPromoDays = Math.max(0, Math.min(monthDays, rawDays));
    }
  }

  const matchedListing = matched;
  const otherFees = matchedListing.selected.feeTotal - matchedListing.referral;
  const neededCompleted = holdTakePct > 1e-12 && matchTakePct > 1e-12
    ? holdExpected / (matchTakePct / 100)
    : Infinity;
  let breakEvenMatchPrice = Infinity;
  if (Number.isFinite(neededCompleted)) {
    const cashInvested = matchedListing.selected.cashInvested;
    breakEvenMatchPrice = breakEvenSalePrice({
      fixedCash: neededCompleted + otherFees + cashInvested,
      referralRate: number(input.referralRate, "Referral rate", 15),
      referralMinimum: number(
        input.referralMinimum,
        "Referral minimum",
        DEFAULT_REFERRAL_MINIMUM,
      ),
    });
  }

  return {
    rows,
    hold: rows[0],
    match: rows[1],
    promo: rows[2],
    winner,
    sessions,
    monthlyUnits,
    holdTakePct,
    matchPrice,
    matchTakePct,
    promoTakePct,
    promoDays,
    monthDays,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    fulfillmentMethod: listing.fulfillmentMethod,
    extraMatchVsHold,
    extraPromoVsHold,
    extraMatchVsPromo,
    breakEvenMatchTakePct,
    // True when the matched sale loses money, so the rate above is a ceiling
    // matching stays ahead below, not a floor it has to climb to.
    matchTakeIsCeiling: matchCrossing.betterBelow,
    breakEvenPromoDays,
    breakEvenMatchPrice,
    summary: matchTakeSummary({
      winner,
      hold: rows[0],
      match: rows[1],
      promo: rows[2],
      extraMatchVsHold,
      extraPromoVsHold,
      extraMatchVsPromo,
      monthlyUnits,
      breakEvenMatchTakePct,
      matchTakeIsCeiling: matchCrossing.betterBelow,
      breakEvenPromoDays,
      breakEvenMatchPrice,
    }),
  };
}

export function matchTakeNote(comparison) {
  if (!comparison?.hold || !comparison?.match || !comparison?.promo) {
    throw new Error("Match-take comparison is missing rows");
  }
  return comparison.summary;
}

export function calculateListing(input) {
  const salePrice = number(input.salePrice, "Sale price");
  const listed = listingAtPrice(input, salePrice);
  const matchPriceRaw = input.matchPrice;
  const hasMatch =
    matchPriceRaw !== undefined && matchPriceRaw !== null && matchPriceRaw !== "";
  if (!hasMatch) {
    return { ...listed, match: null, matchDelta: null, matchStillProfitable: null };
  }

  const matchPrice = number(matchPriceRaw, "Match price");
  const matched = listingAtPrice(input, matchPrice);
  const matchDelta = matched.selected.profit - listed.selected.profit;
  return {
    ...listed,
    match: matched,
    matchPrice,
    matchDelta,
    matchStillProfitable: matched.selected.profit >= 0,
  };
}

// A repack is the one WFS lever that does not touch the price.
//
// Every other decision page here trades leftover against take rate: match the
// Buy Box, run ads, offer 2-day. This one leaves the listing alone. The WFS
// fulfillment fee is a step function of the shipped box — its longest, median
// and shortest sides and its billable weight — so a carton that is half an inch
// over on one side pays a whole tier more on every unit, forever, and nothing on
// the listing says so. `classifySizeTier` and `defaultFulfillmentFee` already
// encoded those steps and were being used only to price the box a seller
// already had.
//
// What the seller cannot see from Seller Center is *which* measurement is the
// one costing them. A carton at 19 × 13 × 7 and 3 lb is Oversize, and the fee
// preview shows one number; it does not say "the 19-inch side is the only thing
// keeping you out of Standard, and it is one inch." That single sentence is the
// product here, and it is why `sizeTierGaps` reports each side separately
// rather than a boolean.
export const WFS_BOX_DEFAULTS = {
  length: 19,
  width: 13,
  height: 7,
  weightLb: 3,
  newLength: 17.5,
  newWidth: 13,
  newHeight: 7,
  newWeightLb: 2.9,
  repackCostPerUnit: 0.35,
  monthlyUnits: 120,
};

/** The Standard-tier ceilings `classifySizeTier` enforces, named so a page can quote them. */
export const STANDARD_TIER_LIMITS = {
  longestIn: 18,
  medianIn: 14,
  shortestIn: 8,
  weightLb: 20,
};

/**
 * Why each box misses Standard, measurement by measurement.
 *
 * Returns one row per constraint with how much it is over (0 when it clears),
 * so a page can say "the longest side is 1 in over" instead of "not Standard".
 * A box already in Standard returns all-zero overages and `clears: true`, which
 * is the honest answer to "what should I shave?" — nothing.
 */
export function sizeTierGaps({ length, width, height, weightLb }) {
  const l = number(length, "Length");
  const w = number(width, "Width");
  const h = number(height, "Height");
  const weight = number(weightLb, "Weight");
  const [longest, median, shortest] = [l, w, h].sort((a, b) => b - a);

  const rows = [
    { id: "longest", label: "Longest side", value: longest, limit: STANDARD_TIER_LIMITS.longestIn, unit: "in" },
    { id: "median", label: "Median side", value: median, limit: STANDARD_TIER_LIMITS.medianIn, unit: "in" },
    { id: "shortest", label: "Shortest side", value: shortest, limit: STANDARD_TIER_LIMITS.shortestIn, unit: "in" },
    { id: "weight", label: "Weight", value: weight, limit: STANDARD_TIER_LIMITS.weightLb, unit: "lb" },
  ].map((row) => ({ ...row, over: Math.max(0, row.value - row.limit) }));

  const blocking = rows.filter((row) => row.over > 1e-9);
  return { rows, blocking, clears: blocking.length === 0 };
}

/**
 * The shipped box against a proposed repack, at the same price.
 *
 * Deliberately *not* a call to `calculateListing`: the listing's referral fee,
 * cost of goods and inbound cost are identical on both sides, so folding them in
 * would bury a $4 fulfillment step inside a $20 ticket and invite the reader to
 * compare two profits that differ by exactly the thing this page is about.
 * The comparison is the fulfillment fee and the repack cost, and nothing else.
 */
export function compareWfsBox(input = {}) {
  const current = {
    length: number(input.length, "Length", WFS_BOX_DEFAULTS.length),
    width: number(input.width, "Width", WFS_BOX_DEFAULTS.width),
    height: number(input.height, "Height", WFS_BOX_DEFAULTS.height),
    weightLb: number(input.weightLb, "Weight", WFS_BOX_DEFAULTS.weightLb),
  };
  const proposed = {
    length: number(input.newLength, "New length", WFS_BOX_DEFAULTS.newLength),
    width: number(input.newWidth, "New width", WFS_BOX_DEFAULTS.newWidth),
    height: number(input.newHeight, "New height", WFS_BOX_DEFAULTS.newHeight),
    weightLb: number(input.newWeightLb, "New weight", WFS_BOX_DEFAULTS.newWeightLb),
  };
  const repackCostPerUnit = number(
    input.repackCostPerUnit,
    "Repack cost per unit",
    WFS_BOX_DEFAULTS.repackCostPerUnit,
  );
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", WFS_BOX_DEFAULTS.monthlyUnits);
  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");

  const box = (dims, id, label) => {
    const tier = classifySizeTier(dims);
    return {
      id,
      label,
      ...dims,
      tier,
      tierLabel: SIZE_TIER_LABELS[tier],
      cubicFeet: cubicFeet(dims),
      fulfillmentFee: defaultFulfillmentFee(tier, dims.weightLb),
      gaps: sizeTierGaps(dims),
    };
  };

  const shipped = box(current, "current", "Box today");
  const repacked = box(proposed, "repacked", "Repacked box");

  const feeSaving = shipped.fulfillmentFee - repacked.fulfillmentFee;
  const netPerUnit = feeSaving - repackCostPerUnit;
  const monthlySaving = netPerUnit * monthlyUnits;
  const tierChanged = shipped.tier !== repacked.tier;

  // The repack cost the saving can absorb before the two are level. Negative
  // when the repack raises the fee — there is no cost that rescues that, and
  // reporting a negative break-even is more honest than clamping it to zero.
  const breakEvenRepackCost = feeSaving;

  // Volume is only meaningful when a per-unit gain exists to multiply.
  const breakEvenUnits = netPerUnit > 1e-9 ? 0 : Infinity;

  const winner = Math.abs(netPerUnit) <= 1e-9 ? "tie" : netPerUnit > 0 ? "repacked" : "current";

  return {
    rows: [shipped, repacked],
    current: shipped,
    repacked,
    winner,
    tierChanged,
    feeSaving,
    repackCostPerUnit,
    netPerUnit,
    monthlySaving,
    monthlyUnits,
    breakEvenRepackCost,
    breakEvenUnits,
    summary: wfsBoxSummary({
      winner,
      shipped,
      repacked,
      tierChanged,
      feeSaving,
      repackCostPerUnit,
      netPerUnit,
      monthlySaving,
      monthlyUnits,
      breakEvenRepackCost,
    }),
  };
}

function gapSentence(gaps) {
  if (gaps.clears) return "";
  const parts = gaps.blocking.map(
    (row) => `${row.label.toLowerCase()} is ${row.over.toFixed(2)} ${row.unit} over the ${row.limit} ${row.unit} Standard ceiling`,
  );
  if (parts.length === 1) return ` The only thing outside Standard is that its ${parts[0]}.`;
  return ` Outside Standard because its ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}

function wfsBoxSummary({
  winner,
  shipped,
  repacked,
  tierChanged,
  feeSaving,
  repackCostPerUnit,
  netPerUnit,
  monthlySaving,
  monthlyUnits,
  breakEvenRepackCost,
}) {
  const units = `${monthlyUnits} unit${monthlyUnits === 1 ? "" : "s"} a month`;
  const tierBit = tierChanged
    ? `The repack moves the box from ${shipped.tierLabel} to ${repacked.tierLabel}.`
    : `Both boxes bill as ${shipped.tierLabel}.`;
  const gapBit = gapSentence(repacked.gaps);

  // A repack that changes nothing is the most common real answer and the one a
  // tool is most tempted to dress up. Say it plainly, and say what would have
  // to change instead of implying the shaving was worth doing.
  if (Math.abs(feeSaving) <= 1e-9) {
    return (
      `${tierBit} The fulfillment fee is ${moneyLabel(shipped.fulfillmentFee)} either way, so the ` +
      `repack saves nothing and the ${moneyLabel(repackCostPerUnit)} of labour and materials is a ` +
      `straight loss of ${moneyLabel(Math.abs(monthlySaving))} across ${units}.${gapBit}`
    );
  }

  if (feeSaving < 0) {
    return (
      `${tierBit} The repacked box costs ${moneyLabel(Math.abs(feeSaving))} more per unit to fulfil, ` +
      `not less — before the ${moneyLabel(repackCostPerUnit)} repack. Across ${units} that is ` +
      `${moneyLabel(Math.abs(monthlySaving))} worse than shipping the box as it is.${gapBit}`
    );
  }

  const feeBit =
    `${tierBit} The fulfillment fee falls ${moneyLabel(feeSaving)} per unit, from ` +
    `${moneyLabel(shipped.fulfillmentFee)} to ${moneyLabel(repacked.fulfillmentFee)}.`;
  const floorBit =
    ` The repack pays for itself up to ${moneyLabel(breakEvenRepackCost)} a unit in labour and materials.`;

  if (winner === "repacked") {
    return (
      `${feeBit} After ${moneyLabel(repackCostPerUnit)} to repack, that is ${moneyLabel(netPerUnit)} ` +
      `a unit, or ${moneyLabel(monthlySaving)} across ${units}.${floorBit}${gapBit}`
    );
  }
  if (winner === "tie") {
    return `${feeBit} The ${moneyLabel(repackCostPerUnit)} repack costs exactly what it saves, so the two are level.${gapBit}`;
  }
  return (
    `${feeBit} But repacking costs ${moneyLabel(repackCostPerUnit)} a unit, which is more than the ` +
    `fee it saves — ${moneyLabel(Math.abs(netPerUnit))} a unit worse, or ` +
    `${moneyLabel(Math.abs(monthlySaving))} across ${units}.${floorBit}${gapBit}`
  );
}

export function wfsBoxNote(comparison) {
  if (!comparison?.current || !comparison?.repacked) {
    throw new Error("WFS box comparison is missing rows");
  }
  return comparison.summary;
}
