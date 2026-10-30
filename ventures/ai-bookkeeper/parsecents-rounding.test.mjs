import test from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "./bank.mjs";

test("half cents round up on the decimal value, not the float product", () => {
  assert.equal(parseCents("1.005"), 101);
  assert.equal(parseCents("2.675"), 268);
  assert.equal(parseCents("-1.005"), -101);
  assert.equal(parseCents("5.005"), 501);
});

test("an amount that rounds to zero is 0, never -0", () => {
  assert.ok(Object.is(parseCents("-0.001"), 0));
  assert.ok(Object.is(parseCents("(0.004)"), 0));
  assert.equal(parseCents("-0.01"), -1);
});
