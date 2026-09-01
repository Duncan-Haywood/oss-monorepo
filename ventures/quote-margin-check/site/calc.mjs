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
  "time_buffer_percent",
];

// Editable starting points, not pricing recommendations.
export const QUOTE_PRESETS = {
  website: { label: "Website project", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 },
  brand: { label: "Brand identity", price: 1800, delivery_hours: 18, admin_hours: 4, revision_hours: 5, overhead: 90, subcontractor_cost: 0, target_hourly_rate: 80 },
  consulting: { label: "Consulting engagement", price: 1500, delivery_hours: 12, admin_hours: 3, revision_hours: 2, overhead: 40, subcontractor_cost: 0, target_hourly_rate: 100 },
};

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
  const bufferedHours = totalHours * (1 + quote.time_buffer_percent / 100);
  const bufferedTargetPrice = bufferedHours * quote.target_hourly_rate + directCosts;
  const hiddenHours = quote.admin_hours + quote.revision_hours;
  const targetRateHours = (quote.price - directCosts) / quote.target_hourly_rate;
  return {
    total_hours: totalHours,
    direct_costs: directCosts,
    effective_hourly_rate: effectiveHourlyRate,
    target_price: targetPrice,
    break_even_price: directCosts,
    buffered_hours: bufferedHours,
    buffered_target_price: bufferedTargetPrice,
    gap_to_target: quote.price - targetPrice,
    cost_coverage: quote.price - directCosts,
    discount_room: Math.max(0, quote.price - targetPrice),
    minimum_price_adjustment: Math.max(0, targetPrice - quote.price),
    delivery_hours: quote.delivery_hours,
    hidden_hours: hiddenHours,
    hidden_time_percent: (hiddenHours / totalHours) * 100,
    target_rate_hours: targetRateHours,
    hours_cushion: targetRateHours - totalHours,
  };
}

/**
 * The panel inputs a link carries beside the quote itself.
 *
 * These are not part of `Quote`, deliberately. `FIELDS` mirrors
 * `src/quote_margin.py`'s `load_quote()` field-for-field so the two
 * implementations cannot disagree about what a quote is, and widening that
 * model to carry browser-panel state would break the mirror for no gain.
 *
 * But they are still the visitor's numbers, and leaving them out of the link
 * was a real defect: the "what if the scope grows" and "should I take the kill
 * fee" panels both render an answer, and a recipient opening a shared link got
 * the sender's quote underneath *the page's shipped defaults* for both. The
 * page then told them, in as many words, whether to take a kill fee of 360 on
 * 14 hours already spent — figures the sender never entered and never saw.
 * Nothing on either screen said the two disagreed.
 *
 * The page already treats these as state worth keeping: `draftFields` in
 * `index.html` is `[...ids, ...killIds]`, so a local draft has always restored
 * them. It was only the link that did not, which is the same allowlist drift
 * that dropped `quantity` on `where-to-sell-calculator` and two whole panels on
 * `shopify-fee-calculator`.
 *
 * Kept as its own list rather than folded into `FIELDS` so the boundary stays
 * legible: `FIELDS` is the shared model, this is the page's own surface.
 */
export const PANEL_FIELDS = [
  "extra-hours",
  "extra-direct-costs",
  "hours_done",
  "already_paid",
  "kill_fee",
  "sunk_costs",
];

/**
 * Encodes validated inputs for a serverless, shareable URL.
 *
 * `panels` is optional so every existing caller — and every link already in
 * somebody's inbox — keeps working unchanged.
 */
export function encodeQuote(quote, panels) {
  const params = new URLSearchParams();
  params.set("currency", quote.currency);
  for (const field of FIELDS) params.set(field, String(quote[field]));
  if (panels && typeof panels === "object") {
    for (const field of PANEL_FIELDS) {
      const value = panels[field];
      // Only real, sendable numbers. A blank or a NaN would arrive as the
      // string "NaN" and land in a number input as an empty box, which reads
      // to the recipient as a field the sender cleared rather than one that
      // was never carried.
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      params.set(field, String(value));
    }
  }
  return params.toString();
}

