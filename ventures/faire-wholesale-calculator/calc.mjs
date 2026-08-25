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

export function comparePayoutSpeeds(input, scenarioId = "marketplace_reorder") {
  return Object.entries(PAYOUT_PRESETS).map(([id, preset]) => {
    const result = calculateBrandOrder({
      ...input,
      payout: id,
      paymentRate: preset.paymentRate,
      paymentFixed: preset.paymentFixed,
    }, scenarioId);
    return { id, label: preset.label, ...result };
  });
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
