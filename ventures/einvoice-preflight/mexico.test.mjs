import assert from "node:assert/strict";
import test from "node:test";
import { checkRfc, checkDigit } from "./mexico.mjs";

test("pinned on RFCs of known good shape", () => {
  for (const r of ["SAT970701NN3", "GODE561231GR8", "CACX7605101P8", "XEXX010101000"]) {
    assert.equal(checkRfc(r).ok, true, r);
  }
});

test("kinds: company 12, person 13, generic", () => {
  assert.equal(checkRfc("SAT970701NN3").kind, "company");
  assert.equal(checkRfc("GODE561231GR8").kind, "person");
  assert.equal(checkRfc("XAXX010101000").kind, "generic");
});

test("single-character substitutions in the first 11 characters: the blind spot is measured", () => {
  // Character values run 0..37 and the sum is mod 11, so swapping a character
  // for one whose value differs by 11, 22 or 33 (same weight) leaves the digit
  // unchanged. Measured on SAT970701NN over letters and digits.
  const base = "SAT970701NN";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "3") missed++;
    }
  }
  assert.equal(total, 385);
  assert.equal(missed, 60);
});

test("reports a wrong check digit, length, date and letters", () => {
  assert.match(checkRfc("SAT970701NN4").problems[0], /check digit should be 3/);
  assert.match(checkRfc("SAT970701").problems[0], /12 characters/);
  assert.match(checkRfc("SAT971301NN3").problems[0], /not a possible YYMMDD/);
  assert.match(checkRfc("S4T970701NN3").problems[0], /should be letters/);
});

test("tolerates spaces, hyphens and lower case", () => {
  assert.equal(checkRfc(" sat-970701-nn3 ").ok, true);
});

test("empty input is not ok", () => {
  assert.equal(checkRfc("").ok, false);
});
