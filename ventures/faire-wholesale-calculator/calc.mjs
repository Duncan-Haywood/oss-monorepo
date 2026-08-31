// Faire wholesale fee arithmetic for one order. No network, no stored live
// schedule: every rate is an input. The presets below are illustrative
// starting points taken from Faire's public North America help article
// (https://www.faire.com/support/articles/360015893392, read 2026-08-25)
// and the matching outside-North-America article. A brand is expected to
// replace them with the numbers on their own payout summary. That keeps the
// output a transparent calculation they can check, not a claim about Faire's
// current published fees.
//
// Faire's published payout formula:
//   payout = order subtotal + shipping reimbursement − commission − processing
//   order subtotal = wholesale merchandise minus brand-funded promotions
//   commission = order subtotal × commission rate  (+ a one-time first-order fee)
//   processing = item subtotal × payout-speed rate  (+ the published fixed fee)

export const PAYOUT_PRESETS = {
  next_day: { paymentRate: 3.5, paymentFixed: 0.3, label: "Next-day payout" },
  day_30: { paymentRate: 2.4, paymentFixed: 0.3, label: "30-day payout" },
  day_60: { paymentRate: 1.9, paymentFixed: 0.3, label: "60-day payout" },
};

export const REGION_PRESETS = {
  north_america: {
    commissionRate: 15,
    firstOrderFlat: 10,
    firstOrderExtraRate: 0,
    label: "North America",
  },
  outside_na: {
    commissionRate: 15,
    firstOrderFlat: 0,
    firstOrderExtraRate: 10,
    label: "Outside North America",
  },
};

export const BRAND_SCENARIOS = [
  {
    id: "marketplace_first",
    label: "Marketplace first order",
    note: "A retailer who found you on Faire. Standard commission plus the one-time new-customer fee.",
    usesFirstOrderFee: true,
    commissionRate: null,
  },
  {
    id: "marketplace_reorder",
    label: "Marketplace reorder",
    note: "A later order from the same Faire-sourced retailer. Standard commission, no new-customer fee.",
    usesFirstOrderFee: false,
    commissionRate: null,
  },
  {
    id: "faire_direct",
    label: "Faire Direct",
    note: "A retailer you brought to Faire with your Direct link. 0% commission; processing still applies.",
    usesFirstOrderFee: false,
    commissionRate: 0,
  },
  {
    id: "own_invoice",
    label: "Own invoice (off Faire)",
    note: "You invoice the same order yourself. No Faire commission or processing unless you enter your own card fees.",
    usesFirstOrderFee: false,
    commissionRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
  },
];

function number(value, name, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function wholeNumber(value, name, fallback = 1) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result) || result < 1) throw new Error(`${name} must be a whole number of at least 1`);
  return result;
}

function regionPreset(region) {
  const key = region === "outside_na" ? "outside_na" : "north_america";
  return REGION_PRESETS[key];
}

function payoutPreset(payout) {
  if (payout && PAYOUT_PRESETS[payout]) return PAYOUT_PRESETS[payout];
  return PAYOUT_PRESETS.day_60;
}

function scenarioById(id) {
  const scenario = BRAND_SCENARIOS.find((row) => row.id === id);
  if (!scenario) throw new Error("Unknown brand scenario");
  return scenario;
}

/**
 * One brand-side Faire (or off-Faire) order.
 *
 * `scenario` is a BRAND_SCENARIOS id. Rates the brand typed override the
 * regional / payout presets; a scenario that zeros commission or processing
 * (Faire Direct, own invoice) still wins over those typed rates so the
 * comparison cannot accidentally apply a marketplace commission to Direct.
 */
export function calculateBrandOrder(input = {}, scenarioId = "marketplace_reorder") {
  const scenario = scenarioById(scenarioId);
  const region = regionPreset(input.region);
  const payout = payoutPreset(input.payout);

  const unitWholesale = number(input.unitWholesale, "Wholesale unit price");
  const quantity = wholeNumber(input.quantity, "Units", 1);
  const unitCogs = number(input.unitCogs, "Unit cost of goods", 0);
  const openingDiscountRate = number(input.openingDiscountRate, "Brand-funded discount %", 0);
  if (openingDiscountRate >= 100) throw new Error("Brand-funded discount must be below 100%");
  const shippingReimbursement = number(input.shippingReimbursement, "Shipping reimbursement", 0);
  const shippingCost = number(input.shippingCost, "Shipping you pay", 0);
  const otherCost = number(input.otherCost, "Other per-order cost", 0);
  const promotedRate = number(input.promotedRate, "Promoted listings rate", 0);

  const commissionRate = scenario.commissionRate === 0
    ? 0
    : number(input.commissionRate, "Commission rate", region.commissionRate);
  const firstOrderFlat = scenario.usesFirstOrderFee
    ? number(input.firstOrderFlat, "First-order flat fee", region.firstOrderFlat)
    : 0;
  const firstOrderExtraRate = scenario.usesFirstOrderFee
    ? number(input.firstOrderExtraRate, "First-order extra rate", region.firstOrderExtraRate)
    : 0;
  const paymentRate = scenario.paymentRate === 0
    ? 0
    : number(input.paymentRate, "Payment processing rate", payout.paymentRate);
  const paymentFixed = scenario.paymentFixed === 0
    ? 0
    : number(input.paymentFixed, "Payment fixed fee", payout.paymentFixed);

  const merchandise = unitWholesale * quantity;
  const brandFundedDiscount = merchandise * openingDiscountRate / 100;
  const orderSubtotal = merchandise - brandFundedDiscount;
  const percentFees = (commissionRate + firstOrderExtraRate + paymentRate + promotedRate) / 100;
  if (percentFees >= 1) throw new Error("Percentage fees add up to 100% or more of the order subtotal");

  const fees = {
    commission: orderSubtotal * commissionRate / 100,
    firstOrder: firstOrderFlat + orderSubtotal * firstOrderExtraRate / 100,
    processing: orderSubtotal * paymentRate / 100 + paymentFixed,
    promoted: orderSubtotal * promotedRate / 100,
  };
  const feeTotal = fees.commission + fees.firstOrder + fees.processing + fees.promoted;
  const payoutAmount = orderSubtotal + shippingReimbursement - feeTotal;
  const cashInvested = unitCogs * quantity + shippingCost + otherCost;
  const profit = payoutAmount - cashInvested;

  return {
    scenario: scenario.id,
    label: scenario.label,
    note: scenario.note,
    unitWholesale,
    quantity,
    merchandise,
    brandFundedDiscount,
    orderSubtotal,
    shippingReimbursement,
    fees,
    feeTotal,
    payoutAmount,
    cashInvested,
    profit,
    margin: orderSubtotal === 0 ? 0 : profit / orderSubtotal * 100,
    roi: cashInvested === 0 ? null : profit / cashInvested * 100,
    percentFees: percentFees * 100,
    firstOrderFlat,
    firstOrderExtraRate,
    commissionRate,
    paymentRate,
    paymentFixed,
  };
}

/**
 * Wholesale unit price that hits `targetMargin` percent of the Faire order
 * subtotal for one scenario, holding quantity, discount, and cash costs fixed.
 */
