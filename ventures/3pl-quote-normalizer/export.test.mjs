import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "./calc.mjs";
import { exportComparisonCsv, exportCsv, exportJson } from "./export.mjs";

test("exports the calculated quote and review safeguard as CSV", () => {
  const result = calculate({
    orders: "10",
    unitsPerOrder: "2",
    shipping: "5",
    minimumMonthly: "500",
  });

  const csv = exportCsv(result);

  assert.match(csv, /"Monthly orders","10"/);
  assert.match(csv, /"Minimum monthly spend applied","yes"/);
  assert.match(csv, /"Total estimated 3PL cost","500\.00"/);
  assert.match(csv, /"Review note","Verify every rate, assumption/);
});

test("quotes CSV values and preserves input warnings", () => {
  const result = calculate({ orders: "-2", shipping: "not-a-number" });
  const csv = exportCsv(result);

  assert.match(csv, /"Input warnings","Orders \/ month cannot be negative; the negative value was treated as zero\. Shipping \/ order was not a number and was ignored\."/);
  assert.match(csv, /"Review note","Verify every rate, assumption, contract term, and operational requirement before relying on this record\."/);
});

test("rejects an incomplete result instead of creating a misleading file", () => {
  assert.throws(() => exportCsv(null), { name: "TypeError" });
});

test("exports a portable JSON review record without raw rate-card inputs", () => {
  const result = calculate({ orders: "10", shipping: "5", minimumMonthly: "500" });
  const record = JSON.parse(exportJson(result));

  assert.equal(record.schema_version, 1);
  assert.equal(record.monthly_orders, 10);
  assert.equal(record.total_estimated_3pl_cost, 500);
  assert.equal(record.minimum_charge_applied, true);
  assert.equal(record.line_items.Shipping, 50);
  assert.equal(record.break_even_orders_per_month, Math.ceil(result.breakEvenOrders));
  assert.ok(!("shipping" in record));
  assert.match(record.review_note, /Verify every rate/);
});

test("rejects an incomplete JSON export result", () => {
  assert.throws(() => exportJson({ quote: {}, components: [] }), { name: "TypeError" });
});

test("exports a named comparison and optional target as CSV", () => {
  const csv = exportComparisonCsv({ first: 1200, second: 1350, cheaper: "first", difference: 150, annualDifference: 1800, equal: false, target: 1250, firstWithinTarget: true, secondWithinTarget: false }, "Northstar 3PL", "Harbor Fulfillment");
  assert.match(csv, /"Northstar 3PL","1200\.00"/);
  assert.match(csv, /"Lower quote","Northstar 3PL"/);
  assert.match(csv, /"First within target","yes"/);
  assert.match(csv, /"Review note","Verify every rate, assumption/);
});
