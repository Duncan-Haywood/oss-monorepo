// Plain-text handoff for a quote review. It contains supplied figures and
// derived arithmetic, but deliberately avoids presenting a profitability or
// pricing recommendation.

export function formatReviewSummary(quote, report, checks, decision = null, extras = {}) {
  const money = (value) => `${quote.currency} ${value.toFixed(2)}`;
  const flags = checks
    .filter((check) => check.level === "attention")
    .map((check) => `- ${check.title}: ${check.detail}`);
  const nextStep = decision?.title
    ? [`Next-step prompt: ${decision.title}`, ""]
    : [];
  const overrunRows = Array.isArray(extras.overrunRows) ? extras.overrunRows : [];
  const overrun = overrunRows.length
    ? [
        "Time-overrun scenarios (not a prediction):",
        ...overrunRows.map((scenario) => `+${scenario.percent}% time: ${scenario.total_hours.toFixed(2)} hours, ${money(scenario.effective_hourly_rate)}/hour, gap ${money(scenario.gap_to_target)}`),
        "",
      ]
    : [];

  return [
    "QUOTE MARGIN CHECK",
    "Arithmetic review for discussion, not pricing or financial advice.",
    ...nextStep,
    `Quoted price: ${money(quote.price)}`,
    `Total working hours: ${report.total_hours.toFixed(2)} (${report.hidden_hours.toFixed(2)} admin/revision hours)`,
    `Direct costs: ${money(report.direct_costs)}`,
    `Effective hourly rate: ${money(report.effective_hourly_rate)}/hour`,
    `Target hourly rate supplied: ${money(quote.target_hourly_rate)}/hour`,
    `Price at target rate: ${money(report.target_price)}`,
    `Gap to target price: ${money(report.gap_to_target)}`,
    `Left after direct costs: ${money(report.cost_coverage)}`,
    `Minimum increase to reach target: ${money(report.minimum_price_adjustment)}`,
    "",
    ...overrun,
    "Review observations:",
    ...(flags.length ? flags : ["- No arithmetic attention flags from these inputs."]),
    "",
    "Review the scope, assumptions, and arithmetic before relying on this output.",
  ].join("\n");
}
