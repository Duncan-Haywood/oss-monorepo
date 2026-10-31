import assert from "node:assert/strict";
import test from "node:test";
import { checkNpwp } from "./indonesia.mjs";

test("accepts the old 15-digit form with its usual punctuation", () => {
  const r = checkNpwp("01.234.567.8-012.345");
  assert.equal(r.ok, true);
  assert.equal(r.npwp, "012345678012345");
});
test("accepts 16 digits with a leading 0 and an NIK-style 16 digits", () => {
  assert.equal(checkNpwp("0012345678012345").ok, true);
  assert.match(checkNpwp("3171234567890001").kind, /NIK/);
});
test("rejects wrong lengths and non-digits, and reports the length", () => {
  const r = checkNpwp("12345678901234");
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /has 14/);
  assert.equal(checkNpwp("12345678901234X").ok, false);
  assert.equal(checkNpwp("").ok, false);
});
