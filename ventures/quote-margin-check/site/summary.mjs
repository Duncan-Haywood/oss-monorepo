// Copy-ready handoff text for a quote review. It reports arithmetic from the
// supplied inputs without turning the result into pricing or profitability advice.

export function quoteSummary(quote, report) {
  const status = report.gap_to_target >= 0 ? "above" : "below";
  const gap = Math.abs(report.gap_to_target).toFixed(2);
  const hiddenHours = (quote.admin_hours + quote.revision_hours).toFixed(2);

  return [
    "Quote margin review",
    `Status: ${status} the supplied target price (arithmetic comparison only)`,
    `Quoted price: ${quote.currency} ${quote.price.toFixed(2)}`,
    `Effective hourly rate: ${quote.currency} ${report.effective_hourly_rate.toFixed(2)}/hour`,
    `Target hourly rate: ${quote.currency} ${quote.target_hourly_rate.toFixed(2)}/hour`,
    `Total working hours: ${report.total_hours.toFixed(2)} (${hiddenHours} admin/revision hours)`,
    `Direct costs: ${quote.currency} ${report.direct_costs.toFixed(2)}`,
    `Target price gap: ${quote.currency} ${report.gap_to_target.toFixed(2)} (${gap} ${quote.currency} ${status} target)`,
    "Arithmetic only, not tax, financial, or business advice. Review and verify every assumption before relying on this output.",
  ].join("\n");
}