export function wholesaleForMargin(input, targetMargin, scenarioId = "marketplace_first") {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) {
    throw new Error("Target margin must be between 0 and 99.9%");
  }
  const quantity = wholeNumber(input.quantity, "Units", 1);
  const openingDiscountRate = number(input.openingDiscountRate, "Brand-funded discount %", 0);
  if (openingDiscountRate >= 100) throw new Error("Brand-funded discount must be below 100%");
  const discountFactor = 1 - openingDiscountRate / 100;
  if (discountFactor <= 0) throw new Error("Brand-funded discount leaves no subtotal");

  const probe = calculateBrandOrder({ ...input, unitWholesale: 0 }, scenarioId);
  const cash = number(input.unitCogs, "Unit cost of goods", 0) * quantity
    + number(input.shippingCost, "Shipping you pay", 0)
    + number(input.otherCost, "Other per-order cost", 0);
  const shippingReimbursement = number(input.shippingReimbursement, "Shipping reimbursement", 0);
  const denominator = 1 - probe.percentFees / 100 - margin / 100;
  if (denominator <= 0) throw new Error("Target margin is not possible with these fee rates");
  const orderSubtotal = (cash + probe.firstOrderFlat + probe.paymentFixed - shippingReimbursement) / denominator;
  return Math.max(0, orderSubtotal / (quantity * discountFactor));
}

export function compareBrandScenarios(input) {
  const results = BRAND_SCENARIOS.map((scenario) => calculateBrandOrder(input, scenario.id));
  const best = results.reduce((winner, row) => (row.profit > winner.profit ? row : winner));
  return {
    results: results.map((row) => ({
      ...row,
      isBest: row === best,
      gapVsBest: best.profit - row.profit,
    })),
    best: { id: best.scenario, label: best.label, profit: best.profit, margin: best.margin },
    spread: best.profit - Math.min(...results.map((row) => row.profit)),
  };
}

