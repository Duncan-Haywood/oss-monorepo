import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { reviewSummary } from "./summary.mjs";

test("formats a complete private review summary from derived values", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const report = calculate(quote);
  const summary = reviewSummary(quote, report, reviewQuote(quote, report));

  assert.match(summary, /Quoted price: USD 1000\.00/);
  assert.match(summary, /Effective hourly rate: USD 66\.67\/hour/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.match(summary, /not a profitability determination/);
  assert.equal(summary.includes("[object Object]"), false);
});

test("keeps user currency labels as plain text", () => {
  const quote = loadQuote({ currency: "USD & CAD", price: 100, delivery_hours: 1, target_hourly_rate: 50 });
  const summary = reviewSummary(quote, calculate(quote), reviewQuote(quote, calculate(quote)));
  assert.match(summary, /Quoted price: USD & CAD 100\.00/);
  assert.equal(summary.includes("<"), false);
});
