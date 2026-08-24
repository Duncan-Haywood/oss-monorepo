import test from "node:test";
import assert from "node:assert/strict";
import { calculate, compareQuotes, negotiationLines } from "./calc.mjs";

test("normalizes the full monthly quote and minimum", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 });
  assert.equal(Math.round(result.quote.subtotal), 1419);
  assert.equal(result.quote.total, 2000);
  assert.equal(result.winner, "in-house");
  assert.deepEqual(result.components, ["receiving", "storage", "pickPack", "packaging", "shipping", "returns", "fixed"]);
});

test("break-even reflects the in-house comparison", () => {
  const result = calculate({ orders: 100, inHousePerOrder: 20, minimumMonthly: 0 });
  assert.equal(Math.round(result.breakEvenOrders), Math.round(result.quote.total / 20));
  assert.ok(result.delta > 0);
});

test("compares two normalized quotes and creates a negotiation report", () => {
  const first = calculate({ orders: 100, shipping: 8 });
  const second = calculate({ orders: 100, shipping: 9 });
  const comparison = compareQuotes(first, second);
  assert.equal(comparison.cheaper, "first");
  assert.equal(comparison.totalDelta, second.quote.total - first.quote.total);
  assert.match(negotiationLines(first).join("\n"), /shipping: \$800\.00/);
  assert.match(negotiationLines(first).join("\n"), /Subtotal before minimum/);
});