function wholeNumberOrZero(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/**
 * One retailer relationship: the opening marketplace order plus the reorders
 * you expect from them, versus sending every order through Direct or invoicing
 * them yourself. The first-order fee is a one-time hit; this is how it looks
 * after they come back.
 */
export function compareRetailerLifetime(input = {}, expectedReorders) {
  const reorders = wholeNumberOrZero(
    expectedReorders === undefined ? input.expectedReorders : expectedReorders,
    "Expected reorders",
    0,
  );
  const first = calculateBrandOrder(input, "marketplace_first");
  const reorder = calculateBrandOrder(input, "marketplace_reorder");
  const direct = calculateBrandOrder(input, "faire_direct");
  const own = calculateBrandOrder(input, "own_invoice");
  const orders = 1 + reorders;

  const pack = (label, profit, fees, payout) => ({
    label,
    orders,
    profit,
    fees,
    payout,
    profitPerOrder: profit / orders,
  });

  const paths = [
    pack(
      "Marketplace (first + reorders)",
      first.profit + reorder.profit * reorders,
      first.feeTotal + reorder.feeTotal * reorders,
      first.payoutAmount + reorder.payoutAmount * reorders,
    ),
    pack(
      "Faire Direct every order",
      direct.profit * orders,
      direct.feeTotal * orders,
      direct.payoutAmount * orders,
    ),
    pack(
      "Own invoice every order",
      own.profit * orders,
      own.feeTotal * orders,
      own.payoutAmount * orders,
    ),
  ];
  const best = paths.reduce((winner, row) => (row.profit > winner.profit ? row : winner));

  let reordersUntilPositive = 0;
  if (first.profit < 0) {
    reordersUntilPositive = reorder.profit <= 0 ? null : Math.ceil(-first.profit / reorder.profit);
  }

  return {
    expectedReorders: reorders,
    orders,
    first,
    reorder,
    amortizedFirstOrderFee: first.fees.firstOrder / orders,
    reordersUntilPositive,
    paths: paths.map((row) => ({
      ...row,
      isBest: row === best,
      gapVsBest: best.profit - row.profit,
    })),
    best: { label: best.label, profit: best.profit },
  };
}

export const OPEN_HOUSE_DEFAULTS = {
  openHouseDiscountRate: 20,
  openHouseCommissionRate: 0,
  openHouseFirstOrderExtraRate: 0,
  openHouseExtraRetailers: 2,
};

function moneyLabel(value) {
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `−$${abs}` : `$${abs}`;
}

function openHouseOrder(input, discountRate, commissionRate, firstOrderExtraRate, firstOrderFlat) {
  return calculateBrandOrder({
    ...input,
    openingDiscountRate: discountRate,
    commissionRate,
    firstOrderExtraRate,
    firstOrderFlat,
  }, "marketplace_first");
}

/**
 * Discount percent on an Open House first order that still matches
 * everyday leftover. Binary search so first-order extra rates and
 * processing stay in the same formula as calculateBrandOrder.
 */
function openHouseDiscountCeiling(input, everydayProfit, commissionRate, firstOrderExtraRate, firstOrderFlat) {
  const atZero = openHouseOrder(input, 0, commissionRate, firstOrderExtraRate, firstOrderFlat);
  // Behind everyday even with no event discount at all, so the waived
  // commission funds nothing. Returning 0 here read as a real (if zero)
  // headroom and could not be told apart from the legitimate case where the
  // ceiling genuinely is 0% — the event ties everyday at no discount and any
  // markdown loses. null is "no discount keeps up".
  if (atZero.profit + 1e-9 < everydayProfit) return null;
  const atTop = openHouseOrder(input, 99.9, commissionRate, firstOrderExtraRate, firstOrderFlat);
  if (atTop.profit + 1e-9 >= everydayProfit) return 99.9;
  let lo = 0;
  let hi = 99.9;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const row = openHouseOrder(input, mid, commissionRate, firstOrderExtraRate, firstOrderFlat);
    if (row.profit + 1e-12 >= everydayProfit) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Same new retailer, first marketplace order: list everyday at your
 * usual opening discount, list during Open House at the deeper
 * retailer discount Faire shoppers expect, and list during Open House
 * at your everyday discount so the waived commission is visible
 * without the extra markdown.
 *
 * Open House is not Faire Direct (you still did not bring the
 * retailer) and not a reorder (the new-customer fee can still apply).
 * Commission and the first-order extra percent default to 0% for the
 * event; the flat new-customer fee stays unless you type a different
 * Open House flat. Extra new retailers are a count you enter, not a
 * forecast that the window will produce them.
 */
export function compareOpenHouse(input = {}) {
  const openHouseDiscountRate = number(
    input.openHouseDiscountRate,
    "Open House discount %",
    OPEN_HOUSE_DEFAULTS.openHouseDiscountRate,
  );
  if (openHouseDiscountRate >= 100) throw new Error("Open House discount must be below 100%");
  const openHouseCommissionRate = number(
    input.openHouseCommissionRate,
    "Open House commission rate",
    OPEN_HOUSE_DEFAULTS.openHouseCommissionRate,
  );
  const openHouseFirstOrderExtraRate = number(
    input.openHouseFirstOrderExtraRate,
    "Open House first-order extra rate",
    OPEN_HOUSE_DEFAULTS.openHouseFirstOrderExtraRate,
  );
  const extraRetailers = wholeNumberOrZero(
    input.openHouseExtraRetailers,
    "Open House extra retailers",
    OPEN_HOUSE_DEFAULTS.openHouseExtraRetailers,
  );
  const region = regionPreset(input.region);
  const everydayFirstFlat = number(input.firstOrderFlat, "First-order flat fee", region.firstOrderFlat);
  const openHouseFirstOrderFlat = input.openHouseFirstOrderFlat === undefined || input.openHouseFirstOrderFlat === ""
    ? everydayFirstFlat
    : number(input.openHouseFirstOrderFlat, "Open House first-order flat fee");

  const everyday = calculateBrandOrder(input, "marketplace_first");
  const openHouse = openHouseOrder(
    input,
    openHouseDiscountRate,
    openHouseCommissionRate,
    openHouseFirstOrderExtraRate,
    openHouseFirstOrderFlat,
  );
  const openHouseSameList = openHouseOrder(
    input,
    everyday.brandFundedDiscount === 0 && number(input.openingDiscountRate, "Brand-funded discount %", 0) === 0
      ? 0
      : number(input.openingDiscountRate, "Brand-funded discount %", 0),
    openHouseCommissionRate,
    openHouseFirstOrderExtraRate,
    openHouseFirstOrderFlat,
  );

  const pack = (id, label, order, retailers) => ({
    id,
    label,
    retailers,
    profit: order.profit,
    fees: order.feeTotal,
    payout: order.payoutAmount,
    discount: order.brandFundedDiscount,
    discountRate: order.merchandise === 0 ? 0 : order.brandFundedDiscount / order.merchandise * 100,
    commissionRate: order.commissionRate,
    pileProfit: order.profit * retailers,
    order,
  });

  const everydayRetailers = 1;
  const openHouseRetailers = 1 + extraRetailers;
  const rows = [
    pack("everyday", "Everyday first order", everyday, everydayRetailers),
    pack("open_house", "Open House + event discount", openHouse, openHouseRetailers),
    pack("open_house_same_list", "Open House at everyday discount", openHouseSameList, openHouseRetailers),
  ];
  const perOrderBest = rows.reduce((winner, row) => (row.profit > winner.profit ? row : winner));
  const pileBest = rows.reduce((winner, row) => (row.pileProfit > winner.pileProfit ? row : winner));

  let retailersToMatchEveryday = 1;
  if (openHouse.profit + 1e-12 < everyday.profit) {
    if (openHouse.profit <= 0) retailersToMatchEveryday = null;
    else retailersToMatchEveryday = Math.ceil(everyday.profit / openHouse.profit - 1e-12);
  }

  const discountCeiling = openHouseDiscountCeiling(
    input,
    everyday.profit,
    openHouseCommissionRate,
    openHouseFirstOrderExtraRate,
    openHouseFirstOrderFlat,
  );

  const result = {
    everyday,
    openHouse,
    openHouseSameList,
    extraRetailers,
    openHouseRetailers,
    discountCeiling,
    retailersToMatchEveryday,
    extraVsEveryday: openHouse.profit - everyday.profit,
    sameListVsEveryday: openHouseSameList.profit - everyday.profit,
    pileExtraVsEveryday: openHouse.profit * openHouseRetailers - everyday.profit,
    rows: rows.map((row) => ({
      ...row,
      isBestPerOrder: row === perOrderBest,
      isBestPile: row === pileBest,
      gapVsBestPerOrder: perOrderBest.profit - row.profit,
      pileGapVsBest: pileBest.pileProfit - row.pileProfit,
    })),
    bestPerOrder: { id: perOrderBest.id, label: perOrderBest.label, profit: perOrderBest.profit },
    bestPile: { id: pileBest.id, label: pileBest.label, profit: pileBest.pileProfit },
  };
  result.summary = openHouseNote(result);
  return result;
}

export function openHouseNote(comparison) {
  if (!comparison?.everyday || !comparison?.openHouse || !comparison?.openHouseSameList) {
    throw new Error("openHouseNote missing rows");
  }
  const everyday = comparison.everyday;
  const event = comparison.openHouse;
  const same = comparison.openHouseSameList;
  const extra = comparison.extraVsEveryday;
  const ceiling = comparison.discountCeiling;
  const pile = comparison.pileExtraVsEveryday;
  const extraRetailers = comparison.extraRetailers;
  const match = comparison.retailersToMatchEveryday;
  const matchBit = match === null
    ? " The event-discount path does not recover everyday leftover at a positive Open House profit."
    : match <= 1
      ? ""
      : ` ${match} Open House first orders (${match - 1} extra) match one everyday order.`;
  const pileBit = extraRetailers === 0
    ? ""
    : pile >= 0
      ? ` ${extraRetailers} extra new retailer${extraRetailers === 1 ? "" : "s"} flip the pile ${moneyLabel(event.profit * comparison.openHouseRetailers)} vs ${moneyLabel(everyday.profit)} (${pile >= 0 ? "+" : ""}${moneyLabel(pile)}).`
      : ` ${extraRetailers} extra new retailer${extraRetailers === 1 ? "" : "s"} still leave the pile ${moneyLabel(event.profit * comparison.openHouseRetailers)} vs ${moneyLabel(everyday.profit)} (${moneyLabel(pile)}).`;
  return (
    `Everyday first order keeps ${moneyLabel(everyday.profit)} after ${everyday.commissionRate}% + ${moneyLabel(everyday.fees.firstOrder)}.`
    + ` Open House at ${event.commissionRate}% commission and a ${(event.merchandise === 0 ? 0 : event.brandFundedDiscount / event.merchandise * 100).toFixed(0)}% retailer discount keeps ${moneyLabel(event.profit)}`
    + ` (${extra >= 0 ? "+" : ""}${moneyLabel(extra)}).`
    + (ceiling === null
      ? ` The waived commission does not fund any extra discount here — the event is behind everyday even at no markdown.`
      : ` The waived commission still funds about ${ceiling.toFixed(1)}% off before leftover matches everyday.`)
    + ` Open House at your everyday discount keeps ${moneyLabel(same.profit)} (${comparison.sameListVsEveryday >= 0 ? "+" : ""}${moneyLabel(comparison.sameListVsEveryday)}) — the leak is the deeper discount, not the event.`
    + matchBit
    + pileBit
  );
}

export function openHouseSummary(comparison) {
  return openHouseNote(comparison);
}

// The listing `promotedRate` line taxes one already-won invoice.
// A campaign also bills last-click organic first orders and only
// pays if extra first orders cover that tax. Defaults are
// illustrative — overwrite the rate, extra orders, and attribution
// from the campaign preview on the brand account.
export const PROMOTED_DEFAULTS = {
  organicFirstOrders: 4,
  extraPromotedOrders: 1,
  campaignPromotedRate: 15,
  attributedOrganicPct: 40,
  highPromotedRate: 22,
  highExtraPromotedOrders: 2,
  highAttributedOrganicPct: 55,
};

function percentAtMost(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be at most 100`);
  return result;
}

function promotedPath({
  id,
  label,
  campaignRate,
  extraOrders,
  billedOrganicOrders,
  billedOrders,
  promotedFee,
  cash,
}) {
  return {
    id,
    label,
    campaignRate,
    extraOrders,
    billedOrganicOrders,
    billedOrders,
    promotedFee,
    cash,
  };
}

function promotedCampaignCash({
  organicOrders,
  organicProfit,
  billedOrganicOrders,
  extraOrders,
  promotedProfit,
}) {
  return (
    (organicOrders - billedOrganicOrders) * organicProfit
    + (billedOrganicOrders + extraOrders) * promotedProfit
  );
}

function promotedSummaryText({
  winner,
  skip,
  campaign,
  higher,
  extraCampaignVsSkip,
  extraHigherVsSkip,
  organicOrders,
  breakEvenCampaignRate,
  breakEvenExtraOrders,
  breakEvenAttributedOrganicPct,
}) {
  const skipKeep = moneyLabel(skip.cash);
  const adsKeep = moneyLabel(campaign.cash);
  const highKeep = moneyLabel(higher.cash);
  const adsGap = moneyLabel(Math.abs(extraCampaignVsSkip));
  const highGap = moneyLabel(Math.abs(extraHigherVsSkip));
  const rateCeil = Number.isFinite(breakEvenCampaignRate)
    ? `${breakEvenCampaignRate.toFixed(1)}%`
    : "an unreachable promoted rate";
  const extraFloor = Number.isFinite(breakEvenExtraOrders)
    ? breakEvenExtraOrders.toFixed(1)
    : "an unreachable extra-order count";
  const attrCeil = Number.isFinite(breakEvenAttributedOrganicPct)
    ? `${breakEvenAttributedOrganicPct.toFixed(1)}%`
    : "an unreachable attribution rate";
  const volume = `${organicOrders} organic first order${organicOrders === 1 ? "" : "s"}`;

  if (winner === "campaign") {
    return (
      `Promoted listings keep ${adsGap} more than skipping the campaign `
      + `(${adsKeep} vs ${skipKeep}) on ${volume}. `
      + `The rate can rise to about ${rateCeil} before skip matches. `
      + `The higher-rate campaign is ${highKeep}.`
    );
  }
  if (winner === "higher") {
    return (
      `The higher-rate campaign keeps ${highGap} more than skipping promoted listings `
      + `(${highKeep} vs ${skipKeep}) on ${volume}. `
      + `The standard campaign is ${adsKeep}.`
    );
  }
  if (winner === "skip") {
    return (
      `Skipping promoted listings keeps ${adsGap} more than the campaign `
      + `(${skipKeep} vs ${adsKeep}) on ${volume}. `
      + `Ads match if the rate falls to about ${rateCeil}, extra first orders rise to `
      + `about ${extraFloor}, or last-click attribution on organic falls to `
      + `about ${attrCeil}. The higher-rate campaign is ${highKeep}.`
    );
  }
  return "Skipping promoted listings and running the campaign leave the same leftover on these rates.";
}

/**
 * Same first-marketplace-order invoice, three ways to buy Faire
 * traffic: skip promoted listings, run a campaign at a typed extra
 * percent, or spend harder at a higher percent. Organic leftover
 * forces `promotedRate` to zero so the listing line does not
 * double-count. Campaign spend is the extra percent on last-click
 * billed first orders (a share of organic plus extra first orders
 * you attribute to the campaign). Extra orders are a count you
 * type, not a forecast that the campaign will produce them.
 *
 * Complementary to Open House (a seasonal 0% window), Faire Direct
 * (you brought the retailer), and payout speed (cash timing after
 * Faire already has the order).
 */
export function compareFairePromoted(input = {}) {
  const organicOrders = wholeNumber(
    input.organicFirstOrders,
    "Organic first orders",
    PROMOTED_DEFAULTS.organicFirstOrders,
  );
  const extraOrders = wholeNumberOrZero(
    input.extraPromotedOrders,
    "Extra promoted first orders",
    PROMOTED_DEFAULTS.extraPromotedOrders,
  );
  const campaignRate = percentAtMost(
    input.campaignPromotedRate,
    "Promoted listings rate",
    PROMOTED_DEFAULTS.campaignPromotedRate,
  );
  if (campaignRate >= 100) throw new Error("Promoted listings rate must be below 100%");
  const attributedOrganicPct = percentAtMost(
    input.attributedOrganicPct,
    "Attributed organic percent",
    PROMOTED_DEFAULTS.attributedOrganicPct,
  );
  const highRate = percentAtMost(
    input.highPromotedRate,
    "Higher promoted rate",
    PROMOTED_DEFAULTS.highPromotedRate,
  );
  if (highRate >= 100) throw new Error("Higher promoted rate must be below 100%");
  const highExtraOrders = wholeNumberOrZero(
    input.highExtraPromotedOrders,
    "Higher-rate extra first orders",
    PROMOTED_DEFAULTS.highExtraPromotedOrders,
  );
  const highAttributedOrganicPct = percentAtMost(
    input.highAttributedOrganicPct,
    "Higher-rate attributed organic percent",
    PROMOTED_DEFAULTS.highAttributedOrganicPct,
  );

  const organic = calculateBrandOrder({ ...input, promotedRate: 0 }, "marketplace_first");
  const campaignOrder = calculateBrandOrder({ ...input, promotedRate: campaignRate }, "marketplace_first");
  const higherOrder = calculateBrandOrder({ ...input, promotedRate: highRate }, "marketplace_first");
  const organicProfit = organic.profit;
  const merchandise = organic.merchandise;
  const billedOrganicOrders = organicOrders * (attributedOrganicPct / 100);
  const highBilledOrganicOrders = organicOrders * (highAttributedOrganicPct / 100);

  const skipCash = organicOrders * organicProfit;
  const campaignCash = promotedCampaignCash({
    organicOrders,
    organicProfit,
    billedOrganicOrders,
    extraOrders,
    promotedProfit: campaignOrder.profit,
  });
  const higherCash = promotedCampaignCash({
    organicOrders,
    organicProfit,
    billedOrganicOrders: highBilledOrganicOrders,
    extraOrders: highExtraOrders,
    promotedProfit: higherOrder.profit,
  });

  const campaignFeePerOrder = campaignOrder.fees.promoted;
  const higherFeePerOrder = higherOrder.fees.promoted;
  const campaignBilled = billedOrganicOrders + extraOrders;
  const higherBilled = highBilledOrganicOrders + highExtraOrders;

  const skip = promotedPath({
    id: "skip",
    label: "Skip promoted listings",
    campaignRate: 0,
    extraOrders: 0,
    billedOrganicOrders: 0,
    billedOrders: 0,
    promotedFee: 0,
    cash: skipCash,
  });
  const campaign = promotedPath({
    id: "campaign",
    label: "Promoted listings",
    campaignRate,
    extraOrders,
    billedOrganicOrders,
    billedOrders: campaignBilled,
    promotedFee: campaignBilled * campaignFeePerOrder,
    cash: campaignCash,
  });
  const higher = promotedPath({
    id: "higher",
    label: "Higher-rate campaign",
    campaignRate: highRate,
    extraOrders: highExtraOrders,
    billedOrganicOrders: highBilledOrganicOrders,
    billedOrders: higherBilled,
    promotedFee: higherBilled * higherFeePerOrder,
    cash: higherCash,
  });

  const extraCampaignVsSkip = campaignCash - skipCash;
  const extraHigherVsSkip = higherCash - skipCash;
  const rows = [skip, campaign, higher].map((row) => ({
    ...row,
    vsSkip: row.cash - skipCash,
  }));

  const bestCash = Math.max(skipCash, campaignCash, higherCash);
  const leaders = [
    { id: "skip", value: skipCash },
    { id: "campaign", value: campaignCash },
    { id: "higher", value: higherCash },
  ].filter((row) => Math.abs(row.value - bestCash) <= 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : "tie";

  let breakEvenCampaignRate = Infinity;
  if (campaignBilled > 1e-12 && organic.orderSubtotal > 1e-12) {
    breakEvenCampaignRate = (extraOrders * organicProfit * 100) / (campaignBilled * organic.orderSubtotal);
    if (breakEvenCampaignRate < -1e-9) breakEvenCampaignRate = Infinity;
  } else if (extraOrders === 0 && billedOrganicOrders === 0) {
    breakEvenCampaignRate = Infinity;
  }

  let breakEvenExtraOrders = Infinity;
  const extraMargin = organicProfit - campaignFeePerOrder;
  if (extraMargin > 1e-12) {
    breakEvenExtraOrders = (billedOrganicOrders * campaignFeePerOrder) / extraMargin;
    if (breakEvenExtraOrders < 0) breakEvenExtraOrders = 0;
  } else if (billedOrganicOrders * campaignFeePerOrder <= 1e-12) {
    breakEvenExtraOrders = 0;
  }

  let breakEvenAttributedOrganicPct = Infinity;
  if (organicOrders > 1e-12 && campaignFeePerOrder > 1e-12) {
    breakEvenAttributedOrganicPct =
      (extraOrders * extraMargin * 100) / (organicOrders * campaignFeePerOrder);
    if (breakEvenAttributedOrganicPct < -1e-9) {
      breakEvenAttributedOrganicPct = Infinity;
    } else {
      breakEvenAttributedOrganicPct = Math.max(0, Math.min(100, breakEvenAttributedOrganicPct));
    }
  } else if (campaignFeePerOrder <= 1e-12) {
    breakEvenAttributedOrganicPct = 100;
  }

  const result = {
    rows,
    skip: rows[0],
    campaign: rows[1],
    higher: rows[2],
    winner,
    organicOrders,
    organicProfit,
    merchandise,
    campaignRate,
    extraOrders,
    attributedOrganicPct,
    highRate,
    highExtraOrders,
    highAttributedOrganicPct,
    extraCampaignVsSkip,
    extraHigherVsSkip,
    breakEvenCampaignRate,
    breakEvenExtraOrders,
    breakEvenAttributedOrganicPct,
  };
  result.summary = promotedSummaryText(result);
  return result;
}

export function promotedNote(comparison) {
  if (!comparison?.skip || !comparison?.campaign || !comparison?.higher) {
    throw new Error("promotedNote missing rows");
  }
  return comparison.summary ?? promotedSummaryText(comparison);
}

// Pay Now is a brand-funded extra percent so the retailer pays
// Faire immediately. It is not next-day payout (the brand paying
// Faire more processing) and not generic 2/10 Net 30 (Faire still
// takes commission on the discounted subtotal, and remittance can
// stay on the brand's payout schedule). Defaults keep remittance
// at 60 days on both paths — overwrite wait days from the payout
// summary if Pay Now actually lands cash sooner.
export const PAY_NOW_DEFAULTS = {
  payNowRate: 2,
  payNowTakePct: 40,
  extraPayNowOrders: 0,
  netWaitDays: 60,
  payNowWaitDays: 60,
};

function waitDays(value, name, fallback) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number of days`);
  if (result > 365) throw new Error(`${name} must be 365 days or fewer`);
  return result;
}

function payNowBrandOrder(input, extraDiscountRate) {
  const opening = number(input.openingDiscountRate, "Brand-funded discount %", 0);
  if (opening >= 100) throw new Error("Brand-funded discount must be below 100%");
  const extra = number(extraDiscountRate, "Pay Now discount %", 0);
  if (extra >= 100) throw new Error("Pay Now discount must be below 100%");
  const combined = opening + extra;
  if (combined >= 100) throw new Error("Pay Now discount plus opening discount must be below 100%");
  return calculateBrandOrder({ ...input, openingDiscountRate: combined }, "marketplace_first");
}

function payNowAfterFloat(order, annualCarryRate, days) {
  const carry = carryingCost(order.payoutAmount, annualCarryRate, days);
  return { carryingCost: carry, net: order.profit - carry };
}

function payNowRateCeiling(input, skipNet, annualCarryRate, payNowWaitDays) {
  const skipAtZero = payNowAfterFloat(payNowBrandOrder(input, 0), annualCarryRate, payNowWaitDays).net;
  // Offering Pay Now is already behind skipping at a 0% discount — which
  // happens when Pay Now's remittance wait is longer than the normal payout,
  // so the early-payment benefit is negative before any discount. No rate
  // recovers that. Returning 0 was indistinguishable from the real case where
  // offering at 0% exactly ties skipping and any positive rate loses, and the
  // summary then told a brand the paths "match if the rate falls to about
  // 0.0%" when at 0.0% offering was still behind.
  if (skipAtZero + 1e-9 < skipNet) return null;
  let low = 0;
  let high = 99.9;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const net = payNowAfterFloat(payNowBrandOrder(input, mid), annualCarryRate, payNowWaitDays).net;
    if (net >= skipNet) low = mid;
    else high = mid;
  }
  return low;
}

