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
