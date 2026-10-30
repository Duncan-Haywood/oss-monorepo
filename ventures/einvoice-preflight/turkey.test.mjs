import assert from "node:assert/strict";
import test from "node:test";
import { checkVkn, checkTckn, checkTurkishTaxId } from "./turkey.mjs";

// 10000000146 is the example commonly used in open-source TCKN validators.
test("accepts numbers whose check digits agree", () => {
  assert.equal(checkVkn("1234567890").ok, true);
  assert.equal(checkVkn("100 000 0000").ok, true);
  assert.equal(checkTckn("10000000146").ok, true);
  assert.equal(checkTckn("12345678950").ok, true);
  assert.equal(checkTurkishTaxId("10000000146").kind, "TCKN");
  assert.equal(checkTurkishTaxId("1234567890").kind, "VKN");
});

test("every single-digit slip in a valid number is caught", () => {
  for (const [good, f] of [["1234567890", checkVkn], ["10000000146", checkTckn]]) {
    for (let i = 0; i < good.length; i++) {
      const bad = good.slice(0, i) + ((Number(good[i]) + 1) % 10) + good.slice(i + 1);
      if (f === checkTckn && bad[0] === "0") continue;
      assert.equal(f(bad).ok, false, bad);
    }
  }
});

test("rejects wrong length, letters, a leading zero TCKN and empty input", () => {
  for (const bad of ["", null, "123456789", "12345678901234", "12345abcde"]) assert.equal(checkTurkishTaxId(bad).ok, false, String(bad));
  assert.equal(checkTckn("01234567890").ok, false);
});
