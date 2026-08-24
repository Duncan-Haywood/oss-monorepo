import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate, overrunScenarios } from "./calc.mjs";
import { quoteSummary } from "./summary.mjs";

test("summary includes assumptions and overrun scenarios", () => {
  const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  const summary = quoteSummary(quote, report, overrunScenarios(quote, report));
  assert.match(summary, /Quoted price: USD 2400\.00/);
  assert.match(summary, /Total working hours: 35\.00 \(delivery 24\.00, admin 5\.00, revisions 6\.00\)/);
  assert.match(summary, /Arithmetic status: Below supplied target/);
  assert.match(summary, /\+10% time: 38\.50 hours/);
  assert.match(summary, /not financial or business advice/);
});

test("summary keeps currency labels as plain text", () => {
  const quote = loadQuote({ currency: "USD & co", price: 1000, delivery_hours: 10, target_hourly_rate: 80 });
  const report = calculate(quote);
  assert.match(quoteSummary(quote, report, overrunScenarios(quote, report)), /USD & co 1000\.00/);
});
