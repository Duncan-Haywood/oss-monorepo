// Builds a plain-text handoff from user-supplied figures and derived arithmetic.
// The caller decides where to copy it; this module never accesses the clipboard.

export function buildReviewSummary(quote, report, checks) {
  const money = (value) => `${quote.currency} ${value.toFixed(2)}`;
  const observations = checks.map((check) => `- ${check.title}: ${check.detail}`);
  return [
    "Quote Margin Check review",
    "Arithmetic summary for manual review",
    "",
    `Quoted price: ${money(quote.price)}`,
    `Total working hours: ${report.total_hours.toFixed(2)}`,
    `Direct costs: ${money(report.direct_costs)}`,
    `Effective hourly rate: ${money(report.effective_hourly_rate)}/hour`,
    `Price at target rate: ${money(report.target_price)}`,
    `Gap to target price: ${money(report.gap_to_target)}`,
    `Left after direct costs: ${money(report.cost_coverage)}`,
    "",
    "Pre-send observations:",
    ...observations,
    "",
    "Review the scope, assumptions, and arithmetic before relying on this result.",
  ].join("\n");
}
