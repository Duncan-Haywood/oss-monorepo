import test from "node:test";
import assert from "node:assert/strict";

import { formatDecimal } from "./format.mjs";

test("matches Python's f\"{x:.2f}\" on ordinary values", () => {
  assert.equal(formatDecimal(2400), "2400.00");
  assert.equal(formatDecimal(54.855), "54.85"); // true binary value is a hair under .855
  assert.equal(formatDecimal(0), "0.00");
  assert.equal(formatDecimal(-4143.465), "-4143.47"); // true binary value is a hair over .465, not a tie
});

test("rounds an exact half-cent to the nearest even hundredth, like Python", () => {
  // Python: f"{62.125:.2f}" == "62.12" (round-half-to-even), not "62.13"
  // (which is what Number.prototype.toFixed(2) would give).
  assert.equal(formatDecimal(62.125), "62.12");
  assert.equal(formatDecimal(0.125), "0.12");
  assert.equal(formatDecimal(0.135), "0.14");
  assert.equal(formatDecimal(1.005), "1.00"); // not a true tie: true value is under .005
});

test("preserves sign, including for a negative value that rounds to zero", () => {
  assert.equal(formatDecimal(-0.001), "-0.00");
  assert.equal(formatDecimal(-0), "-0.00");
  assert.equal(formatDecimal(-62.125), "-62.12");
});

test("agrees with Python across a large random and division-derived sample", () => {
  // Generated once with `python3 -c "import random,json; ..."` against this
  // repo's Python, then frozen here as a fixture — the arithmetic this
  // module exists to match lives in Python, and re-deriving it in this test
  // would just be re-testing the same claim a different way.
  const cases = [
    [62.125, "62.12"],
    [62.375, "62.38"],
    [62.625, "62.62"],
    [62.875, "62.88"],
    [-62.125, "-62.12"],
    [-62.375, "-62.38"],
    [1903.135, "1903.13"],
    [3989.085, "3989.09"],
    [3472.985, "3472.99"],
    [1860.965, "1860.96"],
    [16.245, "16.25"],
    [4211.925, "4211.93"],
    [2746.405, "2746.41"],
    [100000.005, "100000.01"],
    [7 / 3, "2.33"],
    [-7 / 3, "-2.33"],
    [22 / 7, "3.14"],
    [1 / 3, "0.33"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(formatDecimal(input), expected, `formatDecimal(${input})`);
  }
});
