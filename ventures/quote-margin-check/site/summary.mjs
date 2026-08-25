// Formats a private, plain-text review note. Keeping this pure makes the
// download content testable without a browser or access to quote inputs.

export function reviewSummary(quote, report, checks) {
  return [
    "QUOTE MARGIN REVIEW",
    "Arithmetic comparison for the quote supplied by the user",
    "",
    `Quoted price: ${quote.currency} ${quote.price.toFixed(2)}`,
    `Total working hours: ${report.total_hours.toFixed(2)}`,
    `Direct costs: ${quote.currency} ${report.direct_costs.toFixed(2)}`,
    `Effective hourly rate: ${quote.currency} ${report.effective_hourly_rate.toFixed(2)}/hour`,
    `Supplied target hourly rate: ${quote.currency} ${quote.target_hourly_rate.toFixed(2)}/hour`,
    `Price at supplied target: ${quote.currency} ${report.target_price.toFixed(2)}`,
    `Gap to supplied target: ${quote.currency} ${report.gap_to_target.toFixed(2)}`,
    `Left after direct costs: ${quote.currency} ${report.cost_coverage.toFixed(2)}`,
    "",
    "Review observations:",
    ...checks.map((check) => `- ${check.title}: ${check.detail}`),
    "",
    "Assumptions: figures are supplied by the user; time overruns, taxes, payment fees, and other costs may change the result.",
    "This is not a profitability determination, pricing advice, tax advice, or financial advice. Review and verify before relying on it.",
  ].join("\n");
}
