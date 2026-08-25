/** Quote one CSV cell when it contains syntax-significant characters. */
export function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function quoteReportCsv(quote, report) {
  const rows = [
    ["measure", "value", "unit"],
    ["quoted_price", quote.price.toFixed(2), quote.currency],
    ["total_working_hours", report.total_hours.toFixed(2), "hours"],
    ["direct_costs", report.direct_costs.toFixed(2), quote.currency],
    ["effective_hourly_rate", report.effective_hourly_rate.toFixed(2), `${quote.currency}/hour`],
    ["target_price", report.target_price.toFixed(2), quote.currency],
    ["gap_to_target", report.gap_to_target.toFixed(2), quote.currency],
    ["cost_coverage", report.cost_coverage.toFixed(2), quote.currency],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
