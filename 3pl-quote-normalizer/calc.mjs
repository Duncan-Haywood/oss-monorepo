export function calculate(input, includeSensitivity = true, includeBreakEven = true) {
  const n = (value, fallback = 0) => {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
  };
  const warnings = inputWarnings(input);
  const orders = n(input.orders, 100);
  const units = n(input.unitsPerOrder, 1.5);
  const pallets = n(input.pallets, 1);
  const returnsRate = Math.min(1, n(input.returnsRate, 8) / 100);
  const inboundUnits = n(input.inboundUnits, orders * units);
  const quote = {
    receiving: inboundUnits * n(input.receivingPerUnit, 0.12),
    storage: pallets * n(input.storagePerPallet, 18),
    pickPack: orders * n(input.firstPick, 2.75) + orders * Math.max(0, units - 1) * n(input.additionalPick, 0.5),
    packaging: orders * n(input.packaging, 0.6),
    shipping: orders * n(input.shipping, 8.5),
    returns: orders * returnsRate * (n(input.returnFee, 2.5) + n(input.restockFee, 0.4)),
    fixed: n(input.fixedFee, 150),
  };
  quote.subtotal = Object.values(quote).reduce((sum, value) => sum + value, 0);
  quote.total = Math.max(quote.subtotal, n(input.minimumMonthly, 0));
  const inHouse = orders * n(input.inHousePerOrder, 13);
  const delta = inHouse - quote.total;
  const perOrder = orders ? quote.total / orders : 0;
  const inHouseRate = n(input.inHousePerOrder, 13);
  const breakEven = includeBreakEven
    ? estimateBreakEven(input, inHouseRate)
    : { orders: inHouseRate ? quote.total / inHouseRate : 0, found: Boolean(inHouseRate) };
  // Orders/month where the volume-driven line items alone (receiving, pick/pack,
  // packaging, shipping, returns — everything that scales with orders) reach the
  // minimum monthly commitment, holding storage and the fixed fee constant. Below
  // this volume the minimum is what's actually setting the bill, not your order
  // count, so it's the number to bring into a minimum-spend negotiation.
  const minimumMonthly = n(input.minimumMonthly, 0);
  const orderVariableCost = orders ? (quote.receiving + quote.pickPack + quote.packaging + quote.shipping + quote.returns) / orders : 0;
  const nonOrderCost = quote.storage + quote.fixed;
  const minimumOrders = minimumMonthly && orderVariableCost ? Math.max(0, (minimumMonthly - nonOrderCost) / orderVariableCost) : 0;
  const result = { orders, unitsPerOrder: units, quote, inHouse, delta, perOrder, breakEvenOrders: breakEven.orders, breakEvenFound: breakEven.found, minimumOrders, minimumApplied: quote.total > quote.subtotal, winner: delta >= 0 ? "3PL" : "in-house", components: ["receiving", "storage", "pickPack", "packaging", "shipping", "returns", "fixed"], warnings };
  if (includeSensitivity) result.sensitivity = volumeSensitivity(input);
  return result;
}

/**
 * First whole-order volume where in-house cost covers the 3PL quote,
 * recalculating receiving, minimums, and line items at that volume.
 * The simple current-total / in-house rate is only a snapshot of this month.
 */
function estimateBreakEven(input, inHouseRate) {
  if (!inHouseRate) return { orders: 0, found: false };
  const units = Number.isFinite(Number(input?.unitsPerOrder))
    ? Math.max(0, Number(input.unitsPerOrder))
    : 1.5;
  const deltaAt = (orders) => {
    const result = calculate({ ...input, orders, inboundUnits: orders * units }, false, false);
    return result.inHouse - result.quote.total;
  };
  if (deltaAt(0) >= 0) return { orders: 0, found: true };
  let high = 1;
  while (high < 1_000_000 && deltaAt(high) < 0) high *= 2;
  if (deltaAt(high) < 0) return { orders: 0, found: false };
  let low = Math.floor(high / 2);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (deltaAt(middle) >= 0) high = middle;
    else low = middle;
  }
  return { orders: high, found: true };
}

const inputLabels = { orders: "Orders / month", unitsPerOrder: "Units / order", pallets: "Pallets stored", inboundUnits: "Inbound units / month", receivingPerUnit: "Receiving / unit", storagePerPallet: "Storage / pallet", firstPick: "First pick / order", additionalPick: "Additional pick / unit", packaging: "Packaging / order", shipping: "Shipping / order", returnsRate: "Returns rate", returnFee: "Return handling / order", restockFee: "Restocking / returned order", fixedFee: "Fixed monthly fee", minimumMonthly: "Minimum monthly spend", inHousePerOrder: "In-house cost / order" };

