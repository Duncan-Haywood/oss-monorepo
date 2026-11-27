import assert from "node:assert/strict";
import test from "node:test";
import { checkKraPin } from "./kenya.mjs";

test("accepts individual and company shapes, ignoring case, spaces and hyphens", () => {
  const a = checkKraPin("a123456789z");
  assert.equal(a.ok, true);
  assert.equal(a.kind, "individual");
  assert.equal(a.id, "A123456789Z");
  assert.equal(checkKraPin("P-051 234567 K").kind, "non-individual");
});

test("rejects wrong length, missing letters and odd first letters", () => {
  for (const bad of ["", "A12345678Z", "A1234567890Z", "1234567890Z", "A123456789", "AB23456789Z", "X123456789Z", null]) {
    const r = checkKraPin(bad);
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.problems.length > 0);
  }
});
