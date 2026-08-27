// CSV export for a calculated comparison. This module accepts derived results,
// not saved inputs, so it cannot accidentally include local usage data.

const HEADERS = [
  "rank",
  "channel",
  "price",
  "fees",
  "profit",
  "expected_profit",
  "return_drag",
  "margin_percent",
  "return_on_cash_percent",
  "monthly_profit",
  "days_to_sell",
  "profit_per_day",
  "monthly_profit_at_velocity",
  "break_even_price",
  "orders_to_cover_plan",
  "price_to_match_best",
];

function escapeCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

function percent(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "";
}

function count(value) {
  return Number.isFinite(value) ? String(value) : "";
}

export function comparisonCsv(comparison) {
  if (!comparison || !Array.isArray(comparison.results)) {
    throw new Error("A calculated comparison is required");
  }
  const rows = comparison.results
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((result) => [
      result.rank,
      result.label,
      money(result.price),
      money(result.feeTotal),
      money(result.profit),
      money(result.expectedProfit),
      money(result.returnDrag),
      percent(result.margin),
      percent(result.roi),
      money(result.monthlyProfit),
      count(result.daysToSell),
      money(result.profitPerDay),
      money(result.monthlyProfitAtVelocity),
      money(result.breakEvenPrice),
      count(result.ordersToCoverPlan),
      money(result.priceToMatchBest),
    ]);
  return [HEADERS, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n") + "\n";
}
