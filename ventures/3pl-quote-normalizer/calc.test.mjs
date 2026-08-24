import test from "node:test";
import assert from "node:assert/strict";
import { calculate, compareQuotes, negotiationLines, summary } from "./calc.mjs";

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

test("zero volume stays finite and does not apply a minimum", () => {
  const result = calculate({ orders: 0, inboundUnits: 0, pallets: 0, minimumMonthly: 0 });
  assert.equal(result.perOrder, 0);
  assert.equal(result.minimumApplied, false);
  assert.ok(Number.isFinite(result.breakEvenOrders));
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

test("summary exposes every normalized line item and minimum warning", () => {
  const text = summary(calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 }));
  assert.match(text, /Receiving:/);
  assert.match(text, /Shipping:/);
  assert.match(text, /Fixed fees:/);
  assert.match(text, /Minimum monthly charge applied: yes/);
  assert.match(text, /signed rate card/);
});
