import assert from "node:assert/strict";
import test from "node:test";
import { checkRuc, checkDigit } from "./peru.mjs";

test("pinned on SUNAT's own RUC", () => {
  assert.equal(checkRuc("20131312955").ok, true);
  assert.equal(checkRuc("2013 1312-955").ok, true);
  assert.equal(checkRuc("20131312955").note, "a number starting 20, the usual company range");
});

test("reports a wrong check digit and a malformed RUC", () => {
  assert.match(checkRuc("20131312954").problems[0], /check digit should be 5/);
  assert.match(checkRuc("2013131295").problems[0], /eleven digits/);
  assert.match(checkRuc("").problems[0], /eleven digits/);
});

test("10 and 11 fold to 0 and 1", () => {
  // first ten digits chosen so the remainder is 1 (digit 0) and 0 or 10 (digit 1)
  const seen = new Set();
  for (let n = 0; n < 5000; n++) seen.add(checkDigit(String(2000000000 + n * 7)));
  assert.deepEqual([...seen].sort(), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
});

test("single-digit substitutions: the share missed is measured", () => {
  // digits 0 and 1 are each reached from two remainders (1 -> 0; 0 and 10 -> 1),
  // so a wrong digit can leave the check digit unchanged when the sum moves
  // between remainders 0 and 10
  let missed = 0, total = 0;
  for (let n = 0; n < 2000; n++) {
    const base = String(2000000000 + ((n * 7919) % 90000000)).padStart(10, "0");
    const dv = checkDigit(base);
    for (let i = 0; i < 10; i++) {
      for (const c of "0123456789") {
        if (c === base[i]) continue;
        total++;
        if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === dv) missed++;
      }
    }
  }
  console.log(`peru single-digit: ${missed} of ${total} missed`);
  assert.equal(total, 180000);
  assert.equal(missed, 3346);
});
