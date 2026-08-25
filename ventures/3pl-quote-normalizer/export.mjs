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
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function exportCsv(result) {
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
