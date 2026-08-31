// Pure Amazon FBA vs FBM profit arithmetic. No network, no state.
// Category referral rates, size-tier fulfillment, and storage rates are
// illustrative defaults the seller can edit. The result is a transparent
// calculation from those inputs — not Amazon's live fee schedule.

export const CATEGORY_PRESETS = {
  clothing: { label: "Clothing & accessories", referralRate: 17 },
  jewelry: { label: "Jewelry", referralRate: 20 },
  electronics: { label: "Electronics", referralRate: 8 },
  grocery: { label: "Grocery & gourmet", referralRate: 8 },
  beauty: { label: "Beauty & personal care", referralRate: 8 },
  home: { label: "Home & kitchen", referralRate: 15 },
  toys: { label: "Toys & games", referralRate: 15 },
  sports: { label: "Sports & outdoors", referralRate: 15 },
  books: { label: "Books", referralRate: 15 },
  everything_else: { label: "Everything else", referralRate: 15 },
};

export const STORAGE_PRESETS = {
  off_peak: { label: "Jan–Sep (off-peak)", perCuFt: 0.87 },
  peak: { label: "Oct–Dec (peak)", perCuFt: 2.4 },
};

export const SIZE_TIER_LABELS = {
  small_standard: "Small standard",
  large_standard: "Large standard",
  large_bulky: "Large bulky",
  extra_large: "Extra-large",
};

// Illustrative 2025–26 US inbound placement mid-band defaults.
// Amazon charges a per-unit placement fee when a shipment is sent to fewer
// fulfillment centers than its "optimized" split. Sellers replace these with
// the fees on their current inbound-placement preview — this is not Amazon's
// live schedule.
export const PLACEMENT_PRESETS = {
  small_standard: { label: "Small standard", minimalPerUnit: 0.32, partialPerUnit: 0.21 },
  large_standard: { label: "Large standard", minimalPerUnit: 0.43, partialPerUnit: 0.27 },
  large_bulky: { label: "Large bulky", minimalPerUnit: 1.86, partialPerUnit: 1.11 },
  extra_large: { label: "Extra-large", minimalPerUnit: 3.12, partialPerUnit: 1.87 },
};

export const PLACEMENT_PATH_LABELS = {
  minimal: "Send to one warehouse",
  partial: "Partial split",
  optimized: "Amazon-optimized split",
};

const PLACEMENT_PATHS = /** @type {const} */ (["minimal", "partial", "optimized"]);

const FULFILLMENT_METHODS = new Set(["fba", "fbm"]);

/**
 * Every numeric input on the page, in the order the page asks for them.
 *
 * This lives here rather than in `index.html` so `share.mjs` and the page read
 * the same list. The alternative — an allowlist maintained beside the encoder —
 * is how a shared link silently loses a field: `where-to-sell-calculator`
 * shipped exactly that, dropping `quantity` and `targetMargin`, so the
 * recipient computed a different profit than the sender saw and nothing went
 * red. `share.test.mjs` also checks this list against the `id` attributes in
 * `index.html`, so a new input is shareable the day it ships.
 */
export const INPUT_FIELDS = [
  "salePrice", "referralRate", "length", "width", "height", "weightLb",
  "monthsInStorage", "storageRate", "fulfillmentFee", "costOfGoods",
  "inboundPerUnit", "fbmShippingCost", "fbmHandlingCost", "packagingCost", "adsPerUnit",
  "otherCost", "monthlySellerFee", "individualPerUnit", "monthlyUnits", "targetMargin",
  "returnRate", "returnHandlingFee", "unsellableReturnRate",
  "lowPriceThreshold", "lowPriceSalePrice", "raisePrice", "lowPriceFulfillmentFee",
  "couponPercent", "couponFixed", "couponFee", "couponLiftPct",
  "snsPercent", "snsEnrollPct",
  "dtcSalePrice", "mcfFulfillmentFee", "dtcProcessorRate", "dtcProcessorFixed", "removalFee",
  "smallOrderQty", "largeOrderQty", "largeCogs", "largeInboundPerUnit", "largeMonthsInStorage",
  "amazonLabelFee", "amazonBagFee", "amazonBubbleFee", "amazonPrepFee",
  "placementUnits", "freightMinimal", "freightPartial", "freightOptimized",
  "placementMinimalPerUnit", "placementPartialPerUnit", "placementOptimizedPerUnit",
  "repackCostPerUnit", "peakMonths",
  "onHandUnits", "soldLast30Days", "soldLast90Days", "lowInventoryFee",
  "agedUnits", "monthlySellThroughPct", "horizonMonths", "aisPerUnit",
  "recoveryPct", "liquidationFee", "agedRemovalFee", "elsewhereNet", "disposalFee",
  "vineUnits", "conversionLiftPct", "vineMonths", "vineReferralRate",
  "sfpShippingCost", "sfpMinutes", "sfpHourlyWage", "fbaTakePct", "sfpTakePct", "fbmTakePct",
];

/** The page's checkbox inputs, carried as `1`/`0` so a link can turn one off. */
export const TOGGLE_FIELDS = ["lowPriceEligible", "groceryExempt", "newFnskuExempt"];

/** Values the `fulfillmentMethod` radio accepts. */
export const FULFILLMENT_VALUES = [...FULFILLMENT_METHODS];

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

