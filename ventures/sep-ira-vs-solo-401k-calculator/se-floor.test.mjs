import { test } from "node:test";
import assert from "node:assert/strict";
import { netSelfEmploymentEarnings } from "./calc.mjs";

// Schedule SE: net earnings under $400 owe no SE tax, so nothing is subtracted for half of it.
test("net earnings under $400 owe no self-employment tax", () => {
  assert.equal(netSelfEmploymentEarnings(433), 433); // 399.88 of net earnings
  assert.ok(netSelfEmploymentEarnings(434) < 434); // 400.80
});
