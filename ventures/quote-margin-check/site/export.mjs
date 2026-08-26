// Spreadsheet export for a validated quote and its derived report.
// Isolated from the DOM so copy/download can be tested without a browser.
// RFC 4180-style quoting: commas, quotes, and line breaks stay in one cell.

import { targetHoursBudget } from "./calc.mjs";

/**
 * Quote one CSV cell when it contains syntax-significant characters.
 * Ordinary labels (USD, hours) stay unquoted so the file stays readable.
 */
export function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(n) {
  return n.toFixed(2);
}

function hours(n) {
  return n.toFixed(2);
}

/**
 * Stable measure,value,unit CSV for the on-screen review.
 *
 * Core rows match the headline result plus the planned-hours hourly
 * comparison. Optional extras add the tables already rendered on the
 * page (time overrun, cost rise, discount ask, extra-time hourly
 * rows, kill-fee) so a pasted spreadsheet matches what the visitor
 * just saw. Null extras keep the same shape as the CLI.
 */
export function quoteCsv(quote, report, extras = {}) {
  const currency = quote.currency;
  const perHour = `${currency}/hour`;
  const rows = [
    ["measure", "value", "unit"],
    ["quoted_price", money(quote.price), currency],
    ["total_working_hours", hours(report.total_hours), "hours"],
    ["delivery_hours", hours(report.delivery_hours), "hours"],
    ["hidden_hours", hours(report.hidden_hours), "hours"],
    ["hidden_time_percent", money(report.hidden_time_percent), "percent"],
    ["direct_costs", money(report.direct_costs), currency],
    ["break_even_price", money(report.break_even_price), currency],
    ["effective_hourly_rate", money(report.effective_hourly_rate), perHour],
    ["target_price", money(report.target_price), currency],
    ["buffered_target_price", money(report.buffered_target_price), currency],
    ["gap_to_target", money(report.gap_to_target), currency],
    ["cost_coverage", money(report.cost_coverage), currency],
    ["target_rate_hours_budget", hours(targetHoursBudget(quote, report)), "hours"],
    ["discount_room", money(report.discount_room), currency],
    ["minimum_price_adjustment", money(report.minimum_price_adjustment), currency],
    ["hourly_bill_at_planned_hours", money(report.target_price), currency],
    ["hourly_minus_fixed_at_planned_hours", money(report.target_price - quote.price), currency],
  ];

  for (const row of extras.overrunRows ?? []) {
    rows.push([`overrun_${row.percent}_hours`, hours(row.total_hours), "hours"]);
    rows.push([`overrun_${row.percent}_rate`, money(row.effective_hourly_rate), perHour]);
    rows.push([`overrun_${row.percent}_gap`, money(row.gap_to_target), currency]);
  }

  for (const row of extras.spikeRows ?? []) {
    rows.push([`cost_spike_${row.percent}_direct_costs`, money(row.direct_costs), currency]);
    rows.push([`cost_spike_${row.percent}_rate`, money(row.effective_hourly_rate), perHour]);
    rows.push([`cost_spike_${row.percent}_target_price`, money(row.target_price), currency]);
  }

  for (const row of extras.billingRows ?? []) {
    rows.push([`hourly_${row.percent}_hours`, hours(row.total_hours), "hours"]);
    rows.push([`hourly_${row.percent}_bill`, money(row.hourly_total), currency]);
    rows.push([`hourly_${row.percent}_minus_fixed`, money(row.hourly_minus_fixed), currency]);
  }

  for (const row of extras.discountRows ?? []) {
    rows.push([`discount_${row.percent}_price`, money(row.discounted_price), currency]);
    rows.push([
      `discount_${row.percent}_hours_to_cut`,
      row.hours_to_cut === null ? "" : hours(row.hours_to_cut),
      "hours",
    ]);
  }

  if (extras.compared) {
    const { finish, kill, walk } = extras.compared;
    rows.push(["kill_finish_cash", money(finish.cash_kept), currency]);
    rows.push(["kill_fee_cash", money(kill.cash_kept), currency]);
    rows.push(["kill_walk_cash", money(walk.cash_kept), currency]);
    rows.push([
      "kill_finish_rate_from_here",
      finish.rate_from_here === null ? "" : money(finish.rate_from_here),
      perHour,
    ]);
    rows.push(["kill_refill_adjusted", money(kill.refill_adjusted), currency]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
