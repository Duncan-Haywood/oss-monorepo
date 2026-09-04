import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate, overrunScenarios, directCostSpikeScenarios, discountAskScenarios, compareBillingModels, loadKillFeeProgress, compareKillFee } from "./calc.mjs";
import { csvCell, quoteCsv } from "./export.mjs";

test("leaves ordinary CSV cells unchanged", () => {
  assert.equal(csvCell("USD/hour"), "USD/hour");
  assert.equal(csvCell("1000.00"), "1000.00");
});

test("quotes CSV cells containing commas, quotes, and line breaks", () => {
  assert.equal(csvCell("USD, quoted"), '"USD, quoted"');
  assert.equal(csvCell('EUR, "net"'), '"EUR, ""net"""');
  assert.equal(csvCell("say \"hello\"\nnow"), '"say ""hello""\nnow"');
});

test("prefixes a free-text cell a spreadsheet would run as a formula", () => {
  for (const attack of ["=1+1", "+1", "-1+1", "@SUM(A1)", "=cmd|'/c calc'!A1"]) {
    assert.equal(csvCell(attack, { text: true }), `'${attack}`);
  }
});

test("leaves numeric cells alone so a negative gap stays a number", () => {
  // Without the text flag these must pass through: -250.00 is a value the
  // recipient needs to sum, not a formula to neutralise.
  assert.equal(csvCell("-250.00"), "-250.00");
  assert.equal(csvCell("=1+1"), "=1+1");
  assert.equal(csvCell("USD", { text: true }), "USD");
});

test("a formula cell that also needs quoting gets both treatments", () => {
  assert.equal(csvCell('=1+1,"x"', { text: true }), '"\'=1+1,""x"""');
});

test("neutralises a formula typed into the currency label", () => {
  const quote = loadQuote({ currency: "=1+1", price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const csv = quoteCsv(quote, calculate(quote));
  // The unit column carries the currency on most rows; none may open with "=".
  const units = csv.split("\n").slice(1).map((line) => line.split(",").at(-1));
  assert.ok(units.length > 5);
  for (const unit of units) {
    assert.ok(!unit.startsWith("="), `unit cell "${unit}" would evaluate as a formula`);
  }
  assert.match(csv, /quoted_price,1000\.00,'=1\+1/);
  assert.match(csv, /effective_hourly_rate,100\.00,'=1\+1\/hour/);
});

test("a negative gap is still exported as a number, not text", () => {
  const quote = loadQuote({ currency: "USD", price: 100, delivery_hours: 10, target_hourly_rate: 100 });
  const csv = quoteCsv(quote, calculate(quote));
  assert.match(csv, /\ngap_to_target,-\d+\.\d\d,USD/);
});

test("exports stable spreadsheet rows and quotes currency labels safely", () => {
  const quote = loadQuote({ currency: 'USD, "local"', price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const csv = quoteCsv(quote, calculate(quote));
  assert.match(csv, /^measure,value,unit\nquoted_price,1000\.00,"USD, ""local"""/);
  assert.match(csv, /effective_hourly_rate,100\.00,"USD, ""local""\/hour"/);
  assert.match(csv, /discount_room,0\.00,"USD, ""local"""/);
  assert.match(csv, /minimum_price_adjustment,0\.00,"USD, ""local"""/);
  assert.match(csv, /target_rate_hours_budget,10\.00,hours/);
  assert.match(csv, /hours_cushion,0\.00,hours/);
  assert.match(csv, /hourly_bill_at_planned_hours,1000\.00,"USD, ""local"""/);
  assert.match(csv, /hourly_minus_fixed_at_planned_hours,0\.00,"USD, ""local"""/);
  assert.doesNotMatch(csv, /discount_\d/);
  assert.doesNotMatch(csv, /kill_/);
});

test("includes discount, cost-rise, overrun, and kill-fee rows when supplied", () => {
  const quote = loadQuote({
    currency: "USD",
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const compared = compareKillFee(
    quote,
    report,
    loadKillFeeProgress({ hours_done: 14, already_paid: 1200, kill_fee: 360, sunk_costs: 180 }, quote, report),
  );
  const csv = quoteCsv(quote, report, {
    overrunRows: overrunScenarios(quote, report),
    spikeRows: directCostSpikeScenarios(quote, report),
    billingRows: compareBillingModels(quote, report),
    discountRows: discountAskScenarios(quote, report),
    compared,
  });
  assert.match(csv, /discount_room,0\.00,USD/);
  assert.match(csv, /target_rate_hours_budget,25\.60,hours/);
  assert.match(csv, /hours_cushion,-9\.40,hours/);
  assert.match(csv, /hourly_bill_at_planned_hours,3105\.00,USD/);
  assert.match(csv, /hourly_minus_fixed_at_planned_hours,705\.00,USD/);
  assert.match(csv, /hourly_50_bill,4417\.50,USD/);
  assert.match(csv, /discount_10_price,2160\.00,USD/);
  assert.match(csv, /discount_10_hours_to_cut,12\.60,hours/);
  assert.match(csv, /overrun_25_hours,43\.75,hours/);
  assert.match(csv, /cost_spike_25_target_price,3225\.00,USD/);
  assert.match(csv, /kill_finish_cash,1920\.00,USD/);
  assert.match(csv, /kill_fee_cash,1380\.00,USD/);
  assert.match(csv, /kill_walk_cash,1020\.00,USD/);
  assert.match(csv, /kill_refill_adjusted,2955\.00,USD/);
});

test("the buffered target price travels with the buffer that produced it", () => {
  // Allowlist drift guard. quoteCsv names each row by hand, so an input added
  // to loadQuote can reach the export only through its derived figures --
  // buffered_target_price landed here while time_buffer_percent did not, so
  // whoever opened the file saw a target they could not reproduce.
  const quote = loadQuote({
    currency: "USD",
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
    time_buffer_percent: 20,
  });
  const report = calculate(quote);
  const csv = quoteCsv(quote, report);
  assert.match(csv, /\ntime_buffer_percent,20\.00,percent/);
  assert.match(csv, /\nbuffered_hours,42\.00,hours/);
  assert.match(csv, /\nbuffered_target_price,3630\.00,USD/);
});

test("emits an empty hours-to-cut cell when a discount no longer covers costs", () => {
  const quote = loadQuote({
    currency: "USD",
    price: 100,
    delivery_hours: 10,
    overhead: 90,
    target_hourly_rate: 50,
  });
  const report = calculate(quote);
  const csv = quoteCsv(quote, report, {
    discountRows: discountAskScenarios(quote, report, [20]),
  });
  assert.match(csv, /discount_20_hours_to_cut,,hours/);
});
