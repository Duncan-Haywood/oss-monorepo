import assert from "node:assert/strict";
import test from "node:test";
import { checkRuc, checkAccessKey, accessKeyDigit, mod10Digit, mod11Digit } from "./ecuador.mjs";

// Sums worked by hand, not read from the SRI. Person: 1710034065 (products
// 2,7,2,0,0,3,8,0,12->3 sum 25, digit 5). Public: 17600015|5 (3+14+42+0+0+0+3+10
// = 72, 72 mod 11 = 6, digit 5). Company: 179001691|9 (4+21+18+0+0+5+24+27+2 =
// 101, mod 11 = 2, digit 9).
test("pinned on hand-computed numbers of the three kinds", () => {
  assert.equal(mod10Digit("171003406"), 5);
  assert.equal(mod11Digit("17600015", [3, 2, 7, 6, 5, 4, 3, 2]), 5);
  assert.equal(mod11Digit("179001691", [4, 3, 2, 7, 6, 5, 4, 3, 2]), 9);
  for (const [c, kind] of [["1710034065", "person"], ["1710034065001", "person"], ["1760001550001", "public body"], ["1790016919001", "private company"], ["1790016919-001", "private company"]]) {
    const r = checkRuc(c);
    assert.equal(r.ok, true, c);
    assert.equal(r.kind, kind, c);
  }
});

test("reports wrong digits, province, kind, length and establishment", () => {
  assert.match(checkRuc("1710034064").problems[0], /should be 5, not 4/);
  assert.match(checkRuc("1760001540001").problems[0], /digit 9\) should be 5/);
  assert.match(checkRuc("1790016918001").problems[0], /digit 10\) should be 9/);
  assert.match(checkRuc("9910034065").problems[0], /province/);
  assert.match(checkRuc("1770034065").problems[0], /third digit/);
  assert.match(checkRuc("12345").problems[0], /10 digits/);
  assert.match(checkRuc("1710034065000").problems[0], /cannot be 000/);
  assert.match(checkRuc("1790016919000").problems[0], /cannot be 000/);
  assert.match(checkRuc("1760001550000").problems[0], /cannot be 0000/);
  assert.match(checkRuc("1790016919").problems[0], /13 digits/);
});

test("a person's check digit: a product over 9 loses 9", () => {
  // 6 x 2 = 12 -> 3 in the example above; 9 x 2 = 18 -> 9
  assert.equal(mod10Digit("999999999"), (10 - ((9 + 9 + 9 + 9 + 9 + 9 + 9 + 9 + 9) % 10)) % 10);
  assert.equal(mod10Digit("000000000"), 0);
});

test("access key: weights 2..7 from the right, 11 gives 0 and 10 gives 1", () => {
  // all 1s: 48 digits, weights cycle 2..7 (sum 27 per 6) x8 = 216, 216 mod 11 = 7, digit 4
  assert.equal(accessKeyDigit("1".repeat(48)), 4);
  let zero = 0, one = 0;
  for (let n = 0; n < 3000; n++) {
    const b = String(n).padStart(48, "0");
    const s = [...b].reverse().reduce((a, d, i) => a + Number(d) * (2 + (i % 6)), 0);
    if (s % 11 === 0) { assert.equal(accessKeyDigit(b), 0); zero++; }
    if (s % 11 === 1) { assert.equal(accessKeyDigit(b), 1); one++; }
  }
  assert.ok(zero > 100 && one > 100);
});

test("access key check: digit, date and RUC; a made-up key built here, not an authorised one", () => {
  const first = "15102026" + "01" + "1790016919001" + "1" + "001001" + "000000123" + "12345678" + "1";
  assert.equal(first.length, 48);
  const key = first + accessKeyDigit(first);
  assert.equal(checkAccessKey(key).ok, true);
  const bad = key.slice(0, 48) + String((Number(key[48]) + 1) % 10);
  assert.match(checkAccessKey(bad).problems[0], /last digit should be/);
  assert.match(checkAccessKey("123").problems[0], /49 digits/);
  const badDate = "45" + key.slice(2);
  const f2 = badDate.slice(0, 48);
  assert.ok(checkAccessKey(f2 + accessKeyDigit(f2)).problems.some((p) => /issue date/.test(p)));
});

test("single-digit substitutions in the access key base: share missed is measured", () => {
  const base = "15102026" + "01" + "1790016919001" + "1" + "001001" + "000000123" + "12345678" + "1";
  const want = accessKeyDigit(base);
  let missed = 0, total = 0;
  for (let i = 0; i < 48; i++) for (const c of "0123456789") {
    if (c === base[i]) continue;
    total++;
    if (accessKeyDigit(base.slice(0, i) + c + base.slice(i + 1)) === want) missed++;
  }
  assert.equal(total, 432);
  // a changed digit moves the sum by w*(c-d), 1..63 in magnitude; only a multiple of 11 is missed
  // (weights 2..7 and a change of 11 is impossible with |c-d|<=9), except 10 and 1 both give digit 1
  assert.ok(missed <= 4, `missed ${missed}`);
});
