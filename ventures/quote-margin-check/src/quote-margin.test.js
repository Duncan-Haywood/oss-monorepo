import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "./quote-margin.js";

test("includes admin and revision time in effective rate", () => {
  const result = calculate({ price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  assert.equal(result.total_hours, 35);
  assert.equal(result.target_price, 3105);
  assert.ok(Math.abs(result.effective_hourly_rate - 54.8571428) < 0.000001);
});

test("rejects missing required values and negative costs", () => {
  assert.throws(() => calculate({ price: 0, delivery_hours: 1, target_hourly_rate: 1 }));
  assert.throws(() => calculate({ price: 1, delivery_hours: 1, target_hourly_rate: 1, overhead: -1 }));
});
