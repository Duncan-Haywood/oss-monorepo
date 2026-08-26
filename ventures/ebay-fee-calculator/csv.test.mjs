import { test } from "node:test";
import assert from "node:assert/strict";
import { repricingCsv } from "./csv.mjs";

test("exports repricing rows as spreadsheet-ready CSV", () => {
  const csv = repricingCsv([
    { price: 32, offset: -20, profit: -1.25, margin: -3.9, unitProfit: -1.25, profitDelta: -7.5, quantity: 4 },
    { price: 40, offset: 0, profit: 6.25, margin: 13.6, unitProfit: 6.25, profitDelta: 0, quantity: 4 },
  ]);
  assert.equal(csv, [
    "Item price,Units,Price change,Net profit,Net margin,Profit per unit,Profit change",
    "32.00,4,-20%,-1.25,-3.9%,-1.25,-7.50",
    "40.00,4,0%,6.25,13.6%,6.25,0.00",
    "",
  ].join("\r\n"));
});

test("defaults missing units to 1 so older saved rows still export", () => {
  const csv = repricingCsv([
    { price: 40, offset: 0, profit: 6.25, margin: 13.6, unitProfit: 6.25, profitDelta: 0 },
  ]);
  assert.match(csv, /^Item price,Units,Price change/);
  assert.match(csv, /40\.00,1,0%,/);
});

test("exports only supported calculated columns", () => {
  const csv = repricingCsv([{ price: 10, offset: 0, profit: 1, margin: 10, unitProfit: 1, profitDelta: 0, note: "not exported" }]);
  assert.ok(csv.startsWith("Item price,Units,Price change,Net profit"));
  assert.ok(!csv.includes("not exported"));
});

test("rejects missing rows", () => {
  assert.throws(() => repricingCsv(), /rows are required/);
});
