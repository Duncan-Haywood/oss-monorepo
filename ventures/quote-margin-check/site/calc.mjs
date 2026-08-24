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

/** Shows how the supplied quote behaves if the work takes longer than planned. */
export function overrunScenarios(quote, report, percentages = [10, 25, 50]) {
  return percentages.map((percent) => {
    const hours = report.total_hours * (1 + percent / 100);
    return {
      percent,
      total_hours: hours,
      effective_hourly_rate: (quote.price - report.direct_costs) / hours,
      gap_to_target: quote.price - (hours * quote.target_hourly_rate + report.direct_costs),
    };
  });
}

/** Calculates the price floor for additional scope at the quote's target rate. */
export function changeOrderPrice(quote, extraHours, extraDirectCosts = 0) {
  if (typeof extraHours !== "number" || !Number.isFinite(extraHours) || extraHours < 0) {
    throw new Error("extraHours must be a non-negative number");
  }
  if (typeof extraDirectCosts !== "number" || !Number.isFinite(extraDirectCosts) || extraDirectCosts < 0) {
    throw new Error("extraDirectCosts must be a non-negative number");
  }
  return {
    extra_hours: extraHours,
    extra_direct_costs: extraDirectCosts,
    target_price: extraHours * quote.target_hourly_rate + extraDirectCosts,
    effective_hourly_rate: extraHours === 0 ? null : (extraHours * quote.target_hourly_rate) / extraHours,
  };
}
