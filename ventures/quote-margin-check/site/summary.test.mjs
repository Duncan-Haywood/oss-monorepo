import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { quoteSummary } from "./summary.mjs";

test("creates a concise handoff with hidden time", () => {
  const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const summary = quoteSummary(quote, calculate(quote));
  assert.match(summary, /Status: below the supplied target price/);
  assert.match(summary, /Effective hourly rate: USD 54\.86\/hour/);
  assert.match(summary, /Total working hours: 35\.00 \(11\.00 admin\/revision hours\)/);
  assert.match(summary, /Arithmetic only, not tax/);
});

test("preserves a positive target gap and currency label", () => {
  const quote = loadQuote({ currency: "EUR", price: 1000, delivery_hours: 5, target_hourly_rate: 100 });
  const summary = quoteSummary(quote, calculate(quote));
  assert.match(summary, /Status: above the supplied target price/);
  assert.match(summary, /Target price gap: EUR 500\.00 \(500\.00 EUR above target\)/);
});
