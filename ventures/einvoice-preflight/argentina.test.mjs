import assert from "node:assert/strict";
import test from "node:test";
import { checkCuit, checkDigit } from "./argentina.mjs";

test("pinned on CUITs of known good shape", () => {
  for (const c of ["33-69345023-9", "33693450239", "30-70308853-4", "30 70308853 4"]) {
    assert.equal(checkCuit(c).ok, true, c);
  }
  assert.equal(checkCuit("33-69345023-9").kind, "company");
});

test("a person's prefix and an unknown prefix", () => {
  const first10 = "2012345678";
  const d = checkDigit(first10);
  assert.ok(d !== null);
  assert.equal(checkCuit(first10 + d).kind, "person");
  const odd = "9912345678";
  assert.match(checkCuit(odd + checkDigit(odd)).problems[0], /prefix/);
});

test("a remainder with no digit is reported", () => {
  // find a first-ten prefix whose sum leaves 10
  let found = null;
  for (let n = 0; n < 100000 && !found; n++) {
    const p = "20" + String(n).padStart(8, "0");
    if (checkDigit(p) === null) found = p;
  }
  assert.ok(found);
  assert.match(checkCuit(found + "0").problems[0], /no valid check digit/);
});

test("single-digit substitutions in the number: share missed is measured", () => {
  const base = "3369345023";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "9") missed++;
    }
  }
  assert.equal(total, 90);
  // weights 5,4,3,2,7,6,5,4,3,2 never share a factor with 11, so a changed digit
  // always moves the sum off the multiple of 11
  assert.equal(missed, 0);
});

test("reports a wrong check digit and a malformed CUIT", () => {
  assert.match(checkCuit("33693450238").problems[0], /check digit should be 9/);
  assert.match(checkCuit("abc").problems[0], /11 digits/);
  assert.match(checkCuit("").problems[0], /11 digits/);
});
