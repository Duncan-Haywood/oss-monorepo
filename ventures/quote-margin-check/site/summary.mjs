// Formats a private, paste-ready review record. It contains only the quote
// values already visible to the user and derived arithmetic from the report.

function money(currency, value) {
  return `${currency} ${value.toFixed(2)}`;
}

export function formatReviewSummary(quote, report, checks, reviewedAt = new Date()) {
  const date = reviewedAt.toISOString().slice(0, 10);
  const flags = checks
    .filter((check) => check.level === "attention")
    .map((check) => `- ${check.title}: ${check.detail}`);

  return [
    "# Quote review",
    `Reviewed: ${date}`,
    "",
    "## Supplied quote",
    `- Currency: ${quote.currency}`,
    `- Quoted price: ${money(quote.currency, quote.price)}`,
    `- Delivery hours: ${quote.delivery_hours.toFixed(2)}`,
    `- Admin hours: ${quote.admin_hours.toFixed(2)}`,
    `- Revision hours: ${quote.revision_hours.toFixed(2)}`,
    `- Overhead cost: ${money(quote.currency, quote.overhead)}`,
    `- Subcontractor cost: ${money(quote.currency, quote.subcontractor_cost)}`,
    `- Target hourly rate: ${money(quote.currency, quote.target_hourly_rate)}`,
    "",
    "## Arithmetic result",
    `- Total working hours: ${report.total_hours.toFixed(2)}`,
    `- Direct costs: ${money(quote.currency, report.direct_costs)}`,
    `- Effective hourly rate: ${money(quote.currency, report.effective_hourly_rate)}/hour`,
    `- Price at target rate: ${money(quote.currency, report.target_price)}`,
    `- Gap to target price: ${money(quote.currency, report.gap_to_target)}`,
    `- Left after direct costs: ${money(quote.currency, report.cost_coverage)}`,
    "",
    "## Before sending",
    ...(flags.length ? flags : ["- No attention flags from these inputs."]),
    "",
    "Arithmetic comparison only. Review the scope, assumptions, and figures before relying on this record.",
  ].join("\n");
}
