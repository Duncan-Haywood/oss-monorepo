import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote, calculate, csvField, csvReport } from "./calc.mjs";

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

test("csv report matches the CLI spreadsheet rows", () => {
  const quote = loadQuote({ currency: "EUR", price: 2400, delivery_hours: 24, target_hourly_rate: 75 });
  assert.equal(
    csvReport(quote, calculate(quote)),
    [
      "measure,value,unit",
      "quoted_price,2400.00,EUR",
      "total_working_hours,24.00,hours",
      "direct_costs,0.00,EUR",
      "effective_hourly_rate,100.00,EUR/hour",
      "target_price,1800.00,EUR",
      "gap_to_target,600.00,EUR",
      "cost_coverage,2400.00,EUR",
    ].join("\n"),
  );
});

test("csv fields quote commas, quotes, and newlines", () => {
  assert.equal(csvField("USD"), "USD");
  assert.equal(csvField("USD,CAD"), '"USD,CAD"');
  assert.equal(csvField('USD "eq"'), '"USD ""eq"""');
  assert.equal(csvField("USD\nCAD"), '"USD\nCAD"');
});

test("csv report quotes a currency label that would split a column", () => {
  const quote = loadQuote({ currency: 'USD, "eq"', price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const csv = csvReport(quote, calculate(quote));
  assert.match(csv, /quoted_price,1000.00,"USD, ""eq"""/);
  assert.match(csv, /effective_hourly_rate,100.00,"USD, ""eq""\/hour"/);
});