function payNowWaitCeiling(takeProfit, takePayout, skipNet, annualCarryRate) {
  if (takeProfit + 1e-12 < skipNet) return null;
  if (annualCarryRate <= 0 || takePayout <= 0) {
    return takeProfit + 1e-12 >= skipNet ? 365 : null;
  }
  const days = (takeProfit - skipNet) * 365 / (takePayout * annualCarryRate / 100);
  if (!Number.isFinite(days) || days < 0) return null;
  return Math.min(365, days);
}

function payNowSummaryText(comparison) {
  const skip = comparison.skip;
  const offer = comparison.offer;
  const take = comparison.take;
  const skipKeep = moneyLabel(skip.cash);
  const offerKeep = moneyLabel(offer.cash);
  const takeKeep = moneyLabel(take.cash);
  const gap = moneyLabel(Math.abs(comparison.offerVsSkip));
  const rateCeil = Number.isFinite(comparison.breakEvenPayNowRate)
    ? `${comparison.breakEvenPayNowRate.toFixed(1)}%`
    : "an unreachable Pay Now rate";

  // The "skip" sentence offers three levers that could close the gap, and any
  // of them can be out of reach on its own. Splicing a fallback noun into
  // "falls to about ___" produced "falls to about an unreachable Pay Now
  // rate", so build only the levers that have a number and say plainly when
  // none of them does.
  const levers = [];
  if (Number.isFinite(comparison.breakEvenPayNowRate)) {
    levers.push(`the rate falls to about ${comparison.breakEvenPayNowRate.toFixed(1)}%`);
  }
  if (comparison.breakEvenPayNowWaitDays != null) {
    levers.push(`remittance on Pay Now falls to about ${comparison.breakEvenPayNowWaitDays.toFixed(1)} days`);
  }
  if (Number.isFinite(comparison.breakEvenExtraOrders)) {
    levers.push(`extra first orders rise to about ${comparison.breakEvenExtraOrders.toFixed(2)}`);
  }
  const leverBit = levers.length === 0
    ? "Nothing on these numbers brings offering level with skipping."
    : `The discount matches if ${levers.length === 1
        ? levers[0]
        : `${levers.slice(0, -1).join(", ")}, or ${levers[levers.length - 1]}`}.`;

  if (comparison.winner === "offer") {
    return (
      `Offering Pay Now keeps ${gap} more than skipping `
      + `(${offerKeep} vs ${skipKeep}) after Faire remittance wait. `
      + `The rate can rise to about ${rateCeil} before skip matches. `
      + `Everyone taking it is ${takeKeep}.`
    );
  }
  if (comparison.winner === "take") {
    return (
      `Everyone taking Pay Now keeps ${moneyLabel(Math.abs(comparison.takeVsSkip))} more than skipping `
      + `(${takeKeep} vs ${skipKeep}) after Faire remittance wait. `
      + `The mixed offer is ${offerKeep}.`
    );
  }
  if (comparison.winner === "skip") {
    return (
      `Skipping Pay Now keeps ${gap} more than offering it `
      + `(${skipKeep} vs ${offerKeep}) when remittance stays on your payout schedule. `
      + `${leverBit} `
      + `Everyone taking it is ${takeKeep}.`
    );
  }
  return "Skipping Pay Now and offering it leave the same leftover on these rates.";
}

