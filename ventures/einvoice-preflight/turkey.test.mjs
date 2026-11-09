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

// Cross-check (2026-11-09): the rule above equals the formulation in a
// separate open-source validator (a GitHub gist, "verifyVkn": per digit
// t = (d + 10 - pos) mod 10, keep t when it is 9, else t * 2^(10-pos) mod 9;
// check digit (10 - sum mod 10) mod 10), written here from its description.
// No GIB-published example number was found, so this shows two independent
// implementations agree, not that GIB agrees.
test("checkVkn agrees with a second formulation on 200,000 pseudo-random numbers", () => {
  const second = (nine) => {
    let total = 0;
    for (let pos = 1; pos <= 9; pos++) {
      const t = (Number(nine[pos - 1]) + 10 - pos) % 10;
      total += t === 9 ? 9 : (t * 2 ** (10 - pos)) % 9;
    }
    return (10 - (total % 10)) % 10;
  };
  let seed = 20261109;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let n = 0; n < 200000; n++) {
    const nine = String(rnd() % 1e9).padStart(9, "0");
    assert.equal(checkVkn(nine + second(nine)).ok, true, nine);
    assert.equal(checkVkn(nine + ((second(nine) + 1) % 10)).ok, false, nine);
  }
});
