import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";
import { quoteCsv } from "./export.mjs";

test("exports stable spreadsheet rows and quotes currency labels safely", () => {
  const quote = loadQuote({ currency: 'USD, "local"', price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const csv = quoteCsv(quote, calculate(quote));
  assert.match(csv, /^measure,value,unit\nquoted_price,1000\.00,"USD, ""local"""/);
  assert.match(csv, /effective_hourly_rate,100\.00,"USD, ""local""\/hour"/);
});
