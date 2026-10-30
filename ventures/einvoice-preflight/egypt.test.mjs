import assert from "node:assert/strict";
import test from "node:test";
import { checkEgyptTrn } from "./egypt.mjs";

test("accepts nine digits, ignoring spaces and hyphens", () => {
  assert.equal(checkEgyptTrn("123456789").ok, true);
  const r = checkEgyptTrn(" 123-456 789 ");
  assert.equal(r.ok, true);
  assert.equal(r.id, "123456789");
});

test("rejects wrong length, letters and all zeros", () => {
  for (const bad of ["", "12345678", "1234567890", "12345678A", "000000000", null]) {
    const r = checkEgyptTrn(bad);
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.problems.length > 0);
  }
});
