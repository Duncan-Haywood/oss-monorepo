import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote, reviewDecision } from "./review.mjs";

function reportFor(data) { const quote = loadQuote(data); return [quote, calculate(quote)]; }

test("flags hidden time that is a quarter or more of the work", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 6, admin_hours: 2, revision_hours: 1, target_hourly_rate: 50 });
  const checks = reviewQuote(quote, report);
  assert.equal(report.hidden_hours, 3);
  assert.equal(report.hidden_time_percent, 33.33333333333333);
  assert.match(checks.find((check) => check.title.startsWith("Hidden time is at least")).detail, /33\.3%/);
});

test("flags a quote below target and names hidden time", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 3, target_hourly_rate: 100 });
  const checks = reviewQuote(quote, report);
  assert.equal(checks[0].title, "The quote is below the supplied target");
  assert.match(checks[1].detail, /5\.00 hours/);
});

test("flags direct costs and missing revision time", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 100, delivery_hours: 2, overhead: 80, subcontractor_cost: 40, target_hourly_rate: 20 });
  assert.deepEqual(reviewQuote(quote, report).map((check) => check.title), ["Direct costs exceed the quoted price", "The quote is below the supplied target", "No revision hours are included", "Target-rate hours budget"]);
});

test("flags direct costs that leave no amount after costs", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 100, delivery_hours: 2, overhead: 60, subcontractor_cost: 40, target_hourly_rate: 20, revision_hours: 1 });
  const checks = reviewQuote(quote, report);
  assert.equal(checks[0].title, "Direct costs use the entire quoted price");
  assert.match(checks[0].detail, /leaving nothing after direct costs/);
  assert.ok(checks.some((check) => check.level === "attention"));
});

test("returns a clear check when there are no flags", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  assert.equal(reviewQuote(quote, report).at(-1).level, "clear");
});

test("turns attention flags into a user-controlled decision prompt", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 900, delivery_hours: 10, target_hourly_rate: 100 });
  const decision = reviewDecision(report, quote);
  assert.equal(decision.tone, "attention");
  assert.match(decision.detail, /1 arithmetic flag/);
});

test("shows a clear decision prompt when arithmetic has no flags", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 5, revision_hours: 1, target_hourly_rate: 50 });
  assert.deepEqual(reviewDecision(report, quote), {
    tone: "clear",
    title: "No arithmetic flags found",
    detail: "You can record your own next step after checking the scope and assumptions.",
  });
});

test("counts a full-price cost flag as attention, not a send recommendation", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 100, delivery_hours: 2, overhead: 60, subcontractor_cost: 40, target_hourly_rate: 20, revision_hours: 1 });
  const decision = reviewDecision(report, quote);
  assert.equal(decision.tone, "attention");
  assert.match(decision.detail, /3 arithmetic flags/);
});

test("shows the target-rate hours budget when the quote has room", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1000, delivery_hours: 5, admin_hours: 1, revision_hours: 1, target_hourly_rate: 50 });
  const budget = reviewQuote(quote, report).find((check) => check.title === "Target-rate hours budget");
  assert.equal(budget.level, "note");
  assert.match(budget.detail, /up to 20\.00 total hours/);
});

test("names the hours the price can absorb when the estimate is longer", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 500, delivery_hours: 10, admin_hours: 3, revision_hours: 1, target_hourly_rate: 40 });
  const budget = reviewQuote(quote, report).find((check) => check.title === "Target-rate hours budget");
  assert.equal(budget.level, "note");
  assert.match(budget.detail, /supports 12\.50 total hours/);
});

test("says there is no hours budget rather than a negative count of hours", () => {
  // target_rate_hours is a signed figure and goes negative once direct costs
  // pass the price; this line used to render it straight, so a freelancer was
  // told "the quote supports -4.00 total hours". A negative there is not a
  // quantity of hours -- it means there is no budget to spend at all.
  const [quote, report] = reportFor({ currency: "USD", price: 800, delivery_hours: 20, admin_hours: 4, revision_hours: 3, overhead: 500, subcontractor_cost: 600, target_hourly_rate: 75 });
  const budget = reviewQuote(quote, report).find((check) => check.title === "Target-rate hours budget");
  assert.equal(budget.level, "note");
  assert.doesNotMatch(budget.detail, /-\d/);
  assert.match(budget.detail, /no time budget at the target rate/);
  assert.match(budget.detail, /exceed the USD 800\.00 quoted price by USD 300\.00/);
  assert.match(budget.detail, /27\.00 estimated hours are unpaid/);
});

test("distinguishes costs that exactly use the price from costs that exceed it", () => {
  const [quote, report] = reportFor({ currency: "USD", price: 1100, delivery_hours: 20, admin_hours: 4, revision_hours: 3, overhead: 500, subcontractor_cost: 600, target_hourly_rate: 75 });
  const budget = reviewQuote(quote, report).find((check) => check.title === "Target-rate hours budget");
  assert.equal(report.cost_coverage, 0);
  assert.match(budget.detail, /use the whole USD 1100\.00 quoted price/);
  assert.doesNotMatch(budget.detail, /exceed/);
});