/**
 * Same first-marketplace-order invoice, three ways to fund Pay Now:
 * skip the extra discount and wait on Net terms; offer it at a typed
 * take-rate plus extra first orders; or assume every retailer takes it.
 * Opening-order discount stays on every path; Pay Now is an extra
 * percent stacked on top so the listing discount cannot hide the
 * early-pay cost. Remittance wait is independent of the retailer
 * paying Faire — default both paths to 60 days. Complementary to
 * next-day payout (processing you pay Faire) and to generic 2/10
 * Net 30 (no marketplace commission on the discounted subtotal).
 */
export function compareFairePayNow(input = {}) {
  const payNowRate = number(input.payNowRate, "Pay Now discount %", PAY_NOW_DEFAULTS.payNowRate);
  if (payNowRate >= 100) throw new Error("Pay Now discount must be below 100%");
  const payNowTakePct = percentAtMost(
    input.payNowTakePct,
    "Pay Now take rate",
    PAY_NOW_DEFAULTS.payNowTakePct,
  );
  const extraOrders = wholeNumberOrZero(
    input.extraPayNowOrders,
    "Pay Now extra first orders",
    PAY_NOW_DEFAULTS.extraPayNowOrders,
  );
  const netWaitDays = waitDays(input.netWaitDays, "Net remittance wait", PAY_NOW_DEFAULTS.netWaitDays);
  const payNowWaitDays = waitDays(
    input.payNowWaitDays,
    "Pay Now remittance wait",
    PAY_NOW_DEFAULTS.payNowWaitDays,
  );
  const annualCarryRate = number(input.annualCarryRate, "Annual carrying-cost rate", 24);
  if (annualCarryRate >= 1000) throw new Error("Annual carrying-cost rate must be below 1000%");

  const skipOrder = payNowBrandOrder(input, 0);
  const takeOrder = payNowBrandOrder(input, payNowRate);
  const skipFloat = payNowAfterFloat(skipOrder, annualCarryRate, netWaitDays);
  const takeFloat = payNowAfterFloat(takeOrder, annualCarryRate, payNowWaitDays);
  const takeShare = payNowTakePct / 100;
  const mixNet = takeShare * takeFloat.net + (1 - takeShare) * skipFloat.net;

  const skip = {
    id: "skip",
    label: "Skip Pay Now (Net terms)",
    payNowRate: 0,
    waitDays: netWaitDays,
    profit: skipOrder.profit,
    payout: skipOrder.payoutAmount,
    discount: skipOrder.brandFundedDiscount,
    carryingCost: skipFloat.carryingCost,
    net: skipFloat.net,
    orders: 1,
    cash: skipFloat.net,
  };
  const offer = {
    id: "offer",
    label: "Offer Pay Now (mixed take-rate)",
    payNowRate,
    waitDays: payNowWaitDays,
    profit: takeShare * takeOrder.profit + (1 - takeShare) * skipOrder.profit,
    payout: takeShare * takeOrder.payoutAmount + (1 - takeShare) * skipOrder.payoutAmount,
    discount: takeShare * takeOrder.brandFundedDiscount + (1 - takeShare) * skipOrder.brandFundedDiscount,
    carryingCost: takeShare * takeFloat.carryingCost + (1 - takeShare) * skipFloat.carryingCost,
    net: mixNet,
    orders: 1 + extraOrders,
    cash: mixNet + extraOrders * takeFloat.net,
  };
  const take = {
    id: "take",
    label: "Everyone takes Pay Now",
    payNowRate,
    waitDays: payNowWaitDays,
    profit: takeOrder.profit,
    payout: takeOrder.payoutAmount,
    discount: takeOrder.brandFundedDiscount,
    carryingCost: takeFloat.carryingCost,
    net: takeFloat.net,
    orders: 1 + extraOrders,
    cash: takeFloat.net * (1 + extraOrders),
  };

  const rows = [skip, offer, take];
  const best = rows.reduce((winner, row) => (row.cash > winner.cash ? row : winner));
  const offerVsSkip = offer.cash - skip.cash;
  const takeVsSkip = take.cash - skip.cash;
  let winner = "tie";
  if (best.cash > skip.cash + 1e-9) winner = best.id;
  else if (skip.cash > best.cash + 1e-9) winner = "skip";
  else if (Math.abs(offer.cash - skip.cash) <= 1e-9 && Math.abs(take.cash - skip.cash) <= 1e-9) {
    winner = "tie";
  } else {
    winner = skip.cash >= offer.cash && skip.cash >= take.cash ? "skip" : best.id;
  }

  const breakEvenPayNowRate = payNowRateCeiling(input, skip.cash, annualCarryRate, payNowWaitDays);
  const breakEvenPayNowWaitDays = payNowWaitCeiling(
    takeOrder.profit,
    takeOrder.payoutAmount,
    skip.cash,
    annualCarryRate,
  );
  let breakEvenExtraOrders = null;
  if (takeFloat.net > 1e-12) {
    const needed = (skip.cash - mixNet) / takeFloat.net;
    breakEvenExtraOrders = needed <= 0 ? 0 : needed;
  }

  const result = {
    skip,
    offer,
    take,
    payNowRate,
    payNowTakePct,
    extraOrders,
    netWaitDays,
    payNowWaitDays,
    annualCarryRate,
    offerVsSkip,
    takeVsSkip,
    breakEvenPayNowRate,
    breakEvenPayNowWaitDays,
    breakEvenExtraOrders,
    winner,
    rows: rows.map((row) => ({
      ...row,
      isBest: row === best,
      vsSkip: row.id === "skip" ? 0 : row.cash - skip.cash,
    })),
    best: { id: best.id, label: best.label, cash: best.cash },
  };
  result.summary = payNowSummaryText(result);
  return result;
}