function wholeNumber(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

export function applyCategoryPreset(input, categoryId) {
  const preset = CATEGORY_PRESETS[categoryId];
  if (!preset) throw new Error(`Unknown Amazon category: ${categoryId}`);
  return { ...input, referralRate: preset.referralRate };
}

export function applyStoragePreset(input, seasonId) {
  const preset = STORAGE_PRESETS[seasonId];
  if (!preset) throw new Error(`Unknown storage season: ${seasonId}`);
  return { ...input, storageRate: preset.perCuFt };
}

export function applyPlacementPreset(input, sizeTier) {
  const preset = PLACEMENT_PRESETS[sizeTier];
  if (!preset) throw new Error(`Unknown size tier: ${sizeTier}`);
  return {
    ...input,
    placementMinimalPerUnit: preset.minimalPerUnit,
    placementPartialPerUnit: preset.partialPerUnit,
  };
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
  const girth = 2 * (median + shortest);

  if (weight <= 1 && longest <= 15 && median <= 12 && shortest <= 0.75) {
    return "small_standard";
  }
  if (weight <= 20 && longest <= 18 && median <= 14 && shortest <= 8) {
    return "large_standard";
  }
  if (weight <= 50 && longest <= 59 && median + shortest <= 90 && longest + girth <= 130) {
    return "large_bulky";
  }
  return "extra_large";
}

// Illustrative 2026 US non-peak, non-apparel FBA fulfillment defaults.
// Sellers should replace these with the fees on their current Amazon fee preview.
function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function defaultFulfillmentFee(tier, weightLb) {
  if (!SIZE_TIER_LABELS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const weight = number(weightLb, "Weight");
  const oz = weight * 16;

  if (tier === "small_standard") {
    if (oz <= 4) return 3.06;
    if (oz <= 8) return 3.16;
    if (oz <= 12) return 3.38;
    return 3.47;
  }
  if (tier === "large_standard") {
    if (oz <= 4) return 3.6;
    if (oz <= 8) return 3.75;
    if (oz <= 12) return 4.15;
    if (oz <= 16) return 4.4;
    if (oz <= 24) return 4.9;
    if (oz <= 32) return 5.19;
    if (oz <= 48) return 5.72;
    if (weight <= 5) return 6.44;
    const extraBands = Math.ceil((oz - 80) / 4);
    return 6.44 + extraBands * 0.16;
  }
  if (tier === "large_bulky") {
    return 9.61 + Math.max(0, weight - 2) * 0.38;
  }
  return 26.33 + Math.max(0, weight - 5) * 0.42;
}

// Illustrative Low-Price FBA pick fees: the same size-tier bands minus a
// typical discount. Extra-large and large bulky usually sit outside the
// program, so they return the regular fee. Sellers should replace these
// with the Low-Price line on their current Amazon fee preview.
export function defaultLowPriceFulfillmentFee(tier, weightLb) {
  const regular = defaultFulfillmentFee(tier, weightLb);
  if (tier === "small_standard") return roundMoney(regular - 0.9);
  if (tier === "large_standard") return roundMoney(regular - 0.7);
  return regular;
}

/**
 * Sale price on regular FBA that matches Low-Price FBA profit at `stayPrice`.
 * Cash, inbound, storage, and ads cancel — only referral (a percent of price)
 * and the two fulfillment fees differ. Below this price, staying under the
 * threshold keeps more; at or above it, leaving the program pays for the
 * extra pick fee after referral.
 */
export function lowPriceBreakEvenRaise({ stayPrice, referralRate, lowPriceFee, regularFee }) {
  const stay = number(stayPrice, "Stay price");
  const rate = number(referralRate, "Referral rate") / 100;
  const cheap = number(lowPriceFee, "Low-price fulfillment fee");
  const regular = number(regularFee, "Regular fulfillment fee");
  if (rate >= 1) return Infinity;
  return stay + (regular - cheap) / (1 - rate);
}

function listingTruthy(value) {
  return !(value === false || value === "false" || value === 0 || value === "0");
}

/**
 * Compare staying at or under Amazon's Low-Price FBA threshold against
 * listing above it on regular FBA. When the typed sale price is already
 * above the threshold, the stay row is the cut-to-threshold path — the
 * decision sellers actually make on a $12–$30 SKU that could drop to $10
 * to keep the cheaper pick fee.
 */
export function compareLowPriceFba(input) {
  const threshold = number(input.lowPriceThreshold, "Low-price threshold", 10);
  if (threshold <= 0) throw new Error("Low-price threshold must be greater than zero");

  const salePrice = number(input.salePrice, "Sale price");
  const referralRate = number(input.referralRate, "Referral rate", 15);
  const sizeTier =
    input.sizeTier && SIZE_TIER_LABELS[input.sizeTier]
      ? input.sizeTier
      : classifySizeTier({
          length: input.length ?? 8,
          width: input.width ?? 6,
          height: input.height ?? 2,
          weightLb: input.weightLb ?? 0.75,
        });
  const suggestedRegular = defaultFulfillmentFee(sizeTier, input.weightLb ?? 0.75);
  const suggestedLow = defaultLowPriceFulfillmentFee(sizeTier, input.weightLb ?? 0.75);
  const regularFee =
    input.fulfillmentFee === undefined || input.fulfillmentFee === null || input.fulfillmentFee === ""
      ? suggestedRegular
      : number(input.fulfillmentFee, "Fulfillment fee");
  const lowPriceFee =
    input.lowPriceFulfillmentFee === undefined ||
    input.lowPriceFulfillmentFee === null ||
    input.lowPriceFulfillmentFee === ""
      ? suggestedLow
      : number(input.lowPriceFulfillmentFee, "Low-price fulfillment fee");
  const eligible = listingTruthy(input.lowPriceEligible ?? true);

  const stayPrice =
    input.lowPriceSalePrice === undefined ||
    input.lowPriceSalePrice === null ||
    input.lowPriceSalePrice === ""
      ? Math.min(salePrice, threshold)
      : number(input.lowPriceSalePrice, "Low-price sale price");
  if (stayPrice > threshold) {
    throw new Error("Low-price sale price must be at or below the threshold");
  }

  const defaultRaise = salePrice > threshold ? salePrice : roundMoney(threshold + 0.01);
  const raisePrice =
    input.raisePrice === undefined || input.raisePrice === null || input.raisePrice === ""
      ? defaultRaise
      : number(input.raisePrice, "Raise-above-threshold price");
  if (raisePrice <= threshold) {
    throw new Error("Raise-above-threshold price must be greater than the low-price threshold");
  }

  const listingInput = { ...input, fulfillmentMethod: "fba" };
  delete listingInput.lowPriceThreshold;
  delete listingInput.lowPriceFulfillmentFee;
  delete listingInput.lowPriceEligible;
  delete listingInput.lowPriceSalePrice;
  delete listingInput.raisePrice;

  const stay = calculateListing({
    ...listingInput,
    salePrice: stayPrice,
    fulfillmentFee: eligible ? lowPriceFee : regularFee,
  });
  const raise = calculateListing({
    ...listingInput,
    salePrice: raisePrice,
    fulfillmentFee: regularFee,
  });

  const justOverPrice = roundMoney(threshold + 0.01);
  const justOver =
    Math.abs(raisePrice - justOverPrice) < 1e-9
      ? raise
      : calculateListing({
          ...listingInput,
          salePrice: justOverPrice,
          fulfillmentFee: regularFee,
        });

  const extraProfit = raise.fba.profit - stay.fba.profit;
  let winner = "tie";
  if (extraProfit > 1e-9) winner = "raise";
  else if (extraProfit < -1e-9) winner = "stay";
  if (!eligible) winner = "raise";

  const breakEvenRaise = eligible
    ? lowPriceBreakEvenRaise({
        stayPrice,
        referralRate,
        lowPriceFee,
        regularFee,
      })
    : Infinity;

  return {
    threshold,
    eligible,
    stayPrice,
    raisePrice,
    justOverPrice,
    regularFee,
    lowPriceFee,
    suggestedRegular,
    suggestedLow,
    sizeTier,
    stay,
    raise,
    justOver,
    extraProfit,
    winner,
    breakEvenRaise,
    raiseBeatsBreakEven: Number.isFinite(breakEvenRaise) && raisePrice + 1e-9 >= breakEvenRaise,
    summary: lowPriceSummary({
      eligible,
      winner,
      extraProfit,
      stayPrice,
      raisePrice,
      breakEvenRaise,
    }),
  };
}

function moneyLabel(value) {
  const abs = Math.abs(value);
  const formatted = abs.toFixed(2);
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function lowPriceSummary({ eligible, winner, extraProfit, stayPrice, raisePrice, breakEvenRaise }) {
  const stay = moneyLabel(stayPrice);
  const raise = moneyLabel(raisePrice);
  const gap = moneyLabel(Math.abs(extraProfit));
  const breakEven = Number.isFinite(breakEvenRaise) ? moneyLabel(breakEvenRaise) : "an unreachable price";
  if (!eligible) {
    return `This listing is marked outside Low-Price FBA, so only the regular fulfillment fee applies at ${raise}.`;
  }
  if (winner === "stay") {
    return `Staying at ${stay} on Low-Price FBA keeps ${gap} more than listing at ${raise}. Regular FBA needs about ${breakEven} to match.`;
  }
  if (winner === "raise") {
    return `Listing at ${raise} on regular FBA keeps ${gap} more than staying at ${stay}. The raise that matches Low-Price profit is about ${breakEven}.`;
  }
  return `Staying at ${stay} and listing at ${raise} leave the same profit on these rates.`;
}

function pathResult({
  revenue,
  percentRate,
  cashInvested,
  targetMarginRate,
  feeParts,
}) {
  const feeTotal = Object.values(feeParts).reduce((sum, value) => sum + value, 0);
  const percentFees = revenue * percentRate;
  const fixedFees = feeTotal - percentFees;
  const costs = feeTotal + cashInvested;
  const profit = revenue - costs;
  const fixedCash = cashInvested + fixedFees;
  const targetRevenueDenominator = 1 - percentRate - targetMarginRate;
  return {
    fees: feeParts,
    feeTotal,
    cashInvested,
    costs,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    breakEvenPrice: percentRate >= 1 ? Infinity : Math.max(0, fixedCash / (1 - percentRate)),
    targetMarginPrice:
      targetRevenueDenominator <= 0
        ? Infinity
        : Math.max(0, fixedCash / targetRevenueDenominator),
  };
}

export function calculateListing(input) {
  const salePrice = number(input.salePrice, "Sale price");
  const referralRate = number(input.referralRate, "Referral rate", 15);
  const length = number(input.length, "Length", 8);
  const width = number(input.width, "Width", 6);
  const height = number(input.height, "Height", 2);
  const weightLb = number(input.weightLb, "Weight", 0.75);
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const inboundPerUnit = number(input.inboundPerUnit, "Inbound per unit");
  const monthsInStorage = number(input.monthsInStorage, "Months in storage", 1);
  const storageRate = number(input.storageRate, "Storage rate", STORAGE_PRESETS.off_peak.perCuFt);
  const fbmShippingCost = number(input.fbmShippingCost, "FBM shipping cost");
  const fbmHandlingCost = number(input.fbmHandlingCost, "FBM handling cost");
  const packagingCost = number(input.packagingCost, "Packaging cost");
  const otherCost = number(input.otherCost, "Other cost");
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");
  const monthlySellerFee = number(input.monthlySellerFee, "Monthly seller fee", 39.99);
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const targetMargin = number(input.targetMargin, "Target margin");
  const fulfillmentMethod = input.fulfillmentMethod ?? "fba";

  if (targetMargin >= 100) throw new Error("Target margin must be less than 100%");
  if (!FULFILLMENT_METHODS.has(fulfillmentMethod)) {
    throw new Error("Fulfillment method must be fba or fbm");
  }
  if (monthlyUnits === 0 && monthlySellerFee > 0) {
    throw new Error("Monthly units must be greater than zero when a seller fee is included");
  }

  const sizeTier = input.sizeTier && SIZE_TIER_LABELS[input.sizeTier]
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
  const referral = salePrice * (referralRate / 100);
  const targetMarginRate = targetMargin / 100;
  const percentRate = referralRate / 100;

  function finish(path, cogsInCash) {
    // The raw ceiling can be negative: fees and non-COGS cash costs alone
    // already exceed the sale price, so no sourcing cost -- not even $0 --
    // reaches break-even. Clamping that to 0 for display would read as "pay
    // at most $0.00" -- a real, if tight, break-even point -- when the truth
    // is that this listing loses money before a unit is even bought.
    // `breakEvenBuyCostRaw` keeps the signed figure so `buyCostCheck` can
    // tell the two apart instead of reporting "at the zero-profit ceiling"
    // for a listing that is already under it.
    const rawBreakEvenBuyCost = salePrice - path.feeTotal - (path.cashInvested - cogsInCash);
    path.breakEvenBuyCostRaw = rawBreakEvenBuyCost;
    path.breakEvenBuyCost = Math.max(0, rawBreakEvenBuyCost);
    path.targetMarginBuyCost = Math.max(0, rawBreakEvenBuyCost - salePrice * targetMarginRate);
    return path;
  }

  // Ads sit in cashInvested, so profit already includes the current PPC spend.
  // Add the spend back to see how much advertising the unit can still carry
  // before it loses money, or before it misses the seller's target margin.
  // ACOS is that spend as a percent of the sale price — the number PPC
  // campaigns are actually managed against.
  function attachAdLimits(path) {
    const profitBeforeAds = path.profit + adsPerUnit;
    const breakEvenAds = Math.max(0, profitBeforeAds);
    const targetProfit = salePrice * targetMarginRate;
    const targetMarginAds = Math.max(0, profitBeforeAds - targetProfit);
    const acos = (ads) => (salePrice <= 0 ? null : (ads / salePrice) * 100);
    return {
      ...path,
      profitBeforeAds,
      breakEvenAds,
      breakEvenAcos: acos(breakEvenAds),
      currentAcos: acos(adsPerUnit),
      targetMarginAds,
      targetMarginAcos: acos(targetMarginAds),
      adsStillPay: path.profit >= -1e-9,
      targetMarginReachableWithAds: profitBeforeAds + 1e-9 >= targetProfit,
    };
  }

  const fbaCash = sharedCash + inboundPerUnit + storagePerUnit;
  const fba = finish(
    pathResult({
      revenue: salePrice,
      percentRate,
      cashInvested: fbaCash,
      targetMarginRate,
      feeParts: { referral, fulfillment: fulfillmentFee },
    }),
    costOfGoods,
  );

  const fbmCash = sharedCash + fbmShippingCost + fbmHandlingCost;
  const fbm = finish(
    pathResult({
      revenue: salePrice,
      percentRate,
      cashInvested: fbmCash,
      targetMarginRate,
      feeParts: { referral, fulfillment: 0 },
    }),
    costOfGoods,
  );

  const returnRatePct = number(input.returnRate, "Return rate");
  const unsellableReturnPct = number(input.unsellableReturnRate, "Unsellable return rate");
  const returnHandlingFee = number(input.returnHandlingFee, "Return handling fee");
  if (returnRatePct > 100) throw new Error("Return rate cannot exceed 100%");
  if (unsellableReturnPct > 100) throw new Error("Unsellable return rate cannot exceed 100%");

  const returnRate = returnRatePct / 100;
  const unsellableRate = unsellableReturnPct / 100;
  const returnAssumptions = {
    salePrice,
    percentRate,
    targetMarginRate,
    costOfGoods,
    returnRate,
    returnHandlingFee,
    unsellableRate,
  };
  const fbaAfterReturns = attachAdLimits(withExpectedReturns(fba, {
    ...returnAssumptions,
    fulfillmentFee,
  }));
  const fbmAfterReturns = attachAdLimits(withExpectedReturns(fbm, {
    ...returnAssumptions,
    fulfillmentFee: 0,
  }));

  const selected = fulfillmentMethod === "fba" ? fbaAfterReturns : fbmAfterReturns;
  const fbaAdvantage = fbaAfterReturns.profit - fbmAfterReturns.profit;
  return {
    salePrice,
    sizeTier,
    sizeTierLabel: SIZE_TIER_LABELS[sizeTier],
    cubicFeet: cuFt,
    storagePerUnit,
    allocatedSellerFee,
    suggestedFulfillment,
    fulfillmentFee,
    fulfillmentMethod,
    returnRate: returnRatePct,
    unsellableReturnRate: unsellableReturnPct,
    returnHandlingFee,
    selected,
    fba: fbaAfterReturns,
    fbm: fbmAfterReturns,
    fbmHandlingCost,
    fbaAdvantage,
    cheaperPath: fbaAdvantage > 0 ? "fba" : fbaAdvantage < 0 ? "fbm" : "tie",
  };
}

// Turns the selected path's max-buy calculation into a sourcing checkpoint.
// Arithmetic comparison only — not a recommendation to purchase.
export function buyCostCheck(result, costOfGoods) {
  const cost = number(costOfGoods, "Cost of goods");
  const maxBuy = result.selected.breakEvenBuyCost;
  // The comparison itself runs on the unclamped ceiling, not the display
  // value. At a $0.00 clamped ceiling, "maxBuy - cost" reads as "at the
  // ceiling" for a typed cost of $0 -- indistinguishable from a listing that
  // genuinely breaks even on a free unit. The raw figure is negative there
  // instead, so a $0 (or any) cost correctly lands above it.
  const raw = result.selected.breakEvenBuyCostRaw ?? maxBuy;
  const headroom = raw - cost;
  return {
    cost,
    maxBuy,
    headroom,
    status: headroom > 0 ? "below_ceiling" : headroom < 0 ? "above_ceiling" : "at_ceiling",
    targetMarginPrice: result.selected.targetMarginPrice,
  };
}

// Expected unit economics after a share of orders come back. A successful
// sale keeps the current path result. A return refunds the sale and the
// referral (Amazon typically does), keeps the outbound fulfillment or FBM
// label, adds return handling, and recovers cost of goods only when the
// unit can be sold again. Storage, inbound, prep, ads, and the allocated
// plan fee stay spent either way. Ported from #1492 onto current main so
// the unique return mix is not lost behind a conflicted rebase.
function withExpectedReturns(path, {
  salePrice,
  percentRate,
  targetMarginRate,
  costOfGoods,
  fulfillmentFee,
  returnRate,
  returnHandlingFee,
  unsellableRate,
}) {
  const cashExcludingCogs = path.cashInvested - costOfGoods;
  const keepShare = 1 - returnRate;
  const cogsFactor = 1 - returnRate * (1 - unsellableRate);
  const profitBeforeReturns = path.profit;
  const expectedProfit =
    keepShare * salePrice * (1 - percentRate)
    - fulfillmentFee
    - cashExcludingCogs
    - returnRate * returnHandlingFee
    - costOfGoods * cogsFactor;
  const expectedRevenue = keepShare * salePrice;
  const expectedFeeTotal =
    keepShare * path.fees.referral + fulfillmentFee + returnRate * returnHandlingFee;
  const recoveredFixed =
    fulfillmentFee + cashExcludingCogs + returnRate * returnHandlingFee + costOfGoods * cogsFactor;
  const breakEvenDenom = keepShare * (1 - percentRate);
  const targetDenom = keepShare * (1 - percentRate - targetMarginRate);
  const maxBuyNumerator =
    keepShare * salePrice * (1 - percentRate)
    - fulfillmentFee
    - cashExcludingCogs
    - returnRate * returnHandlingFee;
  const stayValue =
    salePrice * (1 - percentRate) + returnHandlingFee - costOfGoods * (1 - unsellableRate);
  let breakEvenReturnRate = null;
  if (profitBeforeReturns <= 0) {
    breakEvenReturnRate = 0;
  } else if (stayValue > 0) {
    breakEvenReturnRate = Math.min(1, profitBeforeReturns / stayValue);
  }

  return {
    ...path,
    fees: { ...path.fees, returnHandling: returnRate * returnHandlingFee },
    feeTotal: expectedFeeTotal,
    profitBeforeReturns,
    profit: expectedProfit,
    costs: expectedFeeTotal + cashExcludingCogs + costOfGoods * cogsFactor,
    margin: expectedRevenue === 0 ? 0 : (expectedProfit / expectedRevenue) * 100,
    roi: path.cashInvested === 0 ? null : (expectedProfit / path.cashInvested) * 100,
    breakEvenPrice: breakEvenDenom <= 0 ? Infinity : Math.max(0, recoveredFixed / breakEvenDenom),
    targetMarginPrice: targetDenom <= 0 ? Infinity : Math.max(0, recoveredFixed / targetDenom),
    breakEvenBuyCost: cogsFactor <= 0
      ? (maxBuyNumerator >= 0 ? Infinity : 0)
      : Math.max(0, maxBuyNumerator / cogsFactor),
    expectedRevenue,
    returnDrag: profitBeforeReturns - expectedProfit,
    breakEvenReturnRate,
  };
}

export const RETURN_RATE_PRESETS = [0, 8, 15, 22];

/**
 * Sweep the same listing across typical return rates plus the typed rate.
 * Zero returns is always on the table so the seller can see the drag, not
 * only the mixed number. Complementary to #1492's mix — this table is the
 * "what rate still leaves a profit" view.
 */
export function compareReturns(input) {
  const typedRate = number(input.returnRate, "Return rate");
  const handling = number(input.returnHandlingFee, "Return handling fee");
  const unsellable = number(input.unsellableReturnRate, "Unsellable return rate");
  if (typedRate > 100) throw new Error("Return rate cannot exceed 100%");
  if (unsellable > 100) throw new Error("Unsellable return rate cannot exceed 100%");

  const rates = [...new Set([...RETURN_RATE_PRESETS, typedRate])].sort((a, b) => a - b);
  const rows = rates.map((rate) => {
    const listing = calculateListing({
      ...input,
      returnRate: rate,
      returnHandlingFee: handling,
      unsellableReturnRate: unsellable,
    });
    return {
      returnRate: rate,
      isCurrent: Math.abs(rate - typedRate) < 1e-9,
      profit: listing.selected.profit,
      profitBeforeReturns: listing.selected.profitBeforeReturns,
      returnDrag: listing.selected.returnDrag,
      margin: listing.selected.margin,
      breakEvenBuyCost: listing.selected.breakEvenBuyCost,
      fbaProfit: listing.fba.profit,
      fbmProfit: listing.fbm.profit,
      cheaperPath: listing.cheaperPath,
    };
  });
  const typed = calculateListing({
    ...input,
    returnRate: typedRate,
    returnHandlingFee: handling,
    unsellableReturnRate: unsellable,
  });
  return {
    returnRate: typedRate,
    returnHandlingFee: handling,
    unsellableReturnRate: unsellable,
    rows,
    typed,
    breakEvenReturnRate: typed.selected.breakEvenReturnRate,
    summary: returnsSummary({
      typedRate,
      handling,
      unsellable,
      typed,
    }),
  };
}

export function returnsSummary({ typedRate, handling, unsellable, typed }) {
  const kept = typed.selected.profitBeforeReturns;
  const expected = typed.selected.profit;
  const drag = typed.selected.returnDrag;
  const wipe = typed.selected.breakEvenReturnRate;
  const wipePct = wipe === null ? null : wipe * 100;
  const path = typed.fulfillmentMethod === "fba" ? "FBA" : "FBM";
  if (typedRate === 0) {
    return `${path} keeps ${moneyLabel(kept)} on a completed sale. Type a return rate to mix that with the refunded-order leftover.`;
  }
  const wipeLine = wipePct === null
    ? "No finite return rate drives expected profit to zero on these costs."
    : wipePct === 0
      ? "The completed sale already loses money, so any return rate still loses."
      : `The return rate that wipes expected profit is about ${wipePct.toFixed(1)}%.`;
  return `At a ${typedRate}% return rate, $${handling.toFixed(2)} handling, and ${unsellable}% unsellable, ${path} expects ${moneyLabel(expected)} versus ${moneyLabel(kept)} on a completed sale — ${moneyLabel(drag)} of drag. ${wipeLine}`;
}

export const SELLER_PLAN_DEFAULTS = {
  individualPerUnit: 0.99,
  professionalMonthly: 39.99,
};

/**
 * Compare Amazon Individual ($/item sold) against Professional (flat/month)
 * on the same listing. Reuses calculateListing so FBA/FBM, referral, storage,
 * and inbound stay on one code path. Individual is modeled as a monthly fee
 * of per-item × units so the allocated per-unit fee equals the Individual
 * charge. Ported from #1547 onto current main so the unique plan table is
 * not lost behind a conflicted rebase.
 */
export function compareSellerPlans(input = {}, plans = {}) {
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const individualPerUnit = number(
    plans.individualPerUnit ?? input.individualPerUnit,
    "Individual per-unit fee",
    SELLER_PLAN_DEFAULTS.individualPerUnit,
  );
  const professionalMonthly = number(
    plans.professionalMonthly ?? input.monthlySellerFee,
    "Professional monthly fee",
    SELLER_PLAN_DEFAULTS.professionalMonthly,
  );

  if (monthlyUnits === 0) {
    throw new Error("Monthly units must be greater than zero to compare seller plans");
  }

  const individual = calculateListing({
    ...input,
    monthlyUnits,
    monthlySellerFee: individualPerUnit * monthlyUnits,
  });
  const professional = calculateListing({
    ...input,
    monthlyUnits,
    monthlySellerFee: professionalMonthly,
  });

  const breakEvenUnits =
    individualPerUnit === 0
      ? professionalMonthly === 0
        ? null
        : Infinity
      : professionalMonthly / individualPerUnit;
  const profitDelta = professional.selected.profit - individual.selected.profit;
  const cheaperPlan = profitDelta > 0 ? "professional" : profitDelta < 0 ? "individual" : "tie";

  return {
    monthlyUnits,
    individualPerUnit,
    professionalMonthly,
    individualMonthlyFee: individualPerUnit * monthlyUnits,
    professionalAllocatedFee: professionalMonthly / monthlyUnits,
    individual,
    professional,
    breakEvenUnits,
    cheaperPlan,
    profitDelta,
    monthlyProfitDelta: profitDelta * monthlyUnits,
    maxBuyDelta: professional.selected.breakEvenBuyCost - individual.selected.breakEvenBuyCost,
  };
}

export const SELLER_PLAN_VOLUME_STEPS = [10, 20, 40, 80, 200];

/**
 * Replay Individual vs Professional at the volumes a growing seller
 * actually hits. The current month is one number; the decision is when
 * the $0.99/item fee flips to the flat plan. Each row reuses
 * compareSellerPlans so FBA/FBM, referral, storage, and inbound stay
 * on one code path.
 */
export function compareSellerPlanVolumes(input = {}, plans = {}, volumes = SELLER_PLAN_VOLUME_STEPS) {
  if (!Array.isArray(volumes) || volumes.length === 0) {
    throw new Error("Volume steps must be a non-empty list");
  }
  const rows = volumes.map((monthlyUnits) => {
    const compared = compareSellerPlans({ ...input, monthlyUnits }, plans);
    return {
      monthlyUnits: compared.monthlyUnits,
      cheaperPlan: compared.cheaperPlan,
      individualProfit: compared.individual.selected.profit,
      professionalProfit: compared.professional.selected.profit,
      profitDelta: compared.profitDelta,
      monthlyProfitDelta: compared.monthlyProfitDelta,
      individualAllocatedFee: compared.individualPerUnit,
      professionalAllocatedFee: compared.professionalAllocatedFee,
    };
  });
  const first = compareSellerPlans({ ...input, monthlyUnits: volumes[0] }, plans);
  return {
    breakEvenUnits: first.breakEvenUnits,
    individualPerUnit: first.individualPerUnit,
    professionalMonthly: first.professionalMonthly,
    rows,
  };
}

// Amazon coupons cut the price the buyer pays. Referral is charged on that
// discounted price. Fulfillment, inbound, and storage do not change. The
// per-redemption coupon fee is deducted from proceeds — it is not cash the
// seller laid out to source the unit. Defaults are illustrative; the seller
// overwrites them from the coupon fee preview on their account.
export const COUPON_PERCENTS = [0, 5, 10, 15, 20];
export const DEFAULT_COUPON_FEE = 0.6;

export function couponDiscount({ salePrice, couponPercent = 0, couponFixed = 0 }) {
  const price = number(salePrice, "Sale price");
  const percent = number(couponPercent, "Coupon percent");
  const fixed = number(couponFixed, "Coupon fixed amount");
  if (percent > 100) throw new Error("Coupon percent must be at most 100");
  return Math.min(price, price * (percent / 100) + fixed);
}

function couponLabel(percent, fixed) {
  const parts = [];
  if (percent > 0) parts.push(`${percent}%`);
  if (fixed > 0) parts.push(`$${fixed.toFixed(2)} off`);
  if (parts.length === 0) return "No coupon";
  return `${parts.join(" + ")} coupon`;
}

// Reprice the selected fulfillment path at the discounted checkout total,
// then subtract the per-redemption coupon fee from profit. Professional-plan
// allocation stays at the typed monthly volume so the table is comparable
// row to row; more couponed units would dilute that fee slightly.
export function couponedListing(input, offer = {}) {
  const listPrice = number(input.salePrice, "Sale price");
  const couponPercent = number(offer.couponPercent ?? 0, "Coupon percent");
  const couponFixed = number(offer.couponFixed ?? 0, "Coupon fixed amount");
  const couponFee = number(offer.couponFee ?? 0, "Coupon fee");
  const targetMargin = number(input.targetMargin, "Target margin");
  const discount = couponDiscount({ salePrice: listPrice, couponPercent, couponFixed });
  const buyerPays = listPrice - discount;
  const listing = calculateListing({ ...input, salePrice: buyerPays });
  const path = listing.selected;
  const profit = path.profit - couponFee;
  const margin = buyerPays === 0 ? 0 : (profit / buyerPays) * 100;
  return {
    listPrice,
    couponPercent,
    couponFixed,
    couponFee,
    discount,
    buyerPays,
    feeTotal: path.feeTotal + couponFee,
    cashInvested: path.cashInvested,
    referral: path.fees.referral,
    fulfillment: path.fees.fulfillment,
    profit,
    margin,
    roi: path.cashInvested === 0 ? null : (profit / path.cashInvested) * 100,
    hitsTarget: buyerPays === 0 ? profit >= 0 : margin + 1e-9 >= targetMargin,
    breakEvenBuyCost: Math.max(0, path.breakEvenBuyCost - couponFee),
  };
}

export function compareCoupons(input) {
  const couponPercent = number(input.couponPercent ?? 0, "Coupon percent");
  const couponFixed = number(input.couponFixed ?? 0, "Coupon fixed amount");
  const couponFee = number(input.couponFee ?? DEFAULT_COUPON_FEE, "Coupon fee");
  const couponLiftPct = number(input.couponLiftPct ?? 0, "Coupon volume lift");
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const feeFor = (percent, fixed) => (percent === 0 && fixed === 0 ? 0 : couponFee);

  const rows = COUPON_PERCENTS.map((percent) => {
    const offer = couponedListing(input, {
      couponPercent: percent,
      couponFixed: 0,
      couponFee: feeFor(percent, 0),
    });
    return {
      ...offer,
      label: couponLabel(percent, 0),
      isCustom: false,
      isCurrent: percent === couponPercent && couponFixed === 0,
    };
  });

  const customMatchesStandard = couponFixed === 0 && COUPON_PERCENTS.includes(couponPercent);
  if (!customMatchesStandard) {
    rows.push({
      ...couponedListing(input, {
        couponPercent,
        couponFixed,
        couponFee: feeFor(couponPercent, couponFixed),
      }),
      label: couponLabel(couponPercent, couponFixed),
      isCustom: true,
      isCurrent: true,
    });
  }

  const none = rows[0];
  const typed = customMatchesStandard
    ? rows.find((row) => row.couponPercent === couponPercent && !row.isCustom)
    : rows[rows.length - 1];

  const withDeltas = rows.map((row) => ({
    ...row,
    profitDelta: row.profit - none.profit,
    monthlyProfit: row.profit * monthlyUnits,
    monthlyDelta: (row.profit - none.profit) * monthlyUnits,
  }));
  const noneRow = withDeltas[0];
  const typedRow = withDeltas.find((row) => row.isCurrent) ?? withDeltas[withDeltas.length - 1];

  // Units at the couponed per-unit profit that match this month's list-price
  // profit. Infinity when the coupon unit itself does not pay: every extra
  // couponed sale then contributes zero or negative profit, so it can never
  // recover the month, whatever the list row's own sign. Gating that on
  // noneRow.profit > 0 (as this used to) silently reported "not defined"
  // whenever the list price was itself unprofitable, even though the coupon
  // was just as unrecoverable — see compareSubscribeSave's offsetUnits,
  // fixed for the identical reasoning error.
  const breakEvenUnits = typedRow.profit <= 0
    ? Infinity
    : (noneRow.profit * monthlyUnits) / typedRow.profit;

  const extraUnitsNeeded = breakEvenUnits === Infinity
    ? Infinity
    : Math.max(0, breakEvenUnits - monthlyUnits);
  const liftPctNeeded = monthlyUnits === 0 || extraUnitsNeeded === Infinity
    ? extraUnitsNeeded
    : (extraUnitsNeeded / monthlyUnits) * 100;

  const liftedUnits = monthlyUnits * (1 + couponLiftPct / 100);
  const liftedMonthlyProfit = typedRow.profit * liftedUnits;
  const listMonthlyProfit = noneRow.monthlyProfit;

  return {
    rows: withDeltas,
    none: noneRow,
    typed: typedRow,
    monthlyUnits,
    couponLiftPct,
    liftedUnits,
    liftedMonthlyProfit,
    listMonthlyProfit,
    liftBeatsList: liftedMonthlyProfit > listMonthlyProfit,
    breakEvenUnits,
    extraUnitsNeeded,
    liftPctNeeded,
    cheaper: typedRow.profit > noneRow.profit ? "coupon" : typedRow.profit < noneRow.profit ? "list" : "tie",
  };
}

export function couponSummary(comparison) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const typed = comparison.typed;
  if (typed.discount === 0 && typed.couponFee === 0) {
    return "No coupon is entered, so every row but the list-price line is a what-if against this listing.";
  }
  const offer = typed.label.toLowerCase();
  const perUnit = `${offer} drops the buyer price from ${money(typed.listPrice)} to ${money(typed.buyerPays)} and leaves ${money(typed.profit)} after the ${money(typed.couponFee)} redemption fee — ${money(Math.abs(typed.profitDelta))} ${typed.profitDelta < 0 ? "less" : "more"} than list.`;
  if (comparison.breakEvenUnits === Infinity) {
    return `${perUnit} Extra volume cannot recover the list-price month: the couponed unit itself does not pay.`;
  }
  const units = comparison.breakEvenUnits;
  const lift = comparison.liftPctNeeded;
  const volume = `At ${comparison.monthlyUnits} units you need about ${units.toFixed(1)} couponed sales (${lift.toFixed(0)}% lift) to match list-price monthly profit.`;
  if (comparison.couponLiftPct > 0) {
    const liftLine = comparison.liftBeatsList
      ? `If the coupon lifts volume ${comparison.couponLiftPct}%, the coupon month keeps ${money(comparison.liftedMonthlyProfit)} against ${money(comparison.listMonthlyProfit)} at list.`
      : `If the coupon lifts volume ${comparison.couponLiftPct}%, the coupon month still keeps only ${money(comparison.liftedMonthlyProfit)} against ${money(comparison.listMonthlyProfit)} at list.`;
    return `${perUnit} ${volume} ${liftLine}`;
  }
  return `${perUnit} ${volume}`;
}

// Subscribe & Save is a standing percent off the list price for enrolled
// deliveries. Referral is charged on that discounted price. Fulfillment,
// inbound, and storage do not change. Unlike a coupon there is typically
// no per-redemption fee — the same percent usually leaves more than a
// coupon. This models a seller-funded discount (the conservative case).
// If Amazon funds the discount on the settlement, leftover matches list;
// type 0% then. Defaults 5% (one-item delivery) and 10% (five or more
// S&S items) are illustrative; sellers replace them from their offer.
export const SNS_PERCENTS = [0, 5, 10, 15];

function snsLabel(percent) {
  if (percent === 0) return "List price";
  if (percent === 5) return "5% S&S (1 item)";
  if (percent === 10) return "10% S&S (5+ items)";
  if (percent === 15) return "15% S&S (promo)";
  return `${percent}% S&S`;
}

export function subscribeSaveListing(input, offer = {}) {
  const listPrice = number(input.salePrice, "Sale price");
  const snsPercent = number(offer.snsPercent ?? 0, "Subscribe & Save percent");
  if (snsPercent > 100) throw new Error("Subscribe & Save percent must be at most 100");
  const targetMargin = number(input.targetMargin, "Target margin");
  const discount = listPrice * (snsPercent / 100);
  const buyerPays = listPrice - discount;
  const listing = calculateListing({ ...input, salePrice: buyerPays });
  const path = listing.selected;
  return {
    listPrice,
    snsPercent,
    discount,
    buyerPays,
    feeTotal: path.feeTotal,
    cashInvested: path.cashInvested,
    referral: path.fees.referral,
    fulfillment: path.fees.fulfillment,
    profit: path.profit,
    margin: path.margin,
    roi: path.roi,
    hitsTarget: buyerPays === 0 ? path.profit >= 0 : path.margin + 1e-9 >= targetMargin,
    breakEvenBuyCost: path.breakEvenBuyCost,
  };
}

export function compareSubscribeSave(input) {
  const snsPercent = number(input.snsPercent ?? 5, "Subscribe & Save percent");
  const snsEnrollPct = number(input.snsEnrollPct ?? 40, "Subscribe & Save enroll percent");
  if (snsPercent > 100) throw new Error("Subscribe & Save percent must be at most 100");
  if (snsEnrollPct > 100) throw new Error("Subscribe & Save enroll percent must be at most 100");
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);

  const rows = SNS_PERCENTS.map((percent) => ({
    ...subscribeSaveListing(input, { snsPercent: percent }),
    label: snsLabel(percent),
    isCustom: false,
    isCurrent: percent === snsPercent,
  }));

  if (!SNS_PERCENTS.includes(snsPercent)) {
    rows.push({
      ...subscribeSaveListing(input, { snsPercent }),
      label: snsLabel(snsPercent),
      isCustom: true,
      isCurrent: true,
    });
  }

  const withDeltas = rows.map((row) => ({
    ...row,
    profitDelta: row.profit - rows[0].profit,
    monthlyProfit: row.profit * monthlyUnits,
  }));
  const noneRow = withDeltas[0];
  const typedRow = withDeltas.find((row) => row.isCurrent) ?? withDeltas[withDeltas.length - 1];

  const enrolledUnits = monthlyUnits * (snsEnrollPct / 100);
  const listUnits = monthlyUnits - enrolledUnits;
  const mixedMonthlyProfit = listUnits * noneRow.profit + enrolledUnits * typedRow.profit;
  const listMonthlyProfit = noneRow.profit * monthlyUnits;
  const mixedDelta = mixedMonthlyProfit - listMonthlyProfit;

  // New S&S-only units that restore the all-list month after enrolled
  // buyers convert. Infinity when the S&S unit itself does not pay — every
  // extra S&S sale then contributes zero or negative profit, so it can
  // never close a positive conversion loss, whatever the list row's own
  // sign. Gating that on noneRow.profit > 0 (as this used to) silently
  // reported "no offset needed" whenever the list price was itself
  // unprofitable, even though the real gap (enrolled buyers converting to
  // an even-less-profitable S&S price) was just as unrecoverable.
  let offsetUnits = 0;
  if (snsPercent === 0 || enrolledUnits === 0 || typedRow.profit >= noneRow.profit) {
    offsetUnits = 0;
  } else if (typedRow.profit <= 0) {
    offsetUnits = Infinity;
  } else {
    offsetUnits = (enrolledUnits * (noneRow.profit - typedRow.profit)) / typedRow.profit;
  }

  // Same reasoning as offsetUnits just above: Infinity whenever the S&S unit
  // itself does not pay, regardless of the list row's own sign, rather than
  // gating on noneRow.profit > 0 and silently falling through to "not
  // defined" whenever the list price was itself unprofitable.
  const breakEvenUnits = typedRow.profit <= 0
    ? Infinity
    : (noneRow.profit * monthlyUnits) / typedRow.profit;

  return {
    rows: withDeltas,
    none: noneRow,
    typed: typedRow,
    monthlyUnits,
    snsEnrollPct,
    enrolledUnits,
    listUnits,
    mixedMonthlyProfit,
    listMonthlyProfit,
    mixedDelta,
    offsetUnits,
    breakEvenUnits,
    cheaper: typedRow.profit > noneRow.profit ? "sns" : typedRow.profit < noneRow.profit ? "list" : "tie",
  };
}

export function subscribeSaveSummary(comparison) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const typed = comparison.typed;
  if (typed.snsPercent === 0) {
    return "No Subscribe & Save discount is entered, so every row but the list-price line is a what-if against this listing.";
  }
  const offer = typed.label;
  const perUnit = `${offer} drops the buyer price from ${money(typed.listPrice)} to ${money(typed.buyerPays)} and leaves ${money(typed.profit)} — ${money(Math.abs(typed.profitDelta))} ${typed.profitDelta < 0 ? "less" : "more"} than list. There is no coupon redemption fee on this path.`;
  if (comparison.offsetUnits === Infinity) {
    return `${perUnit} Extra Subscribe & Save volume cannot recover the converted buyers: the discounted unit itself does not pay.`;
  }
  const enroll = `If ${comparison.snsEnrollPct}% of ${comparison.monthlyUnits} units enroll (${comparison.enrolledUnits.toFixed(1)}), this month keeps ${money(comparison.mixedMonthlyProfit)} against ${money(comparison.listMonthlyProfit)} at list.`;
  if (comparison.offsetUnits === 0) {
    return `${perUnit} ${enroll}`;
  }
  return `${perUnit} ${enroll} You need about ${comparison.offsetUnits.toFixed(1)} new S&S-only sales to offset those converted buyers.`;
}

