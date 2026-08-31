import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonCsv } from "./export.mjs";

test("comparisonCsv exports ranked results including days-to-sell pace", () => {
  const csv = comparisonCsv({ results: [
    {
      rank: 2, label: "Own, store", price: 50, feeTotal: 3.25, profit: 12.5,
      expectedProfit: 11.2, returnDrag: 1.3, margin: 25, roi: null,
      monthlyProfit: 1250, daysToSell: 20, profitPerDay: 0.625,
      monthlyProfitAtVelocity: 18.75, breakEvenPrice: 35.4, ordersToCoverPlan: 4, priceToMatchBest: 54.75,
    },
    {
      rank: 1, label: "eBay", price: 48, feeTotal: 6.12, profit: 14.88,
      expectedProfit: 14.88, returnDrag: 0, margin: 31, roi: 106.285,
      monthlyProfit: 1488, daysToSell: 9, profitPerDay: 1.653333, monthlyProfitAtVelocity: 49.6,
      breakEvenPrice: 29.12, ordersToCoverPlan: 0, priceToMatchBest: null,
    },
  ] });
  assert.equal(csv, [
    "rank,channel,price,fees,profit,expected_profit,return_drag,margin_percent,return_on_cash_percent,monthly_profit,days_to_sell,profit_per_day,monthly_profit_at_velocity,break_even_price,orders_to_cover_plan,price_to_match_best",
    "1,eBay,48.00,6.12,14.88,14.88,0.00,31.0,106.3,1488.00,9,1.65,49.60,29.12,0,",
    '2,"Own, store",50.00,3.25,12.50,11.20,1.30,25.0,,1250.00,20,0.63,18.75,35.40,4,54.75',
    "",
  ].join("\n"));
});

test("comparisonCsv leaves pace columns blank when days-to-sell is unset", () => {
  const csv = comparisonCsv({ results: [
    {
      rank: 1, label: "eBay", price: 48, feeTotal: 6.12, profit: 14.88,
      expectedProfit: 14.88, returnDrag: 0, margin: 31, roi: 106.3,
      monthlyProfit: 1488, daysToSell: null, profitPerDay: null,
      monthlyProfitAtVelocity: null, breakEvenPrice: 29.12, priceToMatchBest: null,
    },
  ] });
  assert.match(csv, /1488\.00,,,,29\.12,,\n/);
});

test("comparisonCsv rejects missing calculated results", () => {
  assert.throws(() => comparisonCsv(), /calculated comparison is required/);
});
