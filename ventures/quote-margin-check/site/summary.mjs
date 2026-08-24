// Creates a plain-text review that a freelancer can paste into a proposal
// thread. It reports supplied assumptions and arithmetic observations without
// turning them into pricing or profitability advice.
export function quoteSummary(quote, report, scenarios) {
  const status = report.gap_to_target >= 0 ? "Above supplied target" : "Below supplied target";
  return [
    "Quote margin review",
    `Quoted price: ${quote.currency} ${quote.price.toFixed(2)}`,
    `Total working hours: ${report.total_hours.toFixed(2)} (delivery ${quote.delivery_hours.toFixed(2)}, admin ${quote.admin_hours.toFixed(2)}, revisions ${quote.revision_hours.toFixed(2)})`,
    `Direct costs: ${quote.currency} ${report.direct_costs.toFixed(2)} (overhead ${quote.overhead.toFixed(2)}, subcontractor ${quote.subcontractor_cost.toFixed(2)})`,
    `Effective hourly rate: ${quote.currency} ${report.effective_hourly_rate.toFixed(2)}/hour`,
    `Price at supplied target rate: ${quote.currency} ${report.target_price.toFixed(2)}`,
    `Gap to supplied target: ${quote.currency} ${report.gap_to_target.toFixed(2)}`,
    `Arithmetic status: ${status}`,
    "",
    "Time-overrun scenarios (not a prediction):",
    ...scenarios.map((scenario) => `+${scenario.percent}% time: ${scenario.total_hours.toFixed(2)} hours, ${quote.currency} ${scenario.effective_hourly_rate.toFixed(2)}/hour, gap ${quote.currency} ${scenario.gap_to_target.toFixed(2)}`),
    "",
    "Review the scope, assumptions, and arithmetic before relying on this summary. It is not financial or business advice.",
  ].join("\n");
}
