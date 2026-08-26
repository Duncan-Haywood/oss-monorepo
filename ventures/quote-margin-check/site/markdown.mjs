// Portable Markdown review. Inputs and derived arithmetic only — no
// project names, client content, or pricing recommendation.

export function markdownReview(quote, report, checks, options = {}) {
  const money = (value) => `${quote.currency} ${value.toFixed(2)}`;
  const overrun = options.overrunRows || [];
  const lines = [
    "# Quote Margin Review",
    "",
    `Generated: ${options.generatedAt || new Date().toISOString()}`,
    "",
    "## Supplied inputs",
    "",
    `- Quoted price: ${money(quote.price)}`,
    `- Delivery hours: ${quote.delivery_hours.toFixed(2)}`,
    `- Admin hours: ${quote.admin_hours.toFixed(2)}`,
    `- Revision hours: ${quote.revision_hours.toFixed(2)}`,
    `- Overhead cost: ${money(quote.overhead)}`,
    `- Subcontractor cost: ${money(quote.subcontractor_cost)}`,
    `- Target hourly rate: ${money(quote.target_hourly_rate)}`,
    "",
    "## Derived arithmetic",
    "",
    `- Total working hours: ${report.total_hours.toFixed(2)}`,
    `- Direct costs: ${money(report.direct_costs)}`,
    `- Effective hourly rate: ${money(report.effective_hourly_rate)}/hour`,
    `- Price at target rate: ${money(report.target_price)}`,
    `- Gap to target price: ${money(report.gap_to_target)}`,
    `- Left after direct costs: ${money(report.cost_coverage)}`,
    "",
    "## Pre-send observations",
    "",
    ...checks.map((check) => `- **${check.title}:** ${check.detail}`),
    "",
  ];
  if (overrun.length) {
    lines.push(
      "## Time-overrun scenarios",
      "",
      "| Extra time | Total hours | Effective rate | Gap to target |",
      "| --- | ---: | ---: | ---: |",
      ...overrun.map((scenario) => `| +${scenario.percent}% | ${scenario.total_hours.toFixed(2)} | ${money(scenario.effective_hourly_rate)}/hour | ${money(scenario.gap_to_target)} |`),
      "",
    );
  }
  lines.push(
    "> Arithmetic comparison only. This report is not tax, financial, or business advice and does not determine whether a quote is profitable.",
    "",
  );
  return lines.join("\n");
}
