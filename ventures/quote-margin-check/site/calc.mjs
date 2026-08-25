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

/**
 * Shows how the same fixed price behaves if overhead and subcontractor
 * costs rise before work starts. Hours stay unchanged. Complements
 * overrunScenarios, which scale time and hold direct costs fixed.
 *
 * The 0% row is the quote as entered so the table can be read without
 * scrolling back to the main result.
 */
export function directCostSpikeScenarios(quote, report, percentages = [10, 25, 50]) {
  const percents = [0, ...percentages.filter((percent) => percent !== 0)];
  return percents.map((percent) => {
    const direct_costs = report.direct_costs * (1 + percent / 100);
    const effective_hourly_rate = (quote.price - direct_costs) / report.total_hours;
    const target_price = report.total_hours * quote.target_hourly_rate + direct_costs;
    const gap_to_target = quote.price - target_price;
    return {
      percent,
      direct_costs,
      effective_hourly_rate,
      target_price,
      gap_to_target,
      extra_gap: gap_to_target - report.gap_to_target,
      cost_coverage: quote.price - direct_costs,
    };
  });
}

/** One-line arithmetic observation for the default +25% cost-rise row. */
export function directCostSpikeSummary(quote, report, rows = directCostSpikeScenarios(quote, report)) {
  if (report.direct_costs === 0) {
    return "No overhead or subcontractor cost is entered, so a cost rise does not change these figures.";
  }
  const asQuoted = rows.find((row) => row.percent === 0) ?? rows[0];
  const spike = rows.find((row) => row.percent === 25) ?? rows[rows.length - 1];
  const currency = quote.currency;
  return (
    `If overhead and subcontractors rise ${spike.percent}% before you start, ` +
    `the effective rate falls from ${currency} ${asQuoted.effective_hourly_rate.toFixed(2)} ` +
    `to ${currency} ${spike.effective_hourly_rate.toFixed(2)}/hour, and you would need ` +
    `${currency} ${spike.target_price.toFixed(2)} instead of ${currency} ${quote.price.toFixed(2)} ` +
    `to hold ${currency} ${quote.target_hourly_rate.toFixed(2)}/hour.`
  );
}
