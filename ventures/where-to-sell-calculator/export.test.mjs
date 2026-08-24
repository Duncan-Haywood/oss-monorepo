import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonCsv } from "./export.mjs";

test("comparisonCsv exports ranked results with stable spreadsheet columns", () => {
  const csv = comparisonCsv({ results: [
    { rank: 2, label: "Own, store", price: 50, feeTotal: 3.25, profit: 12.5, margin: 25, roi: null, breakEvenPrice: 35.4, priceToMatchBest: 54.75 },
    { rank: 1, label: "eBay", price: 48, feeTotal: 6.12, profit: 14.88, margin: 31, roi: 106.285, breakEvenPrice: 29.12, priceToMatchBest: null },
  ] });
  assert.equal(csv, [
    "rank,channel,price,fees,profit,margin_percent,return_on_cash_percent,break_even_price,price_to_match_best",
    '1,eBay,48.00,6.12,14.88,31.0,106.3,29.12,',
    '2,"Own, store",50.00,3.25,12.50,25.0,,35.40,54.75',
    "",
  ].join("\n"));
});

test("comparisonCsv rejects missing calculated results", () => {
  assert.throws(() => comparisonCsv(), /calculated comparison is required/);
});
