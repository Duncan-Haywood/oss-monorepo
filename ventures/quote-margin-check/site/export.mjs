/**
 * Serializes rows as RFC 4180-compatible CSV. Quote every cell containing a
 * delimiter, quote, or line break so pasted exports remain one row per record.
 */
export function toCsv(rows) {
  return rows
    .map((row) => row.map((cell) => {
      const value = String(cell);
      return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(","))
    .join("\n");
}

export function reportCsv(quote, report) {
  return toCsv([
    ["measure", "value", "unit"],
    ["quoted_price", quote.price.toFixed(2), quote.currency],
    ["total_working_hours", report.total_hours.toFixed(2), "hours"],
    ["direct_costs", report.direct_costs.toFixed(2), quote.currency],
    ["effective_hourly_rate", report.effective_hourly_rate.toFixed(2), `${quote.currency}/hour`],
    ["target_price", report.target_price.toFixed(2), quote.currency],
    ["gap_to_target", report.gap_to_target.toFixed(2), quote.currency],
    ["cost_coverage", report.cost_coverage.toFixed(2), quote.currency],
  ]);
}
