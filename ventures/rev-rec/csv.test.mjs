import { test } from "node:test";
import assert from "node:assert/strict";
import { linesFromCsv, sampleCsv, parseCsv, oneCurrency, parseAmount } from "./csv.mjs";
import { schedule } from "./revrec.mjs";

test("reads Stripe-style headers in any order, parentheses as negatives", () => {
  const r = linesFromCsv('Period End,amount,Date (UTC),Period Start,id\n2027-01-01,"1,200.00",2026-01-01,2026-01-01,il_1\n2026-02-10,(25.00),2026-02-10,2026-02-10,cn_1');
  assert.equal(r.skipped.length, 0);
  assert.equal(r.lines[0].amount, 120000);
  assert.equal(r.lines[1].amount, -2500);
});

test("missing columns and bad rows are reported, not guessed", () => {
  assert.deepEqual(linesFromCsv("id,amount\n1,5").missing, ["billed", "start"]);
  const r = linesFromCsv("amount,date,period start,period end\nabc,2026-01-01,2026-01-01,2026-02-01\n5,nope,2026-01-01,2026-02-01\n5,2026-01-01,2026-03-01,2026-02-01\n5,2026-01-01,2026-01-01,");
  assert.deepEqual(r.skipped.map((s) => s.why), ["amount is not a number", "billing date is not a date", "period end is before period start"]);
  assert.equal(r.lines.length, 1);
});

test("quoted commas and CRLF parse", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y",2\r\n'), [["a", "b"], ["x,y", "2"]]);
});

test("sample data parses cleanly and the schedule always rolls forward", () => {
  const r = linesFromCsv(sampleCsv());
  assert.equal(r.skipped.length, 0);
  assert.ok(r.lines.length > 100);
  const rows = schedule(r.lines, { asOf: Date.UTC(2026, 9, 15) });
  for (const x of rows) assert.equal(x.opening + x.billed - x.recognized, x.closing);
  assert.ok(rows.at(-1).closing === 0, "every demo term ends in the future window");
});

