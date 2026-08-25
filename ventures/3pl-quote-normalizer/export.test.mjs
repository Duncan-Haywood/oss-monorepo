import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "./calc.mjs";
import { exportCsv } from "./export.mjs";

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
