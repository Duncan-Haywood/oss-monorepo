import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { formatReviewSummary } from "./summary.mjs";

test("formats a review summary with derived arithmetic and attention flags", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report));

  assert.match(summary, /Quoted price: USD 1000\.00/);
  assert.match(summary, /Effective hourly rate: USD 66\.67\/hour/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.match(summary, /Minimum increase to reach target: USD 500\.00/);
  assert.match(summary, /not pricing or financial advice/);
});

test("states when there are no arithmetic attention flags", () => {
  const quote = loadQuote({ currency: "EUR", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report));

  assert.match(summary, /No arithmetic attention flags/);
  assert.doesNotMatch(summary, /undefined/);
});
