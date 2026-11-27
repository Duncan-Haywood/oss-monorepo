import assert from "node:assert/strict";
import test from "node:test";
import { checkRuc, checkDigit } from "./paraguay.mjs";

test("pinned on a hand-computed number (sum 171, 171 mod 11 = 6, digit 5), not a registered RUC", () => {
  assert.equal(checkDigit("80016875"), "5");
  for (const c of ["800168755", "80016875-5", "80.016.875 5"]) assert.equal(checkRuc(c).ok, true, c);
});

test("remainders 0 and 1 give digit 0", () => {
  let zero = 0;
  for (let n = 1; n < 2000; n++) {
    const b = String(n).padStart(8, "0");
    const s = [...b].reverse().reduce((a, d, i) => a + Number(d) * (i + 2), 0);
    if (s % 11 <= 1) { assert.equal(checkDigit(b), "0", b); zero++; }
  }
  assert.ok(zero > 100);
});

test("reports a wrong check digit and a malformed RUC", () => {
  assert.match(checkRuc("80016875-4").problems[0], /check digit should be 5/);
  assert.match(checkRuc("1234").problems[0], /5 to 9 digits/);
  assert.match(checkRuc("").problems[0], /5 to 9 digits/);
});

test("single-digit substitutions in the base: share missed is measured", () => {
  const base = "80016875";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "5") missed++;
    }
  }
  assert.equal(total, 72);
  // for this base (digit 5): a changed digit moves the sum, and r = 0 or 1 (both digit 0) is not reached
  assert.equal(missed, 0);
});