export function inputWarnings(input) {
  return Object.entries(inputLabels).flatMap(([name, label]) => {
    const raw = input?.[name];
    if (raw === undefined || raw === null) return [];
    if (raw === "" || (typeof raw === "string" && raw.trim() === "")) {
      if (name === "inboundUnits") return [`${label} was blank; orders × units / order was used.`];
      const fallback = defaultInputs[name];
      return fallback === undefined ? [] : [`${label} was blank; the default ${fallback} was used.`];
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return [`${label} was not a number and was ignored.`];
    if (value < 0) return [`${label} cannot be negative; the negative value was treated as zero.`];
    return [];
  });
}

const defaultInputs = {
  orders: 100,
  unitsPerOrder: 1.5,
  pallets: 1,
  receivingPerUnit: 0.12,
  storagePerPallet: 18,
  firstPick: 2.75,
  additionalPick: 0.5,
  packaging: 0.6,
  shipping: 8.5,
  returnsRate: 8,
  returnFee: 2.5,
  restockFee: 0.4,
  fixedFee: 150,
  minimumMonthly: 0,
  inHousePerOrder: 13,
};

export function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export const INBOUND_METHODS = [
  { id: "pallet", label: "Pallet inbound", countLabel: "Pallets received" },
  { id: "carton", label: "Carton inbound", countLabel: "Cartons received" },
  { id: "unit", label: "Loose / per-unit inbound", countLabel: "Units received" },
];

/**
 * Converts a rate-card inbound method into the per-unit receiving rate the
 * rest of the quote already uses. Pallet and carton lines are fee ÷ units
 * in the container; loose inbound is already a per-unit rate.
 * Distinct from leftover aged storage, return disposition, and kitting —
 * this is how the inbound shipment is received, not what happens later.
 */
export function inboundReceivingPerUnit(method, input = {}) {
  const inboundUnits = fieldNumber(input.inboundUnits, fieldNumber(input.orders, 100) * fieldNumber(input.unitsPerOrder, 1.5));
  if (method === "pallet") {
    const unitsPerPallet = fieldNumber(input.unitsPerPallet, 48);
    const fee = fieldNumber(input.palletInboundFee, 12);
    if (unitsPerPallet === 0) {
      return { receivingPerUnit: Infinity, inboundCount: Infinity, fee, unitsPerContainer: 0, inboundUnits };
    }
    return {
      receivingPerUnit: fee / unitsPerPallet,
      inboundCount: inboundUnits / unitsPerPallet,
      fee,
      unitsPerContainer: unitsPerPallet,
      inboundUnits,
    };
  }
  if (method === "carton") {
    const unitsPerCarton = fieldNumber(input.unitsPerCarton, 12);
    const fee = fieldNumber(input.cartonInboundFee, 1.75);
    if (unitsPerCarton === 0) {
      return { receivingPerUnit: Infinity, inboundCount: Infinity, fee, unitsPerContainer: 0, inboundUnits };
    }
    return {
      receivingPerUnit: fee / unitsPerCarton,
      inboundCount: inboundUnits / unitsPerCarton,
      fee,
      unitsPerContainer: unitsPerCarton,
      inboundUnits,
    };
  }
  if (method === "unit") {
    const fee = fieldNumber(input.receivingPerUnit, 0.45);
    return {
      receivingPerUnit: fee,
      inboundCount: inboundUnits,
      fee,
      unitsPerContainer: 1,
      inboundUnits,
    };
  }
  throw new Error(`Unknown inbound method: ${method}`);
}

/**
 * Reprices the same quote under pallet, carton, and loose inbound so a seller
 * can see which rate-card line they should actually ship against.
 */
export function compareInboundMethods(input = {}) {
  const rows = INBOUND_METHODS.map((method) => {
    const inbound = inboundReceivingPerUnit(method.id, input);
    const finite = Number.isFinite(inbound.receivingPerUnit);
    const result = finite ? calculate({ ...input, receivingPerUnit: inbound.receivingPerUnit }, false) : null;
    return {
      id: method.id,
      label: method.label,
      countLabel: method.countLabel,
      inboundCount: inbound.inboundCount,
      receivingPerUnit: inbound.receivingPerUnit,
      receiving: result ? result.quote.receiving : Infinity,
      total: result ? result.quote.total : Infinity,
      perOrder: result ? result.perOrder : Infinity,
      vsInHouse: result ? result.winner : "in-house",
      delta: result ? result.delta : Number.NEGATIVE_INFINITY,
    };
  });
  const finite = rows.filter((row) => Number.isFinite(row.total));
  const cheapestTotal = finite.length ? Math.min(...finite.map((row) => row.total)) : Infinity;
  const dearestTotal = finite.length ? Math.max(...finite.map((row) => row.total)) : 0;
  const receivingValues = finite.map((row) => row.receiving);
  const cheapestIds = finite.filter((row) => row.total === cheapestTotal).map((row) => row.id);
  return {
    rows,
    cheapestId: cheapestIds.length === 1 ? cheapestIds[0] : null,
    cheapestIds,
    monthlySpread: Number.isFinite(cheapestTotal) ? dearestTotal - cheapestTotal : 0,
    receivingSpread: receivingValues.length ? Math.max(...receivingValues) - Math.min(...receivingValues) : 0,
  };
}

export function inboundComparisonSummary(comparison) {
  if (comparison.cheapestIds.length === 0) {
    return "Enter inbound rates to compare receiving methods.";
  }
  if (comparison.cheapestIds.length > 1) {
    const labels = comparison.rows
      .filter((row) => comparison.cheapestIds.includes(row.id))
      .map((row) => row.label);
    if (comparison.monthlySpread === 0 && comparison.receivingSpread > 0) {
      return `Receiving differs by ${money(comparison.receivingSpread)} per month, but the monthly minimum keeps the normalized totals the same.`;
    }
    if (comparison.monthlySpread === 0 && comparison.cheapestIds.length === comparison.rows.length) {
      return "Pallet, carton, and loose inbound have the same normalized monthly total at this volume.";
    }
    return `${labels.join(" and ")} tie as the lower inbound method at this volume.`;
  }
  const winner = comparison.rows.find((row) => row.id === comparison.cheapestId);
  if (comparison.monthlySpread === 0) {
    return `${winner.label} matches the other inbound methods at this volume.`;
  }
  return `${winner.label} is lower by ${money(comparison.monthlySpread)} per month than the most expensive inbound method at this volume.`;
}

export function compareQuotes(first, second) {
  const totalDelta = second.quote.total - first.quote.total;
  return {
    totalDelta,
    perOrderDelta: second.perOrder - first.perOrder,
    cheaper: totalDelta === 0 ? "tie" : totalDelta > 0 ? "first" : "second",
  };
}

export function comparisonSummary(first, second, firstName = "Quote A", secondName = "Quote B") {
  const comparison = compareQuotes(first, second);
  if (comparison.cheaper === "tie") return `${firstName} and ${secondName} have the same normalized monthly total.`;
  const cheaperName = comparison.cheaper === "first" ? firstName : secondName;
  return `${cheaperName} is lower by ${money(Math.abs(comparison.totalDelta))} per month (${money(Math.abs(comparison.perOrderDelta))} per order at this volume).`;
}

export function volumeSensitivity(input, volumes = [25, 50, 100, 250, 500]) {
  const base = calculate(input, false);
  const baseOrders = Math.max(1, base.orders || 1);
  const units = base.unitsPerOrder;
  return volumes.map((orders) => {
    const result = calculate({ ...input, orders, inboundUnits: orders * units }, false);
    return {
      orders,
      total: result.quote.total,
      perOrder: result.perOrder,
      minimumApplied: result.minimumApplied,
      savingsVsInHouse: result.delta,
      volumeRatio: orders / baseOrders,
    };
  });
}

const DEFAULT_RETURN_RATES = [0, 5, 8, 12, 15, 20];

function normalizeReturnRates(rates) {
  const unique = [...new Set((rates || DEFAULT_RETURN_RATES).map((rate) => {
    const number = Number(rate);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }))];
  unique.sort((left, right) => left - right);
  return unique;
}

export function returnsSensitivity(input, rates = DEFAULT_RETURN_RATES) {
  return normalizeReturnRates(rates).map((returnsRate) => {
    const result = calculate({ ...input, returnsRate }, false);
    return {
      returnsRate,
      returnsCost: result.quote.returns,
      total: result.quote.total,
      subtotal: result.quote.subtotal,
      perOrder: result.perOrder,
      inHouse: result.inHouse,
      savingsVsInHouse: result.delta,
      winner: result.winner,
      minimumApplied: result.minimumApplied,
    };
  });
}

export function returnsFlip(rows) {
  if (!rows.length) return { kind: "empty" };
  if (rows[0].winner === "in-house") return { kind: "already-in-house", rate: rows[0].returnsRate };
  const flip = rows.find((row) => row.winner === "in-house");
  if (!flip) return { kind: "stays-3pl", rate: rows[rows.length - 1].returnsRate };
  return { kind: "flips", rate: flip.returnsRate, gap: flip.savingsVsInHouse };
}

export function returnsMinimumMask(rows) {
  const masked = rows.filter((row) => row.minimumApplied);
  if (!masked.length) return { masked: false };
  const firstUnmasked = rows.find((row) => !row.minimumApplied);
  return {
    masked: true,
    maskedThrough: masked[masked.length - 1].returnsRate,
    unmaskedAt: firstUnmasked ? firstUnmasked.returnsRate : null,
  };
}

export function returnsSensitivitySummary(input, rates = DEFAULT_RETURN_RATES) {
  const rows = returnsSensitivity(input, rates);
  const flip = returnsFlip(rows);
  const mask = returnsMinimumMask(rows);
  const flipLine = flip.kind === "already-in-house"
    ? `In-house is already lower at ${flip.rate}% returns. Return fees are not the reason this quote loses.`
    : flip.kind === "stays-3pl"
      ? `3PL stays lower through ${flip.rate}% returns at these assumptions.`
      : `3PL stays lower until ${flip.rate}% returns, where in-house is lower by ${money(Math.abs(flip.gap))} per month.`;
  const maskLine = mask.masked
    ? mask.unmaskedAt == null
      ? `A monthly minimum hides return-fee growth through ${mask.maskedThrough}% returns.`
      : `A monthly minimum hides return-fee growth through ${mask.maskedThrough}% returns. The quote rises again at ${mask.unmaskedAt}%.`
    : "No monthly minimum is hiding the return-fee line.";
  return [
    "3PL returns-rate sensitivity",
    flipLine,
    maskLine,
    "",
    "Return rate, 3PL total, returns cost, winner",
    ...rows.map((row) => `${row.returnsRate}%: ${money(row.total)} total, ${money(row.returnsCost)} returns, ${row.winner}`),
    "",
    "Review these figures against the signed rate card before relying on them.",
  ].join("\n");
}

function fieldNumber(value, fallback = 0) {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function quoteWithStorage(input, pallets, storagePerPallet) {
  return calculate({ ...input, pallets, storagePerPallet }, false);
}

// The signed rate card prices every pallet at the fresh-storage line. After
// 30–90 days most 3PLs move leftover pallets onto a long-term surcharge.
// Liquidating leftover is a one-time recovery against that monthly hold.
// Distinct from return-rate sensitivity and from inbound method (pallet /
// carton / loose) — this is inventory that is already on the floor.
export function compareAgedStorage(input = {}) {
  const pallets = fieldNumber(input.pallets, 1);
  const leftoverPallets = Math.min(pallets, fieldNumber(input.leftoverPallets, 0));
  const turningPallets = Math.max(0, pallets - leftoverPallets);
  const baseRate = fieldNumber(input.storagePerPallet, 18);
  const longTermBlank = input.longTermStoragePerPallet === undefined
    || input.longTermStoragePerPallet === null
    || (typeof input.longTermStoragePerPallet === "string" && input.longTermStoragePerPallet.trim() === "");
  const longTermRate = longTermBlank ? baseRate * 2 : fieldNumber(input.longTermStoragePerPallet, baseRate * 2);
  const liquidationPerPallet = fieldNumber(input.liquidationPerPallet, 0);
  const blendedRate = pallets > 0 ? (turningPallets * baseRate + leftoverPallets * longTermRate) / pallets : 0;

  const asWritten = quoteWithStorage(input, pallets, baseRate);
  const aged = quoteWithStorage(input, pallets, blendedRate);
  const liquidate = quoteWithStorage(input, turningPallets, baseRate);
  const monthlySurcharge = leftoverPallets * Math.max(0, longTermRate - baseRate);
  const monthlyHoldIfKept = leftoverPallets * longTermRate;
  const liquidationRecovery = leftoverPallets * liquidationPerPallet;
  const monthsUntilSurchargeEatsRecovery = monthlyHoldIfKept > 0 && liquidationRecovery > 0
    ? liquidationRecovery / monthlyHoldIfKept
    : null;

  const rows = [
    {
      id: "asWritten",
      label: "Quote as written",
      result: asWritten,
      storageCost: asWritten.quote.storage,
      leftoverPallets: 0,
    },
    {
      id: "aged",
      label: "Leftover at long-term rate",
      result: aged,
      storageCost: aged.quote.storage,
      leftoverPallets,
    },
    {
      id: "liquidate",
      label: "Liquidate leftover now",
      result: liquidate,
      storageCost: liquidate.quote.storage,
      leftoverPallets: 0,
      liquidationRecovery,
    },
  ].map((row) => ({
    ...row,
    vsAsWritten: row.result.quote.total - asWritten.quote.total,
  }));

  const monthlyTotals = rows.map((row) => row.result.quote.total);
  const minTotal = Math.min(...monthlyTotals);
  const leaders = rows.filter((row) => Math.abs(row.result.quote.total - minTotal) < 1e-9);

  return {
    rows,
    asWritten: rows[0],
    aged: rows[1],
    liquidate: rows[2],
    pallets,
    leftoverPallets,
    turningPallets,
    baseRate,
    longTermRate,
    blendedRate,
    monthlySurcharge,
    monthlyHoldIfKept,
    liquidationPerPallet,
    liquidationRecovery,
    monthsUntilSurchargeEatsRecovery,
    cheapestPath: leaders.length === 1 ? leaders[0].id : "tie",
    agedWinner: aged.winner,
  };
}

function leftoverSweepCounts(pallets) {
  if (pallets <= 0) return [0];
  const step = pallets <= 8 ? 1 : Math.max(1, Math.round(pallets / 4));
  const counts = [];
  for (let leftover = 0; leftover <= pallets; leftover += step) counts.push(leftover);
  if (counts[counts.length - 1] !== pallets) counts.push(pallets);
  return counts;
}

export function agedStorageSweep(input = {}) {
  const pallets = fieldNumber(input.pallets, 1);
  return leftoverSweepCounts(pallets).map((leftoverPallets) => {
    const comparison = compareAgedStorage({ ...input, leftoverPallets });
    return {
      leftoverPallets,
      storageCost: comparison.aged.storageCost,
      total: comparison.aged.result.quote.total,
      perOrder: comparison.aged.result.perOrder,
      inHouse: comparison.aged.result.inHouse,
      savingsVsInHouse: comparison.aged.result.delta,
      winner: comparison.aged.result.winner,
      monthlySurcharge: comparison.monthlySurcharge,
      minimumApplied: comparison.aged.result.minimumApplied,
    };
  });
}

export function agedStorageFlip(rows) {
  if (!rows.length) return { kind: "empty" };
  if (rows[0].winner === "in-house") return { kind: "already-in-house", leftoverPallets: rows[0].leftoverPallets };
  const flip = rows.find((row) => row.winner === "in-house");
  if (!flip) return { kind: "stays-3pl", leftoverPallets: rows[rows.length - 1].leftoverPallets };
  return { kind: "flips", leftoverPallets: flip.leftoverPallets, gap: flip.savingsVsInHouse };
}

export function agedStorageSummary(input = {}) {
  const comparison = compareAgedStorage(input);
  const sweep = agedStorageSweep(input);
  const flip = agedStorageFlip(sweep);
  const { leftoverPallets, monthlySurcharge, liquidationRecovery, monthsUntilSurchargeEatsRecovery, cheapestPath } = comparison;
  const agedTotal = comparison.aged.result.quote.total;
  const asWrittenTotal = comparison.asWritten.result.quote.total;
  const flipLine = leftoverPallets === 0
    ? "No leftover pallets are on the long-term line, so the quote as written and the aged path match."
    : monthlySurcharge === 0
      ? "The long-term rate matches fresh storage, so leftover pallets do not change the monthly total."
      : `Leftover at the long-term rate raises the monthly 3PL total by ${money(agedTotal - asWrittenTotal)} versus the quote as written (${money(monthlySurcharge)} of that is the storage surcharge).`;
  const holdLine = leftoverPallets === 0
    ? "Raise leftover pallets to see when a surcharge flips the quote."
    : monthsUntilSurchargeEatsRecovery == null
      ? liquidationRecovery === 0
        ? `Liquidating leftover drops monthly 3PL cost by ${money(comparison.asWritten.result.quote.total - comparison.liquidate.result.quote.total)} with no cash recovered.`
        : "Long-term storage is $0, so holding leftover does not eat a liquidation recovery."
      : `Holding leftover eats a ${money(liquidationRecovery)} liquidation recovery in ${monthsUntilSurchargeEatsRecovery.toFixed(1)} months of long-term storage.`;
  const decisionLine = flip.kind === "already-in-house"
    ? `In-house is already lower before leftover ages. Long-term storage is not why this quote loses.`
    : flip.kind === "stays-3pl"
      ? `3PL stays lower through ${flip.leftoverPallets} leftover pallet${flip.leftoverPallets === 1 ? "" : "s"} at these assumptions.`
      : `3PL stays lower until ${flip.leftoverPallets} leftover pallet${flip.leftoverPallets === 1 ? "" : "s"} hit the long-term rate, where in-house is lower by ${money(Math.abs(flip.gap))} per month.`;
  const cheapestLine = cheapestPath === "tie"
    ? "The monthly 3PL totals tie across these paths."
    : cheapestPath === "liquidate"
      ? "The lowest monthly 3PL total is liquidating leftover and keeping only turning stock."
      : cheapestPath === "aged"
        ? "The lowest monthly 3PL total is keeping leftover at the long-term rate."
        : "The lowest monthly 3PL total is the quote as written (all pallets at the fresh-storage line).";
  return [
    "3PL long-term storage comparison",
    flipLine,
    holdLine,
    decisionLine,
    cheapestLine,
    "",
    "Path, leftover pallets, storage line, 3PL total, winner vs in-house",
    ...comparison.rows.map((row) =>
      `${row.label}: ${row.leftoverPallets} leftover, ${money(row.storageCost)} storage, ${money(row.result.quote.total)} total, ${row.result.winner}`,
    ),
    "",
    "Leftover sweep (aged path)",
    ...sweep.map((row) =>
      `${row.leftoverPallets} leftover: ${money(row.total)} total, ${money(row.monthlySurcharge)} surcharge, ${row.winner}`,
    ),
    "",
    "Review these figures against the signed rate card before relying on them.",
  ].join("\n");
}

function fieldPercent(value, fallback = 0) {
  return Math.min(100, fieldNumber(value, fallback));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const DEFAULT_RESTOCKABLE_RATES = [40, 50, 60, 70, 80, 90, 100];
const DEFAULT_UNIT_COSTS = [8, 12, 18, 24, 30, 45, 60];

// A return that just arrived is a different decision from leftover pallets
// already on the floor (compareAgedStorage) and from raising the return
// *rate* against in-house (returnsSensitivity). Here the sale is already
// refunded. Restock pays inbound + inspect and keeps sellable units.
// Destroy pays inbound + dispose and writes off cost. Customer-keeps skips
// the label and the 3PL return lines and writes off cost.
export function compareReturnDisposition(input = {}) {
  const orders = fieldNumber(input.orders, 100);
  const returnsRate = fieldPercent(input.returnsRate, 12);
  const returnedOrders = roundMoney(orders * returnsRate / 100);
  const returnFee = fieldNumber(input.returnFee, 3.5);
  const restockFee = fieldNumber(input.restockFee, 4);
  const destroyFee = fieldNumber(input.destroyFee, 1.5);
  const returnLabelCost = fieldNumber(input.returnLabelCost, 8);
  const unitCost = fieldNumber(input.unitCost, 18);
  const restockableRate = fieldPercent(input.restockableRate, 70);
  const restockable = restockableRate / 100;
  const storageUntilResale = fieldNumber(input.storageUntilResale, 0.4);
  const keepOffer = fieldNumber(input.keepOffer, 0);

  const restockFees = returnLabelCost + returnFee + restockFee + storageUntilResale;
  const destroyFees = returnLabelCost + returnFee + destroyFee;
  const inventoryLostIfRestock = unitCost * (1 - restockable);
  const destroyLeftoverIfRestock = destroyFee * (1 - restockable);

  const restockNet = roundMoney(restockFees + inventoryLostIfRestock + destroyLeftoverIfRestock);
  const destroyNet = roundMoney(destroyFees + unitCost);
  const keepNet = roundMoney(unitCost + keepOffer);

  const restock = {
    id: "restock",
    label: "Restock sellable units",
    perReturn: restockNet,
    monthly: roundMoney(restockNet * returnedOrders),
    fees: roundMoney(restockFees),
    inventoryLost: roundMoney(inventoryLostIfRestock),
    destroyLeftover: roundMoney(destroyLeftoverIfRestock),
    unitsKept: roundMoney(returnedOrders * restockable),
  };
  const destroy = {
    id: "destroy",
    label: "Destroy the return",
    perReturn: destroyNet,
    monthly: roundMoney(destroyNet * returnedOrders),
    fees: roundMoney(destroyFees),
    inventoryLost: roundMoney(unitCost),
    destroyLeftover: roundMoney(destroyFee),
    unitsKept: 0,
  };
  const keep = {
    id: "keep",
    label: "Customer keeps the item",
    perReturn: keepNet,
    monthly: roundMoney(keepNet * returnedOrders),
    fees: roundMoney(keepOffer),
    inventoryLost: roundMoney(unitCost),
    destroyLeftover: 0,
    unitsKept: 0,
  };
  const rows = [restock, destroy, keep];
  const minCost = Math.min(...rows.map((row) => row.perReturn));
  const leaders = rows.filter((row) => Math.abs(row.perReturn - minCost) < 1e-9);
  const cheapestPath = leaders.length === 1 ? leaders[0].id : "tie";

  // Restock beats customer-keeps once recovered inventory covers the extra
  // 3PL path. Algebra: fees + cogs*(1-r) + destroyFee*(1-r) = cogs + keepOffer
  const restockBeatsKeepAt = restockable > 0
    ? roundMoney((restockFees + destroyFee * (1 - restockable) - keepOffer) / restockable)
    : null;
  const restockBeatsDestroyAt = restockable > 0
    ? roundMoney((restockFees + destroyFee * (1 - restockable) - destroyFees) / restockable)
    : null;

  return {
    orders,
    returnsRate,
    returnedOrders,
    returnFee,
    restockFee,
    destroyFee,
    returnLabelCost,
    unitCost,
    restockableRate,
    storageUntilResale,
    keepOffer,
    restockFees: roundMoney(restockFees),
    destroyFees: roundMoney(destroyFees),
    rows,
    restock,
    destroy,
    keep,
    cheapestPath,
    cheapestPerReturn: minCost,
    vsKeep: {
      restock: roundMoney(keepNet - restockNet),
      destroy: roundMoney(keepNet - destroyNet),
    },
    restockBeatsKeepAt,
    restockBeatsDestroyAt,
  };
}

function normalizeSweepValues(values, fallbacks) {
  const unique = [...new Set((values || fallbacks).map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }))];
  unique.sort((left, right) => left - right);
  return unique;
}

export function returnDispositionRestockableSweep(input = {}, rates = DEFAULT_RESTOCKABLE_RATES) {
  return normalizeSweepValues(rates, DEFAULT_RESTOCKABLE_RATES).map((restockableRate) => {
    const comparison = compareReturnDisposition({ ...input, restockableRate });
    return {
      restockableRate,
      restock: comparison.restock.perReturn,
      destroy: comparison.destroy.perReturn,
      keep: comparison.keep.perReturn,
      cheapestPath: comparison.cheapestPath,
    };
  });
}

export function returnDispositionUnitCostSweep(input = {}, costs = DEFAULT_UNIT_COSTS) {
  return normalizeSweepValues(costs, DEFAULT_UNIT_COSTS).map((unitCost) => {
    const comparison = compareReturnDisposition({ ...input, unitCost });
    return {
      unitCost,
      restock: comparison.restock.perReturn,
      destroy: comparison.destroy.perReturn,
      keep: comparison.keep.perReturn,
      cheapestPath: comparison.cheapestPath,
    };
  });
}

export function returnDispositionFlip(rows, key = "restockableRate") {
  if (!rows.length) return { kind: "empty" };
  const first = rows[0].cheapestPath;
  const flip = rows.find((row) => row.cheapestPath !== first && row.cheapestPath !== "tie");
  if (!flip) return { kind: "holds", path: first, at: rows[rows.length - 1][key] };
  return { kind: "flips", from: first, to: flip.cheapestPath, at: flip[key] };
}

export function returnDispositionSummary(input = {}) {
  const comparison = compareReturnDisposition(input);
  const restockableSweep = returnDispositionRestockableSweep(input);
  const unitCostSweep = returnDispositionUnitCostSweep(input);
  const restockableFlip = returnDispositionFlip(restockableSweep, "restockableRate");
  const unitCostFlip = returnDispositionFlip(unitCostSweep, "unitCost");
  const keepVsRestock = roundMoney(comparison.restock.perReturn - comparison.keep.perReturn);
  const cheapestLine = comparison.cheapestPath === "tie"
    ? "The three paths tie on net cash out per return at these assumptions."
    : comparison.cheapestPath === "keep"
      ? `Letting the customer keep the item is cheaper by ${money(keepVsRestock)} per return versus restock (${money(comparison.keep.perReturn)} vs ${money(comparison.restock.perReturn)}).`
      : comparison.cheapestPath === "restock"
        ? `Restocking sellable units is cheaper by ${money(comparison.vsKeep.restock)} per return versus letting the customer keep it.`
        : `Destroying the return is the cheapest path at ${money(comparison.destroy.perReturn)} per return.`;
  const thresholdLine = comparison.restockBeatsKeepAt == null
    ? "At 0% restockable, restock never recovers inventory, so it cannot beat customer-keeps."
    : comparison.unitCost + 1e-9 >= comparison.restockBeatsKeepAt
      ? `Restock already beats customer-keeps. It first wins once unit cost is ${money(comparison.restockBeatsKeepAt)} at this restockable rate.`
      : `Restock beats customer-keeps once unit cost reaches ${money(comparison.restockBeatsKeepAt)} at this restockable rate.`;
  const flipLine = restockableFlip.kind === "holds"
    ? `${restockableFlip.path === "keep" ? "Customer-keeps" : restockableFlip.path === "restock" ? "Restock" : restockableFlip.path === "tie" ? "A tie" : "Destroy"} stays cheapest through ${restockableFlip.at}% restockable.`
    : restockableFlip.kind === "flips"
      ? `Cheapest path flips from ${restockableFlip.from} to ${restockableFlip.to} at ${restockableFlip.at}% restockable.`
      : "No restockable-rate sweep.";
  const unitFlipLine = unitCostFlip.kind === "holds"
    ? `${unitCostFlip.path === "keep" ? "Customer-keeps" : unitCostFlip.path === "restock" ? "Restock" : unitCostFlip.path === "tie" ? "A tie" : "Destroy"} stays cheapest through ${money(unitCostFlip.at)} unit cost.`
    : unitCostFlip.kind === "flips"
      ? `Cheapest path flips from ${unitCostFlip.from} to ${unitCostFlip.to} at ${money(unitCostFlip.at)} unit cost.`
      : "No unit-cost sweep.";
  return [
    "3PL return disposition comparison",
    `${comparison.returnedOrders} returned orders / month at ${comparison.returnsRate}% of ${comparison.orders} orders.`,
    cheapestLine,
    thresholdLine,
    flipLine,
    unitFlipLine,
    "",
    "Path, 3PL + label fees, inventory written off, net per return, monthly",
    ...comparison.rows.map((row) =>
      `${row.label}: ${money(row.fees)} fees, ${money(row.inventoryLost)} inventory, ${money(row.perReturn)} each, ${money(row.monthly)} / month`,
    ),
    "",
    "Restockable-rate sweep (net per return)",
    ...restockableSweep.map((row) =>
      `${row.restockableRate}% restockable: restock ${money(row.restock)}, destroy ${money(row.destroy)}, keep ${money(row.keep)}, cheapest ${row.cheapestPath}`,
    ),
    "",
    "Unit-cost sweep (net per return)",
    ...unitCostSweep.map((row) =>
      `${money(row.unitCost)} COGS: restock ${money(row.restock)}, destroy ${money(row.destroy)}, keep ${money(row.keep)}, cheapest ${row.cheapestPath}`,
    ),
    "",
    "Review these figures against the signed rate card and your own refund policy before relying on them.",
  ].join("\n");
}

const DEFAULT_KIT_FEES = [0.75, 1.25, 1.84, 2.5, 3.5, 5, 7];
const DEFAULT_AOV_LIFTS = [3, 4, 5, 6, 7.66, 8, 10, 12];

// A kit / insert / polybag is a different decision from leftover pallets
// (compareAgedStorage), from raising the return *rate* (returnsSensitivity),
// and from restock vs keep on a return that already arrived
// (compareReturnDisposition). The signed pick-and-pack line prices the first
// unit. Ops then bills assembly, extra component picks, and extra receiving.
// Hold the rest of the quote still. Three paths: pay the 3PL to assemble,
// kit before inbound so those extra lines are $0, or skip the bundle and
// keep the hero SKU. Net is contribution, not cost — skip is $0.
export function compareKitting(input = {}) {
  const orders = fieldNumber(input.orders, 400);
  const kitAttachRate = fieldPercent(input.kitAttachRate, 100);
  const kittedOrders = roundMoney(orders * kitAttachRate / 100);
  const aovLift = fieldNumber(input.aovLift, 6);
  const extraCogs = fieldNumber(input.extraCogs, 2.8);
  const kitFee = fieldNumber(input.kitFee, 3.5);
  const extraPicks = fieldNumber(input.extraPicks, 1);
  const extraReceiving = fieldNumber(input.extraReceiving, 0.36);
  const inHouseKitLabor = fieldNumber(input.inHouseKitLabor, 0.9);

  const threePlFees = roundMoney(kitFee + extraPicks + extraReceiving);
  const threePlNet = roundMoney(aovLift - extraCogs - threePlFees);
  const prekitNet = roundMoney(aovLift - extraCogs - inHouseKitLabor);
  const skipNet = 0;

  const threePl = {
    id: "threePl",
    label: "3PL assembles the kit",
    fees: threePlFees,
    extraCogs: roundMoney(extraCogs),
    aovLift: roundMoney(aovLift),
    perOrder: threePlNet,
    monthly: roundMoney(threePlNet * kittedOrders),
  };
  const prekit = {
    id: "prekit",
    label: "Kit before inbound",
    fees: roundMoney(inHouseKitLabor),
    extraCogs: roundMoney(extraCogs),
    aovLift: roundMoney(aovLift),
    perOrder: prekitNet,
    monthly: roundMoney(prekitNet * kittedOrders),
  };
  const skip = {
    id: "skip",
    label: "Skip the kit / sell the hero SKU",
    fees: 0,
    extraCogs: 0,
    aovLift: 0,
    perOrder: skipNet,
    monthly: 0,
  };
  const rows = [threePl, prekit, skip];
  const maxNet = Math.max(...rows.map((row) => row.perOrder));
  const leaders = rows.filter((row) => Math.abs(row.perOrder - maxNet) < 1e-9);
  const bestPath = leaders.length === 1 ? leaders[0].id : "tie";

  const inboundLeaders = [threePl, skip].filter((row) => Math.abs(row.perOrder - Math.max(threePlNet, skipNet)) < 1e-9);
  const bestIfAlreadyInbound = inboundLeaders.length === 1 ? inboundLeaders[0].id : "tie";

  // 3PL beats skip once the bundle lift covers extra COGS plus every extra
  // 3PL line. Algebra: aov - cogs - kitFee - picks - receiving = 0
  const threePlBeatsSkipAtKitFee = roundMoney(aovLift - extraCogs - extraPicks - extraReceiving);
  const threePlBeatsSkipAtAovLift = roundMoney(extraCogs + kitFee + extraPicks + extraReceiving);
  const prekitBeatsSkipAtAovLift = roundMoney(extraCogs + inHouseKitLabor);

  return {
    orders,
    kitAttachRate,
    kittedOrders,
    aovLift: roundMoney(aovLift),
    extraCogs: roundMoney(extraCogs),
    kitFee: roundMoney(kitFee),
    extraPicks: roundMoney(extraPicks),
    extraReceiving: roundMoney(extraReceiving),
    inHouseKitLabor: roundMoney(inHouseKitLabor),
    threePlFees,
    rows,
    threePl,
    prekit,
    skip,
    bestPath,
    bestIfAlreadyInbound,
    vsSkip: {
      threePl: threePlNet,
      prekit: prekitNet,
    },
    threePlBeatsSkipAtKitFee,
    threePlBeatsSkipAtAovLift,
    prekitBeatsSkipAtAovLift,
  };
}

export function kittingFeeSweep(input = {}, fees = DEFAULT_KIT_FEES) {
  return normalizeSweepValues(fees, DEFAULT_KIT_FEES).map((kitFee) => {
    const comparison = compareKitting({ ...input, kitFee });
    return {
      kitFee,
      threePl: comparison.threePl.perOrder,
      prekit: comparison.prekit.perOrder,
      skip: comparison.skip.perOrder,
      bestPath: comparison.bestPath,
      bestIfAlreadyInbound: comparison.bestIfAlreadyInbound,
    };
  });
}

export function kittingAovSweep(input = {}, lifts = DEFAULT_AOV_LIFTS) {
  return normalizeSweepValues(lifts, DEFAULT_AOV_LIFTS).map((aovLift) => {
    const comparison = compareKitting({ ...input, aovLift });
    return {
      aovLift,
      threePl: comparison.threePl.perOrder,
      prekit: comparison.prekit.perOrder,
      skip: comparison.skip.perOrder,
      bestPath: comparison.bestPath,
      bestIfAlreadyInbound: comparison.bestIfAlreadyInbound,
    };
  });
}

export function kittingFlip(rows, key = "kitFee", pathKey = "bestPath") {
  if (!rows.length) return { kind: "empty" };
  const first = rows[0][pathKey];
  const flip = rows.find((row) => row[pathKey] !== first && row[pathKey] !== "tie");
  if (!flip) return { kind: "holds", path: first, at: rows[rows.length - 1][key] };
  return { kind: "flips", from: first, to: flip[pathKey], at: flip[key] };
}

export function kittingSummary(input = {}) {
  const comparison = compareKitting(input);
  const feeSweep = kittingFeeSweep(input);
  const aovSweep = kittingAovSweep(input);
  const feeFlip = kittingFlip(feeSweep, "kitFee", "bestIfAlreadyInbound");
  const aovFlip = kittingFlip(aovSweep, "aovLift", "bestIfAlreadyInbound");
  const bestLine = comparison.bestPath === "tie"
    ? "The three paths tie on net contribution per kitted order at these assumptions."
    : comparison.bestPath === "prekit"
      ? `Kitting before inbound keeps ${money(comparison.prekit.perOrder)} per kit versus ${money(comparison.threePl.perOrder)} if the 3PL assembles and ${money(comparison.skip.perOrder)} if you skip the bundle.`
      : comparison.bestPath === "skip"
        ? `Skipping the kit keeps more than paying the 3PL to assemble (${money(comparison.threePl.perOrder)} per kit) or kitting before inbound (${money(comparison.prekit.perOrder)}).`
        : `Paying the 3PL to assemble keeps ${money(comparison.threePl.perOrder)} per kit, ${money(comparison.threePl.perOrder - comparison.prekit.perOrder)} more than kitting before inbound.`;
  const inboundLine = comparison.bestIfAlreadyInbound === "tie"
    ? `If the components are already on the floor, 3PL assembly and skipping the kit tie at ${money(comparison.threePl.perOrder)}.`
    : comparison.bestIfAlreadyInbound === "skip"
      ? `If the components are already on the floor, skip the kit. 3PL assembly first beats skip at a ${money(comparison.threePlBeatsSkipAtKitFee)} kit fee or a ${money(comparison.threePlBeatsSkipAtAovLift)} AOV lift.`
      : `If the components are already on the floor, 3PL assembly still beats skip by ${money(comparison.threePl.perOrder)} per kit.`;
  const feeFlipLine = feeFlip.kind === "holds"
    ? `${feeFlip.path === "skip" ? "Skip" : feeFlip.path === "threePl" ? "3PL assembly" : "Tie"} stays the on-the-floor winner through a ${money(feeFlip.at)} kit fee.`
    : feeFlip.kind === "flips"
      ? `On-the-floor winner flips from ${feeFlip.from} to ${feeFlip.to} at a ${money(feeFlip.at)} kit fee.`
      : "No kit-fee sweep.";
  const aovFlipLine = aovFlip.kind === "holds"
    ? `${aovFlip.path === "skip" ? "Skip" : aovFlip.path === "threePl" ? "3PL assembly" : "Tie"} stays the on-the-floor winner through a ${money(aovFlip.at)} AOV lift.`
    : aovFlip.kind === "flips"
      ? `On-the-floor winner flips from ${aovFlip.from} to ${aovFlip.to} at a ${money(aovFlip.at)} AOV lift.`
      : "No AOV-lift sweep.";
  return [
    "3PL kitting comparison",
    `${comparison.kittedOrders} kitted orders / month at ${comparison.kitAttachRate}% of ${comparison.orders} orders.`,
    bestLine,
    inboundLine,
    feeFlipLine,
    aovFlipLine,
    "",
    "Path, extra 3PL / labor, extra COGS, AOV lift, net per kit, monthly",
    ...comparison.rows.map((row) =>
      `${row.label}: ${money(row.fees)} fees, ${money(row.extraCogs)} extra COGS, ${money(row.aovLift)} lift, ${money(row.perOrder)} each, ${money(row.monthly)} / month`,
    ),
    "",
    "Kit-fee sweep (net per kit)",
    ...feeSweep.map((row) =>
      `${money(row.kitFee)} kit fee: 3PL ${money(row.threePl)}, pre-kit ${money(row.prekit)}, skip ${money(row.skip)}, best ${row.bestPath}, on-floor ${row.bestIfAlreadyInbound}`,
    ),
    "",
    "AOV-lift sweep (net per kit)",
    ...aovSweep.map((row) =>
      `${money(row.aovLift)} lift: 3PL ${money(row.threePl)}, pre-kit ${money(row.prekit)}, skip ${money(row.skip)}, best ${row.bestPath}, on-floor ${row.bestIfAlreadyInbound}`,
    ),
    "",
    "Review these figures against the signed rate card and your own kit labor before relying on them.",
  ].join("\n");
}

const componentLabels = { receiving: "Receiving", storage: "Storage", pickPack: "Pick and pack", packaging: "Packaging", shipping: "Shipping", returns: "Returns", fixed: "Fixed fees" };

export function negotiationLines(result) {
  const driver = largestCostDriver(result);
  return [
    `Monthly volume: ${result.orders} orders`,
    `Largest normalized cost driver: ${driver.label} (${money(driver.amount)}, ${driver.share}% of subtotal)`,
    ...result.components.map((component) => `${componentLabels[component] || component}: ${money(result.quote[component])}`),
    `Subtotal before minimum: ${money(result.quote.subtotal)}`,
    `Minimum monthly spend applied: ${money(Math.max(0, result.quote.total - result.quote.subtotal))}`,
    `Total estimated 3PL cost: ${money(result.quote.total)}`,
    `True cost per order: ${money(result.perOrder)}`,
    ...(result.minimumOrders > 0 ? [`Orders needed to clear the minimum on volume alone: ${Math.ceil(result.minimumOrders)} orders/month`] : []),
  ];
}

export function largestCostDriver(result) {
  const component = result.components.reduce((largest, current) =>
    result.quote[current] > result.quote[largest] ? current : largest,
    result.components[0],
  );
  const amount = result.quote[component] || 0;
  const subtotal = result.quote.subtotal || 0;
  return { component, label: componentLabels[component] || component, amount, share: subtotal ? Math.round((amount / subtotal) * 100) : 0 };
}

export function costDrivers(result, reductionPercent = 10) {
  const reduction = Math.min(100, Math.max(0, Number(reductionPercent) || 0)) / 100;
  return result.components.map((component) => {
    const current = result.quote[component] || 0;
    const savings = current * reduction;
    return {
      component,
      label: componentLabels[component] || component,
      current,
      savings,
      revised: current - savings,
    };
  }).sort((first, second) => second.current - first.current);
}

export function summary(result) {
  const driver = largestCostDriver(result);
  return [
    "3PL quote normalization",
    ...(result.warnings.length ? ["", "Input warnings", ...result.warnings] : []),
    `Monthly orders: ${result.orders}`,
    `3PL total: ${money(result.quote.total)}`,
    `In-house estimate: ${money(result.inHouse)}`,
    `Difference (in-house minus 3PL): ${money(result.delta)}`,
    `True 3PL cost per order: ${money(result.perOrder)}`,
    `Largest cost driver: ${driver.label} (${money(driver.amount)}, ${driver.share}% of subtotal)`,
    `Break-even volume: about ${Math.ceil(result.breakEvenOrders)} orders/month`,
    ...(result.minimumOrders > 0 ? [`Orders needed to clear the minimum on volume alone: ${Math.ceil(result.minimumOrders)} orders/month`] : []),
    "",
    "Line items",
    `Receiving: ${money(result.quote.receiving)}`,
    `Storage: ${money(result.quote.storage)}`,
    `Pick and pack: ${money(result.quote.pickPack)}`,
    `Packaging: ${money(result.quote.packaging)}`,
    `Shipping: ${money(result.quote.shipping)}`,
    `Returns: ${money(result.quote.returns)}`,
    `Fixed fees: ${money(result.quote.fixed)}`,
    `Minimum monthly charge applied: ${result.quote.total > result.quote.subtotal ? "yes" : "no"}`,
    "",
    "Review these figures against the signed rate card before relying on them.",
  ].join("\n");
}