// Illustrative 2026 US Multi-Channel Fulfillment Standard defaults: the
// same size-tier FBA band plus a typical MCF premium. Sellers replace
// these with the MCF line on their current Amazon fee preview. MCF is
// how a website, eBay, or Walmart order ships from FBA inventory — no
// Amazon referral, but the pick/pack/ship fee is higher than FBA.
const MCF_SURCHARGE = {
  small_standard: 2.1,
  large_standard: 2.4,
  large_bulky: 4.8,
  extra_large: 8,
};

export function defaultMcfFee(tier, weightLb) {
  if (!SIZE_TIER_LABELS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const surcharge = MCF_SURCHARGE[tier];
  return roundMoney(defaultFulfillmentFee(tier, weightLb) + surcharge);
}

function websitePathResult({
  salePrice,
  processorRate,
  processorFixed,
  fulfillment,
  cashInvested,
  targetMarginRate,
  costOfGoods,
}) {
  const processor = salePrice * (processorRate / 100) + processorFixed;
  const path = pathResult({
    revenue: salePrice,
    percentRate: processorRate / 100,
    cashInvested,
    targetMarginRate,
    feeParts: { referral: 0, fulfillment, processor },
  });
  path.salePrice = salePrice;
  path.breakEvenBuyCost = Math.max(
    0,
    salePrice - path.feeTotal - (cashInvested - costOfGoods),
  );
  path.hitsTarget = salePrice === 0 ? path.profit >= 0 : path.margin + 1e-9 >= targetMarginRate * 100;
  return path;
}

function mcfSummary({ winner, amazon, mcf, selfShip, mcfFee, breakEvenMcfFee }) {
  const amazonProfit = moneyLabel(amazon.profit);
  const mcfProfit = moneyLabel(mcf.profit);
  const selfProfit = moneyLabel(selfShip.profit);
  const fee = moneyLabel(mcfFee);
  const cap = Number.isFinite(breakEvenMcfFee) ? moneyLabel(breakEvenMcfFee) : "an unreachable fee";
  if (winner === "mcf") {
    return `Website + MCF keeps ${mcfProfit} after a ${fee} MCF fee and card processing — ${moneyLabel(Math.abs(mcf.profit - amazon.profit))} more than Amazon FBA at ${amazonProfit}. MCF still beats Amazon up to about ${cap}.`;
  }
  if (winner === "self") {
    return `Website + you ship keeps ${selfProfit}, ahead of MCF at ${mcfProfit} and Amazon FBA at ${amazonProfit}. That path assumes the unit is already outside Amazon (or the removal fee is in the inputs).`;
  }
  if (winner === "amazon") {
    return `Amazon FBA keeps ${amazonProfit}, ahead of website + MCF at ${mcfProfit}. The MCF fee that would match Amazon is about ${cap}; the typed MCF fee is ${fee}.`;
  }
  return `Amazon FBA, website + MCF, and website + you ship leave the same profit on these rates.`;
}

/**
 * Compare selling the next unit on Amazon (FBA referral + FBA pick fee)
 * against a website order fulfilled from the same FBA inventory (MCF,
 * no referral, card fees) and a website order you ship yourself (card
 * fees + your label, no Amazon referral or warehouse stay). Amazon ads
 * stay on the Amazon row only. Inbound and storage stay on Amazon and
 * MCF. You-ship adds an optional removal fee when the unit has to leave
 * the Amazon warehouse first.
 */
export function compareMcf(input) {
  const amazonPrice = number(input.salePrice, "Sale price");
  const dtcSalePrice =
    input.dtcSalePrice === undefined || input.dtcSalePrice === null || input.dtcSalePrice === ""
      ? amazonPrice
      : number(input.dtcSalePrice, "Website sale price");
  const processorRate = number(input.dtcProcessorRate, "Website card rate", 2.9);
  const processorFixed = number(input.dtcProcessorFixed, "Website card fixed fee", 0.3);
  const removalFee = number(input.removalFee, "Removal fee");
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");
  const costOfGoods = number(input.costOfGoods, "Cost of goods");
  const targetMargin = number(input.targetMargin, "Target margin");
  if (processorRate >= 100) throw new Error("Website card rate must be less than 100%");

  const amazonListing = calculateListing({ ...input, fulfillmentMethod: "fba" });
  const suggestedMcfFee = defaultMcfFee(amazonListing.sizeTier, input.weightLb ?? 0.75);
  const mcfFee =
    input.mcfFulfillmentFee === undefined ||
    input.mcfFulfillmentFee === null ||
    input.mcfFulfillmentFee === ""
      ? suggestedMcfFee
      : number(input.mcfFulfillmentFee, "MCF fulfillment fee");

  const targetMarginRate = targetMargin / 100;
  const warehouseCash = amazonListing.fba.cashInvested - adsPerUnit;
  const selfCash = amazonListing.fbm.cashInvested - adsPerUnit + removalFee;
  const processorFee = dtcSalePrice * (processorRate / 100) + processorFixed;

  const amazon = {
    id: "amazon",
    label: "Amazon FBA",
    salePrice: amazonPrice,
    fees: { ...amazonListing.fba.fees, processor: 0 },
    feeTotal: amazonListing.fba.feeTotal,
    cashInvested: amazonListing.fba.cashInvested,
    profit: amazonListing.fba.profit,
    margin: amazonListing.fba.margin,
    roi: amazonListing.fba.roi,
    breakEvenBuyCost: amazonListing.fba.breakEvenBuyCost,
    hitsTarget:
      amazonPrice === 0
        ? amazonListing.fba.profit >= 0
        : amazonListing.fba.margin + 1e-9 >= targetMargin,
  };

  const mcf = {
    id: "mcf",
    label: "Website + MCF",
    ...websitePathResult({
      salePrice: dtcSalePrice,
      processorRate,
      processorFixed,
      fulfillment: mcfFee,
      cashInvested: warehouseCash,
      targetMarginRate,
      costOfGoods,
    }),
  };

  const selfShip = {
    id: "self",
    label: "Website + you ship",
    ...websitePathResult({
      salePrice: dtcSalePrice,
      processorRate,
      processorFixed,
      fulfillment: 0,
      cashInvested: selfCash,
      targetMarginRate,
      costOfGoods,
    }),
  };

  const rows = [amazon, mcf, selfShip].map((row) => ({
    ...row,
    profitDelta: row.profit - amazon.profit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.profit));
  const leaders = rows.filter((row) => Math.abs(row.profit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  // MCF fulfillment fee that matches Amazon FBA profit on this website price.
  // Cash and card fees are held constant. Null-safe Infinity when the
  // website price cannot cover processor + warehouse cash + Amazon profit.
  const breakEvenMcfFee = dtcSalePrice - processorFee - warehouseCash - amazon.profit;

  return {
    rows,
    amazon: rows[0],
    mcf: rows[1],
    selfShip: rows[2],
    winner,
    suggestedMcfFee,
    mcfFee,
    dtcSalePrice,
    processorRate,
    processorFixed,
    processorFee,
    removalFee,
    sizeTier: amazonListing.sizeTier,
    breakEvenMcfFee,
    mcfBeatsAmazon: mcf.profit + 1e-9 >= amazon.profit,
    summary: mcfSummary({
      winner,
      amazon: rows[0],
      mcf: rows[1],
      selfShip: rows[2],
      mcfFee,
      breakEvenMcfFee,
    }),
  };
}

function emptyField(value) {
  return value === undefined || value === null || value === "";
}

export const DEFAULT_SMALL_ORDER_QTY = 100;
export const DEFAULT_LARGE_ORDER_QTY = 500;

function orderPath(listing, targetMargin) {
  const path = listing.selected;
  return {
    profit: path.profit,
    margin: path.margin,
    cashInvested: path.cashInvested,
    storagePerUnit: listing.storagePerUnit,
    hitsTarget: listing.salePrice === 0
      ? path.profit >= 0
      : path.margin + 1e-9 >= targetMargin,
    fbaProfit: listing.fba.profit,
    fbmProfit: listing.fbm.profit,
  };
}

/**
 * Compare a usual replenishment PO against a supplier MOQ that drops
 * unit COGS (and often inbound) but sits in FBA longer. Storage months
 * on the MOQ default to the listing months scaled by qty / usual qty so
 * a 5× pile sits 5× as long as the stay the seller already modeled.
 * That is the decision: does the cheaper unit survive the extra warehouse
 * stay and the extra cash tied up? Not a leftover-unit hold/remove, not
 * a coupon, and not a season-rate swap.
 */
export function compareBulkBuy(input) {
  const smallQty = number(input.smallOrderQty ?? DEFAULT_SMALL_ORDER_QTY, "Small order quantity");
  const largeQty = number(input.largeOrderQty ?? DEFAULT_LARGE_ORDER_QTY, "Large order quantity");
  if (smallQty <= 0) throw new Error("Small order quantity must be greater than zero");
  if (largeQty <= 0) throw new Error("Large order quantity must be greater than zero");

  const smallCogs = number(
    emptyField(input.smallCogs) ? input.costOfGoods : input.smallCogs,
    "Small-order cost of goods",
  );
  const largeCogs = number(
    emptyField(input.largeCogs) ? input.costOfGoods : input.largeCogs,
    "Large-order cost of goods",
  );
  const smallInbound = number(
    emptyField(input.smallInboundPerUnit) ? input.inboundPerUnit : input.smallInboundPerUnit,
    "Small-order inbound per unit",
  );
  const largeInbound = number(
    emptyField(input.largeInboundPerUnit) ? input.inboundPerUnit : input.largeInboundPerUnit,
    "Large-order inbound per unit",
  );
  const listingMonths = number(input.monthsInStorage, "Months in storage", 1);
  const smallMonths = emptyField(input.smallMonthsInStorage)
    ? listingMonths
    : number(input.smallMonthsInStorage, "Small-order months in storage");
  const largeMonths = emptyField(input.largeMonthsInStorage)
    ? smallMonths * (largeQty / smallQty)
    : number(input.largeMonthsInStorage, "Large-order months in storage");
  const targetMargin = number(input.targetMargin, "Target margin");

  const smallListing = calculateListing({
    ...input,
    costOfGoods: smallCogs,
    inboundPerUnit: smallInbound,
    monthsInStorage: smallMonths,
  });
  const largeListing = calculateListing({
    ...input,
    costOfGoods: largeCogs,
    inboundPerUnit: largeInbound,
    monthsInStorage: largeMonths,
  });

  const small = {
    id: "small",
    label: `Usual PO (${smallQty} units)`,
    qty: smallQty,
    costOfGoods: smallCogs,
    inboundPerUnit: smallInbound,
    monthsInStorage: smallMonths,
    ...orderPath(smallListing, targetMargin),
  };
  const large = {
    id: "large",
    label: `MOQ PO (${largeQty} units)`,
    qty: largeQty,
    costOfGoods: largeCogs,
    inboundPerUnit: largeInbound,
    monthsInStorage: largeMonths,
    ...orderPath(largeListing, targetMargin),
  };

  const extraProfit = large.profit - small.profit;
  const pileDelta = extraProfit * largeQty;
  const smallCapital = small.cashInvested * smallQty;
  const largeCapital = large.cashInvested * largeQty;
  const extraCapital = largeCapital - smallCapital;
  // Profit moves $1 for $1 of COGS on the same sale price and fees.
  const breakEvenLargeCogs = largeCogs + extraProfit;
  const cogsSaveNeeded = smallCogs - breakEvenLargeCogs;
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const paybackMonths =
    extraProfit > 1e-9 && extraCapital > 1e-9
      ? extraCapital / (extraProfit * monthlyUnits)
      : extraProfit <= 1e-9 && extraCapital > 1e-9
        ? Infinity
        : 0;

  let winner = "tie";
  if (extraProfit > 1e-9) winner = "large";
  else if (extraProfit < -1e-9) winner = "small";

  return {
    rows: [small, large],
    small,
    large,
    extraProfit,
    pileDelta,
    smallCapital,
    largeCapital,
    extraCapital,
    breakEvenLargeCogs,
    cogsSaveNeeded,
    monthlyUnits,
    paybackMonths,
    winner,
    summary: bulkBuySummary({
      winner,
      small,
      large,
      extraProfit,
      pileDelta,
      extraCapital,
      breakEvenLargeCogs,
      paybackMonths,
    }),
  };
}

export function bulkBuySummary({
  winner,
  small,
  large,
  extraProfit,
  pileDelta,
  extraCapital,
  breakEvenLargeCogs,
  paybackMonths,
}) {
  const unit = moneyLabel(Math.abs(extraProfit));
  const pile = moneyLabel(Math.abs(pileDelta));
  const cash = moneyLabel(Math.abs(extraCapital));
  const cap = moneyLabel(breakEvenLargeCogs);
  const months = large.monthsInStorage.toFixed(1);
  if (winner === "large") {
    const payback = Number.isFinite(paybackMonths)
      ? ` Extra cash pays back in about ${paybackMonths.toFixed(1)} months of sales at the typed volume.`
      : "";
    return `The ${large.qty}-unit MOQ keeps ${unit} more per unit after ${months} months of storage — ${pile} more on the pile — and ties up ${cash} extra cash. The MOQ unit cost can rise to ${cap} before the usual ${small.qty}-unit PO wins.${payback}`;
  }
  if (winner === "small") {
    return `The usual ${small.qty}-unit PO keeps ${unit} more per unit than the ${large.qty}-unit MOQ after ${months} months of storage on the bigger pile (${pile} on the MOQ qty). Extra cash on the MOQ is ${cash}. The MOQ unit cost has to fall to ${cap} to match the usual PO.`;
  }
  return `The usual ${small.qty}-unit PO and the ${large.qty}-unit MOQ leave the same per-unit profit on these rates. Extra cash on the MOQ is ${cash}.`;
}

// Amazon FBA Prep Service is charged on inbound shipments: FNSKU labels,
// polybags, bubble wrap. The listing's packagingCost is you-prep
// (supplies + your time). Swapping that line is the decision — referral,
// pick fee, inbound freight, and storage do not change. Defaults are
// illustrative; the seller overwrites them from the inbound preview.
export const DEFAULT_AMAZON_LABEL_FEE = 0.3;
export const DEFAULT_AMAZON_BAG_FEE = 0.55;
export const DEFAULT_AMAZON_BUBBLE_FEE = 0.8;

function prepPath(listing, targetMargin, bundle) {
  const path = listing.selected;
  return {
    ...bundle,
    profit: path.profit,
    margin: path.margin,
    cashInvested: path.cashInvested,
    hitsTarget:
      listing.salePrice === 0
        ? path.profit >= 0
        : path.margin + 1e-9 >= targetMargin,
  };
}

/**
 * Compare you-prep against Amazon inbound prep bundles on the same
 * listing. Label-only, label+bag, and label+bag+bubble are always
 * shown. A typed shipment-preview total adds a fourth Amazon row.
 * Profit moves $1 for $1 of prep, so Amazon can charge up to the
 * typed you-prep cost before you-prep wins. Not a leftover-unit
 * hold/remove, not inbound placement, and not FBA vs FBM.
 */
export function comparePrep(input) {
  const diyCost = number(input.packagingCost, "Packaging cost");
  const labelFee = number(
    emptyField(input.amazonLabelFee) ? DEFAULT_AMAZON_LABEL_FEE : input.amazonLabelFee,
    "Amazon labeling fee",
  );
  const bagFee = number(
    emptyField(input.amazonBagFee) ? DEFAULT_AMAZON_BAG_FEE : input.amazonBagFee,
    "Amazon bagging fee",
  );
  const bubbleFee = number(
    emptyField(input.amazonBubbleFee) ? DEFAULT_AMAZON_BUBBLE_FEE : input.amazonBubbleFee,
    "Amazon bubble-wrap fee",
  );
  const targetMargin = number(input.targetMargin, "Target margin");
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);

  const bundles = [
    { id: "diy", label: "You prep", prepCost: diyCost },
    { id: "label", label: "Amazon labeling", prepCost: labelFee },
    { id: "label_bag", label: "Amazon label + bag", prepCost: labelFee + bagFee },
    { id: "full", label: "Amazon label + bag + bubble", prepCost: labelFee + bagFee + bubbleFee },
  ];
  if (!emptyField(input.amazonPrepFee)) {
    bundles.push({
      id: "quote",
      label: "Your Amazon prep quote",
      prepCost: number(input.amazonPrepFee, "Amazon prep quote"),
    });
  }

  const rows = bundles.map((bundle) => {
    const listing = calculateListing({ ...input, packagingCost: bundle.prepCost });
    return prepPath(listing, targetMargin, bundle);
  }).map((row, _, all) => {
    const diy = all[0];
    return {
      ...row,
      profitDelta: row.profit - diy.profit,
      monthlyDelta: (row.profit - diy.profit) * monthlyUnits,
    };
  });

  const maxProfit = Math.max(...rows.map((row) => row.profit));
  const leaders = rows.filter((row) => Math.abs(row.profit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";
  const byId = (id) => rows.find((row) => row.id === id);

  const comparison = {
    rows,
    diy: byId("diy"),
    label: byId("label"),
    labelBag: byId("label_bag"),
    full: byId("full"),
    quote: byId("quote") ?? null,
    labelFee,
    bagFee,
    bubbleFee,
    monthlyUnits,
    breakEvenAmazonFee: diyCost,
    winner,
  };
  comparison.summary = prepSummary(comparison);
  return comparison;
}

export function prepSummary(comparison) {
  const { diy, label, labelBag, full, quote, winner, breakEvenAmazonFee, monthlyUnits } = comparison;
  const cap = moneyLabel(breakEvenAmazonFee);
  const month = `${monthlyUnits} unit${monthlyUnits === 1 ? "" : "s"}`;
  const vsBag =
    labelBag.profitDelta < -1e-9
      ? `loses ${moneyLabel(Math.abs(labelBag.profitDelta))}`
      : labelBag.profitDelta > 1e-9
        ? `keeps ${moneyLabel(labelBag.profitDelta)} more`
        : "matches you-prep";

  if (winner === "diy") {
    const bagGap = moneyLabel(Math.abs(labelBag.profitDelta));
    const bagMonth = moneyLabel(Math.abs(labelBag.monthlyDelta));
    const labelLine =
      label.profitDelta > 1e-9
        ? `Amazon labeling alone at ${moneyLabel(label.prepCost)} still beats you-prep by ${moneyLabel(label.profitDelta)}`
        : label.profitDelta < -1e-9
          ? `Amazon labeling alone at ${moneyLabel(label.prepCost)} costs ${moneyLabel(Math.abs(label.profitDelta))} more`
          : `Amazon labeling alone at ${moneyLabel(label.prepCost)} matches you-prep`;
    return (
      `You-prep at ${moneyLabel(diy.prepCost)} keeps ${bagGap} more per unit than Amazon label + bag ` +
      `at ${moneyLabel(labelBag.prepCost)} — ${bagMonth} more this month at ${month}. ` +
      `${labelLine}. Amazon prep can rise to ${cap} before you-prep wins.`
    );
  }
  if (winner === "label") {
    return (
      `Amazon labeling at ${moneyLabel(label.prepCost)} keeps ${moneyLabel(label.profitDelta)} more per unit ` +
      `than you-prep at ${moneyLabel(diy.prepCost)} — ${moneyLabel(label.monthlyDelta)} more this month at ${month}. ` +
      `Label + bag is ${moneyLabel(labelBag.prepCost)} and ${vsBag} vs you-prep. ` +
      `Amazon prep can rise to ${cap} before you-prep wins.`
    );
  }
  if (winner === "label_bag") {
    return (
      `Amazon label + bag at ${moneyLabel(labelBag.prepCost)} keeps ${moneyLabel(labelBag.profitDelta)} more per unit ` +
      `than you-prep at ${moneyLabel(diy.prepCost)} — ${moneyLabel(labelBag.monthlyDelta)} more this month at ${month}. ` +
      `Amazon prep can rise to ${cap} before you-prep wins.`
    );
  }
  if (winner === "full") {
    return (
      `Amazon label + bag + bubble at ${moneyLabel(full.prepCost)} keeps ${moneyLabel(full.profitDelta)} more per unit ` +
      `than you-prep at ${moneyLabel(diy.prepCost)} — ${moneyLabel(full.monthlyDelta)} more this month at ${month}. ` +
      `Amazon prep can rise to ${cap} before you-prep wins.`
    );
  }
  if (winner === "quote" && quote) {
    const delta =
      quote.profitDelta > 1e-9
        ? `keeps ${moneyLabel(quote.profitDelta)} more`
        : quote.profitDelta < -1e-9
          ? `keeps ${moneyLabel(Math.abs(quote.profitDelta))} less`
          : "matches";
    return (
      `Your Amazon prep quote at ${moneyLabel(quote.prepCost)} ${delta} per unit than you-prep ` +
      `at ${moneyLabel(diy.prepCost)}. Amazon prep can rise to ${cap} before you-prep wins.`
    );
  }
  return (
    `You-prep and the cheapest Amazon prep leave the same profit on these rates. ` +
    `Amazon prep can rise to ${cap} before you-prep wins.`
  );
}

/**
 * Illustrative Vine enrollment. Unit count, referral on the gift, and
 * conversion lift are inputs — not Amazon Vine's current invite size
 * or a claimed review-to-sale rate. 30 leftover units / 0% referral /
 * 12% lift / 6 months is a launch a seller overwrites from their last
 * enrollment.
 */
export const DEFAULT_VINE_UNITS = 30;
export const DEFAULT_VINE_REFERRAL_RATE = 0;
export const DEFAULT_CONVERSION_LIFT_PCT = 12;
export const DEFAULT_VINE_MONTHS = 6;

export function vineUnitCost(input) {
  const vineReferralRate = emptyField(input.vineReferralRate)
    ? DEFAULT_VINE_REFERRAL_RATE
    : number(input.vineReferralRate, "Vine referral rate");
  const vineSalePrice = emptyField(input.vineSalePrice)
    ? 0
    : number(input.vineSalePrice, "Vine sale price");
  const gifted = calculateListing({
    ...input,
    salePrice: vineSalePrice,
    referralRate: vineReferralRate,
    monthlySellerFee: 0,
  });
  return gifted.selected.cashInvested + gifted.selected.feeTotal;
}

function vineSummary({
  winner,
  extraKeptOnLeftover,
  extraKeptOnSellable,
  vineUpfront,
  breakEvenLiftPct,
  vineMonths,
}) {
  const upfront = moneyLabel(vineUpfront);
  const leftoverGap = moneyLabel(Math.abs(extraKeptOnLeftover));
  const leftoverAhead = extraKeptOnLeftover >= 0 ? "more" : "less";
  const liftFloor = Number.isFinite(breakEvenLiftPct)
    ? ` Leftover Vine needs about ${breakEvenLiftPct.toFixed(1)}% lift over ${vineMonths} month${vineMonths === 1 ? "" : "s"} to match skipping.`
    : " No conversion lift on these rates can recover leftover Vine.";
  if (winner === "tie") {
    return `Vine and skipping leave the same leftover over this horizon.`;
  }
  if (winner === "leftover") {
    return (
      `Vine on leftover units keeps ${leftoverGap} more than skipping after a ${upfront} enrollment.` +
      liftFloor +
      ` Vine on units that would have sold keeps ${moneyLabel(Math.abs(extraKeptOnSellable))} ${extraKeptOnSellable >= 0 ? "more" : "less"}.`
    );
  }
  if (winner === "sellable") {
    return (
      `Vine on units that would have sold keeps ${moneyLabel(Math.abs(extraKeptOnSellable))} more than skipping after a ${upfront} enrollment.` +
      liftFloor
    );
  }
  return (
    `Skipping Vine keeps ${leftoverGap} more than leftover enrollment after a ${upfront} gift.` +
    liftFloor
  );
}

/**
 * Same SKU, three ways to treat a Vine invite.
 *
 *   - Skip Vine — keep the typed monthly profit for the typed months.
 *   - Vine leftover units — gift units that would not have sold, pay
 *     COGS + inbound + prep + fulfillment, then apply the conversion
 *     lift to the selling month.
 *   - Vine units that would have sold — same gift cost plus the
 *     profit those units would have left at list.
 *
 * Complementary to landed coupons (a discount on paid sales) and to
 * open return-rate work. Rates and the lift are inputs, not Vine policy.
 */
export function compareVine(input) {
  const vineUnits = emptyField(input.vineUnits)
    ? DEFAULT_VINE_UNITS
    : number(input.vineUnits, "Vine units");
  if (vineUnits === 0) throw new Error("Vine units must be greater than zero");
  const conversionLiftPct = emptyField(input.conversionLiftPct)
    ? DEFAULT_CONVERSION_LIFT_PCT
    : number(input.conversionLiftPct, "Conversion lift percent");
  const vineMonths = emptyField(input.vineMonths)
    ? DEFAULT_VINE_MONTHS
    : number(input.vineMonths, "Vine months");
  if (vineMonths === 0) throw new Error("Vine months must be greater than zero");
  const vineReferralRate = emptyField(input.vineReferralRate)
    ? DEFAULT_VINE_REFERRAL_RATE
    : number(input.vineReferralRate, "Vine referral rate");

  const listing = calculateListing(input);
  const profitPerUnit = listing.selected.profit;
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  const monthlyProfit = profitPerUnit * monthlyUnits;
  const unitCost = vineUnitCost(input);
  const vineUpfront = vineUnits * unitCost;
  const extraMonthly = monthlyProfit * (conversionLiftPct / 100);
  const liftOverHorizon = extraMonthly * vineMonths;
  const skipHorizon = monthlyProfit * vineMonths;
  const leftoverHorizon = skipHorizon + liftOverHorizon - vineUpfront;
  const sellableHorizon = leftoverHorizon - vineUnits * profitPerUnit;

  const skip = {
    id: "skip",
    label: "Skip Vine",
    horizonProfit: skipHorizon,
    upfront: 0,
  };
  const leftover = {
    id: "leftover",
    label: "Vine leftover units",
    horizonProfit: leftoverHorizon,
    upfront: vineUpfront,
  };
  const sellable = {
    id: "sellable",
    label: "Vine units that would have sold",
    horizonProfit: sellableHorizon,
    upfront: vineUpfront + vineUnits * Math.max(0, profitPerUnit),
  };

  const extraKeptOnLeftover = leftoverHorizon - skipHorizon;
  const extraKeptOnSellable = sellableHorizon - skipHorizon;
  const rows = [skip, leftover, sellable].map((row) => ({
    ...row,
    vsSkip: row.horizonProfit - skipHorizon,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.horizonProfit));
  const leaders = rows.filter((row) => Math.abs(row.horizonProfit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenLiftPct = Infinity;
  if (monthlyProfit > 1e-12) {
    breakEvenLiftPct = (vineUpfront / (monthlyProfit * vineMonths)) * 100;
  }
  let breakEvenMonths = Infinity;
  if (extraMonthly > 1e-12) {
    breakEvenMonths = vineUpfront / extraMonthly;
  }

  return {
    rows,
    skip: rows[0],
    leftover: rows[1],
    sellable: rows[2],
    vineUnits,
    vineReferralRate,
    conversionLiftPct,
    vineMonths,
    profitPerUnit,
    monthlyProfit,
    vineUnitCost: unitCost,
    vineUpfront,
    extraMonthly,
    extraKeptOnLeftover,
    extraKeptOnSellable,
    breakEvenLiftPct,
    breakEvenMonths,
    winner,
    summary: vineSummary({
      winner,
      extraKeptOnLeftover,
      extraKeptOnSellable,
      vineUpfront,
      breakEvenLiftPct,
      vineMonths,
    }),
  };
}

// Illustrative aged-inventory defaults so the table is immediately useful.
// AIS, removal, and disposal are inputs — not Amazon's live surcharge
// schedule or a published removal-order rate card. $1.50 / unit / month
// is a middle-aged standard-size surcharge a seller replaces from the
// fee preview. $1.04 return and $0.32 dispose are the common standard-size
// removal examples. 80 units at 5% sell-through over 3 months is a slow
// leftover pile, not a forecast.
export const DEFAULT_AGED_UNITS = 80;
export const DEFAULT_AGED_SELL_THROUGH_PCT = 5;
export const DEFAULT_AGED_HORIZON_MONTHS = 3;
export const DEFAULT_AGED_AIS_PER_UNIT = 1.5;
export const DEFAULT_AGED_REMOVAL_FEE = 1.04;
export const DEFAULT_AGED_DISPOSAL_FEE = 0.32;
// Illustrative FBA Liquidations defaults. Recovery is a percent of
// list the seller pastes from Amazon's liquidation estimate — not a
// published live recoverability table. $0.30 / unit is a processing
// line some previews still show; $4 elsewhere leftover is a modest
// eBay / own-site keep after fees and a Ground label, not a forecast.
export const DEFAULT_LIQUIDATION_RECOVERY_PCT = 8;
export const DEFAULT_LIQUIDATION_FEE = 0.3;
export const DEFAULT_ELSEWHERE_NET = 4;

function agedKeepPath({
  units,
  sellThroughPct,
  horizonMonths,
  storagePerUnitMonth,
  aisPerUnit,
  contribution,
}) {
  let remaining = units;
  let cash = 0;
  let soldTotal = 0;
  let carryingFees = 0;
  const rate = sellThroughPct / 100;
  for (let month = 0; month < horizonMonths; month += 1) {
    const fees = remaining * (storagePerUnitMonth + aisPerUnit);
    const sold = remaining * rate;
    cash += sold * contribution - fees;
    carryingFees += fees;
    soldTotal += sold;
    remaining -= sold;
  }
  return { cash, remaining, soldTotal, carryingFees };
}

function agedBreakEvenSellThrough(targetCash, args) {
  if (agedKeepPath({ ...args, sellThroughPct: 100 }).cash + 1e-9 < targetCash) {
    return Infinity;
  }
  if (agedKeepPath({ ...args, sellThroughPct: 0 }).cash >= targetCash - 1e-9) {
    return 0;
  }
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (agedKeepPath({ ...args, sellThroughPct: mid }).cash >= targetCash) hi = mid;
    else lo = mid;
  }
  return hi;
}

function agedBreakEvenAis(targetCash, args) {
  const atZero = agedKeepPath({ ...args, aisPerUnit: 0 });
  if (atZero.cash + 1e-9 < targetCash) return 0;
  let lo = 0;
  let hi = 1;
  while (agedKeepPath({ ...args, aisPerUnit: hi }).cash > targetCash && hi < 1e6) {
    hi *= 2;
  }
  if (agedKeepPath({ ...args, aisPerUnit: hi }).cash > targetCash) return Infinity;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (agedKeepPath({ ...args, aisPerUnit: mid }).cash >= targetCash) lo = mid;
    else hi = mid;
  }
  return lo;
}

function agedInventorySummary({
  winner,
  keepCash,
  removeCash,
  disposeCash,
  extraKeepVsDispose,
  breakEvenSellThroughVsDispose,
  agedUnits,
  horizonMonths,
}) {
  const keep = moneyLabel(keepCash);
  const remove = moneyLabel(removeCash);
  const dispose = moneyLabel(disposeCash);
  const gap = moneyLabel(Math.abs(extraKeepVsDispose));
  const floor = Number.isFinite(breakEvenSellThroughVsDispose)
    ? `${breakEvenSellThroughVsDispose.toFixed(1)}%`
    : "an unreachable sell-through";
  const pile = `${agedUnits} unit${agedUnits === 1 ? "" : "s"}`;
  const months = `${horizonMonths} month${horizonMonths === 1 ? "" : "s"}`;
  if (winner === "keep") {
    return (
      `Keeping the ${pile} still beats disposing by ${gap} over ${months} ` +
      `(${keep} vs ${dispose}). Removing them now is ${remove}. ` +
      `Keeping needs about ${floor} monthly sell-through to match dispose.`
    );
  }
  if (winner === "remove") {
    return (
      `A return removal at ${remove} beats keeping (${keep}) by ` +
      `${moneyLabel(removeCash - keepCash)} over ${months}. ` +
      `Disposing is ${dispose}. Keeping needs about ${floor} monthly ` +
      `sell-through to match dispose.`
    );
  }
  if (winner === "dispose") {
    return (
      `Disposing the ${pile} loses ${gap} less than keeping over ${months} ` +
      `(${dispose} vs ${keep}). A return removal is ${remove}. ` +
      `Keeping needs about ${floor} monthly sell-through to match dispose.`
    );
  }
  return (
    `Keeping, returning, and disposing leave the same cash on these rates ` +
    `over ${months}.`
  );
}

/**
 * Same leftover FBA pile, three ways to treat units that already sit.
 *
 *   - Keep — expected sales at the typed monthly sell-through, minus
 *     storage and aged-inventory surcharge on what is still there.
 *   - Remove (return) — pay the return-removal fee now; COGS is already
 *     sunk and the units come back.
 *   - Dispose — pay the cheaper disposal fee; the units are gone.
 *
 * COGS and inbound are sunk (the pile is already in FBA). Professional
 * is paid anyway. Complementary to Q4 storage (a seasonal rate, not an
 * age surcharge), to restock vs low-inventory fee (a quantity question),
 * and to 3PL long-term storage (a different warehouse). Rates are inputs,
 * not Amazon's live AIS or removal schedule.
 */
export function compareAgedInventory(input) {
  const agedUnits = emptyField(input.agedUnits)
    ? DEFAULT_AGED_UNITS
    : number(input.agedUnits, "Aged units");
  if (agedUnits === 0) throw new Error("Aged units must be greater than zero");
  const monthlySellThroughPct = emptyField(input.monthlySellThroughPct)
    ? DEFAULT_AGED_SELL_THROUGH_PCT
    : number(input.monthlySellThroughPct, "Monthly sell-through percent");
  if (monthlySellThroughPct > 100) {
    throw new Error("Monthly sell-through percent must be at most 100");
  }
  const horizonMonths = emptyField(input.horizonMonths)
    ? DEFAULT_AGED_HORIZON_MONTHS
    : number(input.horizonMonths, "Horizon months");
  if (horizonMonths === 0) throw new Error("Horizon months must be greater than zero");
  const aisPerUnit = emptyField(input.aisPerUnit)
    ? DEFAULT_AGED_AIS_PER_UNIT
    : number(input.aisPerUnit, "Aged inventory surcharge");
  const removalFee = emptyField(input.removalFee)
    ? DEFAULT_AGED_REMOVAL_FEE
    : number(input.removalFee, "Removal fee");
  const disposalFee = emptyField(input.disposalFee)
    ? DEFAULT_AGED_DISPOSAL_FEE
    : number(input.disposalFee, "Disposal fee");

  const listing = calculateListing({
    ...input,
    fulfillmentMethod: "fba",
    monthsInStorage: 1,
  });
  const salePrice = listing.salePrice;
  const referral = salePrice * (number(input.referralRate, "Referral rate", 15) / 100);
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");
  const contribution = salePrice - referral - listing.fulfillmentFee - adsPerUnit;
  const storagePerUnitMonth = listing.cubicFeet * number(
    input.storageRate,
    "Storage rate",
    STORAGE_PRESETS.off_peak.perCuFt,
  );

  const keepPath = agedKeepPath({
    units: agedUnits,
    sellThroughPct: monthlySellThroughPct,
    horizonMonths,
    storagePerUnitMonth,
    aisPerUnit,
    contribution,
  });
  const removeCash = -removalFee * agedUnits;
  const disposeCash = -disposalFee * agedUnits;

  const keep = {
    id: "keep",
    label: "Keep and sell through",
    cash: keepPath.cash,
    leftoverUnits: keepPath.remaining,
    soldUnits: keepPath.soldTotal,
    carryingFees: keepPath.carryingFees,
  };
  const remove = {
    id: "remove",
    label: "Remove (return to you)",
    cash: removeCash,
    leftoverUnits: agedUnits,
    soldUnits: 0,
    carryingFees: 0,
  };
  const dispose = {
    id: "dispose",
    label: "Dispose",
    cash: disposeCash,
    leftoverUnits: 0,
    soldUnits: 0,
    carryingFees: 0,
  };

  const rows = [keep, remove, dispose].map((row) => ({
    ...row,
    vsKeep: row.cash - keep.cash,
  }));
  const maxCash = Math.max(...rows.map((row) => row.cash));
  const leaders = rows.filter((row) => Math.abs(row.cash - maxCash) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const keepArgs = {
    units: agedUnits,
    horizonMonths,
    storagePerUnitMonth,
    aisPerUnit,
    contribution,
  };
  const breakEvenSellThroughVsDispose = agedBreakEvenSellThrough(disposeCash, keepArgs);
  const breakEvenSellThroughVsRemove = agedBreakEvenSellThrough(removeCash, keepArgs);
  const breakEvenAisVsDispose = agedBreakEvenAis(disposeCash, {
    ...keepArgs,
    sellThroughPct: monthlySellThroughPct,
  });

  return {
    rows,
    keep: rows[0],
    remove: rows[1],
    dispose: rows[2],
    agedUnits,
    monthlySellThroughPct,
    horizonMonths,
    aisPerUnit,
    removalFee,
    disposalFee,
    contribution,
    storagePerUnitMonth,
    extraKeepVsDispose: keep.cash - dispose.cash,
    extraKeepVsRemove: keep.cash - remove.cash,
    breakEvenSellThroughVsDispose,
    breakEvenSellThroughVsRemove,
    breakEvenAisVsDispose,
    winner,
    summary: agedInventorySummary({
      winner,
      keepCash: keep.cash,
      removeCash,
      disposeCash,
      extraKeepVsDispose: keep.cash - dispose.cash,
      breakEvenSellThroughVsDispose,
      agedUnits,
      horizonMonths,
    }),
  };
}

/**
 * Months of the remaining stay that fall after the aged-inventory threshold.
 * Age is counted at the end of each future month: a unit already stored for
 * `monthsAlreadyStored` months, held one more month, is age
 * `monthsAlreadyStored + 1`. Surcharge applies when that age is strictly
 * greater than `agedStartsAfterMonths` (the usual “after 6 months” reading).
 *
 * Complementary to compareAgedInventory, which applies a typed per-unit AIS
 * every month of the horizon. This answers a different question: how many of
 * the remaining months will actually be billed at the surcharge.
 */
export function agedSurchargeMonths({
  monthsAlreadyStored,
  additionalMonths,
  agedStartsAfterMonths,
}) {
  const already = number(monthsAlreadyStored, "Months already stored");
  const extra = number(additionalMonths, "Additional months");
  const threshold = number(agedStartsAfterMonths, "Aged surcharge starts after months", 6);
  let surchargeMonths = 0;
  for (let month = 1; month <= extra; month += 1) {
    if (already + month > threshold) surchargeMonths += 1;
  }
  return surchargeMonths;
}

function warehouseCostPerUnit({
  cubicFeet,
  additionalMonths,
  monthsAlreadyStored,
  agedStartsAfterMonths,
  storageRate,
  agedSurchargePerCuFt,
}) {
  const cuFt = number(cubicFeet, "Cubic feet");
  const extra = number(additionalMonths, "Additional months");
  const storage = number(storageRate, "Storage rate");
  const surcharge = number(agedSurchargePerCuFt, "Aged surcharge per cu ft");
  const surchargeMonths = agedSurchargeMonths({
    monthsAlreadyStored,
    additionalMonths: extra,
    agedStartsAfterMonths,
  });
  return {
    surchargeMonths,
    storagePerUnit: cuFt * storage * extra,
    surchargePerUnit: cuFt * surcharge * surchargeMonths,
    warehousePerUnit: cuFt * storage * extra + cuFt * surcharge * surchargeMonths,
  };
}

/**
 * Forward-looking hold-vs-remove for units already in FBA.
 *
 * Cost of goods, inbound already paid, storage already billed, and the
 * professional monthly plan are sunk either way and are excluded. The hold
 * path assumes the remaining units sell at `salePrice` after
 * `expectedMonthsToSell` more months, paying referral, fulfillment, ads, and
 * the *future* warehouse bill. The remove path pays the removal/disposal fee
 * and recovers `salvagePerUnit` (liquidation, FBM elsewhere, or $0).
 *
 * Distinct from compareAgedInventory (keep / return / dispose over a sell-
 * through horizon with a flat per-unit AIS). Salvaged from #1495.
 */
export function compareHoldVsRemove(input) {
  const remainingUnits = wholeNumber(input.remainingUnits, "Remaining units", 1);
  if (remainingUnits < 1) throw new Error("Remaining units must be at least 1");
  const expectedMonthsToSell = number(input.expectedMonthsToSell, "Expected months to sell", 2);
  const monthsAlreadyStored = number(input.monthsAlreadyStored, "Months already stored");
  const agedStartsAfterMonths = number(input.agedStartsAfterMonths, "Aged surcharge starts after months", 6);
  const storageRate = number(input.storageRate, "Storage rate");
  const agedSurchargePerCuFt = number(input.agedSurchargePerCuFt, "Aged surcharge per cu ft");
  const removalFeePerUnit = number(input.removalFeePerUnit, "Removal fee per unit");
  const salvagePerUnit = number(input.salvagePerUnit, "Salvage per unit");
  const cubicFeet = number(input.cubicFeet, "Cubic feet");
  const salePrice = number(input.salePrice, "Sale price");
  const referralRate = number(input.referralRate, "Referral rate");
  const fulfillmentFee = number(input.fulfillmentFee, "Fulfillment fee");
  const adsPerUnit = number(input.adsPerUnit, "Ads per unit");

  const referral = salePrice * (referralRate / 100);
  const sellingCosts = referral + fulfillmentFee + adsPerUnit;
  const removeNetPerUnit = salvagePerUnit - removalFeePerUnit;

  function outcome(additionalMonths) {
    const warehouse = warehouseCostPerUnit({
      cubicFeet,
      additionalMonths,
      monthsAlreadyStored,
      agedStartsAfterMonths,
      storageRate,
      agedSurchargePerCuFt,
    });
    const holdNetPerUnit = salePrice - sellingCosts - warehouse.warehousePerUnit;
    return {
      additionalMonths,
      ...warehouse,
      holdNetPerUnit,
      holdTotal: holdNetPerUnit * remainingUnits,
      removeNetPerUnit,
      removeTotal: removeNetPerUnit * remainingUnits,
      holdAdvantage: (holdNetPerUnit - removeNetPerUnit) * remainingUnits,
    };
  }

  const expected = outcome(expectedMonthsToSell);
  const holdAdvantage = expected.holdAdvantage;
  let monthsUntilRemoveWins = null;
  for (let month = 0; month <= 36; month += 1) {
    if (outcome(month).holdAdvantage < 0) {
      monthsUntilRemoveWins = month;
      break;
    }
  }

  return {
    remainingUnits,
    expectedMonthsToSell,
    monthsAlreadyStored,
    agedStartsAfterMonths,
    sellingCosts,
    ...expected,
    betterPath: holdAdvantage > 0 ? "hold" : holdAdvantage < 0 ? "remove" : "tie",
    monthsUntilRemoveWins,
    scenarios: [1, 2, 3, 6].map(outcome),
  };
}

function liquidationSummary({
  winner,
  keepCash,
  liquidateCash,
  elsewhereCash,
  disposeCash,
  extraLiquidateVsDispose,
  extraElsewhereVsLiquidate,
  extraKeepVsLiquidate,
  breakEvenRecoveryVsDispose,
  breakEvenElsewhereVsLiquidate,
  breakEvenSellThroughVsLiquidate,
  agedUnits,
  horizonMonths,
}) {
  const keep = moneyLabel(keepCash);
  const liquidate = moneyLabel(liquidateCash);
  const elsewhere = moneyLabel(elsewhereCash);
  const dispose = moneyLabel(disposeCash);
  const liqGap = moneyLabel(Math.abs(extraLiquidateVsDispose));
  const elseGap = moneyLabel(Math.abs(extraElsewhereVsLiquidate));
  const keepGap = moneyLabel(Math.abs(extraKeepVsLiquidate));
  const pile = `${agedUnits} unit${agedUnits === 1 ? "" : "s"}`;
  const months = `${horizonMonths} month${horizonMonths === 1 ? "" : "s"}`;
  const recoveryFloor = !Number.isFinite(breakEvenRecoveryVsDispose)
    ? "an unreachable recovery"
    : breakEvenRecoveryVsDispose <= 1e-9
      ? "0%"
      : `${breakEvenRecoveryVsDispose.toFixed(1)}%`;
  const elsewhereFloor = Number.isFinite(breakEvenElsewhereVsLiquidate)
    ? moneyLabel(breakEvenElsewhereVsLiquidate)
    : "an unreachable leftover";
  const sellThroughFloor = Number.isFinite(breakEvenSellThroughVsLiquidate)
    ? `${breakEvenSellThroughVsLiquidate.toFixed(1)}%`
    : "an unreachable sell-through";

  if (winner === "liquidate") {
    return (
      `FBA Liquidations keeps ${liqGap} more than disposing the ${pile} ` +
      `(${liquidate} vs ${dispose}). Selling the returned units elsewhere ` +
      `is ${elsewhere}. Keeping over ${months} is ${keep}. ` +
      `${breakEvenRecoveryVsDispose <= 1e-9
        ? "Even 0% recovery still beats dispose on this processing fee."
        : `Recovery can fall to about ${recoveryFloor} before dispose matches.`}`
    );
  }
  if (winner === "elsewhere") {
    return (
      `Pulling the ${pile} and selling them elsewhere keeps ${elseGap} more ` +
      `than FBA Liquidations (${elsewhere} vs ${liquidate}). Dispose is ` +
      `${dispose}. Keeping over ${months} is ${keep}. ` +
      `Elsewhere leftover can fall to about ${elsewhereFloor} before ` +
      `liquidations match.`
    );
  }
  if (winner === "dispose") {
    return (
      `Disposing the ${pile} loses ${liqGap} less than FBA Liquidations ` +
      `(${dispose} vs ${liquidate}). Selling elsewhere is ${elsewhere}. ` +
      `Keeping over ${months} is ${keep}. Recovery needs about ` +
      `${recoveryFloor} to match dispose.`
    );
  }
  if (winner === "keep") {
    return (
      `Keeping the ${pile} still beats FBA Liquidations by ${keepGap} over ` +
      `${months} (${keep} vs ${liquidate}). Selling elsewhere is ${elsewhere}. ` +
      `Keeping needs about ${sellThroughFloor} monthly sell-through to ` +
      `match liquidations.`
    );
  }
  return (
    `Keeping, liquidating, selling elsewhere, and disposing leave the ` +
    `same cash on these rates over ${months}.`
  );
}

/**
 * Same leftover FBA pile, four cash paths — complementary to
 * compareAgedInventory, which treats a return as a fee with no resale
 * and has no Amazon Liquidations recovery.
 *
 *   - Keep — expected sales at the typed monthly sell-through, minus
 *     storage and aged-inventory surcharge (same path as the aged page).
 *   - Liquidate — Amazon takes the units and pays recovery% of list
 *     minus a per-unit processing fee. Units are gone.
 *   - Elsewhere — pay the return-removal fee, then keep the typed
 *     leftover from selling the units on eBay / your site / a jobber.
 *   - Dispose — pay the cheaper disposal fee; the units are gone.
 *
 * COGS and inbound are sunk. Professional is paid anyway. Rates are
 * inputs, not Amazon's live liquidation recoverability table.
 * Salvaged from #1703 onto current main so the unique recovery
 * comparison is not lost to a conflicted close.
 */
export function compareLiquidation(input = {}) {
  const aged = compareAgedInventory(input);
  const recoveryPct = emptyField(input.recoveryPct)
    ? DEFAULT_LIQUIDATION_RECOVERY_PCT
    : takePercent(input.recoveryPct, "Recovery percent");
  const liquidationFee = emptyField(input.liquidationFee)
    ? DEFAULT_LIQUIDATION_FEE
    : number(input.liquidationFee, "Liquidation fee");
  const elsewhereNet = emptyField(input.elsewhereNet)
    ? DEFAULT_ELSEWHERE_NET
    : number(input.elsewhereNet, "Elsewhere leftover");

  const listing = calculateListing({
    ...input,
    fulfillmentMethod: "fba",
    monthsInStorage: 1,
  });
  const salePrice = listing.salePrice;
  const agedUnits = aged.agedUnits;
  const liquidatePerUnit = salePrice * (recoveryPct / 100) - liquidationFee;
  const elsewherePerUnit = elsewhereNet - aged.removalFee;
  const liquidateCash = liquidatePerUnit * agedUnits;
  const elsewhereCash = elsewherePerUnit * agedUnits;

  const keep = {
    id: "keep",
    label: "Keep and sell through",
    cash: aged.keep.cash,
    leftoverUnits: aged.keep.leftoverUnits,
    soldUnits: aged.keep.soldUnits,
    carryingFees: aged.keep.carryingFees,
    perUnit: aged.keep.cash / agedUnits,
  };
  const liquidate = {
    id: "liquidate",
    label: "FBA Liquidations",
    cash: liquidateCash,
    leftoverUnits: 0,
    soldUnits: 0,
    carryingFees: 0,
    perUnit: liquidatePerUnit,
  };
  const elsewhere = {
    id: "elsewhere",
    label: "Remove and sell elsewhere",
    cash: elsewhereCash,
    leftoverUnits: 0,
    soldUnits: agedUnits,
    carryingFees: 0,
    perUnit: elsewherePerUnit,
  };
  const dispose = {
    id: "dispose",
    label: "Dispose",
    cash: aged.dispose.cash,
    leftoverUnits: 0,
    soldUnits: 0,
    carryingFees: 0,
    perUnit: aged.dispose.cash / agedUnits,
  };

  const rows = [keep, liquidate, elsewhere, dispose].map((row) => ({
    ...row,
    vsLiquidate: row.cash - liquidateCash,
  }));
  const maxCash = Math.max(...rows.map((row) => row.cash));
  const leaders = rows.filter((row) => Math.abs(row.cash - maxCash) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenRecoveryVsDispose = Infinity;
  if (salePrice > 1e-12) {
    breakEvenRecoveryVsDispose = ((liquidationFee + aged.dispose.cash / agedUnits) / salePrice) * 100;
    if (!Number.isFinite(breakEvenRecoveryVsDispose) || breakEvenRecoveryVsDispose < -1e-9) {
      breakEvenRecoveryVsDispose = 0;
    } else if (breakEvenRecoveryVsDispose > 100 + 1e-9) {
      breakEvenRecoveryVsDispose = Infinity;
    } else {
      breakEvenRecoveryVsDispose = Math.max(0, Math.min(100, breakEvenRecoveryVsDispose));
    }
  }

  let breakEvenRecoveryVsKeep = Infinity;
  if (salePrice > 1e-12) {
    breakEvenRecoveryVsKeep = ((keep.perUnit + liquidationFee) / salePrice) * 100;
    if (!Number.isFinite(breakEvenRecoveryVsKeep) || breakEvenRecoveryVsKeep < -1e-9) {
      breakEvenRecoveryVsKeep = 0;
    } else if (breakEvenRecoveryVsKeep > 100 + 1e-9) {
      breakEvenRecoveryVsKeep = Infinity;
    } else {
      breakEvenRecoveryVsKeep = Math.max(0, Math.min(100, breakEvenRecoveryVsKeep));
    }
  }

  const breakEvenElsewhereVsLiquidate = liquidatePerUnit + aged.removalFee;
  const keepArgs = {
    units: agedUnits,
    horizonMonths: aged.horizonMonths,
    storagePerUnitMonth: aged.storagePerUnitMonth,
    aisPerUnit: aged.aisPerUnit,
    contribution: aged.contribution,
  };
  const breakEvenSellThroughVsLiquidate = agedBreakEvenSellThrough(liquidateCash, keepArgs);

  return {
    rows,
    keep: rows[0],
    liquidate: rows[1],
    elsewhere: rows[2],
    dispose: rows[3],
    winner,
    salePrice,
    agedUnits,
    monthlySellThroughPct: aged.monthlySellThroughPct,
    horizonMonths: aged.horizonMonths,
    aisPerUnit: aged.aisPerUnit,
    removalFee: aged.removalFee,
    disposalFee: aged.disposalFee,
    recoveryPct,
    liquidationFee,
    elsewhereNet,
    contribution: aged.contribution,
    storagePerUnitMonth: aged.storagePerUnitMonth,
    extraLiquidateVsDispose: liquidateCash - aged.dispose.cash,
    extraElsewhereVsLiquidate: elsewhereCash - liquidateCash,
    extraKeepVsLiquidate: aged.keep.cash - liquidateCash,
    breakEvenRecoveryVsDispose,
    breakEvenRecoveryVsKeep,
    breakEvenElsewhereVsLiquidate,
    breakEvenSellThroughVsLiquidate,
    summary: liquidationSummary({
      winner,
      keepCash: aged.keep.cash,
      liquidateCash,
      elsewhereCash,
      disposeCash: aged.dispose.cash,
      extraLiquidateVsDispose: liquidateCash - aged.dispose.cash,
      extraElsewhereVsLiquidate: elsewhereCash - liquidateCash,
      extraKeepVsLiquidate: aged.keep.cash - liquidateCash,
      breakEvenRecoveryVsDispose,
      breakEvenElsewhereVsLiquidate,
      breakEvenSellThroughVsLiquidate,
      agedUnits,
      horizonMonths: aged.horizonMonths,
    }),
  };
}

export function liquidationNote(comparison) {
  if (!comparison?.liquidate || !comparison?.dispose) {
    throw new Error("Liquidation comparison is missing rows");
  }
  return comparison.summary;
}

// Freight to one FC vs Amazon's inbound placement fee is the weekly inbound
// decision. The listing calculator's "inbound / unit" field is a blended
// number; this comparison keeps freight and placement on separate lines so a
// seller can see whether following Amazon's split actually costs less.
export function compareInboundPlacement(input) {
  const units = number(input.units, "Shipment units");
  if (units === 0) {
    throw new Error("Shipment units must be greater than zero");
  }

  const freight = {
    minimal: number(input.freightMinimal, "Single-destination freight"),
    partial: number(input.freightPartial, "Partial-split freight"),
    optimized: number(input.freightOptimized, "Amazon-optimized freight"),
  };
  const placementPerUnit = {
    minimal: number(input.placementMinimalPerUnit, "Minimal placement fee per unit"),
    partial: number(input.placementPartialPerUnit, "Partial placement fee per unit"),
    optimized: number(input.placementOptimizedPerUnit, "Optimized placement fee per unit", 0),
  };

  /** @type {Record<string, {id: string, label: string, freight: number, placementPerUnit: number, placementTotal: number, total: number, perUnit: number}>} */
  const paths = {};
  for (const id of PLACEMENT_PATHS) {
    const placementTotal = units * placementPerUnit[id];
    const total = freight[id] + placementTotal;
    paths[id] = {
      id,
      label: PLACEMENT_PATH_LABELS[id],
      freight: freight[id],
      placementPerUnit: placementPerUnit[id],
      placementTotal,
      total,
      perUnit: total / units,
    };
  }

  const ranked = PLACEMENT_PATHS.map((id) => paths[id]).sort((a, b) => a.total - b.total);
  const cheapestTotal = ranked[0].total;
  const cheapestIds = ranked
    .filter((path) => Math.abs(path.total - cheapestTotal) < 1e-9)
    .map((path) => path.id);
  const winner = cheapestIds.length === 1 ? cheapestIds[0] : "tie";
  const nextBestDelta = ranked.length > 1 ? ranked[1].total - cheapestTotal : 0;

  return {
    units,
    paths,
    ranked,
    winner,
    cheapestIds,
    extraVsCheapest: Object.fromEntries(
      PLACEMENT_PATHS.map((id) => [id, paths[id].total - cheapestTotal]),
    ),
    nextBestDelta,
    extraFreightOptimizedCanCarry: paths.minimal.placementTotal - paths.optimized.placementTotal,
    extraFreightPartialCanCarry: paths.minimal.placementTotal - paths.partial.placementTotal,
  };
}

// Oct–Dec storage is billed at a higher cubic-foot rate than Jan–Sep.
// The listing calculator takes one blended rate; this comparison keeps
// the two seasons on separate rows so a seller can see whether sending
// now and sitting through Q4 still beats waiting until January.
// Complementary to aged-inventory (an age surcharge on leftover units)
// and to expected returns (a mix on completed sales). Salvaged from
// #1516 onto current main so the unique inbound-timing table is not
// lost behind a conflicted rebase.
export function blendedStorageRate({
  offPeakMonths,
  peakMonths,
  offPeakRate = STORAGE_PRESETS.off_peak.perCuFt,
  peakRate = STORAGE_PRESETS.peak.perCuFt,
}) {
  const offM = number(offPeakMonths, "Off-peak months");
  const peakM = number(peakMonths, "Peak months");
  const offR = number(offPeakRate, "Off-peak storage rate");
  const peakR = number(peakRate, "Peak storage rate");
  const total = offM + peakM;
  if (total === 0) return 0;
  return (offM * offR + peakM * peakR) / total;
}

/**
 * Price the same listing three ways: wait until January (all off-peak),
 * the typed stay (some months at the Oct–Dec rate), or an all-peak stay.
 *
 * Storage is the only line that changes. Referral, fulfillment, inbound,
 * and cost of goods stay. Return mix is forced to zero so this table
 * stays completed-sale storage arithmetic — complementary to the
 * returns page, not a second return sweep.
 *
 * A hang-only price is not in play here. The "$612 to sit through Q4"
 * number is waitUntilJanuarySaves on the typed unit count.
 */
export function compareStorageSeasons(input) {
  const months = number(input.monthsInStorage ?? input.months, "Months in storage", 1);
  const peakMonths = number(input.peakMonths ?? 0, "Peak months");
  if (peakMonths > months) {
    throw new Error("Peak months cannot exceed months in storage");
  }
  const offPeakMonths = months - peakMonths;
  const offPeakRate = number(
    input.offPeakRate,
    "Off-peak storage rate",
    STORAGE_PRESETS.off_peak.perCuFt,
  );
  const peakRate = number(input.peakRate, "Peak storage rate", STORAGE_PRESETS.peak.perCuFt);
  const typedUnits = input.units ?? input.monthlyUnits;
  const units = number(typedUnits === undefined || typedUnits === "" ? 1 : typedUnits, "Units", 1);
  if (units === 0) throw new Error("Units must be greater than zero");

  function scenario(id, label, offM, peakM) {
    const storageRate = blendedStorageRate({
      offPeakMonths: offM,
      peakMonths: peakM,
      offPeakRate,
      peakRate,
    });
    const listing = calculateListing({
      ...input,
      monthsInStorage: offM + peakM,
      storageRate,
      returnRate: 0,
      unsellableReturnRate: 0,
      returnHandlingFee: 0,
    });
    return {
      id,
      label,
      offPeakMonths: offM,
      peakMonths: peakM,
      storageRate,
      storagePerUnit: listing.storagePerUnit,
      storageOnUnits: listing.storagePerUnit * units,
      fbaProfit: listing.fba.profit,
      fbaProfitOnUnits: listing.fba.profit * units,
      maxBuyCost: listing.fba.breakEvenBuyCost,
    };
  }

  const scenarios = {
    off_peak: scenario("off_peak", "Wait until January (all off-peak)", months, 0),
    mixed: scenario("mixed", "Your stay (peak months at Oct–Dec rate)", offPeakMonths, peakMonths),
    peak: scenario("peak", "All peak (Oct–Dec rate)", 0, months),
  };
  const ranked = ["off_peak", "mixed", "peak"]
    .map((id) => scenarios[id])
    .sort((a, b) => b.fbaProfit - a.fbaProfit);
  const bestProfit = ranked[0].fbaProfit;
  const cheapestIds = ranked
    .filter((row) => Math.abs(row.fbaProfit - bestProfit) < 1e-9)
    .map((row) => row.id);
  const winner = cheapestIds.length === 1 ? cheapestIds[0] : "tie";

  const zeroStorage = calculateListing({
    ...input,
    monthsInStorage: 0,
    storageRate: 0,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
  });
  const cuFt = cubicFeet({
    length: input.length,
    width: input.width,
    height: input.height,
  });
  const peakCostPerMonth = cuFt * peakRate;
  let peakMonthsUntilUnprofitable;
  if (peakCostPerMonth === 0) {
    peakMonthsUntilUnprofitable = zeroStorage.fba.profit > 0 ? Infinity : 0;
  } else if (zeroStorage.fba.profit <= 0) {
    peakMonthsUntilUnprofitable = 0;
  } else {
    peakMonthsUntilUnprofitable = zeroStorage.fba.profit / peakCostPerMonth;
  }

  return {
    months,
    peakMonths,
    offPeakMonths,
    units,
    cubicFeet: cuFt,
    offPeakRate,
    peakRate,
    scenarios,
    ranked,
    winner,
    cheapestIds,
    waitUntilJanuarySavesPerUnit:
      scenarios.mixed.storagePerUnit - scenarios.off_peak.storagePerUnit,
    waitUntilJanuarySaves: scenarios.mixed.storageOnUnits - scenarios.off_peak.storageOnUnits,
    peakCostsExtraPerUnit: scenarios.peak.storagePerUnit - scenarios.off_peak.storagePerUnit,
    peakCostsExtra: scenarios.peak.storageOnUnits - scenarios.off_peak.storageOnUnits,
    peakMonthsUntilUnprofitable,
    profitBeforeStorage: zeroStorage.fba.profit,
  };
}

// Cheapest to dearest. A carton only drops a fee cliff by moving left.
export const SIZE_TIER_ORDER = Object.freeze([
  "small_standard",
  "large_standard",
  "large_bulky",
  "extra_large",
]);

// Maximum packed size that still classifies as that tier under
// classifySizeTier(). These are the published US dimensional gates the
// classifier uses — not Amazon's live schedule.
export const SIZE_TIER_LIMITS = Object.freeze({
  small_standard: { weightLb: 1, longest: 15, median: 12, shortest: 0.75 },
  large_standard: { weightLb: 20, longest: 18, median: 14, shortest: 8 },
  large_bulky: { weightLb: 50, longest: 59, medianPlusShortest: 90, longestPlusGirth: 130 },
});

const STANDARD_WEIGHT_BAND_OZ = Object.freeze({
  small_standard: [4, 8, 12, 16],
  large_standard: [4, 8, 12, 16, 24, 32, 48, 80],
});

export function nextLowerSizeTier(tier) {
  if (!SIZE_TIER_LABELS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const index = SIZE_TIER_ORDER.indexOf(tier);
  return index > 0 ? SIZE_TIER_ORDER[index - 1] : null;
}

function sortedDims(length, width, height) {
  return [length, width, height].sort((a, b) => b - a);
}

function cutsFromCurrent(current, packed) {
  const [cLong, cMed, cShort] = sortedDims(current.length, current.width, current.height);
  const [pLong, pMed, pShort] = sortedDims(packed.length, packed.width, packed.height);
  return {
    longestIn: Math.max(0, cLong - pLong),
    medianIn: Math.max(0, cMed - pMed),
    shortestIn: Math.max(0, cShort - pShort),
    weightOz: Math.max(0, (current.weightLb - packed.weightLb) * 16),
  };
}

/**
 * Shrink the current carton just enough to classify as `tier`.
 * Axes are reassigned longest/median/shortest so the comparison is about
 * the packed cube, not about which form field was "length".
 */
export function clampBoxToTier(input, tier) {
  if (!SIZE_TIER_LIMITS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const length = number(input.length, "Length");
  const width = number(input.width, "Width");
  const height = number(input.height, "Height");
  const weightLb = number(input.weightLb, "Weight");
  const [longest, median, shortest] = sortedDims(length, width, height);
  const limits = SIZE_TIER_LIMITS[tier];

  if (tier === "small_standard" || tier === "large_standard") {
    return {
      length: Math.min(longest, limits.longest),
      width: Math.min(median, limits.median),
      height: Math.min(shortest, limits.shortest),
      weightLb: Math.min(weightLb, limits.weightLb),
    };
  }

  let nextLongest = Math.min(longest, limits.longest);
  let nextMedian = median;
  let nextShortest = shortest;
  if (nextMedian + nextShortest > limits.medianPlusShortest) {
    const scale = limits.medianPlusShortest / (nextMedian + nextShortest);
    nextMedian *= scale;
    nextShortest *= scale;
  }
  const girth = 2 * (nextMedian + nextShortest);
  if (nextLongest + girth > limits.longestPlusGirth) {
    const maxSum = (limits.longestPlusGirth - nextLongest) / 2;
    if (maxSum > 0 && nextMedian + nextShortest > maxSum) {
      const scale = maxSum / (nextMedian + nextShortest);
      nextMedian *= scale;
      nextShortest *= scale;
    }
  }
  return {
    length: nextLongest,
    width: nextMedian,
    height: nextShortest,
    weightLb: Math.min(weightLb, limits.weightLb),
  };
}

/** Max weight (lb) of the next cheaper fulfillment band, or null if already cheapest. */
export function nextCheaperWeightLb(tier, weightLb) {
  if (!SIZE_TIER_LABELS[tier]) throw new Error(`Unknown size tier: ${tier}`);
  const weight = number(weightLb, "Weight");
  const bands = STANDARD_WEIGHT_BAND_OZ[tier];
  if (bands) {
    const oz = weight * 16;
    const index = bands.findIndex((band) => oz <= band);
    // Heavier than every listed band: those weights price by the pound past
    // this point (see defaultFulfillmentFee's extraBands math), so the next
    // cheaper stop is the top of the heaviest listed band, not one band
    // further down — treating it as already sitting in that band (as a
    // `?? bands[bands.length - 1]` fallback used to) skipped straight past
    // the real next-cheaper weight to the band below it.
    if (index === -1) return bands[bands.length - 1] / 16;
    if (index <= 0) return null;
    return bands[index - 1] / 16;
  }
  if (tier === "large_bulky") {
    if (weight <= 2) return null;
    return 2;
  }
  if (weight <= 5) return null;
  return 5;
}

function listingForPack(input, pack, packExtra) {
  const packagingCost = number(input.packagingCost, "Packaging cost") + packExtra;
  const listing = calculateListing({
    ...input,
    ...pack,
    packagingCost,
    fulfillmentFee: undefined,
    sizeTier: undefined,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
  });
  return { listing, pack, packExtra };
}

/**
 * Current carton vs a pack that drops a size tier vs a pack that only
 * drops a fulfillment weight band. The drop-tier carton is the current
 * cube clamped to the next-lower tier's gates — it is not a claim the
 * product still fits that box. Repack cost is extra prep on the smaller
 * carton only.
 *
 * Return mix is forced to zero so this table stays completed-sale
 * packaging arithmetic — complementary to the returns page, not a
 * second return sweep.
 */
export function compareSizeTierPackaging(input = {}) {
  const current = calculateListing({
    ...input,
    fulfillmentFee: undefined,
    sizeTier: undefined,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
  });
  const packExtra = number(input.repackCostPerUnit, "Repack cost");
  const currentPack = {
    length: number(input.length, "Length", 8),
    width: number(input.width, "Width", 6),
    height: number(input.height, "Height", 2),
    weightLb: number(input.weightLb, "Weight", 0.75),
  };
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);

  const lowerTier = nextLowerSizeTier(current.sizeTier);
  let dropTier = null;
  if (lowerTier) {
    const pack = clampBoxToTier(currentPack, lowerTier);
    const { listing } = listingForPack(input, pack, packExtra);
    const profitDelta = listing.fba.profit - current.fba.profit;
    dropTier = {
      targetTier: lowerTier,
      targetTierLabel: SIZE_TIER_LABELS[lowerTier],
      pack,
      cuts: cutsFromCurrent(currentPack, pack),
      sizeTier: listing.sizeTier,
      sizeTierLabel: listing.sizeTierLabel,
      fulfillmentFee: listing.suggestedFulfillment,
      storagePerUnit: listing.storagePerUnit,
      packExtra,
      profit: listing.fba.profit,
      profitDelta,
      monthlyDelta: profitDelta * monthlyUnits,
    };
  }

  const lighterWeight = nextCheaperWeightLb(current.sizeTier, currentPack.weightLb);
  let dropWeight = null;
  if (lighterWeight !== null) {
    const pack = { ...currentPack, weightLb: lighterWeight };
    const { listing } = listingForPack(input, pack, 0);
    const profitDelta = listing.fba.profit - current.fba.profit;
    dropWeight = {
      pack,
      cuts: cutsFromCurrent(currentPack, pack),
      sizeTier: listing.sizeTier,
      sizeTierLabel: listing.sizeTierLabel,
      fulfillmentFee: listing.suggestedFulfillment,
      storagePerUnit: listing.storagePerUnit,
      packExtra: 0,
      profit: listing.fba.profit,
      profitDelta,
      monthlyDelta: profitDelta * monthlyUnits,
    };
  }

  const dropTierPays = Boolean(dropTier && dropTier.profitDelta > 0);
  const dropWeightPays = Boolean(dropWeight && dropWeight.profitDelta > 0);
  const winner = dropTierPays && (!dropWeight || dropTier.profitDelta >= dropWeight.profitDelta)
    ? "drop_tier"
    : dropWeightPays
      ? "drop_weight"
      : "current";

  return {
    current: {
      pack: currentPack,
      sizeTier: current.sizeTier,
      sizeTierLabel: current.sizeTierLabel,
      fulfillmentFee: current.suggestedFulfillment,
      storagePerUnit: current.storagePerUnit,
      packExtra: 0,
      profit: current.fba.profit,
      profitDelta: 0,
      monthlyDelta: 0,
    },
    dropTier,
    dropWeight,
    dropTierPays,
    dropWeightPays,
    winner,
    alreadyCheapestStandardBand:
      current.sizeTier === "small_standard" && dropWeight === null,
    monthlyUnits,
    packExtra,
  };
}

export const DEFAULT_FBM_SHIPPING_COST = 4.75;
export const DEFAULT_SFP_SHIPPING = 8.95;
export const DEFAULT_SFP_MINUTES = 6;
export const DEFAULT_SFP_HOURLY = 18;
export const DEFAULT_FBA_TAKE_PCT = 70;
export const DEFAULT_SFP_TAKE_PCT = 65;
export const DEFAULT_FBM_TAKE_PCT = 40;

function takePercent(value, name) {
  const rate = number(value, name);
  if (rate > 100) throw new Error(`${name} must be at most 100`);
  return rate;
}

function sfpLaborCost(minutes, hourlyWage) {
  return (minutes / 60) * hourlyWage;
}

function sfpPath({
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

function sfpSummary({
  winner,
  fba,
  sfp,
  fbm,
  extraKeptOnSfp,
  extraKeptOnFbm,
  monthlyExtraOnSfp,
  monthlyUnits,
  breakEvenSfpShipping,
  breakEvenSfpTakePct,
  breakEvenFbmTakePct,
}) {
  const fbaKeep = moneyLabel(fba.expectedProfit);
  const sfpKeep = moneyLabel(sfp.expectedProfit);
  const fbmKeep = moneyLabel(fbm.expectedProfit);
  const sfpGap = moneyLabel(Math.abs(extraKeptOnSfp));
  const fbmGap = moneyLabel(Math.abs(extraKeptOnFbm));
  const monthGap = moneyLabel(Math.abs(monthlyExtraOnSfp));
  const shipCeil = Number.isFinite(breakEvenSfpShipping)
    ? moneyLabel(breakEvenSfpShipping)
    : "an unreachable 2-day label";
  const sfpFloor = Number.isFinite(breakEvenSfpTakePct)
    ? `${breakEvenSfpTakePct.toFixed(1)}%`
    : "an unreachable take rate";
  const fbmFloor = Number.isFinite(breakEvenFbmTakePct)
    ? `${breakEvenFbmTakePct.toFixed(1)}%`
    : "an unreachable take rate";
  const volume = `${monthlyUnits} FBA unit${monthlyUnits === 1 ? "" : "s"}`;

  if (winner === "sfp") {
    return (
      `Seller Fulfilled Prime keeps ${sfpGap} more per session than FBA ` +
      `(${sfpKeep} vs ${fbaKeep}), ${monthGap} on ${volume}. ` +
      `The 2-day label can rise to about ${shipCeil} before FBA matches.`
    );
  }
  if (winner === "fbm") {
    return (
      `Merchant fulfilled without Prime keeps ${fbmGap} more per session than FBA ` +
      `(${fbmKeep} vs ${fbaKeep}). SFP is ${sfpKeep}. ` +
      `FBM still needs about ${fbmFloor} take to match FBA.`
    );
  }
  if (winner === "fba") {
    return (
      `FBA keeps ${sfpGap} more per session than Seller Fulfilled Prime ` +
      `(${fbaKeep} vs ${sfpKeep}), ${monthGap} on ${volume}. ` +
      `SFP matches if the 2-day label falls to about ${shipCeil} ` +
      `or take rises to about ${sfpFloor}. FBM is ${fbmKeep}.`
    );
  }
  return `FBA, Seller Fulfilled Prime, and merchant fulfilled leave the same expected leftover on these rates.`;
}

/**
 * Same SKU, three Amazon badges.
 *
 *   - FBA (Prime) — existing listing path: referral, pick fee, inbound,
 *     storage. Highest typical take because of the Prime filter.
 *   - Seller Fulfilled Prime — you buy a 2-day label and pack it.
 *     No Amazon pick, inbound, or storage. Prime badge stays; take is
 *     usually a little below FBA.
 *   - Merchant fulfilled (no Prime) — existing FBM path: cheaper
 *     Ground label, no Prime filter, lower take.
 *
 * Expected leftover is take% × completed-sale profit on the same
 * visitor pool (monthly FBA units / FBA take). Return mix is forced
 * to zero so this table stays fulfillment-path arithmetic —
 * complementary to the returns page, to MCF (a website order from
 * FBA stock), and to FBA vs FBM on the main calculator (which does
 * not model the Prime badge). Rates and take are inputs, not
 * Amazon's live SFP SLA or fee schedule.
 */
export function compareSfp(input = {}) {
  const fbmShippingCost = emptyField(input.fbmShippingCost)
    ? DEFAULT_FBM_SHIPPING_COST
    : number(input.fbmShippingCost, "FBM shipping cost");
  const sfpShippingCost = emptyField(input.sfpShippingCost)
    ? DEFAULT_SFP_SHIPPING
    : number(input.sfpShippingCost, "SFP shipping cost");
  const sfpMinutes = emptyField(input.sfpMinutes)
    ? DEFAULT_SFP_MINUTES
    : number(input.sfpMinutes, "SFP minutes");
  const sfpHourlyWage = emptyField(input.sfpHourlyWage)
    ? DEFAULT_SFP_HOURLY
    : number(input.sfpHourlyWage, "SFP hourly wage");
  const fbaTakePct = emptyField(input.fbaTakePct)
    ? DEFAULT_FBA_TAKE_PCT
    : takePercent(input.fbaTakePct, "FBA take percent");
  const sfpTakePct = emptyField(input.sfpTakePct)
    ? DEFAULT_SFP_TAKE_PCT
    : takePercent(input.sfpTakePct, "SFP take percent");
  const fbmTakePct = emptyField(input.fbmTakePct)
    ? DEFAULT_FBM_TAKE_PCT
    : takePercent(input.fbmTakePct, "FBM take percent");
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");
  if (fbaTakePct === 0) throw new Error("FBA take percent must be greater than zero");

  const listing = calculateListing({
    ...input,
    fbmShippingCost,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
  });

  const laborCost = sfpLaborCost(sfpMinutes, sfpHourlyWage);
  const fbaCompleted = listing.fba.profit;
  const fbmCompleted = listing.fbm.profit;
  const sfpCompleted = fbmCompleted + fbmShippingCost - sfpShippingCost - laborCost;

  const sessions = monthlyUnits / (fbaTakePct / 100);
  const fbaExpected = (fbaTakePct / 100) * fbaCompleted;
  const sfpExpected = (sfpTakePct / 100) * sfpCompleted;
  const fbmExpected = (fbmTakePct / 100) * fbmCompleted;
  const fbaMonthly = fbaExpected * sessions;
  const sfpMonthly = sfpExpected * sessions;
  const fbmMonthly = fbmExpected * sessions;

  const fba = sfpPath({
    id: "fba",
    label: "FBA (Prime)",
    takePct: fbaTakePct,
    shippingCost: listing.fulfillmentFee,
    laborCost: 0,
    completedProfit: fbaCompleted,
    expectedProfit: fbaExpected,
    monthlyProfit: fbaMonthly,
  });
  const sfp = sfpPath({
    id: "sfp",
    label: "Seller Fulfilled Prime",
    takePct: sfpTakePct,
    shippingCost: sfpShippingCost,
    laborCost,
    completedProfit: sfpCompleted,
    expectedProfit: sfpExpected,
    monthlyProfit: sfpMonthly,
  });
  const fbm = sfpPath({
    id: "fbm",
    label: "Merchant fulfilled (no Prime)",
    takePct: fbmTakePct,
    shippingCost: fbmShippingCost,
    laborCost: 0,
    completedProfit: fbmCompleted,
    expectedProfit: fbmExpected,
    monthlyProfit: fbmMonthly,
  });

  const extraKeptOnSfp = sfpExpected - fbaExpected;
  const extraKeptOnFbm = fbmExpected - fbaExpected;
  const monthlyExtraOnSfp = extraKeptOnSfp * sessions;
  const monthlyExtraOnFbm = extraKeptOnFbm * sessions;

  const rows = [fba, sfp, fbm].map((row) => ({
    ...row,
    vsFba: row.expectedProfit - fbaExpected,
  }));

  const expectedValues = [fbaExpected, sfpExpected, fbmExpected];
  const bestExpected = Math.max(...expectedValues);
  const leaders = [
    { id: "fba", value: fbaExpected },
    { id: "sfp", value: sfpExpected },
    { id: "fbm", value: fbmExpected },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenSfpShipping = Infinity;
  if (sfpTakePct > 1e-12) {
    const neededCompleted = fbaExpected / (sfpTakePct / 100);
    breakEvenSfpShipping = fbmCompleted + fbmShippingCost - laborCost - neededCompleted;
    if (!Number.isFinite(breakEvenSfpShipping)) breakEvenSfpShipping = Infinity;
  }

  let breakEvenSfpTakePct = Infinity;
  if (sfpCompleted > 1e-12) {
    breakEvenSfpTakePct = (fbaExpected / sfpCompleted) * 100;
    if (breakEvenSfpTakePct < -1e-9 || breakEvenSfpTakePct > 100 + 1e-9) {
      breakEvenSfpTakePct = Infinity;
    } else {
      breakEvenSfpTakePct = Math.max(0, Math.min(100, breakEvenSfpTakePct));
    }
  }

  let breakEvenFbmTakePct = Infinity;
  if (fbmCompleted > 1e-12) {
    breakEvenFbmTakePct = (fbaExpected / fbmCompleted) * 100;
    if (breakEvenFbmTakePct < -1e-9 || breakEvenFbmTakePct > 100 + 1e-9) {
      breakEvenFbmTakePct = Infinity;
    } else {
      breakEvenFbmTakePct = Math.max(0, Math.min(100, breakEvenFbmTakePct));
    }
  }

  let breakEvenSfpMinutes = Infinity;
  if (sfpHourlyWage > 1e-12 && sfpTakePct > 1e-12) {
    const neededCompleted = fbaExpected / (sfpTakePct / 100);
    const laborRoom = fbmCompleted + fbmShippingCost - sfpShippingCost - neededCompleted;
    breakEvenSfpMinutes = (laborRoom / sfpHourlyWage) * 60;
    if (!Number.isFinite(breakEvenSfpMinutes) || breakEvenSfpMinutes < -1e-9) {
      breakEvenSfpMinutes = Infinity;
    }
  }

  return {
    rows,
    fba: rows[0],
    sfp: rows[1],
    fbm: rows[2],
    winner,
    sessions,
    monthlyUnits,
    fbaTakePct,
    sfpTakePct,
    fbmTakePct,
    sfpShippingCost,
    sfpMinutes,
    sfpHourlyWage,
    laborCost,
    fbmShippingCost,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    extraKeptOnSfp,
    extraKeptOnFbm,
    monthlyExtraOnSfp,
    monthlyExtraOnFbm,
    breakEvenSfpShipping,
    breakEvenSfpTakePct,
    breakEvenFbmTakePct,
    breakEvenSfpMinutes,
    summary: sfpSummary({
      winner,
      fba: rows[0],
      sfp: rows[1],
      fbm: rows[2],
      extraKeptOnSfp,
      extraKeptOnFbm,
      monthlyExtraOnSfp,
      monthlyUnits,
      breakEvenSfpShipping,
      breakEvenSfpTakePct,
      breakEvenFbmTakePct,
    }),
  };
}

export function sfpNote(comparison) {
  if (!comparison?.fba || !comparison?.sfp) {
    throw new Error("SFP comparison is missing rows");
  }
  return comparison.summary;
}

// Amazon Warehousing and Distribution is the inbound-bulk decision on a
// fresh PO: send the whole lot to FBA now, park it in AWD and replenish a
// working FBA stock, or hold it yourself and drip inbound. Complementary
// to inbound placement (which FC, not AWD vs FBA), aged inventory (units
// already sitting), Q4 storage (when you send), supplier MOQ (how
// many you buy), and restock vs the low-inventory-level fee (how thin
// FBA already is). Defaults are illustrative 2025–26 US mid-band figures;
// sellers overwrite them from the current AWD and FBA fee previews.
export const DEFAULT_AWD_LOT_UNITS = 400;
export const DEFAULT_AWD_HORIZON_MONTHS = 5;
export const DEFAULT_AWD_INBOUND = 0.15;
export const DEFAULT_AWD_STORAGE_PER_CU_FT = 0.48;
export const DEFAULT_AWD_TO_FBA = 0.68;
export const DEFAULT_YOU_HOLD_STORAGE_PER_UNIT = 0.25;

function simulateAwdPath({
  lotUnits,
  monthlyUnits,
  horizonMonths,
  workingStock,
  fbaStoragePerUnitMonth,
  contribution,
  receivePerUnit = 0,
  transferPerUnit = 0,
  bulkStoragePerUnitMonth = 0,
  startInFba = false,
}) {
  let bulk = startInFba ? 0 : lotUnits;
  let fba = startInFba ? lotUnits : 0;
  let inbound = receivePerUnit * lotUnits;
  let transfers = 0;
  let storage = 0;
  let sold = 0;
  let fbaUnitMonths = 0;
  let bulkUnitMonths = 0;
  let movedFromBulk = 0;

  const prime = startInFba ? 0 : Math.min(workingStock, bulk);
  if (prime > 0) {
    bulk -= prime;
    fba += prime;
    transfers += prime * transferPerUnit;
    movedFromBulk += prime;
  }

  for (let month = 0; month < horizonMonths; month += 1) {
    storage += bulk * bulkStoragePerUnitMonth + fba * fbaStoragePerUnitMonth;
    bulkUnitMonths += bulk;
    fbaUnitMonths += fba;
    const sell = Math.min(monthlyUnits, fba);
    fba -= sell;
    sold += sell;
    if (!startInFba) {
      const need = Math.min(Math.max(0, workingStock - fba), bulk);
      if (need > 0) {
        bulk -= need;
        fba += need;
        transfers += need * transferPerUnit;
        movedFromBulk += need;
      }
    }
  }

  return {
    cash: sold * contribution - inbound - transfers - storage,
    sold,
    remainingBulk: bulk,
    remainingFba: fba,
    leftover: bulk + fba,
    inbound,
    transfers,
    storage,
    fbaUnitMonths,
    bulkUnitMonths,
    movedFromBulk,
  };
}

function awdPathRow(id, label, sim, fbaCash) {
  return {
    id,
    label,
    cash: sim.cash,
    sold: sim.sold,
    leftover: sim.leftover,
    inbound: sim.inbound,
    transfers: sim.transfers,
    storage: sim.storage,
    vsFba: sim.cash - fbaCash,
  };
}

function awdSummary({
  winner,
  fba,
  awd,
  hold,
  lotUnits,
  extraAwdVsFba,
  extraHoldVsFba,
  breakEvenAwdToFba,
  breakEvenAwdStorage,
}) {
  const awdGap = moneyLabel(Math.abs(extraAwdVsFba));
  const holdGap = moneyLabel(Math.abs(extraHoldVsFba));
  const awdCash = moneyLabel(awd.cash);
  const fbaCash = moneyLabel(fba.cash);
  const holdCash = moneyLabel(hold.cash);
  const transferCeil = Number.isFinite(breakEvenAwdToFba)
    ? moneyLabel(breakEvenAwdToFba)
    : "an unreachable fee";
  const storageCeil = Number.isFinite(breakEvenAwdStorage)
    ? moneyLabel(breakEvenAwdStorage)
    : "an unreachable rate";
  if (winner === "awd") {
    return `AWD replenish keeps ${awdGap} more on ${lotUnits} units than sending the whole lot to FBA now (${awdCash} vs ${fbaCash}). The AWD-to-FBA transfer can rise to about ${transferCeil} before FBA wins. You-hold and drip ${extraHoldVsFba < -1e-9 ? `loses ${holdGap}` : extraHoldVsFba > 1e-9 ? `keeps ${holdGap} more` : "ties FBA"} (${holdCash}).`;
  }
  if (winner === "fba") {
    return `Sending the whole lot to FBA now keeps ${awdGap} more on ${lotUnits} units than AWD replenish (${fbaCash} vs ${awdCash}). AWD storage has to fall to about ${storageCeil} / cu ft, or the transfer to ${transferCeil}, to match. You-hold and drip is ${holdCash}.`;
  }
  if (winner === "hold") {
    return `You-hold and drip keeps ${holdGap} more on ${lotUnits} units than sending the whole lot to FBA now (${holdCash} vs ${fbaCash}). AWD replenish is ${awdCash} (${extraAwdVsFba >= 0 ? "ahead of" : "behind"} FBA by ${awdGap}).`;
  }
  return `AWD replenish and sending the whole lot to FBA now leave the same cash on ${lotUnits} units (${fbaCash}). You-hold and drip is ${holdCash}. The AWD-to-FBA transfer ceiling is about ${transferCeil}.`;
}

/**
 * Compare sending a fresh PO straight to FBA, parking it in Amazon
 * Warehousing and Distribution and replenishing a working FBA stock,
 * or holding it yourself and dripping inbound. Per-sale leftover
 * (referral, pick, COGS, prep) is the same once a unit is in FBA —
 * the table is inbound + bulk storage + AWD-to-FBA transfer. Return
 * mix is held at zero so this stays an inbound-bulk question.
 */
export function compareAwd(input = {}) {
  const lotUnits = emptyField(input.lotUnits)
    ? DEFAULT_AWD_LOT_UNITS
    : number(input.lotUnits, "Lot units", 1);
  if (lotUnits === 0) throw new Error("Lot units must be greater than zero");
  const horizonMonths = emptyField(input.horizonMonths)
    ? DEFAULT_AWD_HORIZON_MONTHS
    : number(input.horizonMonths, "Horizon months", 1);
  if (horizonMonths === 0) throw new Error("Horizon months must be greater than zero");
  const awdInboundPerUnit = emptyField(input.awdInboundPerUnit)
    ? DEFAULT_AWD_INBOUND
    : number(input.awdInboundPerUnit, "AWD inbound per unit");
  const awdStoragePerCuFt = emptyField(input.awdStoragePerCuFt)
    ? DEFAULT_AWD_STORAGE_PER_CU_FT
    : number(input.awdStoragePerCuFt, "AWD storage per cubic foot");
  const awdToFbaPerUnit = emptyField(input.awdToFbaPerUnit)
    ? DEFAULT_AWD_TO_FBA
    : number(input.awdToFbaPerUnit, "AWD to FBA per unit");
  const youHoldStoragePerUnit = emptyField(input.youHoldStoragePerUnit)
    ? DEFAULT_YOU_HOLD_STORAGE_PER_UNIT
    : number(input.youHoldStoragePerUnit, "You-hold storage per unit");

  const listing = calculateListing({
    ...input,
    inboundPerUnit: 0,
    monthsInStorage: 0,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
    monthlySellerFee: 0,
  });
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 1);
  if (monthlyUnits === 0) throw new Error("Monthly units must be greater than zero");
  const workingStock = emptyField(input.workingStock)
    ? monthlyUnits
    : number(input.workingStock, "Working stock", 1);
  if (workingStock === 0) throw new Error("Working stock must be greater than zero");

  const fbaInboundPerUnit = number(input.inboundPerUnit, "Inbound per unit");
  const fbaStoragePerUnitMonth = listing.cubicFeet * number(
    input.storageRate,
    "Storage rate",
    STORAGE_PRESETS.off_peak.perCuFt,
  );
  const awdStoragePerUnitMonth = listing.cubicFeet * awdStoragePerCuFt;
  const contribution = listing.salePrice
    - listing.fba.fees.referral
    - listing.fulfillmentFee
    - number(input.costOfGoods, "Cost of goods")
    - number(input.packagingCost, "Packaging cost")
    - number(input.otherCost, "Other cost")
    - number(input.adsPerUnit, "Ads per unit");

  const shared = { lotUnits, monthlyUnits, horizonMonths, workingStock, fbaStoragePerUnitMonth, contribution };

  const fbaSim = simulateAwdPath({
    ...shared,
    receivePerUnit: fbaInboundPerUnit,
    startInFba: true,
  });
  const awdSim = simulateAwdPath({
    ...shared,
    receivePerUnit: awdInboundPerUnit,
    transferPerUnit: awdToFbaPerUnit,
    bulkStoragePerUnitMonth: awdStoragePerUnitMonth,
  });
  const holdSim = simulateAwdPath({
    ...shared,
    receivePerUnit: 0,
    transferPerUnit: fbaInboundPerUnit,
    bulkStoragePerUnitMonth: youHoldStoragePerUnit,
  });

  const fba = awdPathRow("fba", "Send all to FBA now", fbaSim, fbaSim.cash);
  const awd = awdPathRow("awd", "AWD, then replenish FBA", awdSim, fbaSim.cash);
  const hold = awdPathRow("hold", "You hold, drip to FBA", holdSim, fbaSim.cash);
  const rows = [fba, awd, hold];

  const maxCash = Math.max(...rows.map((row) => row.cash));
  const leaders = rows.filter((row) => Math.abs(row.cash - maxCash) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  const extraAwdVsFba = awd.cash - fba.cash;
  const extraHoldVsFba = hold.cash - fba.cash;

  let breakEvenAwdToFba = Infinity;
  if (awdSim.movedFromBulk > 1e-12) {
    // AWD cash − FBA cash = FBA inbound − AWD inbound − transfer×moved − AWD storage + FBA storage
    breakEvenAwdToFba =
      (fbaSim.inbound - awdSim.inbound - awdSim.storage + fbaSim.storage) / awdSim.movedFromBulk;
    if (!Number.isFinite(breakEvenAwdToFba)) breakEvenAwdToFba = Infinity;
  }

  let breakEvenAwdStorage = Infinity;
  if (awdSim.bulkUnitMonths > 1e-12 && listing.cubicFeet > 1e-12) {
    // AWD storage = bulkUnitMonths * cuFt * rate + fbaUnitMonths * fbaRate
    // delta = fbaInbound - awdInbound - awdToFba*moved - awdStorage + fbaStorage
    // awdStorage = bulkUnitMonths * cuFt * rate + awdSim's FBA storage portion
    const awdFbaStorage = awdSim.fbaUnitMonths * fbaStoragePerUnitMonth;
    breakEvenAwdStorage =
      (fbaSim.inbound - awdSim.inbound - awdSim.transfers + fbaSim.storage - awdFbaStorage)
      / (awdSim.bulkUnitMonths * listing.cubicFeet);
    if (!Number.isFinite(breakEvenAwdStorage) || breakEvenAwdStorage < -1e-9) {
      breakEvenAwdStorage = Infinity;
    }
  }

  let breakEvenYouHoldStorage = Infinity;
  if (holdSim.bulkUnitMonths > 1e-12) {
    const holdFbaStorage = holdSim.fbaUnitMonths * fbaStoragePerUnitMonth;
    breakEvenYouHoldStorage =
      (fbaSim.inbound - holdSim.inbound - holdSim.transfers + fbaSim.storage - holdFbaStorage)
      / holdSim.bulkUnitMonths;
    if (!Number.isFinite(breakEvenYouHoldStorage) || breakEvenYouHoldStorage < -1e-9) {
      breakEvenYouHoldStorage = Infinity;
    }
  }

  return {
    rows,
    fba,
    awd,
    hold,
    winner,
    lotUnits,
    monthlyUnits,
    horizonMonths,
    workingStock,
    contribution,
    cubicFeet: listing.cubicFeet,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    fbaInboundPerUnit,
    awdInboundPerUnit,
    awdStoragePerCuFt,
    awdToFbaPerUnit,
    youHoldStoragePerUnit,
    fbaStoragePerUnitMonth,
    extraAwdVsFba,
    extraHoldVsFba,
    breakEvenAwdToFba,
    breakEvenAwdStorage,
    breakEvenYouHoldStorage,
    summary: awdSummary({
      winner,
      fba,
      awd,
      hold,
      lotUnits,
      extraAwdVsFba,
      extraHoldVsFba,
      breakEvenAwdToFba,
      breakEvenAwdStorage,
    }),
  };
}

export function awdNote(comparison) {
  if (!comparison?.fba || !comparison?.awd) {
    throw new Error("AWD comparison is missing rows");
  }
  return comparison.summary;
}

// Remote Fulfillment with North America is the Canada/Mexico expansion
// decision on a SKU already sitting in US FBA. Complementary to AWD
// (where a fresh US PO parks), inbound placement (which US FC), MCF
// (a website order from FBA stock), and SFP (a US Prime badge). This
// table is incremental CA/MX demand only — skip, fulfill from US FBA
// with the remote surcharge, or send a dedicated Canada pile.
// Defaults are illustrative mid-band figures; sellers overwrite them
// from the current Remote Fulfillment and CA inbound previews.
export const DEFAULT_NARF_FEE = 1.25;
export const DEFAULT_CA_INBOUND = 5.2;
export const DEFAULT_NARF_TAKE_PCT = 50;
export const DEFAULT_CA_TAKE_PCT = 65;
export const DEFAULT_CA_SESSIONS = 40;

function narfPath({
  id,
  label,
  takePct,
  completedProfit,
  inboundPerUnit,
  extraFee,
}) {
  const expectedProfit = (takePct / 100) * completedProfit;
  return {
    id,
    label,
    takePct,
    inboundPerUnit,
    extraFee,
    completedProfit,
    expectedProfit,
  };
}

function narfSummary({
  winner,
  skip,
  narf,
  canada,
  extraNarfVsSkip,
  extraCanadaVsNarf,
  monthlyExtraOnNarf,
  monthlySessions,
  breakEvenNarfFee,
  breakEvenCaInbound,
  breakEvenNarfTakePct,
}) {
  const narfKeep = moneyLabel(narf.expectedProfit);
  const caKeep = moneyLabel(canada.expectedProfit);
  const skipKeep = moneyLabel(skip.expectedProfit);
  const narfGap = moneyLabel(Math.abs(extraNarfVsSkip));
  const caGap = moneyLabel(Math.abs(extraCanadaVsNarf));
  const monthGap = moneyLabel(Math.abs(monthlyExtraOnNarf));
  const feeCeil = Number.isFinite(breakEvenNarfFee)
    ? moneyLabel(breakEvenNarfFee)
    : "an unreachable remote fee";
  const inboundCeil = Number.isFinite(breakEvenCaInbound)
    ? moneyLabel(breakEvenCaInbound)
    : "an unreachable Canada inbound";
  const takeFloor = Number.isFinite(breakEvenNarfTakePct)
    ? `${breakEvenNarfTakePct.toFixed(1)}%`
    : "an unreachable take rate";
  const volume = `${monthlySessions} Canada session${monthlySessions === 1 ? "" : "s"}`;

  if (winner === "narf") {
    return (
      `Remote Fulfillment keeps ${narfGap} more per Canada session than skipping ` +
      `(${narfKeep} vs ${skipKeep}), ${monthGap} on ${volume}. ` +
      `A dedicated Canada pile is ${caKeep} (${extraCanadaVsNarf < -1e-9 ? `behind` : extraCanadaVsNarf > 1e-9 ? `ahead` : `tied`} by ${caGap}). ` +
      `The remote fee can rise to about ${feeCeil} before the Canada pile matches.`
    );
  }
  if (winner === "canada") {
    return (
      `A dedicated Canada pile keeps ${caGap} more per session than Remote Fulfillment ` +
      `(${caKeep} vs ${narfKeep}). Skip is ${skipKeep}. ` +
      `Canada inbound can rise to about ${inboundCeil} before NARF matches, or NARF take has to rise to about ${takeFloor}.`
    );
  }
  if (winner === "skip") {
    return (
      `Skipping Canada keeps more than listing there on these rates ` +
      `(${skipKeep} vs NARF ${narfKeep} / Canada pile ${caKeep}). ` +
      `NARF matches skip if the remote fee falls to about ${feeCeil}.`
    );
  }
  return (
    `Remote Fulfillment and a dedicated Canada pile leave the same expected leftover ` +
    `on these rates (${narfKeep}). Skip is ${skipKeep}. The remote-fee ceiling is about ${feeCeil}.`
  );
}

/**
 * Same SKU already in US FBA, three Canada/Mexico paths.
 *
 *   - Skip — do not list in CA/MX. Incremental leftover is $0.
 *   - Remote Fulfillment — Amazon ships the US FBA unit across the
 *     border. US inbound is already sunk; the extra line is the
 *     remote surcharge. Take is usually lower than local Prime
 *     because delivery is slower.
 *   - Dedicated Canada pile — send working stock to CA FBA. Replaces
 *     the US inbound line with CA inbound. Local Prime take is
 *     usually higher.
 *
 * Expected leftover is take% × completed-sale profit on the same
 * Canada visitor pool. Return mix and the Professional monthly fee
 * are forced to zero so this table stays incremental CA demand on
 * inventory already in US FBA — the $39.99 plan is already covered
 * by US volume. Rates and take are inputs, not Amazon's live
 * Remote Fulfillment schedule.
 */
export function compareRemoteFulfillment(input = {}) {
  const narfFee = emptyField(input.narfFee)
    ? DEFAULT_NARF_FEE
    : number(input.narfFee, "Remote fulfillment fee");
  const caInboundPerUnit = emptyField(input.caInboundPerUnit)
    ? DEFAULT_CA_INBOUND
    : number(input.caInboundPerUnit, "Canada inbound per unit");
  const narfTakePct = emptyField(input.narfTakePct)
    ? DEFAULT_NARF_TAKE_PCT
    : takePercent(input.narfTakePct, "Remote fulfillment take percent");
  const caTakePct = emptyField(input.caTakePct)
    ? DEFAULT_CA_TAKE_PCT
    : takePercent(input.caTakePct, "Canada FBA take percent");
  const monthlySessions = emptyField(input.caSessions)
    ? DEFAULT_CA_SESSIONS
    : number(input.caSessions, "Canada sessions", 1);
  if (monthlySessions === 0) throw new Error("Canada sessions must be greater than zero");

  const listing = calculateListing({
    ...input,
    returnRate: 0,
    unsellableReturnRate: 0,
    returnHandlingFee: 0,
    monthlySellerFee: 0,
  });
  const usInbound = number(input.inboundPerUnit, "Inbound per unit");
  const usProfit = listing.fba.profit;
  const skipCompleted = 0;
  const narfCompleted = usProfit - narfFee;
  const canadaCompleted = usProfit + usInbound - caInboundPerUnit;

  const skip = narfPath({
    id: "skip",
    label: "Skip Canada",
    takePct: 0,
    completedProfit: skipCompleted,
    inboundPerUnit: 0,
    extraFee: 0,
  });
  const narf = narfPath({
    id: "narf",
    label: "Remote Fulfillment from US FBA",
    takePct: narfTakePct,
    completedProfit: narfCompleted,
    inboundPerUnit: 0,
    extraFee: narfFee,
  });
  const canada = narfPath({
    id: "canada",
    label: "Send a Canada FBA pile",
    takePct: caTakePct,
    completedProfit: canadaCompleted,
    inboundPerUnit: caInboundPerUnit,
    extraFee: 0,
  });

  const extraNarfVsSkip = narf.expectedProfit - skip.expectedProfit;
  const extraCanadaVsNarf = canada.expectedProfit - narf.expectedProfit;
  const extraCanadaVsSkip = canada.expectedProfit - skip.expectedProfit;
  const monthlyExtraOnNarf = extraNarfVsSkip * monthlySessions;
  const monthlyExtraOnCanada = extraCanadaVsSkip * monthlySessions;

  const rows = [skip, narf, canada].map((row) => ({
    ...row,
    vsSkip: row.expectedProfit - skip.expectedProfit,
    monthlyProfit: row.expectedProfit * monthlySessions,
  }));

  const expectedValues = [skip.expectedProfit, narf.expectedProfit, canada.expectedProfit];
  const bestExpected = Math.max(...expectedValues);
  const leaders = [
    { id: "skip", value: skip.expectedProfit },
    { id: "narf", value: narf.expectedProfit },
    { id: "canada", value: canada.expectedProfit },
  ].filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenNarfFee = Infinity;
  if (narfTakePct > 1e-12) {
    breakEvenNarfFee = usProfit - canada.expectedProfit / (narfTakePct / 100);
    if (!Number.isFinite(breakEvenNarfFee)) breakEvenNarfFee = Infinity;
  }

  let breakEvenCaInbound = Infinity;
  if (caTakePct > 1e-12) {
    breakEvenCaInbound = usProfit + usInbound - narf.expectedProfit / (caTakePct / 100);
    if (!Number.isFinite(breakEvenCaInbound)) breakEvenCaInbound = Infinity;
  }

  let breakEvenNarfTakePct = Infinity;
  if (Math.abs(narfCompleted) > 1e-12) {
    breakEvenNarfTakePct = (canada.expectedProfit / narfCompleted) * 100;
    if (breakEvenNarfTakePct < -1e-9 || breakEvenNarfTakePct > 100 + 1e-9) {
      breakEvenNarfTakePct = Infinity;
    } else {
      breakEvenNarfTakePct = Math.max(0, Math.min(100, breakEvenNarfTakePct));
    }
  }

  return {
    rows,
    skip: rows[0],
    narf: rows[1],
    canada: rows[2],
    winner,
    usProfit,
    usInbound,
    narfFee,
    caInboundPerUnit,
    narfTakePct,
    caTakePct,
    monthlySessions,
    sizeTier: listing.sizeTier,
    sizeTierLabel: listing.sizeTierLabel,
    fulfillmentFee: listing.fulfillmentFee,
    extraNarfVsSkip,
    extraCanadaVsNarf,
    extraCanadaVsSkip,
    monthlyExtraOnNarf,
    monthlyExtraOnCanada,
    breakEvenNarfFee,
    breakEvenCaInbound,
    breakEvenNarfTakePct,
    summary: narfSummary({
      winner,
      skip,
      narf,
      canada,
      extraNarfVsSkip,
      extraCanadaVsNarf,
      monthlyExtraOnNarf,
      monthlySessions,
      breakEvenNarfFee,
      breakEvenCaInbound,
      breakEvenNarfTakePct,
    }),
  };
}

export function remoteFulfillmentNote(comparison) {
  if (!comparison?.narf || !comparison?.canada) {
    throw new Error("Remote fulfillment comparison is missing rows");
  }
  return comparison.summary;
}

export function sizeTierPackagingNote(comparison) {
  if (!comparison?.current) {
    throw new Error("Size-tier packaging comparison is missing rows");
  }
  if (comparison.alreadyCheapestStandardBand) {
    return "This carton is already in the cheapest illustrative small-standard weight band. A smaller box does not drop another FBA size tier on these rates.";
  }
  if (comparison.winner === "drop_tier") {
    const inches = comparison.dropTier.cuts.shortestIn;
    const money = roundMoney(comparison.dropTier.profitDelta);
    const shrink = inches > 0
      ? `shrink the shortest side by ${inches.toFixed(2)} in into a ${comparison.dropTier.targetTierLabel.toLowerCase()} carton`
      : `pack the unit into a ${comparison.dropTier.targetTierLabel.toLowerCase()} carton`;
    return `If you can ${shrink} and the unit still fits, FBA keeps $${money.toFixed(2)} more per unit than the current pack after the extra prep you entered.`;
  }
  if (comparison.winner === "drop_weight") {
    const ounces = comparison.dropWeight.cuts.weightOz;
    const money = roundMoney(comparison.dropWeight.profitDelta);
    return `If the shipped weight drops ${ounces.toFixed(1)} oz into the next fulfillment band, FBA keeps $${money.toFixed(2)} more per unit. Dimensions stay the same, so the size tier does not change.`;
  }
  if (comparison.dropTier && comparison.dropTier.profitDelta < 0) {
    return "The extra prep on the smaller carton costs more than the fulfillment and storage it saves on these rates.";
  }
  return "A smaller carton does not keep more on these rates. Overwrite the fulfillment fee from your Amazon fee preview before you change packaging.";
}

export function storageSeasonNote(result) {
  if (!result?.scenarios?.off_peak || !result?.scenarios?.mixed) {
    throw new Error("Storage-season comparison is missing rows");
  }
  const money = (value) => {
    const sign = value < 0 ? "−" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const january = result.scenarios.off_peak;
  const mixed = result.scenarios.mixed;
  const peakStay = result.scenarios.peak;
  if (result.peakMonths === 0) {
    return `This stay has no October–December months, so waiting until January does not change storage. Each path keeps ${money(january.fbaProfit)} per unit.`;
  }
  const saveLine = `Waiting until January keeps ${money(result.waitUntilJanuarySavesPerUnit)} more per unit (${money(result.waitUntilJanuarySaves)} on ${result.units} units) than a stay with ${result.peakMonths} peak month${result.peakMonths === 1 ? "" : "s"}.`;
  const peakLine = ` An all-peak stay costs ${money(result.peakCostsExtraPerUnit)} more per unit (${money(result.peakCostsExtra)} on the shipment) than January.`;
  const wipe = result.peakMonthsUntilUnprofitable === Infinity
    ? " Peak storage cannot wipe this listing because the peak cubic-foot charge is $0.00."
    : result.peakMonthsUntilUnprofitable === 0
      ? " The listing is already at or below $0.00 before storage, so peak months do not create the loss."
      : ` Peak storage alone wipes leftover after about ${result.peakMonthsUntilUnprofitable.toFixed(1)} October–December months.`;
  const januaryProfit = ` January leftover is ${money(january.fbaProfit)}; sending now leaves ${money(mixed.fbaProfit)}; all-peak leaves ${money(peakStay.fbaProfit)}.`;
  return `${saveLine}${peakLine}${wipe}${januaryProfit}`;
}

export function placementSummary(comparison) {
  if (!comparison?.paths) {
    throw new Error("Inbound-placement comparison is missing paths");
  }
  const money = (value) => {
    const sign = value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { winner, paths, extraFreightOptimizedCanCarry, units, nextBestDelta } = comparison;
  const winnerLine = winner === "tie"
    ? `All three inbound splits cost ${money(paths.minimal.total)} on ${units} units.`
    : `${paths[winner].label} totals ${money(paths[winner].total)} (${money(paths[winner].perUnit)} / unit) — ${money(nextBestDelta)} less than the next option.`;
  const carry = extraFreightOptimizedCanCarry > 0
    ? ` The Amazon-optimized split can cost up to ${money(extraFreightOptimizedCanCarry)} more in freight before one warehouse plus placement is cheaper.`
    : ` One-warehouse placement is ${money(-extraFreightOptimizedCanCarry)} cheaper than the optimized split's placement line, so extra freight on the split has to be even smaller to win.`;
  return `${winnerLine}${carry}`;
}

// Amazon can add a per-unit low-inventory-level surcharge when BOTH the
// 30-day and 90-day historical days of supply sit below 28. That is a
// quantity question (how thin is this FNSKU?), not aged-inventory (an
// age surcharge on leftover units) and not restock vs storage seasons
// (when the cube sits). Salvaged from #1521 onto current main so the
// unique restock-vs-stay-thin table is not lost behind a conflicted rebase.
export const LOW_INVENTORY_THRESHOLD_DAYS = 28;

// Illustrative 2025–26 US FBA low-inventory-level bands. Sellers replace
// the per-unit fee from their current Amazon fee preview. Extra-large is
// treated as exempt in this model.
export const LOW_INVENTORY_FEE_PRESETS = {
  small_standard: [
    { maxDays: 13, fee: 0.89, label: "0–13 days" },
    { maxDays: 20, fee: 0.63, label: "14–20 days" },
    { maxDays: 27, fee: 0.32, label: "21–27 days" },
  ],
  large_standard_light: [
    { maxDays: 13, fee: 0.97, label: "0–13 days" },
    { maxDays: 20, fee: 0.7, label: "14–20 days" },
    { maxDays: 27, fee: 0.36, label: "21–27 days" },
  ],
  large_standard_heavy: [
    { maxDays: 13, fee: 1.11, label: "0–13 days" },
    { maxDays: 20, fee: 0.87, label: "14–20 days" },
    { maxDays: 27, fee: 0.47, label: "21–27 days" },
  ],
  large_bulky: [
    { maxDays: 13, fee: 2.09, label: "0–13 days" },
    { maxDays: 20, fee: 1.44, label: "14–20 days" },
    { maxDays: 27, fee: 1.08, label: "21–27 days" },
  ],
};

export function daysOfSupply({ averageDailyInventory, unitsSold, windowDays }) {
  const inventory = number(averageDailyInventory, "On-hand units");
  const sold = number(unitsSold, "Units sold");
  const window = number(windowDays, "Window days");
  if (window === 0) throw new Error("Window days must be greater than zero");
  const dailyShipped = sold / window;
  if (dailyShipped === 0) return Infinity;
  return inventory / dailyShipped;
}

export function lowInventoryBandKey(sizeTier, weightLb) {
  if (!SIZE_TIER_LABELS[sizeTier]) throw new Error(`Unknown size tier: ${sizeTier}`);
  if (sizeTier === "small_standard") return "small_standard";
  if (sizeTier === "large_standard") {
    return number(weightLb, "Weight") <= 3 ? "large_standard_light" : "large_standard_heavy";
  }
  if (sizeTier === "large_bulky") return "large_bulky";
  return "exempt";
}

export function defaultLowInventoryFee({ sizeTier, weightLb, daysOfSupply: days }) {
  const supply = number(days, "Days of supply");
  if (supply >= LOW_INVENTORY_THRESHOLD_DAYS) return 0;
  const key = lowInventoryBandKey(sizeTier, weightLb);
  const bands = LOW_INVENTORY_FEE_PRESETS[key];
  if (!bands) return 0;
  for (const band of bands) {
    if (supply <= band.maxDays) return band.fee;
  }
  return bands[bands.length - 1].fee;
}

/**
 * Same FNSKU, two policies once both historical windows sit under 28 days.
 *
 *   - Stay thin — pay the per-unit surcharge on each FBA shipment.
 *   - Restock to 28 days — send the extra units, pay inbound now and
 *     storage on the extra cube, and drop the surcharge.
 *
 * Days of supply is on-hand divided by daily shipped in that window.
 * When both windows are thin, the fee band follows the thinner one.
 * If either window is 28 days or more, this model adds nothing.
 * Merchant-fulfilled, grocery, and new-FNSKU are exemption switches
 * the seller turns on — not a claim the account qualifies.
 *
 * Listing profit stays completed-sale on the main calculator. This
 * table is complementary, not a second aged-inventory or Q4-storage
 * page. Rates are inputs, not Amazon's live LIL schedule.
 */
export function compareLowInventory(input = {}) {
  const hasInventory =
    !emptyField(input.onHandUnits) &&
    !emptyField(input.soldLast30Days) &&
    !emptyField(input.soldLast90Days);

  if (!hasInventory) {
    return {
      applies: false,
      reason: "not_entered",
      shortTermDays: null,
      longTermDays: null,
      bandDays: null,
      bandLabel: "not entered",
      suggestedFee: 0,
      feePerUnit: 0,
      monthlyFee: 0,
      extraUnitsTo28: 0,
      extraStoragePerMonth: 0,
      extraInbound: 0,
      restockSavesPerMonth: 0,
      inboundPaybackMonths: null,
      cheaperPolicy: "tie",
      exempt: false,
      monthlyUnits: 0,
    };
  }

  const onHandUnits = number(input.onHandUnits, "On-hand units");
  const soldLast30Days = number(input.soldLast30Days, "Units sold last 30 days");
  const soldLast90Days = number(input.soldLast90Days, "Units sold last 90 days");
  const storageRate = number(input.storageRate, "Storage rate", 0);
  const inboundPerUnit = number(input.inboundPerUnit, "Inbound per unit", 0);
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 0);
  const cuFt = emptyField(input.cubicFeet)
    ? cubicFeet({
        length: input.length ?? 8,
        width: input.width ?? 6,
        height: input.height ?? 2,
      })
    : number(input.cubicFeet, "Cubic feet", 0);
  const fulfillmentMethod = input.fulfillmentMethod ?? "fba";
  const newFnskuExempt = Boolean(input.newFnskuExempt);
  const groceryExempt = Boolean(input.groceryExempt);
  const sizeTier = input.sizeTier ?? "large_standard";
  const weightLb = input.weightLb ?? 0;

  const shortTermDays = daysOfSupply({
    averageDailyInventory: onHandUnits,
    unitsSold: soldLast30Days,
    windowDays: 30,
  });
  const longTermDays = daysOfSupply({
    averageDailyInventory: onHandUnits,
    unitsSold: soldLast90Days,
    windowDays: 90,
  });

  const bothFinite = Number.isFinite(shortTermDays) && Number.isFinite(longTermDays);
  const bothBelow =
    bothFinite &&
    shortTermDays < LOW_INVENTORY_THRESHOLD_DAYS &&
    longTermDays < LOW_INVENTORY_THRESHOLD_DAYS;
  // When both windows are thin, the fee band follows the thinner one. If
  // either window is 28 days or more, Amazon's published rule waives the fee.
  const bandDays = bothBelow ? Math.min(shortTermDays, longTermDays) : Math.max(shortTermDays, longTermDays);

  let reason = "above_threshold";
  let exempt = false;
  if (fulfillmentMethod === "fbm") {
    reason = "fbm";
    exempt = true;
  } else if (newFnskuExempt) {
    reason = "new_fnsku";
    exempt = true;
  } else if (groceryExempt) {
    reason = "grocery";
    exempt = true;
  } else if (!bothBelow) {
    reason = "above_threshold";
  } else {
    reason = "below_threshold";
  }

  const applies = reason === "below_threshold";
  const suggestedFee = applies
    ? defaultLowInventoryFee({
        sizeTier,
        weightLb,
        daysOfSupply: bandDays,
      })
    : 0;

  const feePerUnit = applies
    ? emptyField(input.lowInventoryFee)
      ? suggestedFee
      : number(input.lowInventoryFee, "Low-inventory fee")
    : 0;

  const monthlyFee = feePerUnit * monthlyUnits;

  const dailyShipped = Math.max(soldLast30Days / 30, soldLast90Days / 90);
  const unitsFor28 = dailyShipped * LOW_INVENTORY_THRESHOLD_DAYS;
  const extraUnitsTo28 = Math.max(0, unitsFor28 - onHandUnits);
  const extraStoragePerMonth = extraUnitsTo28 * cuFt * storageRate;
  const extraInbound = extraUnitsTo28 * inboundPerUnit;
  const restockSavesPerMonth = monthlyFee - extraStoragePerMonth;
  const inboundPaybackMonths =
    restockSavesPerMonth > 0 ? extraInbound / restockSavesPerMonth : extraInbound === 0 ? 0 : Infinity;

  let cheaperPolicy = "tie";
  if (restockSavesPerMonth > 0) cheaperPolicy = "restock";
  if (restockSavesPerMonth < 0) cheaperPolicy = "stay_thin";

  const bands = LOW_INVENTORY_FEE_PRESETS[lowInventoryBandKey(sizeTier, weightLb)] ?? [];
  const bandLabel = applies
    ? bands.find((band) => bandDays <= band.maxDays)?.label ?? "below 28 days"
    : reason === "above_threshold"
      ? "28+ days"
      : reason === "fbm"
        ? "FBM (not charged)"
        : reason === "new_fnsku"
          ? "new FNSKU exempt"
          : reason === "grocery"
            ? "grocery exempt"
            : "not entered";

  return {
    applies,
    reason,
    shortTermDays,
    longTermDays,
    bandDays,
    bandLabel,
    suggestedFee,
    feePerUnit,
    monthlyFee,
    extraUnitsTo28,
    extraStoragePerMonth,
    extraInbound,
    restockSavesPerMonth,
    inboundPaybackMonths,
    cheaperPolicy,
    exempt,
    dailyShipped,
    unitsFor28,
    monthlyUnits,
    cubicFeet: cuFt,
    sizeTier,
    sizeTierLabel: SIZE_TIER_LABELS[sizeTier] ?? sizeTier,
  };
}

export function lowInventoryNote(result) {
  if (!result || typeof result.reason !== "string") {
    throw new Error("Low-inventory comparison is missing");
  }
  const money = (value) => {
    const sign = value < 0 ? "−" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  if (!result.applies) {
    if (result.reason === "fbm") {
      return "Merchant fulfilled shipments do not pick up the low-inventory-level surcharge on these inputs.";
    }
    if (result.reason === "grocery") {
      return "The grocery exemption switch is on, so this model adds no low-inventory-level surcharge. That is not a claim your account qualifies.";
    }
    if (result.reason === "new_fnsku") {
      return "The new-FNSKU exemption switch is on, so this model adds no low-inventory-level surcharge. That is not a claim your account qualifies.";
    }
    if (result.reason === "not_entered") {
      return "On-hand units and the last 30 / 90 days of sales are needed before days of supply can be compared to 28.";
    }
    return "One of the two historical windows is 28 days or more. The model adds no surcharge when either the 30-day or the 90-day days of supply sits at or above 28.";
  }
  const stay = `Stay thin: ${money(result.monthlyFee)} / month on ${result.monthlyUnits} shipments (${money(result.feePerUnit)} / unit, ${result.bandLabel}).`;
  if (result.cheaperPolicy === "restock") {
    const payback = Number.isFinite(result.inboundPaybackMonths)
      ? ` Extra inbound pays back in about ${result.inboundPaybackMonths.toFixed(1)} months.`
      : "";
    return (
      `${stay} Restocking ${result.extraUnitsTo28.toFixed(1)} units to 28 days avoids ` +
      `${money(result.restockSavesPerMonth)} more per month after the extra storage.` +
      `${payback} Arithmetic on your inputs, not advice to send inventory.`
    );
  }
  if (result.cheaperPolicy === "stay_thin") {
    return (
      `${stay} Extra storage on a restock to 28 days (${money(result.extraStoragePerMonth)} / month) ` +
      `is larger than the surcharge, so staying thin leaves ` +
      `${money(-result.restockSavesPerMonth)} more per month. ` +
      `Arithmetic on your inputs, not advice to stay thin.`
    );
  }
  return `${stay} Restocking to 28 days and staying thin leave the same monthly cash on these rates.`;
}
