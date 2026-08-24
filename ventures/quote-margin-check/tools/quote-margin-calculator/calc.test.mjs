import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadQuote, calculate, csvRows } from "./calc.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ventureRoot = path.resolve(here, "..", "..");

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
  // Python's load_quote() guards isinstance(value, bool) explicitly; without
  // the mirrored guard here, `true` would coerce to 1 and validate.
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
  assert.equal(loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 }).currency, "units");
  const quote = loadQuote({ currency: " USD ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(quote.currency, "USD");
});

test("rejects an empty or over-long currency label", () => {
  assert.throws(() => loadQuote({ currency: "   ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }));
  assert.throws(() => loadQuote({ currency: "WAY TOO LONG A LABEL", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }));
});

// The whole point of this module is that it can't drift from the Python it
// mirrors. Rather than assert that by eye, run the real CLI over its own
// committed example and require byte-identical CSV. If either side's formula,
// rounding, or measure naming changes without the other, this fails.
test("CSV export is byte-identical to the Python CLI's --format csv", () => {
  const examplePath = path.join(ventureRoot, "examples", "website-redesign.json");
  const fromCli = execFileSync(
    "python3",
    [path.join(ventureRoot, "src", "quote_margin.py"), examplePath, "--format", "csv"],
    { encoding: "utf-8" },
  );

  const quote = loadQuote(JSON.parse(readFileSync(examplePath, "utf-8")));
  const fromBrowser = csvRows(quote, calculate(quote));

  assert.equal(fromBrowser.trimEnd(), fromCli.trimEnd());
});
