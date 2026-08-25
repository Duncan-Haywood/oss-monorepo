import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate, csvReport, csvValue } from "./calc.mjs";

test("escapes CSV values containing separators and quotes", () => {
  assert.equal(csvValue('EUR, "net"'), '"EUR, ""net"""');
  assert.equal(csvValue("line\nitem"), '"line\nitem"');
  assert.equal(csvValue("USD"), "USD");
});

test("CSV report keeps a custom currency label in one column", () => {
  const quote = loadQuote({ currency: 'U, "T"', price: 1000, delivery_hours: 10, target_hourly_rate: 50 });
  const csv = csvReport(quote, calculate(quote));
  const priceRow = csv.split("\n")[1];
  assert.equal(priceRow, 'quoted_price,1000.00,"U, ""T"""');
});
