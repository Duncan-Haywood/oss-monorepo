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
  // profit. Null when list profit is not positive. Infinity when the coupon
  // unit itself does not pay — extra volume cannot recover the month.
  let breakEvenUnits = null;
  if (noneRow.profit > 0 && typedRow.profit <= 0) breakEvenUnits = Infinity;
  else if (typedRow.profit > 0) breakEvenUnits = (noneRow.profit * monthlyUnits) / typedRow.profit;

  const extraUnitsNeeded = breakEvenUnits === null
    ? 0
    : breakEvenUnits === Infinity
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
  const money = (value) => `$${value.toFixed(2)}`;
  const typed = comparison.typed;
  if (typed.discount === 0 && typed.couponFee === 0) {
    return "No coupon is entered, so every row but the list-price line is a what-if against this listing.";
  }
  const offer = typed.label.toLowerCase();
  const perUnit = `${offer} drops the buyer price from ${money(typed.listPrice)} to ${money(typed.buyerPays)} and leaves ${money(typed.profit)} after the ${money(typed.couponFee)} redemption fee — ${money(Math.abs(typed.profitDelta))} ${typed.profitDelta < 0 ? "less" : "more"} than list.`;
  if (comparison.breakEvenUnits === Infinity) {
    return `${perUnit} Extra volume cannot recover the list-price month: the couponed unit itself does not pay.`;
  }
  if (comparison.breakEvenUnits === null) {
    return `${perUnit} The list-price unit is not profitable on these inputs, so a break-even volume is not defined.`;
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
  // buyers convert. Infinity when the S&S unit itself does not pay.
  let offsetUnits = 0;
  if (snsPercent === 0 || enrolledUnits === 0 || typedRow.profit >= noneRow.profit) {
    offsetUnits = 0;
  } else if (typedRow.profit <= 0) {
    offsetUnits = noneRow.profit > 0 ? Infinity : 0;
  } else {
    offsetUnits = (enrolledUnits * (noneRow.profit - typedRow.profit)) / typedRow.profit;
  }

  let breakEvenUnits = null;
  if (noneRow.profit > 0 && typedRow.profit <= 0) breakEvenUnits = Infinity;
  else if (typedRow.profit > 0) breakEvenUnits = (noneRow.profit * monthlyUnits) / typedRow.profit;

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
  const money = (value) => `$${value.toFixed(2)}`;
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
