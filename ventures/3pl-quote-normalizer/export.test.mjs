import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "./calc.mjs";
import { exportComparisonCsv, exportCsv } from "./export.mjs";

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

test("exports a named comparison and optional target as CSV", () => {
  const csv = exportComparisonCsv({ first: 1200, second: 1350, cheaper: "first", difference: 150, annualDifference: 1800, equal: false, target: 1250, firstWithinTarget: true, secondWithinTarget: false }, "Northstar 3PL", "Harbor Fulfillment");
  assert.match(csv, /"Northstar 3PL","1200\.00"/);
  assert.match(csv, /"Lower quote","Northstar 3PL"/);
  assert.match(csv, /"First within target","yes"/);
  assert.match(csv, /"Review note","Verify every rate, assumption/);
});