/** Reads a URL query string or fragment and validates it through the same input boundary. */
export function decodeQuote(search) {
  const params = new URLSearchParams(search.replace(/^[?#]/, ""));
  if (!params.has("price") || !params.has("delivery_hours") || !params.has("target_hourly_rate")) {
    return null;
  }
  const data = { currency: params.get("currency") ?? undefined };
  for (const field of FIELDS) {
    if (params.has(field)) data[field] = Number(params.get(field));
  }
  return loadQuote(data);
}

/**
 * The panel values out of a link, or `{}` when it carries none.
 *
 * Separate from `decodeQuote` because the two have different failure rules. A
 * malformed quote is not openable at all and `decodeQuote` returns null; a
 * malformed panel value is just one field this link cannot restore, and the
 * rest of the bid is still worth showing. So this drops bad entries
 * individually rather than refusing the link.
 *
 * Validated rather than trusted, for the reason `decodeQuote` is: a fragment is
 * the one part of this page a stranger writes. Anything not a finite,
 * non-negative number never reaches an input.
 */
export function decodePanels(search) {
  const out = {};
  if (typeof search !== "string") return out;
  const params = new URLSearchParams(search.replace(/^[?#]/, ""));
  for (const field of PANEL_FIELDS) {
    if (!params.has(field)) continue;
    const value = Number(params.get(field));
    if (!Number.isFinite(value) || value < 0) continue;
    out[field] = value;
  }
  return out;
}

/** Breaks the target price into the inputs that produced it. */
export function targetPriceBreakdown(quote) {
  const hiddenHours = quote.admin_hours + quote.revision_hours;
  return {
    delivery_labor: quote.delivery_hours * quote.target_hourly_rate,
    hidden_time_labor: hiddenHours * quote.target_hourly_rate,
    direct_costs: quote.overhead + quote.subcontractor_cost,
    total: (quote.delivery_hours + hiddenHours) * quote.target_hourly_rate
      + quote.overhead + quote.subcontractor_cost,
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

/** Maximum total hours that still reaches the supplied target rate. */
export function targetHoursBudget(quote, report) {
  return report.target_rate_hours ?? (quote.price - report.direct_costs) / quote.target_hourly_rate;
}

/** Compares the quote price needed at nearby hourly targets. */
export function targetRateLadder(quote, report, rates = [50, 75, 100, 125]) {
  return rates.map((rate) => ({
    hourly_rate: rate,
    target_price: report.total_hours * rate + report.direct_costs,
    difference_from_quote: report.total_hours * rate + report.direct_costs - quote.price,
  }));
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

function requireNonNegativeNumber(name, value, fallback = 0) {
  const raw = value === undefined ? fallback : value;
  if (typeof raw === "boolean" || typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return raw;
}

/**
 * Validates the mid-project cancel inputs used by compareKillFee.
 * Hours already spent cannot exceed the quote's working hours; cash
 * already collected cannot exceed the quoted price; sunk costs cannot
 * exceed the quote's direct costs.
 */
export function loadKillFeeProgress(data, quote, report) {
  const hours_done = requireNonNegativeNumber("hours_done", data.hours_done);
  const already_paid = requireNonNegativeNumber("already_paid", data.already_paid);
  const kill_fee = requireNonNegativeNumber("kill_fee", data.kill_fee);
  const sunk_costs = requireNonNegativeNumber("sunk_costs", data.sunk_costs);
  if (hours_done > report.total_hours) {
    throw new Error("hours_done cannot exceed total working hours");
  }
  if (already_paid > quote.price) {
    throw new Error("already_paid cannot exceed the quoted price");
  }
  if (sunk_costs > report.direct_costs) {
    throw new Error("sunk_costs cannot exceed direct costs");
  }
  return { hours_done, already_paid, kill_fee, sunk_costs };
}

function pickWinner(rows, key) {
  return rows.reduce((best, row) => (row[key] > best[key] ? row : best)).id;
}

/**
 * Compares finishing the remaining work with taking a kill fee or
 * walking with only what is already paid. Direct costs already spent
 * stay sunk on every path; uncommitted remaining costs are avoided if
 * you stop. The refill columns value freed hours at the supplied
 * target rate so an empty calendar and a booked calendar are visible
 * as two different arithmetic results — not a forecast of other work.
 */
export function compareKillFee(quote, report, progress) {
  const remaining_hours = report.total_hours - progress.hours_done;
  const remaining_invoice = quote.price - progress.already_paid;
  const remaining_costs = report.direct_costs - progress.sunk_costs;
  const finish_cash = quote.price - report.direct_costs;
  const net_from_here = remaining_invoice - remaining_costs;
  const rate_from_here = remaining_hours > 0 ? net_from_here / remaining_hours : null;
  const refill_value = remaining_hours * quote.target_hourly_rate;

  function path(id, cash_kept, hours_freed) {
    const refill_adjusted = cash_kept + (id === "finish" ? 0 : refill_value);
    return {
      id,
      cash_kept,
      vs_finish: cash_kept - finish_cash,
      hours_freed,
      refill_value: id === "finish" ? 0 : refill_value,
      refill_adjusted,
      refill_vs_finish: refill_adjusted - finish_cash,
    };
  }

  const finish = {
    ...path("finish", finish_cash, 0),
    hours_still_worked: remaining_hours,
    net_from_here,
    rate_from_here,
  };
  const kill = path("kill", progress.already_paid + progress.kill_fee - progress.sunk_costs, remaining_hours);
  const walk = path("walk", progress.already_paid - progress.sunk_costs, remaining_hours);
  const rows = [finish, kill, walk];
  return {
    remaining_hours,
    remaining_invoice,
    remaining_costs,
    finish,
    kill,
    walk,
    cash_winner: pickWinner(rows, "cash_kept"),
    refill_winner: pickWinner(rows, "refill_adjusted"),
  };
}

/** One-line arithmetic observation for the default mid-project cancel. */
export function killFeeSummary(quote, report, progress, compared = compareKillFee(quote, report, progress)) {
  const currency = quote.currency;
  const finishCash = `${currency} ${compared.finish.cash_kept.toFixed(2)}`;
  const killCash = `${currency} ${compared.kill.cash_kept.toFixed(2)}`;
  const gap = Math.abs(compared.kill.vs_finish);
  const gapCash = `${currency} ${gap.toFixed(2)}`;
  if (compared.remaining_hours < 1e-9) {
    return (
      `No hours remain, so the table is leftover cash: finishing still collects ` +
      `${currency} ${compared.remaining_invoice.toFixed(2)} and keeps ${finishCash}; ` +
      `the kill fee keeps ${killCash}.`
    );
  }
  const rate =
    compared.finish.rate_from_here === null
      ? ""
      : ` Finishing the remaining ${compared.remaining_hours.toFixed(2)} hours pays ` +
        `${currency} ${compared.finish.net_from_here.toFixed(2)} from here ` +
        `(${currency} ${compared.finish.rate_from_here.toFixed(2)}/hour).`;
  const refillGap = Math.abs(compared.kill.refill_vs_finish);
  if (compared.kill.vs_finish > 0) {
    return (
      `The kill fee keeps ${killCash} — ${gapCash} more cash than finishing (${finishCash}).` +
      rate
    );
  }
  if (compared.kill.vs_finish < 0 && compared.kill.refill_vs_finish > 0) {
    return (
      `Finishing keeps ${finishCash} — ${gapCash} more cash than the kill fee (${killCash}).` +
      rate +
      ` Booking the ${compared.remaining_hours.toFixed(2)} freed hours at ` +
      `${currency} ${quote.target_hourly_rate.toFixed(2)}/hour would make the kill fee ` +
      `${currency} ${refillGap.toFixed(2)} ahead of finishing.`
    );
  }
  if (compared.kill.vs_finish < 0) {
    return (
      `Finishing keeps ${finishCash} — ${gapCash} more cash than the kill fee (${killCash}).` +
      rate +
      ` Booking the freed hours at the target rate still leaves finishing ahead.`
    );
  }
  return (
    `Finishing and the kill fee keep the same ${finishCash}.` +
    rate
  );
}

/**
 * Side-by-side billing-model comparison at the same hours and direct costs.
 *
 * Fixed keeps the quoted price (you eat extra hours). Hourly bills those
 * hours at the supplied target rate plus the same direct costs (the client
 * pays the extra hours). Planned hours (0%) is included so the table answers
 * "is this fixed quote already a discount vs hourly?" not only the overrun
 * case already covered by overrunScenarios().
 */
export function compareBillingModels(quote, report, percentages = [0, 10, 25, 50]) {
  return percentages.map((percent) => {
    const hours = report.total_hours * (1 + percent / 100);
    const hourly_total = hours * quote.target_hourly_rate + report.direct_costs;
    return {
      percent,
      total_hours: hours,
      fixed_effective_rate: (quote.price - report.direct_costs) / hours,
      hourly_total,
      hourly_minus_fixed: hourly_total - quote.price,
    };
  });
}

/** Planned-hours comparison used by the page summary and CLI. */
export function billingModelSummary(quote, report) {
  const planned = compareBillingModels(quote, report, [0])[0];
  return {
    ...planned,
    fixed_is_below_hourly: planned.hourly_minus_fixed > 0,
  };
}

/** One-line arithmetic observation for planned hours. */
export function billingModelNote(quote, report, planned = billingModelSummary(quote, report)) {
  const currency = quote.currency;
  const hourly = `${currency} ${planned.hourly_total.toFixed(2)}`;
  if (Math.abs(planned.hourly_minus_fixed) < 1e-9) {
    return (
      `At planned hours, hourly at the supplied target would bill the same as this ` +
      `fixed quote (${hourly}). Comparison only, not a recommendation of which to send.`
    );
  }
  const gap = `${currency} ${Math.abs(planned.hourly_minus_fixed).toFixed(2)}`;
  const direction = planned.hourly_minus_fixed > 0 ? "more than" : "less than";
  return (
    `At planned hours, hourly at the supplied target would bill ${hourly} — ` +
    `${gap} ${direction} this fixed quote. Comparison only, not a recommendation of which to send.`
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

/** Price floor for additional scope at the quote's target rate plus new costs. */
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
    effective_hourly_rate: extraHours === 0 ? null : quote.target_hourly_rate,
  };
}
