import { test } from "node:test";
import assert from "node:assert/strict";
import { seTax } from "./calc.mjs";

// Schedule SE: net earnings (earnings x 92.35%) under $400 owe no self-employment tax.
test("net earnings under $400 owe no self-employment tax", () => {
  assert.equal(seTax(433, 184500), 0); // 399.88
  assert.ok(seTax(434, 184500) > 0); // 400.80
});
