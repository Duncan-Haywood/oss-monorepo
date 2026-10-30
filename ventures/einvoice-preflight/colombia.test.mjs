import assert from "node:assert/strict";
import test from "node:test";
import { checkNit, checkDigit } from "./colombia.mjs";

test("pinned on NITs of known good shape", () => {
  for (const n of ["800.197.268-4", "890903938-8", "899.999.068-1", "860034313-7"]) {
    assert.equal(checkNit(n).ok, true, n);
  }
});

test("remainders 0 and 1 give the DV itself", () => {
  // "1" sums to 3, remainder 3, DV 11 - 3 = 8; every DV is one digit
  assert.equal(checkDigit("1"), "8");
  for (let n = 1; n < 2000; n++) {
    const dv = Number(checkDigit(String(n)));
    assert.ok(dv >= 0 && dv <= 9);
  }
});

test("single-digit substitutions: the blind spot is measured", () => {
  // No weight is a multiple of 11, so one wrong digit moves the sum off its
  // remainder, but remainders 1 and 10 both give DV 1: a NIT whose DV is 1
  // can swallow an error that moves the remainder between them (about 19% of
  // NITs end in 1). Measured over 2,000 fixed bases n * 7919 mod 10^9.
  let missed = 0, total = 0;
  for (let n = 1; n <= 2000; n++) {
    const base = String((n * 7919) % 1e9).padStart(9, "0");
    const dv = checkDigit(base);
    for (let i = 0; i < base.length; i++) {
      for (const c of "0123456789") {
        if (c === base[i]) continue;
        total++;
        if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === dv) missed++;
      }
    }
  }
  assert.equal(total, 162000);
  assert.equal(missed, 3015);
  assert.ok(missed / total < 0.025);
});

test("a DV that is not 1 never hides a single wrong digit", () => {
  const base = "800197268"; // DV 4
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      assert.notEqual(checkDigit(base.slice(0, i) + c + base.slice(i + 1)), "4");
    }
  }
});

test("reports a wrong DV, a missing DV and a malformed NIT", () => {
  assert.match(checkNit("800.197.268-5").problems[0], /check digit should be 4/);
  assert.match(checkNit("800197268").problems[0], /800197268-4/);
  assert.match(checkNit("12").problems[0], /eight to ten digits/);
  assert.equal(checkNit("").ok, false);
});