export function payNowNote(comparison) {
  if (!comparison?.skip || !comparison?.offer || !comparison?.take) {
    throw new Error("payNowNote missing rows");
  }
  return comparison.summary ?? payNowSummaryText(comparison);
}

export const FAIRE_RETURN_DEFAULTS = {
  returnUnits: 10,
  returnLabel: 18,
  restockablePct: 80,
  keepDiscountPct: 20,
  denyKeepPct: 50,
};

/**
 * A completed Faire first order, then a return request. Distinct from
 * Open House (listing during the window) and from first-vs-Direct
 * (channel). Taking the return claws back that slice of payout, you
 * pay the return label, and you recover restockable COGS. A keep-it
 * credit leaves the goods with the retailer and reverses commission
 * on the credited merchandise only. Denying keeps the booked leftover
 * at the odds you type. Arithmetic only — it does not say to take
 * the return, offer a credit, or fight it, and it does not publish
 * Faire's live return policy.
 */
export function compareFaireReturn(input = {}) {
  const completed = calculateBrandOrder(input, "marketplace_first");
  const quantity = completed.quantity;
  const returnUnitsRaw = number(
    input.returnUnits,
    "Return units",
    Math.min(FAIRE_RETURN_DEFAULTS.returnUnits, quantity),
  );
  if (!Number.isInteger(returnUnitsRaw) || returnUnitsRaw < 1) {
    throw new Error("Return units must be a whole number of at least 1");
  }
  if (returnUnitsRaw > quantity) throw new Error("Return units cannot exceed the order");
  const returnUnits = returnUnitsRaw;
  const returnLabel = number(input.returnLabel, "Return label", FAIRE_RETURN_DEFAULTS.returnLabel);
  const restockablePct = number(input.restockablePct, "Restockable %", FAIRE_RETURN_DEFAULTS.restockablePct);
  if (restockablePct > 100) throw new Error("Restockable percent must be between 0 and 100");
  const keepDiscountPct = number(
    input.keepDiscountPct,
    "Keep-it credit",
    FAIRE_RETURN_DEFAULTS.keepDiscountPct,
  );
  if (keepDiscountPct >= 100) throw new Error("Keep-it credit must be below 100%");
  const denyKeepPct = number(input.denyKeepPct, "Deny keep rate", FAIRE_RETURN_DEFAULTS.denyKeepPct);
  if (denyKeepPct > 100) throw new Error("Deny keep rate must be between 0 and 100");

  const returnShare = returnUnits / quantity;
  const clawback = completed.payoutAmount * returnShare;
  const unitCogs = number(input.unitCogs, "Unit cost of goods", 0);
  const restockValue = (restockablePct / 100) * returnUnits * unitCogs;
  const takeAfter = completed.profit - clawback - returnLabel + restockValue;

  const credit = completed.orderSubtotal * (keepDiscountPct / 100);
  const commissionGiveback = credit * (completed.commissionRate / 100);
  const keepAfter = completed.profit - credit + commissionGiveback;

  const denyAfter = completed.profit * (denyKeepPct / 100);

  const rows = [
    { id: "keep", label: "Keep-it credit", leftover: keepAfter },
    { id: "deny", label: "Deny the return", leftover: denyAfter },
    { id: "take", label: "Take the return", leftover: takeAfter },
  ];
  const winner = rows.reduce((best, row) => (row.leftover > best.leftover ? row : best));

  let denyFloorVsKeep = null;
  if (completed.profit > 0) {
    denyFloorVsKeep = (keepAfter / completed.profit) * 100;
    if (denyFloorVsKeep < 0) denyFloorVsKeep = null;
  }

  let keepCeilingVsDeny = null;
  const keepNetFrac = 1 - completed.commissionRate / 100;
  if (completed.orderSubtotal > 0 && keepNetFrac > 0) {
    keepCeilingVsDeny = (completed.profit - denyAfter) / (completed.orderSubtotal * keepNetFrac) * 100;
    if (keepCeilingVsDeny < 0) keepCeilingVsDeny = null;
  }

  return {
    completed,
    returnUnits,
    returnShare,
    returnLabel,
    restockablePct,
    keepDiscountPct,
    denyKeepPct,
    clawback,
    restockValue,
    credit,
    commissionGiveback,
    takeAfter,
    keepAfter,
    denyAfter,
    keepVsDeny: keepAfter - denyAfter,
    takeVsKeep: takeAfter - keepAfter,
    winner: winner.id,
    denyFloorVsKeep,
    keepCeilingVsDeny,
    rows: rows.map((row) => ({
      ...row,
      isBest: row.id === winner.id,
      gapVsBest: winner.leftover - row.leftover,
    })),
  };
}

