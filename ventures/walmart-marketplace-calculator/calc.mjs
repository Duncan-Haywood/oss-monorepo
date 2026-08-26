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

export const DEFAULT_REFERRAL_MINIMUM = 0.3;

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
    path.breakEvenBuyCost = Math.max(0, salePrice - path.feeTotal - (path.cashInvested - cogsInCash));
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
    return (
      `Seller-fulfilled standard shipping keeps ${standardGap} more per session than WFS ` +
      `(${standardKeep} vs ${wfsKeep}). 2-day is ${twoDayKeep}. ` +
      `Standard still needs about ${standardFloor} take to match WFS.`
    );
  }
  if (winner === "wfs") {
    return (
      `WFS keeps ${twoDayGap} more per session than seller-fulfilled 2-day ` +
      `(${wfsKeep} vs ${twoDayKeep}), ${monthGap} on ${volume}. ` +
      `2-day matches if the label falls to about ${shipCeil} ` +
      `or take rises to about ${twoDayFloor}. Standard is ${standardKeep}.`
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

  let breakEvenTwoDayTakePct = Infinity;
  if (twoDayCompleted > 1e-12) {
    breakEvenTwoDayTakePct = (wfsExpected / twoDayCompleted) * 100;
    if (breakEvenTwoDayTakePct < -1e-9 || breakEvenTwoDayTakePct > 100 + 1e-9) {
      breakEvenTwoDayTakePct = Infinity;
    } else {
      breakEvenTwoDayTakePct = Math.max(0, Math.min(100, breakEvenTwoDayTakePct));
    }
  }

  let breakEvenStandardTakePct = Infinity;
  if (standardCompleted > 1e-12) {
    breakEvenStandardTakePct = (wfsExpected / standardCompleted) * 100;
    if (breakEvenStandardTakePct < -1e-9 || breakEvenStandardTakePct > 100 + 1e-9) {
      breakEvenStandardTakePct = Infinity;
    } else {
      breakEvenStandardTakePct = Math.max(0, Math.min(100, breakEvenStandardTakePct));
    }
  }

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
    if (breakEvenAttributedOrganicPct < -1e-9) {
      breakEvenAttributedOrganicPct = Infinity;
    } else {
      breakEvenAttributedOrganicPct = Math.max(0, Math.min(100, breakEvenAttributedOrganicPct));
    }
  } else if (adSpendPerUnit <= 1e-12) {
    breakEvenAttributedOrganicPct = 100;
  }

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
