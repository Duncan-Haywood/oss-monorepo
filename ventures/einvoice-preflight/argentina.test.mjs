import assert from "node:assert/strict";
import test from "node:test";
import { checkCuit, checkDigit } from "./argentina.mjs";

test("pinned on ARCA's own CUIT", () => {
  assert.equal(checkCuit("33-69345023-9").ok, true);
  assert.equal(checkCuit("33693450239").ok, true);
  assert.equal(checkCuit("33-69345023-9").cuit, "33-69345023-9");
  assert.equal(checkCuit("33-69345023-9").note, "a prefix in the usual company range");
});

test("reports a wrong check digit and a malformed CUIT", () => {
  assert.match(checkCuit("33-69345023-8").problems[0], /check digit should be 9/);
  assert.match(checkCuit("3369345023").problems[0], /eleven digits/);
  assert.match(checkCuit("").problems[0], /eleven digits/);
});

test("a sum that gives 10 has no valid digit", () => {
  let found = null;
  for (let n = 0; n < 1000 && !found; n++) {
    const b = String(2000000000 + n);
    if (checkDigit(b) === null) found = b;
  }
  assert.ok(found);
  assert.match(checkCuit(found + "0").problems[0], /no valid check digit/);
});

test("single-digit substitutions: the share missed is measured", () => {
  // remainders map one-to-one to digits except 10 (none), so a changed digit,
  // which moves the sum by weight x difference (never a multiple of 11),
  // always changes the digit
  let missed = 0, total = 0;
  for (let n = 0; n < 2000; n++) {
    const base = String(2000000000 + ((n * 7919) % 90000000)).padStart(10, "0");
    const dv = checkDigit(base);
    if (dv === null) continue;
    for (let i = 0; i < 10; i++) {
      for (const c of "0123456789") {
        if (c === base[i]) continue;
        total++;
        if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === dv) missed++;
      }
    }
  }
  console.log(`argentina single-digit: ${missed} of ${total} missed`);
  assert.equal(total, 163170);
  assert.equal(missed, 0);
});
