// Pure calculation logic for the Quote Margin Check browser calculator. No
// DOM, no network, no state — mirrors ../src/quote_margin.py's calculate()
// exactly so the browser and CLI never disagree, and is unit tested directly.

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
 * Validates and normalizes raw quote input, matching src/quote_margin.py's
 * load_quote(). Throws Error with a human-readable message on invalid input.
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

/** Derives the transparent margin report from a validated quote. Matches calculate() in src/quote_margin.py. */
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

/** Quote a CSV field the way Python csv.writer (QUOTE_MINIMAL) does. */
function csvField(value) {
  const field = String(value);
  if (/[",\r\n]/.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

/**
 * Spreadsheet-friendly measure/value/unit rows. Matches csv_report() in
 * src/quote_margin.py, including QUOTE_MINIMAL quoting of the currency label.
 */
export function csvRows(quote, result) {
  const rows = [
    ["measure", "value", "unit"],
    ["quoted_price", quote.price.toFixed(2), quote.currency],
    ["total_working_hours", result.total_hours.toFixed(2), "hours"],
    ["direct_costs", result.direct_costs.toFixed(2), quote.currency],
    ["effective_hourly_rate", result.effective_hourly_rate.toFixed(2), `${quote.currency}/hour`],
    ["target_price", result.target_price.toFixed(2), quote.currency],
    ["gap_to_target", result.gap_to_target.toFixed(2), quote.currency],
    ["cost_coverage", result.cost_coverage.toFixed(2), quote.currency],
  ];
  return rows.map((row) => row.map(csvField).join(",")).join("\n");
}
