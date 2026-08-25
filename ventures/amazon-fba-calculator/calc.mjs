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

// Ads sit in cashInvested, so profit already includes the current PPC spend.
// Add the spend back to see how much advertising the unit can still carry
// before it loses money, or before it misses the seller's target margin.
// ACOS is that spend as a percent of the sale price — the number PPC
// campaigns are actually managed against.
function attachAdLimits(path, { salePrice, adsPerUnit, targetMarginRate }) {
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

  const adLimits = { salePrice, adsPerUnit, targetMarginRate };

  const fbaCash = sharedCash + inboundPerUnit + storagePerUnit;
  const fba = attachAdLimits(
    finish(
      pathResult({
        revenue: salePrice,
        percentRate,
        cashInvested: fbaCash,
        targetMarginRate,
        feeParts: { referral, fulfillment: fulfillmentFee },
      }),
      costOfGoods,
    ),
    adLimits,
  );

  const fbmCash = sharedCash + fbmShippingCost;
  const fbm = attachAdLimits(
    finish(
      pathResult({
        revenue: salePrice,
        percentRate,
        cashInvested: fbmCash,
        targetMarginRate,
        feeParts: { referral, fulfillment: 0 },
      }),
      costOfGoods,
    ),
    adLimits,
  );

  const selected = fulfillmentMethod === "fba" ? fba : fbm;
  const fbaAdvantage = fba.profit - fbm.profit;
  return {
    salePrice,
    adsPerUnit,
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
