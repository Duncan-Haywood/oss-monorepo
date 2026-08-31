// Portable Markdown review. Inputs and derived arithmetic only — no
// project names, client content, or pricing recommendation.

import { formatDecimal } from "./format.mjs";

export function markdownReview(quote, report, checks, options = {}) {
  const money = (value) => `${quote.currency} ${formatDecimal(value)}`;
  const overrun = options.overrunRows || [];
  const lines = [
    "# Quote Margin Review",
    "",
    `Generated: ${options.generatedAt || new Date().toISOString()}`,
    "",
    "## Supplied inputs",
    "",
    `- Quoted price: ${money(quote.price)}`,
    `- Delivery hours: ${formatDecimal(quote.delivery_hours)}`,
    `- Admin hours: ${formatDecimal(quote.admin_hours)}`,
    `- Revision hours: ${formatDecimal(quote.revision_hours)}`,
    `- Overhead cost: ${money(quote.overhead)}`,
    `- Subcontractor cost: ${money(quote.subcontractor_cost)}`,
    `- Target hourly rate: ${money(quote.target_hourly_rate)}`,
    `- Time buffer: ${formatDecimal(quote.time_buffer_percent)}%`,
    "",
    "## Derived arithmetic",
    "",
    `- Total working hours: ${formatDecimal(report.total_hours)}`,
    `- Direct costs: ${money(report.direct_costs)}`,
    `- Effective hourly rate: ${money(report.effective_hourly_rate)}/hour`,
    `- Price at target rate: ${money(report.target_price)}`,
    `- Gap to target price: ${money(report.gap_to_target)}`,
    `- Left after direct costs: ${money(report.cost_coverage)}`,
    `- Minimum increase to reach target: ${money(report.minimum_price_adjustment)}`,
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
      ...overrun.map((scenario) => `| +${scenario.percent}% | ${formatDecimal(scenario.total_hours)} | ${money(scenario.effective_hourly_rate)}/hour | ${money(scenario.gap_to_target)} |`),
      "",
    );
  }
  lines.push(
    "> Arithmetic comparison only. This report is not tax, financial, or business advice and does not determine whether a quote is profitable.",
    "",
  );
  return lines.join("\n");
}
