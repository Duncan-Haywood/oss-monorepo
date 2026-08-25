import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { reviewQuote } from "./review.mjs";
import { csvCell, quoteReportCsv } from "./export.mjs";

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

test("quotes CSV cells containing separators and escapes quotes", () => {
  assert.equal(csvCell("USD, quoted"), '"USD, quoted"');
  assert.equal(csvCell('inch " marks'), '"inch "" marks"');
  assert.equal(csvCell("line\nlabel"), '"line\nlabel"');
  assert.equal(csvCell("USD"), "USD");
});

test("browser report export stays three columns with a custom currency label", () => {
  const [quote, report] = reportFor({ currency: "USD, quoted", price: 1000, delivery_hours: 5, target_hourly_rate: 50 });
  const lines = quoteReportCsv(quote, report).split("\n");
  assert.equal(lines[0], "measure,value,unit");
  assert.equal(lines[1], 'quoted_price,1000.00,"USD, quoted"');
  assert.equal(lines[4], 'effective_hourly_rate,200.00,"USD, quoted/hour"');
});
