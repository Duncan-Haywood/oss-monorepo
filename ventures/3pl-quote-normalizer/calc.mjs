export const INBOUND_METHODS = [
  { id: "pallet", label: "Pallet inbound", countLabel: "Pallets received" },
  { id: "carton", label: "Carton inbound", countLabel: "Cartons received" },
  { id: "unit", label: "Loose / per-unit inbound", countLabel: "Units received" },
];

function n(value, fallback = 0) {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

export function calculate(input, includeSensitivity = true) {
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
  const result = { orders, unitsPerOrder: units, quote, inHouse, delta, perOrder, breakEvenOrders: inHouseRate ? quote.total / inHouseRate : 0, minimumApplied: quote.total > quote.subtotal, winner: delta >= 0 ? "3PL" : "in-house", components: ["receiving", "storage", "pickPack", "packaging", "shipping", "returns", "fixed"], warnings };
  if (includeSensitivity) result.sensitivity = volumeSensitivity(input);
  return result;
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

/**
 * Converts a rate-card inbound method into the per-unit receiving rate the
 * rest of the quote already uses. Pallet and carton lines are fee ÷ units
 * in the container; loose inbound is already a per-unit rate.
 */
export function inboundReceivingPerUnit(method, input = {}) {
  const inboundUnits = n(input.inboundUnits, n(input.orders, 100) * n(input.unitsPerOrder, 1.5));
  if (method === "pallet") {
    const unitsPerPallet = n(input.unitsPerPallet, 48);
    const fee = n(input.palletInboundFee, 12);
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
    const unitsPerCarton = n(input.unitsPerCarton, 12);
    const fee = n(input.cartonInboundFee, 1.75);
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
    const fee = n(input.receivingPerUnit, 0.45);
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

export function negotiationLines(result) {
  const driver = largestCostDriver(result);
  return [
    `Monthly volume: ${result.orders} orders`,
    `Largest normalized cost driver: ${driver.label} (${money(driver.amount)}, ${driver.share}% of subtotal)`,
    ...result.components.map((component) => `${component}: ${money(result.quote[component])}`),
    `Subtotal before minimum: ${money(result.quote.subtotal)}`,
    `Minimum monthly spend applied: ${money(Math.max(0, result.quote.total - result.quote.subtotal))}`,
    `Total estimated 3PL cost: ${money(result.quote.total)}`,
    `True cost per order: ${money(result.perOrder)}`,
  ];
}

const componentLabels = { receiving: "Receiving", storage: "Storage", pickPack: "Pick and pack", packaging: "Packaging", shipping: "Shipping", returns: "Returns", fixed: "Fixed fees" };

export function largestCostDriver(result) {
  const component = result.components.reduce((largest, current) =>
    result.quote[current] > result.quote[largest] ? current : largest,
    result.components[0],
  );
  const amount = result.quote[component] || 0;
  const subtotal = result.quote.subtotal || 0;
  return { component, label: componentLabels[component] || component, amount, share: subtotal ? Math.round((amount / subtotal) * 100) : 0 };
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
