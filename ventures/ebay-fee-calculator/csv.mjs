// Spreadsheet export for the repricing table. Keep this pure so downloads
// contain only the seller's calculated values and remain easy to test.

const escapeCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function repricingCsv(rows) {
  if (!Array.isArray(rows)) throw new Error("Repricing rows are required");
  const header = ["Item price", "Units", "Price change", "Net profit", "Net margin", "Profit per unit", "Profit change"];
  const body = rows.map((row) => [
    Number(row.price).toFixed(2),
    String(Number.isInteger(row.quantity) && row.quantity > 0 ? row.quantity : 1),
    `${row.offset > 0 ? "+" : ""}${row.offset}%`,
    Number(row.profit).toFixed(2),
    `${Number(row.margin).toFixed(1)}%`,
    Number(row.unitProfit).toFixed(2),
    Number(row.profitDelta).toFixed(2),
  ]);
  return [header, ...body].map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
