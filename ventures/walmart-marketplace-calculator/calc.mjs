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
