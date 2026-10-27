import assert from "node:assert/strict";
import test from "node:test";
import { checkRut, checkDigit } from "./chile.mjs";

test("pinned on RUTs of known good shape", () => {
  for (const r of ["60.805.000-0", "11.111.111-1", "12.345.678-5", "76.086.428-5", "76086428-5"]) {
    assert.equal(checkRut(r).ok, true, r);
  }
});

test("K check digit and kinds", () => {
  assert.equal(checkDigit("6"), "K");
  assert.equal(checkRut("6-k").ok, true);
  assert.equal(checkRut("76.086.428-5").kind, "company");
  assert.equal(checkRut("12.345.678-5").kind, "person");
});

test("single-digit substitutions: the share missed is measured", () => {
  // weights are 2 to 7 and a changed digit differs by 1 to 9, so the sum moves
  // by weight x difference, never a multiple of 11: a single wrong digit is
  // never missed (swapped neighbours can be, which this does not test)
  const base = "76086428";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "5") missed++;
    }
  }
  assert.equal(total, 72);
  assert.equal(missed, 0);
});

test("reports a wrong check digit and a malformed RUT", () => {
  assert.match(checkRut("76.086.428-4").problems[0], /check digit should be 5/);
  assert.match(checkRut("abc").problems[0], /up to eight digits/);
  assert.match(checkRut("").problems[0], /up to eight digits/);
});

test("swapped neighbouring digits: none missed on 2,000 fixed company RUTs", () => {
  // adjacent weights differ by 1 (or 5 where 7 wraps to 2), never a multiple
  // of 11, and the swapped digits differ, so the sum always moves
  let missed = 0, total = 0;
  for (let n = 0; n < 2000; n++) {
    const b = String(60000000 + ((n * 7919) % 30000000));
    const dv = checkDigit(b);
    for (let i = 0; i < b.length - 1; i++) {
      if (b[i] === b[i + 1]) continue;
      total++;
      if (checkDigit(b.slice(0, i) + b[i + 1] + b[i] + b.slice(i + 2)) === dv) missed++;
    }
  }
  assert.equal(total, 12667);
  assert.equal(missed, 0);
});
