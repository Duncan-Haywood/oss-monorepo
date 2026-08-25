import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote, calculate, overrunScenarios, directCostSpikeScenarios, directCostSpikeSummary } from "./calc.mjs";

test("calculates hidden time and target price", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const result = calculate(quote);
  assert.equal(result.total_hours, 35);
  assert.ok(Math.abs(result.effective_hourly_rate - 54.8571428) < 1e-6);
  assert.equal(result.target_price, 3105);
  assert.equal(result.gap_to_target, -705);
});

test("defaults optional costs and time to zero", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(calculate(quote).effective_hourly_rate, 100);
});

test("rejects invalid required values", () => {
  const invalid = [
    { price: 0, delivery_hours: 1, target_hourly_rate: 1 },
    { price: 1, delivery_hours: -1, target_hourly_rate: 1 },
    { price: 1, delivery_hours: 1, target_hourly_rate: 0 },
  ];
  for (const data of invalid) {
    assert.throws(() => loadQuote(data));
  }
});

test("rejects booleans as numbers", () => {
  assert.throws(() => loadQuote({ price: true, delivery_hours: 1, target_hourly_rate: 1 }));
});

test("rejects non-finite numbers", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => loadQuote({ price: value, delivery_hours: 1, target_hourly_rate: 1 }));
  }
});

test("reports price left after direct costs", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, overhead: 125, subcontractor_cost: 75, target_hourly_rate: 80 });
  assert.equal(calculate(quote).cost_coverage, 800);
});

test("currency defaults and is trimmed", () => {
  const quote = loadQuote({ currency: " USD ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(quote.currency, "USD");
});

test("rejects an empty or over-long currency label", () => {
  assert.throws(() => loadQuote({ currency: "   ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }));
  assert.throws(() =>
    loadQuote({ currency: "WAY TOO LONG A LABEL", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }),
  );
});

test("calculates transparent overrun sensitivity without changing the quote", () => {
  const quote = loadQuote({ price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  assert.deepEqual(overrunScenarios(quote, report).map((scenario) => scenario.total_hours), [38.5, 43.75, 52.5]);
  assert.equal(overrunScenarios(quote, report)[0].effective_hourly_rate, 49.87012987012987);
  assert.equal(report.total_hours, 35);
});

test("compares a cost rise without changing hours or the quoted price", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const rows = directCostSpikeScenarios(quote, report);
  assert.deepEqual(rows.map((row) => row.percent), [0, 10, 25, 50]);
  assert.equal(rows[0].direct_costs, 480);
  assert.equal(rows[0].effective_hourly_rate, report.effective_hourly_rate);
  assert.equal(rows[0].target_price, 3105);
  assert.equal(rows[0].gap_to_target, -705);
  assert.equal(rows[0].extra_gap, 0);

  assert.equal(rows[1].direct_costs, 528);
  assert.ok(Math.abs(rows[1].effective_hourly_rate - 53.48571428571428) < 1e-9);
  assert.equal(rows[1].target_price, 3153);
  assert.equal(rows[1].gap_to_target, -753);
  assert.equal(rows[1].extra_gap, -48);

  assert.equal(rows[2].direct_costs, 600);
  assert.ok(Math.abs(rows[2].effective_hourly_rate - 51.42857142857143) < 1e-9);
  assert.equal(rows[2].target_price, 3225);
  assert.equal(rows[2].gap_to_target, -825);
  assert.equal(rows[2].extra_gap, -120);

  assert.equal(rows[3].direct_costs, 720);
  assert.equal(rows[3].effective_hourly_rate, 48);
  assert.equal(rows[3].target_price, 3345);
  assert.equal(rows[3].gap_to_target, -945);
  assert.equal(rows[3].extra_gap, -240);

  assert.equal(report.total_hours, 35);
  assert.equal(report.direct_costs, 480);
});

test("cost-rise summary names the price that would hold the target rate", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  assert.match(
    directCostSpikeSummary(quote, report),
    /rise 25%.*54\.86.*51\.43.*3225\.00 instead of units 2400\.00/,
  );
});

test("a quote with no direct costs is unchanged by a cost rise", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const report = calculate(quote);
  const rows = directCostSpikeScenarios(quote, report);
  for (const row of rows) {
    assert.equal(row.direct_costs, 0);
    assert.equal(row.effective_hourly_rate, 100);
    assert.equal(row.target_price, 1000);
    assert.equal(row.extra_gap, 0);
  }
  assert.match(directCostSpikeSummary(quote, report), /does not change/);
});

test("a steep cost rise can leave nothing after direct costs", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, overhead: 800, target_hourly_rate: 80 });
  const report = calculate(quote);
  const spike50 = directCostSpikeScenarios(quote, report).find((row) => row.percent === 50);
  assert.equal(spike50.direct_costs, 1200);
  assert.equal(spike50.cost_coverage, -200);
  assert.equal(spike50.effective_hourly_rate, -20);
});
