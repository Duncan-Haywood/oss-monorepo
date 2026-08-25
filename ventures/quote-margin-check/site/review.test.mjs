import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { formatReviewSummary } from "./summary.mjs";

function reportFor(data) { const quote = loadQuote(data); return [quote, calculate(quote)]; }

test("flags a quote below target and names hidden time", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const checks = reviewQuote(quote, report);
  assert.equal(checks[0].title, "The quote is below the supplied target");
  assert.match(checks[1].detail, /5\.00 hours/);
});

test("flags direct costs and missing revision time", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 100, delivery_hours: 2, overhead: 80, subcontractor_cost: 40, target_hourly_rate: 20 });
  assert.deepEqual(reviewQuote(quote, report).map((check) => check.title), ["Direct costs exceed the quoted price", "The quote is below the supplied target", "No revision hours are included"]);
});

test("returns a clear check when there are no flags", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  assert.equal(reviewQuote(quote, report).at(-1).level, "clear");
});

test("formats a private review summary with supplied and derived figures", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report), new Date("2026-08-25T12:00:00Z"));
  assert.match(summary, /Reviewed: 2026-08-25/);
  assert.match(summary, /Quoted price: USD 1000\.00/);
  assert.match(summary, /Effective hourly rate: USD 66\.67\/hour/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.doesNotMatch(summary, /undefined|null/);
});
