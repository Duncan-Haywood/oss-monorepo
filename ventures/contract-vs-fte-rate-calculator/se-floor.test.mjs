import { test } from "node:test";
import assert from "node:assert/strict";
import { selfEmploymentTax } from "./calc.mjs";

// Schedule SE: net earnings (profit x 92.35%) under $400 owe no self-employment tax.
test("net earnings under $400 owe no self-employment tax", () => {
  const o = { ssRate: 6.2, medicareRate: 1.45, wageBase: 184500 };
  assert.equal(selfEmploymentTax(433, o), 0); // 399.88
  assert.ok(Math.abs(selfEmploymentTax(434, o) - 434 * 0.9235 * 0.153) < 1e-9); // 400.80
});
