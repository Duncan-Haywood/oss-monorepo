import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "./calc.mjs";

test("normalizes the full monthly quote and minimum", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 });
  assert.equal(Math.round(result.quote.subtotal), 1419);
  assert.equal(result.quote.total, 2000);
  assert.equal(result.winner, "in-house");
});

test("break-even reflects the in-house comparison", () => {
  const result = calculate({ orders: 100, inHousePerOrder: 20, minimumMonthly: 0 });
  assert.equal(Math.round(result.breakEvenOrders), Math.round(result.quote.total / 20));
  assert.ok(result.delta > 0);
});

test("zero volume stays finite and does not apply a minimum", () => {
  const result = calculate({ orders: 0, inboundUnits: 0, pallets: 0, minimumMonthly: 0 });
  assert.equal(result.perOrder, 0);
  assert.equal(Math.round(result.breakEvenOrders), Math.round(result.quote.total / 13));
  assert.equal(result.minimumApplied, false);
  assert.equal(Number.isFinite(result.quote.total), true);
});