test("a blank amount is skipped, not read as 0, and a credits column links a refund (quality audit 2026-11-17)", () => {
  const { lines, skipped } = linesFromCsv("id,date,period start,period end,amount,credits\nil_1,2026-01-01,2026-01-01,2027-01-01,1200,\nr1,2026-02-01,2026-02-01,,,\ncn1,2026-02-15,2026-02-15,,(1052.05),il_1\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(skipped, [{ line: 3, why: "amount is blank" }]);
  assert.equal(lines[1].credits, "il_1");
});

test("a decimal comma is read as a decimal point, not as a thousands separator (red team 2026-11-17)", () => {
  const { lines, skipped } = linesFromCsv('id,date,period start,amount\na,2026-01-05,2026-01-05,"29,00"\nb,2026-01-05,2026-01-05,"1.234,50 €"\nc,2026-01-05,2026-01-05,"(9,5)"\nd,2026-01-05,2026-01-05,"1,234.50"\ne,2026-01-05,2026-01-05,"1,234"\nf,2026-01-05,2026-01-05,"12.345.678,9"');
  assert.deepEqual(skipped, []);
  assert.deepEqual(lines.map((l) => l.amount), [2900, 123450, -950, 123450, 123400, 1234567890]);
});

test("skipped rows carry the spreadsheet line number for every reason", () => {
  const r = linesFromCsv("amount,date,period start,period end\n5,2026-01-01,nope,\n5,2026-01-01,2026-03-01,2026-02-01\n5,2026-01-01,2026-01-01,");
  assert.deepEqual(r.skipped, [{ line: 2, why: "period start is not a date" }, { line: 3, why: "period end is before period start" }]);
});

test("headers match aliases exactly: a numbered column is not read as the plain one", () => {
  const r = linesFromCsv("Amount 2,date,period start,net amount\n999,2026-01-01,2026-01-01,5");
  assert.equal(r.lines[0].amount, 500);
});

test("mixed currencies: the demo keeps the most common one and reports the rest", () => {
  const { lines } = linesFromCsv("id,date,period start,amount,currency\na,2026-01-01,2026-01-01,10,EUR\nb,2026-01-01,2026-01-01,20,usd\nc,2026-01-01,2026-01-01,30,eur");
  const r = oneCurrency(lines);
  assert.equal(r.currency, "eur");
  assert.deepEqual(r.lines.map((l) => l.id), ["a", "c"]);
  assert.deepEqual(r.left, { usd: 1 });
  assert.deepEqual(oneCurrency([]), { currency: "usd", lines: [], left: {} });
});

test("mixed currencies: the most common one wins even when another comes first", () => {
  const { lines } = linesFromCsv("id,date,period start,amount,currency\na,2026-01-01,2026-01-01,10,usd\nb,2026-01-01,2026-01-01,20,eur\nc,2026-01-01,2026-01-01,30,eur");
  const r = oneCurrency(lines);
  assert.equal(r.currency, "eur");
  assert.deepEqual(r.left, { usd: 1 });
});

test("sample periods follow Stripe's billing anchor: each end is the anchor day, clamped to short months", () => {
  const rows = parseCsv(sampleCsv()).slice(1).filter((r) => r[4] !== "(79)");
  assert.equal(rows.length, 296, "40 demo subscriptions");
  const dim = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  let anchor = null, prevEnd = null;
  for (const [, , s, e] of rows) {
    if (s !== prevEnd) anchor = new Date(`${s}T00:00:00Z`).getUTCDate();
    const end = new Date(`${e}T00:00:00Z`);
    assert.equal(end.getUTCDate(), Math.min(anchor, dim(end)), `${s} -> ${e}`);
    prevEnd = e;
  }
});

test("a lone CR ends a row without eating the next row's first character (red team 2026-11-17)", () => {
  assert.deepEqual(parseCsv("a,b\rxy,2\r"), [["a", "b"], ["xy", "2"]]);
});

test("every skip reason names its file line, header being line 1 (red team 2026-11-17)", () => {
  const r = linesFromCsv("amount,date,period start,period end\nabc,2026-01-01,2026-01-01,\n5,2026-01-01,nope,\n5,2026-01-01,2026-03-01,2026-02-01\n");
  assert.deepEqual(r.skipped.map((s) => s.line), [2, 3, 4]);
});

test("zero-decimal amounts are not multiplied by 100 (red team 2026-11-17)", () => {
  const r = linesFromCsv("id,date,period start,amount,currency\na,2026-01-01,2026-01-01,1200,JPY\nb,2026-01-01,2026-01-01,1200,usd\nc,2026-01-01,2026-01-01,1.5,kwd\n");
  assert.deepEqual(r.lines.map((l) => l.amount), [1200, 120000, 1500]);
});

test("sample data: plan prices stay 29, 79, 249 monthly and 290 annual, with one 79 refund", () => {
  const amounts = new Set(sampleCsv().split("\n").slice(1).map((r) => r.split(",")[4]));
  assert.deepEqual([...amounts].sort(), ["(79)", "249", "29", "290", "79"]);
});

test("a period end that is not a date is skipped, not read as a one-off (red team 2026-11-18)", () => {
  const r = linesFromCsv("amount,date,period start,period end\n1200,2026-01-01,2026-01-01,2027-13-01\n5,2026-01-01,2026-01-01,\n");
  assert.deepEqual(r.skipped, [{ line: 2, why: "period end is not a date" }]);
  assert.equal(r.lines.length, 1, "a blank period end is still a one-off charge");
});

test("an impossible calendar date is skipped, not rolled into the next month (red team 2026-11-18)", () => {
  // Date.parse reads 2026-02-30 as 2 March; a typo must be flagged, not moved.
  const r = linesFromCsv("amount,date,period start,period end\n10,2026-02-30,2026-02-01,2026-03-01\n10,2026-02-01,2026-02-31,2026-03-01\n10,2026-02-01,2026-02-01,2026-04-31\n10,2024-02-29,2024-02-29,2024-03-29");
  assert.deepEqual(r.skipped.map((s) => s.why), ["billing date is not a date", "period start is not a date", "period end is not a date"]);
  assert.equal(r.lines.length, 1, "29 Feb in a leap year is a real date");
});

test("an amount with more decimals than its currency is skipped, not read 1000x too small (red team 2026-11-18)", () => {
  // "€ 1.000" in a European export is a thousand euros; reading it as 1.00 would
  // shrink the schedule silently, so a third decimal in a two-decimal currency is flagged.
  const r = linesFromCsv("amount,date,period start,currency\n€ 1.000,2026-01-01,2026-01-01,eur\n1.250,2026-01-01,2026-01-01,kwd\n12.5,2026-01-01,2026-01-01,usd\n100.5,2026-01-01,2026-01-01,jpy\n5000.00,2026-01-01,2026-01-01,jpy");
  assert.deepEqual(r.skipped.map((s) => [s.line, s.why]), [[2, "amount has more decimals than EUR allows (is . a thousands separator?)"], [5, "amount has more decimals than JPY allows (is . a thousands separator?)"]]);
  assert.deepEqual(r.lines.map((l) => l.amount), [1250, 1250, 5000]);
});

test("accounting-format negatives are credits wherever the currency sign sits (red team 2026-11-18)", () => {
  const { lines, skipped } = linesFromCsv("amount,date,period start\n($100.00),2026-01-01,2026-01-01\n$(100.00),2026-01-01,2026-01-01\n$ (100.00),2026-01-01,2026-01-01\n(100.00) USD,2026-01-01,2026-01-01\n");
  assert.deepEqual(skipped, []);
  assert.deepEqual(lines.map((l) => l.amount), [-10000, -10000, -10000, -10000]);
});

test("amounts with a currency code or any currency sign before the number parse (red team 2026-11-18, second run)", () => {
  // Every row was skipped as "not a number": only $, £ and € were stripped, and only a trailing code.
  const rows = [["\u00a512,000", "jpy", 12000], ["\u20b91,499.00", "inr", 149900], ["USD 100", "usd", 10000], ["CHF 100.50", "chf", 10050], ["R$ 49,90", "brl", 4990], ["\u20a950000", "krw", 50000], ["-USD 5", "usd", -500], ["(CHF 5)", "chf", -500], ["100 CHF", "chf", 10000], ["kr 99", "sek", 9900], ["99 kr", "sek", 9900]];
  const csv = "amount,currency,date,period start\n" + rows.map(([a, c]) => `"${a}",${c},2026-01-01,2026-01-01`).join("\n");
  const r = linesFromCsv(csv);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.lines.map((l) => l.amount), rows.map((x) => x[2]));
  // Letters inside a number, or a one-letter suffix like "5k", are still not a number.
  assert.deepEqual(linesFromCsv("amount,date,period start\n12abc34,2026-01-01,2026-01-01\n5k,2026-01-01,2026-01-01\nN/A,2026-01-01,2026-01-01").skipped.map((s) => s.why), ["amount is not a number", "amount is not a number", "amount is not a number"]);
});

test("LF then CR ends rows without eating a character, and a 4-letter suffix is not a currency code (red team 2026-11-18, second run)", () => {
  assert.deepEqual(parseCsv("a,b\n\rxy,2"), [["a", "b"], ["xy", "2"]]);
  assert.ok(Number.isNaN(parseAmount("100 EURO")) && Number.isNaN(parseAmount("100 abcd")));
});

test("the demo's sample data is pinned to its documented default date, so every sample test checks what the page loads", () => {
  assert.equal(sampleCsv(), sampleCsv(Date.UTC(2026, 9, 15)));
});
