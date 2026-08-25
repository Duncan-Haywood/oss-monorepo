import test from "node:test";
import assert from "node:assert/strict";
import { calculate, compareQuotes, comparisonSummary, inputWarnings, largestCostDriver, negotiationLines, summary, volumeSensitivity } from "./calc.mjs";

test("custom return and restocking fees flow into the normalized quote", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1, returnsRate: 10, returnFee: 7, restockFee: 3 });
  assert.equal(result.quote.returns, 100);
});

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

test("comparison identifies the cheaper quote at the same volume", () => {
  const first = calculate({ orders: 100, shipping: 8, fixedFee: 100 });
  const second = calculate({ orders: 100, shipping: 9, fixedFee: 100 });
  assert.match(comparisonSummary(first, second, "North", "South"), /North is lower by \$100\.00 per month/);
});

test("flags malformed and negative rate-card inputs", () => {
  const result = calculate({ orders: -10, shipping: "not-a-number", returnFee: -1, restockFee: "unknown" });
  assert.deepEqual(result.warnings, [
    "Orders / month cannot be negative; the negative value was treated as zero.",
    "Shipping / order was not a number and was ignored.",
    "Return fee cannot be negative; the negative value was treated as zero.",
    "Restock fee was not a number and was ignored.",
  ]);
  assert.deepEqual(inputWarnings({}), []);
  assert.match(summary(result), /Input warnings/);
});

test("shows how minimums and unit economics change with volume", () => {
  const rows = volumeSensitivity({ orders: 100, unitsPerOrder: 1.5, minimumMonthly: 2000 }, [50, 100, 500]);
  assert.deepEqual(rows.map((row) => row.orders), [50, 100, 500]);
  assert.equal(rows[0].minimumApplied, true);
  assert.equal(rows[1].minimumApplied, true);
  assert.equal(rows[2].minimumApplied, false);
  assert.ok(rows[2].perOrder < rows[0].perOrder);
});

test("identifies the largest normalized cost driver for negotiation", () => {
  const result = calculate({ orders: 100, shipping: 12, fixedFee: 50 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "shipping");
  assert.equal(driver.label, "Shipping");
  assert.equal(driver.amount, result.quote.shipping);
  assert.equal(driver.share, Math.round((result.quote.shipping / result.quote.subtotal) * 100));
  assert.match(summary(result), /Largest cost driver: Shipping/);
  assert.match(negotiationLines(result).join("\n"), /Largest normalized cost driver: Shipping/);
});

test("uses the first component when the quote is tied or empty", () => {
  const result = calculate({ orders: 0, unitsPerOrder: 0, pallets: 0, inboundUnits: 0, fixedFee: 0 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "receiving");
  assert.equal(driver.amount, 0);
  assert.equal(driver.share, 0);
});
