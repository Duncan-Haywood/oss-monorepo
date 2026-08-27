import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate, overrunScenarios } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { markdownReview } from "./markdown.mjs";

test("markdown review includes inputs, arithmetic, observations, and disclaimer", () => {
  const quote = loadQuote({
    currency: "USD",
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const markdown = markdownReview(quote, report, reviewQuote(quote, report), {
    generatedAt: "2026-08-26T18:00:00.000Z",
    overrunRows: overrunScenarios(quote, report),
  });
  assert.match(markdown, /# Quote Margin Review/);
  assert.match(markdown, /Quoted price: USD 2400\.00/);
  assert.match(markdown, /Effective hourly rate: USD 54\.86\/hour/);
  assert.match(markdown, /\+10%/);
  assert.match(markdown, /not tax, financial, or business advice/);
  assert.doesNotMatch(markdown, /should send|must bid|you should/i);
});
