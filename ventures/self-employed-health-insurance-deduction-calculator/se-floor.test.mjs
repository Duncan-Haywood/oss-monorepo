import { test } from "node:test";
import assert from "node:assert/strict";
import { seTax } from "./calc.mjs";

// Schedule SE: the $400 floor is on net earnings (profit x 92.35%), not on profit.
test("profit of $420 is under the $400 net-earnings floor", () => {
  assert.equal(seTax(420), 0); // 387.87 of net earnings
  assert.ok(Math.abs(seTax(434) - 434 * 0.9235 * 0.153) < 1e-9); // 400.80
});
