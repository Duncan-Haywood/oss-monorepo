// Pure calculation logic for the Quote Margin Check browser calculator. No
// DOM, no network, no state — mirrors ../../src/quote_margin.py's
// load_quote()/calculate() field-for-field so the browser tool and the CLI
// can never quietly disagree, and is unit tested directly.

const FIELDS = [
  "price",
  "delivery_hours",
  "admin_hours",
  "revision_hours",
  "overhead",
  "subcontractor_cost",
  "target_hourly_rate",
];

/**
 * Validates and normalizes raw quote input, matching load_quote() in
 * src/quote_margin.py. Throws Error with a human-readable message on
 * invalid input.
 *
 * The `typeof value === "boolean"` guard mirrors the Python side's
 * `isinstance(value, bool)` check: in both languages a boolean would
 * otherwise sail through the numeric test and silently score as 0 or 1.
 */
export function loadQuote(data) {
  const currencyRaw = data.currency === undefined ? "units" : data.currency;
  if (typeof currencyRaw !== "string" || !currencyRaw.trim() || currencyRaw.trim().length > 12) {
    throw new Error("currency must be a short non-empty label");
  }
  const currency = currencyRaw.trim();

  const values = {};
  for (const field of FIELDS) {
    const value = data[field] === undefined ? 0 : data[field];
    if (typeof value === "boolean" || typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a non-negative number`);
    }
    values[field] = value;
  }
  if (values.price <= 0) throw new Error("price must be greater than zero");
  if (values.delivery_hours <= 0) throw new Error("delivery_hours must be greater than zero");
  if (values.target_hourly_rate <= 0) throw new Error("target_hourly_rate must be greater than zero");

  return { currency, ...values };
}

/**
 * Derives the transparent margin report from a validated quote. Matches
 * calculate() in src/quote_margin.py exactly, including key names — the CSV
 * export below reuses them as its `measure` column, so they double as the
 * CLI's own spreadsheet vocabulary.
 */
export function calculate(quote) {
  const totalHours = quote.delivery_hours + quote.admin_hours + quote.revision_hours;
  const directCosts = quote.overhead + quote.subcontractor_cost;
  const effectiveHourlyRate = (quote.price - directCosts) / totalHours;
  const targetPrice = totalHours * quote.target_hourly_rate + directCosts;
  return {
    total_hours: totalHours,
    direct_costs: directCosts,
    effective_hourly_rate: effectiveHourlyRate,
    target_price: targetPrice,
    gap_to_target: quote.price - targetPrice,
    cost_coverage: quote.price - directCosts,
  };
}

/**
 * Renders the same measure/value/unit rows as the CLI's `--format csv`
 * output (csv_report() in src/quote_margin.py), so a result copied out of
 * the browser lands in a spreadsheet identically to one piped from the CLI.
 */
export function csvRows(quote, result) {
  return [
    "measure,value,unit",
    `quoted_price,${quote.price.toFixed(2)},${quote.currency}`,
    `total_working_hours,${result.total_hours.toFixed(2)},hours`,
    `direct_costs,${result.direct_costs.toFixed(2)},${quote.currency}`,
    `effective_hourly_rate,${result.effective_hourly_rate.toFixed(2)},${quote.currency}/hour`,
    `target_price,${result.target_price.toFixed(2)},${quote.currency}`,
    `gap_to_target,${result.gap_to_target.toFixed(2)},${quote.currency}`,
    `cost_coverage,${result.cost_coverage.toFixed(2)},${quote.currency}`,
  ].join("\n");
}
