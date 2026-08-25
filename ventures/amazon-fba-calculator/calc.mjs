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

  const lowInventory = compareLowInventory({
    onHandUnits: input.onHandUnits,
    soldLast30Days: input.soldLast30Days,
    soldLast90Days: input.soldLast90Days,
    sizeTier,
    weightLb,
    cubicFeet: cuFt,
    storageRate,
    inboundPerUnit,
    monthlyUnits,
    lowInventoryFee: input.lowInventoryFee,
    newFnskuExempt: input.newFnskuExempt,
    groceryExempt: input.groceryExempt,
    fulfillmentMethod: "fba",
  });

  const fbaCash = sharedCash + inboundPerUnit + storagePerUnit;
  const fba = finish(
    pathResult({
      revenue: salePrice,
      percentRate,
      cashInvested: fbaCash,
      targetMarginRate,
      feeParts: { referral, fulfillment: fulfillmentFee, lowInventory: lowInventory.feePerUnit },
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
      feeParts: { referral, fulfillment: 0, lowInventory: 0 },
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
    lowInventory,
  };
}

// Illustrative US low-inventory-level (LIL) bands. Amazon charges a per-unit
// surcharge on FBA shipments when both the 30-day and 90-day historical days
// of supply sit below 28. These defaults are editable starting points — not
// Amazon's live schedule. Extra-large is treated as exempt unless the seller
// types a fee.
export const LOW_INVENTORY_THRESHOLD_DAYS = 28;

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

export function compareLowInventory(input = {}) {
  const hasInventory =
    input.onHandUnits !== undefined &&
    input.onHandUnits !== null &&
    input.onHandUnits !== "" &&
    input.soldLast30Days !== undefined &&
    input.soldLast30Days !== null &&
    input.soldLast30Days !== "" &&
    input.soldLast90Days !== undefined &&
    input.soldLast90Days !== null &&
    input.soldLast90Days !== "";

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
    };
  }

  const onHandUnits = number(input.onHandUnits, "On-hand units");
  const soldLast30Days = number(input.soldLast30Days, "Units sold last 30 days");
  const soldLast90Days = number(input.soldLast90Days, "Units sold last 90 days");
  const storageRate = number(input.storageRate, "Storage rate", 0);
  const inboundPerUnit = number(input.inboundPerUnit, "Inbound per unit", 0);
  const monthlyUnits = number(input.monthlyUnits, "Monthly units", 0);
  const cuFt = number(input.cubicFeet ?? 0, "Cubic feet", 0);
  const fulfillmentMethod = input.fulfillmentMethod ?? "fba";
  const newFnskuExempt = Boolean(input.newFnskuExempt);
  const groceryExempt = Boolean(input.groceryExempt);

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
        sizeTier: input.sizeTier ?? "large_standard",
        weightLb: input.weightLb ?? 0,
        daysOfSupply: bandDays,
      })
    : 0;

  const overrideEmpty =
    input.lowInventoryFee === undefined || input.lowInventoryFee === null || input.lowInventoryFee === "";
  const feePerUnit = applies
    ? overrideEmpty
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

  const bandLabel = applies
    ? (LOW_INVENTORY_FEE_PRESETS[lowInventoryBandKey(input.sizeTier ?? "large_standard", input.weightLb ?? 0)] ?? [])
        .find((band) => bandDays <= band.maxDays)?.label ?? "below 28 days"
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
  };
}