export function faireReturnNote(comparison) {
  if (!comparison?.completed) throw new Error("faireReturnNote missing rows");
  const booked = moneyLabel(comparison.completed.profit);
  const floor = comparison.denyFloorVsKeep == null
    ? ""
    : ` Denying matches a taken keep-it credit at about ${comparison.denyFloorVsKeep.toFixed(1)}% they'll-drop-it.`;
  if (comparison.winner === "keep") {
    return (
      `On this completed first order (${booked} booked), a ${comparison.keepDiscountPct}% ` +
      `keep-it credit leaves ${moneyLabel(comparison.keepAfter)} after reversing ` +
      `${moneyLabel(comparison.commissionGiveback)} of commission on the credit. ` +
      `Denying at ${comparison.denyKeepPct}% they'll-drop-it leaves ` +
      `${moneyLabel(comparison.denyAfter)} — ${moneyLabel(comparison.keepVsDeny)} behind. ` +
      `Taking the return of ${comparison.returnUnits} unit${comparison.returnUnits === 1 ? "" : "s"} ` +
      `leaves ${moneyLabel(comparison.takeAfter)} after a ${moneyLabel(comparison.returnLabel)} ` +
      `label and ${comparison.restockablePct.toFixed(0)}% restockable COGS.${floor}`
    );
  }
  if (comparison.winner === "take") {
    return (
      `On this completed first order (${booked} booked), taking the return of ` +
      `${comparison.returnUnits} unit${comparison.returnUnits === 1 ? "" : "s"} leaves ` +
      `${moneyLabel(comparison.takeAfter)} after a ${moneyLabel(comparison.returnLabel)} label. ` +
      `A ${comparison.keepDiscountPct}% keep-it credit leaves ${moneyLabel(comparison.keepAfter)} ` +
      `— ${moneyLabel(-comparison.takeVsKeep)} behind. Denying at ` +
      `${comparison.denyKeepPct}% they'll-drop-it leaves ${moneyLabel(comparison.denyAfter)}.${floor}`
    );
  }
  return (
    `On this completed first order (${booked} booked), denying at ` +
    `${comparison.denyKeepPct}% they'll-drop-it leaves ${moneyLabel(comparison.denyAfter)} — ` +
    `${moneyLabel(-comparison.keepVsDeny)} ahead of a ${comparison.keepDiscountPct}% keep-it ` +
    `credit (${moneyLabel(comparison.keepAfter)}) and ` +
    `${moneyLabel(comparison.denyAfter - comparison.takeAfter)} ahead of taking the return ` +
    `(${moneyLabel(comparison.takeAfter)}).${floor}`
  );
}

export function comparePayoutSpeeds(input, scenarioId = "marketplace_reorder") {
  return Object.entries(PAYOUT_PRESETS).map(([id, preset]) => {
    const result = calculateBrandOrder({
      ...input,
      payout: id,
      paymentRate: preset.paymentRate,
      paymentFixed: preset.paymentFixed,
    }, scenarioId);
    return { ...result, id, label: preset.label };
  });
}

/** Published Faire payout speeds, in calendar days until cash. Next-day is 1. */
export const PAYOUT_WAIT_DAYS = {
  next_day: 1,
  day_30: 30,
  day_60: 60,
};

function carryingCost(amount, annualRatePercent, days) {
  return amount * (annualRatePercent / 100) * (days / 365);
}

/**
 * Same payout-speed ladder as `comparePayoutSpeeds`, then subtracts modeled
 * carrying cost on the cash the brand could have had next day. Waiting is
 * cheaper on Faire's processing line; it is not cheaper once the brand's
 * own money costs more than the fee spread.
 *
 * Carrying cost is an assumption the brand types (card, inventory line,
 * opportunity cost). It is not interest Faire charges or a reason to pick
 * a payout speed.
 */
