// Transparent pre-send observations for a quote. These are not pricing advice
// or a profitability determination; they point back to the supplied figures.

export function reviewQuote(quote, report) {
  const checks = [];
  const hiddenHours = quote.admin_hours + quote.revision_hours;

  if (report.direct_costs > quote.price) {
    checks.push({ level: "attention", title: "Direct costs exceed the quoted price", detail: `The supplied direct costs are ${quote.currency} ${report.direct_costs.toFixed(2)} against ${quote.currency} ${quote.price.toFixed(2)}.` });
  }
  if (report.gap_to_target < 0) {
    checks.push({ level: "attention", title: "The quote is below the supplied target", detail: `The arithmetic gap is ${quote.currency} ${Math.abs(report.gap_to_target).toFixed(2)} below the target price.` });
  }
  if (hiddenHours > 0) {
    checks.push({ level: "note", title: "Hidden time is included", detail: `${hiddenHours.toFixed(2)} hours of admin and revisions are included in the effective rate.` });
  }
  if (quote.revision_hours === 0) {
    checks.push({ level: "note", title: "No revision hours are included", detail: "Confirm that the quote scope and revision assumptions match the work you expect to deliver." });
  }
  if (!checks.some((check) => check.level === "attention")) {
    checks.push({ level: "clear", title: "No review flags from these inputs", detail: "Review the scope, assumptions, and arithmetic before relying on this result." });
  }
  return checks;
}

/** Formats a short, proposal-ready review without including private project details. */
export function proposalSummary(quote, report) {
  const above = report.gap_to_target >= 0;
  const observations = reviewQuote(quote, report)
    .filter((check) => check.level === "attention")
    .map((check) => `- ${check.title}: ${check.detail}`);

  return [
    "QUOTE MARGIN REVIEW",
    "Arithmetic comparison for the supplied quote; review before relying on it.",
    "",
    `Quoted price: ${quote.currency} ${quote.price.toFixed(2)}`,
    `Total working hours: ${report.total_hours.toFixed(2)}`,
    `Direct costs: ${quote.currency} ${report.direct_costs.toFixed(2)}`,
    `Effective hourly rate: ${quote.currency} ${report.effective_hourly_rate.toFixed(2)}/hour`,
    `Price at supplied target rate: ${quote.currency} ${report.target_price.toFixed(2)}`,
    `Gap to target price: ${quote.currency} ${report.gap_to_target.toFixed(2)}`,
    `Comparison: ${above ? "above" : "below"} the supplied target (not a profitability verdict)`,
    "",
    "Review observations:",
    ...(observations.length ? observations : ["- No attention flags from these inputs."]),
    "",
    "Verify the scope, assumptions, costs, and arithmetic before sending the quote.",
  ].join("\n");
}
