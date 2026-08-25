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

const FULFILLMENT_METHODS = new Set(["fba", "fbm"]);

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
  if (!preset) throw new Error(`Unknown Amazon category: ${categoryId}`);
  return { ...input, referralRate: preset.referralRate };
}

export function applyStoragePreset(input, seasonId) {
  const preset = STORAGE_PRESETS[seasonId];
  if (!preset) throw new Error(`Unknown storage season: ${seasonId}`);
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
    path.breakEvenBuyCost = Math.max(0, salePrice - path.feeTotal - (path.cashInvested - cogsInCash));
    return path;
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

  const fbmCash = sharedCash + fbmShippingCost;
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

  const selected = fulfillmentMethod === "fba" ? fba : fbm;
  const fbaAdvantage = fba.profit - fbm.profit;
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
    selected,
    fba,
    fbm,
    fbaAdvantage,
    cheaperPath: fbaAdvantage > 0 ? "fba" : fbaAdvantage < 0 ? "fbm" : "tie",
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
    const current = bands.find((band) => oz <= band) ?? bands[bands.length - 1];
    const index = bands.indexOf(current);
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
  });
  return { listing, pack, packExtra };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Current carton vs a pack that drops a size tier vs a pack that only
 * drops a fulfillment weight band. The drop-tier carton is the current
 * cube clamped to the next-lower tier's gates — it is not a claim the
 * product still fits that box. Repack cost is extra prep on the smaller
 * carton only.
 */
export function compareSizeTierPackaging(input = {}) {
  const current = calculateListing({
    ...input,
    fulfillmentFee: undefined,
    sizeTier: undefined,
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

export function sizeTierPackagingNote(comparison) {
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
