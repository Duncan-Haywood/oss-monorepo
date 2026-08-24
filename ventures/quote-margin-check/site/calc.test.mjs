import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadQuote, calculate } from "./calc.mjs";

const ventureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// calc.mjs claims to mirror src/quote_margin.py. Every test above checks that
// claim against numbers hand-copied into this file, which pins the port to
// whatever the Python did on the day it was copied — if load_quote() or
// calculate() changes upstream, all of them still pass.
//
// This one runs the real CLI over the venture's committed example and requires
// identical output, so a change to either side that the other doesn't follow
// fails CI instead of silently shipping two calculators that disagree.
test("matches the Python CLI's own output for the committed example", () => {
  const examplePath = path.join(ventureRoot, "examples", "website-redesign.json");
  const cliCsv = execFileSync(
    "python3",
    [path.join(ventureRoot, "src", "quote_margin.py"), examplePath, "--format", "csv"],
    { encoding: "utf-8" },
  );

  const quote = loadQuote(JSON.parse(readFileSync(examplePath, "utf-8")));
  const result = calculate(quote);

  // Rebuild the CLI's measure/value/unit rows from this module's own output.
  // Same rows, same order, same 2dp rounding as csv_report() in quote_margin.py.
  const ours = [
    "measure,value,unit",
    `quoted_price,${quote.price.toFixed(2)},${quote.currency}`,
    `total_working_hours,${result.total_hours.toFixed(2)},hours`,
    `direct_costs,${result.direct_costs.toFixed(2)},${quote.currency}`,
    `effective_hourly_rate,${result.effective_hourly_rate.toFixed(2)},${quote.currency}/hour`,
    `target_price,${result.target_price.toFixed(2)},${quote.currency}`,
    `gap_to_target,${result.gap_to_target.toFixed(2)},${quote.currency}`,
    `cost_coverage,${result.cost_coverage.toFixed(2)},${quote.currency}`,
  ].join("\n");

  assert.equal(ours.trimEnd(), cliCsv.trimEnd());
});
