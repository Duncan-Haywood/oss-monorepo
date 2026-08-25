import test from "node:test";
import assert from "node:assert/strict";

import { reportCsv, toCsv } from "./export.mjs";

test("quotes CSV cells containing commas, quotes, and line breaks", () => {
  assert.equal(toCsv([["measure", "USD, tax-inclusive"], ["note", "say \"hello\"\nnow"]]),
    'measure,"USD, tax-inclusive"\nnote,"say ""hello""\nnow"');
});

test("keeps a currency label in one report column", () => {
  const csv = reportCsv(
    { price: 100, currency: "USD, tax-inclusive" },
    { total_hours: 2, direct_costs: 10, effective_hourly_rate: 45, target_price: 120, gap_to_target: -20, cost_coverage: 90 },
  );
  assert.equal(csv.split("\n")[1], 'quoted_price,100.00,"USD, tax-inclusive"');
  assert.equal(csv.split("\n").length, 8);
});
