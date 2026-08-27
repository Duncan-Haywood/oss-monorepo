import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate, overrunScenarios } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { formatReviewSummary } from "./summary.mjs";
import { reviewDecision } from "./review.mjs";

test("formats a review summary with derived arithmetic and attention flags", () => {
  const quote = loadQuote({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report), reviewDecision(report, quote));

  assert.match(summary, /Quoted price: USD 1000\.00/);
  assert.match(summary, /Total working hours: 15\.00 \(5\.00 admin\/revision hours\)/);
  assert.match(summary, /Effective hourly rate: USD 66\.67\/hour/);
  assert.match(summary, /The quote is below the supplied target/);
  assert.match(summary, /Minimum increase to reach target: USD 500\.00/);
  assert.match(summary, /not pricing or financial advice/);
  assert.match(summary, /Next-step prompt: Review the flags before deciding/);
});

test("states when there are no arithmetic attention flags", () => {
  const quote = loadQuote({ currency: "EUR", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report));

  assert.match(summary, /No arithmetic attention flags/);
  assert.doesNotMatch(summary, /undefined/);
});

test("creates a concise handoff with hidden time", () => {
  const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report));
  assert.match(summary, /Total working hours: 35\.00 \(11\.00 admin\/revision hours\)/);
  assert.match(summary, /Effective hourly rate: USD 54\.86\/hour/);
  assert.doesNotMatch(summary, /should send|must revise|recommended/i);
});

test("summary includes assumptions and overrun scenarios", () => {
  const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report), null, { overrunRows: overrunScenarios(quote, report) });
  assert.match(summary, /Quoted price: USD 2400\.00/);
  assert.match(summary, /Total working hours: 35\.00 \(11\.00 admin\/revision hours\)/);
  assert.match(summary, /\+10% time: 38\.50 hours/);
  assert.match(summary, /not pricing or financial advice/);
  assert.doesNotMatch(summary, /should send|must revise|recommended/i);
});

test("includes the local next-step prompt without recommending a price", () => {
  const quote = loadQuote({ currency: "EUR", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  const report = calculate(quote);
  const summary = formatReviewSummary(quote, report, reviewQuote(quote, report), reviewDecision(report, quote));
  assert.match(summary, /Next-step prompt: No arithmetic flags found/);
  assert.doesNotMatch(summary, /should send|must revise|recommended/i);
});
