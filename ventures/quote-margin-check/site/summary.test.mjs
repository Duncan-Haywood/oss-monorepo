import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { buildReviewSummary } from "./summary.mjs";

test("builds a copyable review summary without project names or client content", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const report = calculate(quote);
  const summary = buildReviewSummary(quote, report, reviewQuote(quote, report));

  assert.match(summary, /Quoted price: USD 1000\.00/);
  assert.match(summary, /Effective hourly rate: USD 66\.67\/hour/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.doesNotMatch(summary, /project name|client/i);
});