export function comparePayoutSpeedsAfterFloat(input = {}, options = {}) {
  const annualCarryRate = number(
    options.annualCarryRate ?? input.annualCarryRate,
    "Annual carrying-cost rate",
    24,
  );
  if (annualCarryRate >= 1000) {
    throw new Error("Annual carrying-cost rate must be below 1000%");
  }
  const scenarioId = options.scenarioId ?? input.floatScenarioId ?? "marketplace_first";
  const speeds = comparePayoutSpeeds(input, scenarioId);
  const fastest = speeds.find((row) => row.id === "next_day") ?? speeds[0];
  const cashBase = fastest.payoutAmount;

  const rows = speeds.map((row) => {
    const waitDays = PAYOUT_WAIT_DAYS[row.id] ?? 0;
    const carry = carryingCost(cashBase, annualCarryRate, waitDays);
    return {
      ...row,
      waitDays,
      carryingCost: carry,
      netAfterFloat: row.profit - carry,
    };
  });
  const best = rows.reduce((winner, row) => (
    row.netAfterFloat > winner.netAfterFloat ? row : winner
  ));
  const next = rows.find((row) => row.id === "next_day");
  const slow = rows.find((row) => row.id === "day_60");
  const dayGap = next && slow ? slow.waitDays - next.waitDays : 0;
  const processingSpread = next && slow ? slow.profit - next.profit : 0;
  let breakEvenAnnualRate = null;
  if (next && slow && cashBase > 0 && dayGap > 0) {
    breakEvenAnnualRate = processingSpread * 365 / (cashBase * dayGap) * 100;
  }

  return {
    annualCarryRate,
    scenarioId,
    cashBase,
    processingSpread,
    breakEvenAnnualRate,
    nextDayBeatsSlow: Boolean(next && slow && next.netAfterFloat > slow.netAfterFloat),
    nextDayPremium: next && slow ? next.netAfterFloat - slow.netAfterFloat : 0,
    speeds: rows.map((row) => ({
      ...row,
      isBest: row === best,
      gapVsBest: best.netAfterFloat - row.netAfterFloat,
    })),
    best: { id: best.id, label: best.label, netAfterFloat: best.netAfterFloat },
  };
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * One-sentence readout. Arithmetic only — it does not tell them to take
 * next-day payout or to wait.
 */
export function summarizePayoutFloat(comparison) {
  const next = comparison.speeds.find((row) => row.id === "next_day");
  const slow = comparison.speeds.find((row) => row.id === "day_60");
  if (!next || !slow) return "";
  const rate = `${comparison.annualCarryRate.toFixed(1)}%`;
  const breakEven = comparison.breakEvenAnnualRate == null
    ? ""
    : ` Next-day and 60-day match at a ${comparison.breakEvenAnnualRate.toFixed(1)}% annual carrying-cost assumption.`;
  if (comparison.nextDayBeatsSlow) {
    return (
      `On this first marketplace order, next-day payout leaves ${money(next.netAfterFloat)} ` +
      `after ${money(next.carryingCost)} of modeled carrying cost. Waiting 60 days leaves ` +
      `${money(slow.netAfterFloat)} — ${money(comparison.nextDayPremium)} behind — because ` +
      `${rate} money for 60 days on the ${money(comparison.cashBase)} you could have had ` +
      `next day costs more than the ${money(comparison.processingSpread)} processing spread.${breakEven}`
    );
  }
  return (
    `On this first marketplace order, waiting 60 days still leaves ${money(slow.netAfterFloat)} ` +
    `after ${money(slow.carryingCost)} of modeled carrying cost — ` +
    `${money(-comparison.nextDayPremium)} ahead of next-day ` +
    `(${money(next.netAfterFloat)}). At ${rate}, the ${money(comparison.processingSpread)} ` +
    `processing savings still covers the wait.${breakEven}`
  );
}

export function calculateRetailerOrder(input = {}) {
  const unitWholesale = number(input.unitWholesale, "Wholesale unit price");
  const quantity = wholeNumber(input.quantity, "Units bought", 1);
  const unitsSold = number(input.unitsSold, "Units sold", quantity);
  if (!Number.isInteger(unitsSold) || unitsSold < 0) throw new Error("Units sold must be a whole number of at least 0");
  if (unitsSold > quantity) throw new Error("Units sold cannot exceed units bought");
  const openingDiscountRate = number(input.openingDiscountRate, "Opening-order discount %", 0);
  if (openingDiscountRate >= 100) throw new Error("Opening-order discount must be below 100%");
  const shippingPaid = number(input.shippingPaid, "Shipping you paid", 0);
  const unitRetail = number(input.unitRetail, "Retail selling price");
  const storePaymentRate = number(input.storePaymentRate, "Store payment rate", 2.9);
  const storePaymentFixed = number(input.storePaymentFixed, "Store payment fixed fee", 0.3);
  const otherCost = number(input.otherCost, "Other cost", 0);

  const invoiceMerchandise = unitWholesale * quantity * (1 - openingDiscountRate / 100);
  const landedCost = invoiceMerchandise + shippingPaid;
  const retailRevenue = unitRetail * unitsSold;
  const storeFees = retailRevenue * storePaymentRate / 100 + (unitsSold > 0 ? storePaymentFixed : 0);
  const unsoldUnits = quantity - unitsSold;
  const profit = retailRevenue - landedCost - storeFees - otherCost;

  return {
    invoiceMerchandise,
    landedCost,
    landedPerUnit: quantity === 0 ? 0 : landedCost / quantity,
    retailRevenue,
    storeFees,
    unsoldUnits,
    unsoldAtLanded: unsoldUnits * (quantity === 0 ? 0 : invoiceMerchandise / quantity),
    profit,
    margin: retailRevenue === 0 ? 0 : profit / retailRevenue * 100,
    roi: landedCost === 0 ? null : profit / landedCost * 100,
  };
}

export function retailPriceForMargin(input, targetMargin) {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) {
    throw new Error("Target margin must be between 0 and 99.9%");
  }
  const quantity = wholeNumber(input.quantity, "Units bought", 1);
  const unitsSold = number(input.unitsSold, "Units sold", quantity);
  if (!Number.isInteger(unitsSold) || unitsSold < 1) throw new Error("Units sold must be at least 1 to set a retail price");
  if (unitsSold > quantity) throw new Error("Units sold cannot exceed units bought");
  const storePaymentRate = number(input.storePaymentRate, "Store payment rate", 2.9);
  const storePaymentFixed = number(input.storePaymentFixed, "Store payment fixed fee", 0.3);
  const openingDiscountRate = number(input.openingDiscountRate, "Opening-order discount %", 0);
  const invoiceMerchandise = number(input.unitWholesale, "Wholesale unit price") * quantity * (1 - openingDiscountRate / 100);
  const landedCost = invoiceMerchandise + number(input.shippingPaid, "Shipping you paid", 0);
  const otherCost = number(input.otherCost, "Other cost", 0);
  const denominator = unitsSold * (1 - storePaymentRate / 100 - margin / 100);
  if (denominator <= 0) throw new Error("Target margin is not possible with these fee rates");
  return Math.max(0, (landedCost + otherCost + storePaymentFixed) / denominator);
}
