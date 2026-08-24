// Pure calculation logic, ported 1:1 from src/quote_margin.py so the CLI and
// the browser tool can never quietly diverge. No advice, no recommendation —
// arithmetic only.

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
 * src/quote_margin.py. Throws Error with a message on invalid input.
 */
export function loadQuote(data) {
  const currencyRaw = data.currency === undefined ? "units" : data.currency;
  if (typeof currencyRaw !== "string" || !currencyRaw.trim() || currencyRaw.trim().length > 12) {
    throw new Error("currency must be a short non-empty label");
  }
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
  return { currency: currencyRaw.trim(), ...values };
}

/** Matches calculate() in src/quote_margin.py exactly. */
export function calculate(quote) {
  const totalHours = quote.delivery_hours + quote.admin_hours + quote.revision_hours;
  const directCosts = quote.overhead + quote.subcontractor_cost;
  const effectiveRate = (quote.price - directCosts) / totalHours;
  const targetPrice = totalHours * quote.target_hourly_rate + directCosts;
  return {
    total_hours: totalHours,
    direct_costs: directCosts,
    effective_hourly_rate: effectiveRate,
    target_price: targetPrice,
    gap_to_target: quote.price - targetPrice,
    cost_coverage: quote.price - directCosts,
  };
}
