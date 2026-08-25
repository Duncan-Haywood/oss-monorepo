const labels = {
  receiving: "Receiving",
  storage: "Storage",
  pickPack: "Pick and pack",
  packaging: "Packaging",
  shipping: "Shipping",
  returns: "Returns",
  fixed: "Fixed fees",
};

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function exportCsv(result) {
  if (!result || !result.quote || !Array.isArray(result.components)) {
    throw new TypeError("A calculated quote result is required");
  }
  const rows = [["3PL quote normalization", "Value"],
    ["Monthly orders", result.orders],
    ...result.components.map((component) => [labels[component] || component, result.quote[component].toFixed(2)]),
    ["Subtotal before minimum", result.quote.subtotal.toFixed(2)],
    ["Minimum monthly spend applied", result.minimumApplied ? "yes" : "no"],
    ["Total estimated 3PL cost", result.quote.total.toFixed(2)],
    ["True 3PL cost per order", result.perOrder.toFixed(2)],
    ["In-house estimate", result.inHouse.toFixed(2)],
    ["Difference (in-house minus 3PL)", result.delta.toFixed(2)],
    ["Break-even volume", Math.ceil(result.breakEvenOrders)],
  ];
  if (result.warnings.length) rows.push(["Input warnings", result.warnings.join(" ")]);
  rows.push(["Review note", "Verify every rate, assumption, contract term, and operational requirement before relying on this record."]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function exportJson(result) {
  if (!result || !result.quote || !Array.isArray(result.components) || !Array.isArray(result.warnings)) {
    throw new TypeError("A calculated quote result is required");
  }
  const lineItems = Object.fromEntries(result.components.map((component) => [labels[component] || component, Number(result.quote[component].toFixed(2))]));
  return JSON.stringify({
    schema_version: 1,
    product: "3PL Quote Normalizer",
    status: "calculated",
    monthly_orders: result.orders,
    line_items: lineItems,
    subtotal_before_minimum: Number(result.quote.subtotal.toFixed(2)),
    minimum_charge_applied: result.minimumApplied,
    total_estimated_3pl_cost: Number(result.quote.total.toFixed(2)),
    true_3pl_cost_per_order: Number(result.perOrder.toFixed(2)),
    in_house_estimate: Number(result.inHouse.toFixed(2)),
    difference_in_house_minus_3pl: Number(result.delta.toFixed(2)),
    break_even_orders_per_month: Math.ceil(result.breakEvenOrders),
    warnings: result.warnings,
    review_note: "Verify every rate, assumption, contract term, and operational requirement before relying on this record.",
  }, null, 2) + "\n";
}

export function exportComparisonCsv(result, firstName = "Quote A", secondName = "Quote B") {
  if (!result || result.error) throw new TypeError("A valid comparison result is required");
  const rows = [["3PL quote comparison", "Value"],
    [firstName, result.first.toFixed(2)],
    [secondName, result.second.toFixed(2)],
    ["Lower quote", result.equal ? "equal" : result.cheaper === "first" ? firstName : secondName],
    ["Monthly difference", result.difference.toFixed(2)],
    ["Annual difference", result.annualDifference.toFixed(2)],
    ["Savings percentage", `${((result.difference / Math.max(result.first, result.second || 1)) * 100).toFixed(2)}%`],
  ];
  if (result.target != null) rows.push(["Target monthly total", result.target.toFixed(2)], ["First within target", result.firstWithinTarget ? "yes" : "no"], ["Second within target", result.secondWithinTarget ? "yes" : "no"]);
  rows.push(["Review note", "Verify every rate, assumption, contract term, and operational requirement before relying on this record."]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
