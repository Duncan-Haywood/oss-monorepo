// CSV formatting for the browser export. Keep this separate from the DOM so
// spreadsheet handoffs can be tested without a browser.

function safeText(value) {
  const text = String(value);
  // Currency labels are user-controlled text. Prevent common spreadsheet
  // programs from interpreting a label as a formula when it is pasted.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvCell(value, { text = false } = {}) {
  const content = text ? safeText(value) : String(value);
  return /[",\n\r]/.test(content) ? `"${content.replaceAll('"', '""')}"` : content;
}

export function buildReportCsv(quote, report) {
  const currency = (value) => csvCell(value, { text: true });
  return [
    ["measure", "value", "unit"],
    ["quoted_price", quote.price.toFixed(2), currency(quote.currency)],
    ["total_working_hours", report.total_hours.toFixed(2), "hours"],
    ["direct_costs", report.direct_costs.toFixed(2), currency(quote.currency)],
    ["effective_hourly_rate", report.effective_hourly_rate.toFixed(2), csvCell(`${quote.currency}/hour`, { text: true })],
    ["target_price", report.target_price.toFixed(2), currency(quote.currency)],
    ["gap_to_target", report.gap_to_target.toFixed(2), currency(quote.currency)],
    ["cost_coverage", report.cost_coverage.toFixed(2), currency(quote.currency)],
  ].map((row) => row.join(",")).join("\n");
}
