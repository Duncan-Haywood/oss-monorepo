import { test } from "node:test";
import assert from "node:assert/strict";
import { selfEmploymentTax } from "./payroll.mjs";

// Schedule SE: net earnings (profit x 92.35%) under $400 owe no self-employment tax.
test("net earnings under $400 owe no self-employment tax", () => {
  const under = selfEmploymentTax(433); // 433 x 0.9235 = 399.88
  assert.equal(under.total, 0);
  assert.equal(under.deductibleHalf, 0);
  const over = selfEmploymentTax(434); // 400.80
  assert.ok(Math.abs(over.total - 434 * 0.9235 * 0.153) < 1e-9);
});
