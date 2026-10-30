import assert from "node:assert/strict";
import test from "node:test";
import { checkRut, checkDigit } from "./uruguay.mjs";

test("pinned on the one RUT I have a source for", () => {
  for (const c of ["211003420017", "21 100342 001 7", "21-100342-001-7"]) assert.equal(checkRut(c).ok, true, c);
});

test("reports a wrong check digit and a malformed RUT", () => {
  assert.match(checkRut("211003420016").problems[0], /check digit should be 7/);
  assert.match(checkRut("21100342001").problems[0], /12 digits/);
  assert.match(checkRut("").problems[0], /12 digits/);
});

test("a remainder with no digit is reported", () => {
  let found = null;
  for (let n = 0; n < 100000 && !found; n++) {
    const p = "21" + String(n).padStart(6, "0") + "001";
    if (checkDigit(p) === null) found = p;
  }
  assert.ok(found);
  assert.match(checkRut(found + "0").problems[0], /no valid check digit/);
});

test("single-digit substitutions in the first eleven: share missed is measured", () => {
  const base = "21100342001";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "7") missed++;
    }
  }
  assert.equal(total, 99);
  // no weight (4,3,2,9,8,7,6,5,4,3,2) is a multiple of 11, so a changed digit
  // always moves the sum off the multiple of 11
  assert.equal(missed, 0);
});
