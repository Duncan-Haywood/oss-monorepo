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

/**
 * Shows how the same hours and direct costs behave if the client asks
 * for a percent off the quoted price. Complements overrunScenarios
 * (time moves) and directCostSpikeScenarios (costs move). The 0% row
 * is the quote as entered.
 *
 * hours_at_target is the work that still pays the supplied target rate
 * after the discount. hours_to_cut is how much scope has to leave for
 * that rate to hold. Both are null when the discounted price no longer
 * covers direct costs — cutting hours cannot fix that.
 */
export function discountAskScenarios(quote, report, percentages = [5, 10, 15, 20]) {
  const percents = [0, ...percentages.filter((percent) => percent !== 0)];
  return percents.map((percent) => {
    const discounted_price = quote.price * (1 - percent / 100);
    const cost_coverage = discounted_price - report.direct_costs;
    const effective_hourly_rate = cost_coverage / report.total_hours;
    const gap_to_target = discounted_price - report.target_price;
    const coversCosts = cost_coverage > 0;
    const hours_at_target = coversCosts ? cost_coverage / quote.target_hourly_rate : null;
    const rawCut = coversCosts ? report.total_hours - hours_at_target : null;
    const hours_to_cut = rawCut === null ? null : Math.max(0, rawCut);
    return {
      percent,
      discounted_price,
      cost_coverage,
      effective_hourly_rate,
      gap_to_target,
      extra_gap: gap_to_target - report.gap_to_target,
      hours_at_target,
      hours_to_cut,
    };
  });
}

/** One-line arithmetic observation for the default 10% discount-ask row. */
export function discountAskSummary(quote, report, rows = discountAskScenarios(quote, report)) {
  const asQuoted = rows.find((row) => row.percent === 0) ?? rows[0];
  const ask = rows.find((row) => row.percent === 10) ?? rows.find((row) => row.percent > 0) ?? rows[rows.length - 1];
  const currency = quote.currency;
  if (ask.percent === 0) {
    return "No discount percent is compared, so the table is the quote as typed.";
  }
  if (ask.cost_coverage <= 0) {
    return (
      `If they take ${ask.percent}% off, the price is ${currency} ${ask.discounted_price.toFixed(2)} — ` +
      `that no longer covers ${currency} ${report.direct_costs.toFixed(2)} of direct costs, ` +
      `so cutting hours cannot hold the target rate.`
    );
  }
  if ((ask.hours_to_cut ?? 0) < 1e-9) {
    return (
      `If they take ${ask.percent}% off, the price is ${currency} ${ask.discounted_price.toFixed(2)} ` +
      `and the effective rate falls from ${currency} ${asQuoted.effective_hourly_rate.toFixed(2)} ` +
      `to ${currency} ${ask.effective_hourly_rate.toFixed(2)}/hour. That still covers ` +
      `${currency} ${quote.target_hourly_rate.toFixed(2)}/hour; no scope cut is required to hold it.`
    );
  }
  return (
    `If they take ${ask.percent}% off, the price is ${currency} ${ask.discounted_price.toFixed(2)} ` +
    `and the effective rate falls from ${currency} ${asQuoted.effective_hourly_rate.toFixed(2)} ` +
    `to ${currency} ${ask.effective_hourly_rate.toFixed(2)}/hour. Holding ` +
    `${currency} ${quote.target_hourly_rate.toFixed(2)}/hour would take cutting ` +
    `${ask.hours_to_cut.toFixed(2)} hours of scope (${ask.hours_at_target.toFixed(2)} hours of work left).`
  );
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
