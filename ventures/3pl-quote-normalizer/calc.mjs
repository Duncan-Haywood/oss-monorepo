export function calculate(input, includeSensitivity = true, includeBreakEven = true) {
  const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
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
  const result = { orders, quote, inHouse, delta, perOrder, breakEvenOrders: includeBreakEven ? estimateBreakEven(input, inHouseRate) : 0, minimumApplied: quote.total > quote.subtotal, winner: delta >= 0 ? "3PL" : "in-house", components: ["receiving", "storage", "pickPack", "packaging", "shipping", "returns", "fixed"], warnings };
  if (includeSensitivity) result.sensitivity = volumeSensitivity(input);
  return result;
}

// Find the first whole-order volume where in-house cost covers the full 3PL quote.
function estimateBreakEven(input, inHouseRate) {
  if (!inHouseRate) return 0;
  const units = Number.isFinite(Number(input?.unitsPerOrder)) ? Math.max(0, Number(input.unitsPerOrder)) : 1.5;
  const deltaAt = (orders) => {
    const result = calculate({ ...input, orders, inboundUnits: orders * units }, false, false);
    return result.inHouse - result.quote.total;
  };
  if (deltaAt(0) >= 0) return 0;
  let high = 1;
  while (high < 1_000_000 && deltaAt(high) < 0) high *= 2;
  if (deltaAt(high) < 0) return 0;
  let low = Math.floor(high / 2);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (deltaAt(middle) >= 0) high = middle;
    else low = middle;
  }
  return high;
}

const inputLabels = { orders: "Orders / month", unitsPerOrder: "Units / order", pallets: "Pallets stored", inboundUnits: "Inbound units / month", receivingPerUnit: "Receiving / unit", storagePerPallet: "Storage / pallet", firstPick: "First pick / order", additionalPick: "Additional pick / unit", packaging: "Packaging / order", shipping: "Shipping / order", returnsRate: "Returns rate", fixedFee: "Fixed monthly fee", minimumMonthly: "Minimum monthly spend", inHousePerOrder: "In-house cost / order" };

export function inputWarnings(input) {
  return Object.entries(inputLabels).flatMap(([name, label]) => {
    const raw = input?.[name];
    if (raw === undefined || raw === null || raw === "") return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [`${label} was not a number and was ignored.`];
    if (value < 0) return [`${label} cannot be negative; the negative value was treated as zero.`];
    return [];
  });
}

export function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function compareQuotes(first, second) {
  return {
    totalDelta: second.quote.total - first.quote.total,
    perOrderDelta: second.perOrder - first.perOrder,
    cheaper: first.quote.total <= second.quote.total ? "first" : "second",
  };
}

export function comparisonSummary(first, second, firstName = "Quote A", secondName = "Quote B") {
  const comparison = compareQuotes(first, second);
  const cheaperName = comparison.cheaper === "first" ? firstName : secondName;
  return `${cheaperName} is lower by ${money(Math.abs(comparison.totalDelta))} per month (${money(Math.abs(comparison.perOrderDelta))} per order at this volume).`;
}

export function volumeSensitivity(input, volumes = [25, 50, 100, 250, 500]) {
  const baseOrders = Math.max(1, Number(input?.orders) || 1);
  const units = Number(input?.unitsPerOrder) || 0;
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
  return [
    `Monthly volume: ${result.orders} orders`,
    ...result.components.map((component) => `${component}: ${money(result.quote[component])}`),
    `Subtotal before minimum: ${money(result.quote.subtotal)}`,
    `Minimum monthly spend applied: ${money(Math.max(0, result.quote.total - result.quote.subtotal))}`,
    `Total estimated 3PL cost: ${money(result.quote.total)}`,
    `True cost per order: ${money(result.perOrder)}`,
  ];
}

export function summary(result) {
  return [
    "3PL quote normalization",
    ...(result.warnings.length ? ["", "Input warnings", ...result.warnings] : []),
    `Monthly orders: ${result.orders}`,
    `3PL total: ${money(result.quote.total)}`,
    `In-house estimate: ${money(result.inHouse)}`,
    `Difference (in-house minus 3PL): ${money(result.delta)}`,
    `True 3PL cost per order: ${money(result.perOrder)}`,
    `Break-even volume: ${result.breakEvenOrders ? `about ${result.breakEvenOrders} orders/month` : "not found within 1,000,000 orders/month"}`,
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
