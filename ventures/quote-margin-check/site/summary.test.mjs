import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { decisionSummary } from "./summary.mjs";

test("summary includes target gap and observations", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const report = calculate(quote);
  const summary = decisionSummary(quote, report, reviewQuote(quote, report));
  assert.match(summary, /Gap to supplied target: USD -500\.00 \(below target\)/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.match(summary, /Review and verify before relying on it/);
});

test("summary does not call an above-target quote profitable", () => {
  const quote = loadQuote({ currency: "EUR", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  const report = calculate(quote);
  const summary = decisionSummary(quote, report, reviewQuote(quote, report));
  assert.match(summary, /Gap to supplied target: EUR 700\.00 \(above target\)/);
  assert.doesNotMatch(summary, /profitable/);
});
