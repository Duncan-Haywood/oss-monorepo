import { test } from "node:test";
import assert from "node:assert/strict";
import { locumYear } from "./calc.mjs";

const p = (rate) => ({ rate, hours: 1, weeks: 1, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0, status: "single" });

// Schedule SE: net earnings (profit x 92.35%) under $400 owe no self-employment tax.
test("net earnings under $400 owe no self-employment tax", () => {
  assert.equal(locumYear(p(433)).seTax, 0); // 399.88
  assert.ok(Math.abs(locumYear(p(434)).seTax - 434 * 0.9235 * 0.153) < 1e-9); // 400.80
});
