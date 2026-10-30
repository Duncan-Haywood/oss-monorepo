import assert from "node:assert/strict";
import test from "node:test";
import { checkRuc, checkAccessKey, accessKeyDigit } from "./ecuador.mjs";

test("company RUC: modulo 11, weights 4,3,2,7,6,5,4,3,2 (sum 81, 81 mod 11 = 4, digit 7)", () => {
  for (const c of ["1790010937001", "1790010937 001", "1.790.010.937-001"]) assert.equal(checkRuc(c).ok, true, c);
  assert.equal(checkRuc("1790010937001").kind, "private company");
  assert.match(checkRuc("1790010938001").problems[0], /Digit 10 should be 7/);
});

test("person RUC: modulo 10 on a cedula (sum 25, digit 5)", () => {
  assert.equal(checkRuc("1710034065001").ok, true);
  assert.equal(checkRuc("1710034065001").kind, "person");
  assert.match(checkRuc("1710034064001").problems[0], /tenth digit should be 5/);
});

test("public body RUC: weights 3,2,7,6,5,4,3,2 and a 0001 establishment", () => {
  // 17 6 0001 8 -> digits 1,7,6,0,0,0,1,8 : 3+14+42+0+0+0+3+16 = 78, 78 mod 11 = 1, digit 10 -> no check digit fits
  assert.match(checkRuc("1760001800001").problems[0], /No check digit fits/);
  // 1760001600001... digits 1,7,6,0,0,0,1,6: 3+14+42+0+0+0+3+12 = 74, 74 mod 11 = 8, digit 3
  assert.equal(checkRuc("1760001630001").ok, true);
  assert.equal(checkRuc("1760001630001").kind, "public body");
});

test("rejects bad shape, province, third digit and zero establishment", () => {
  assert.match(checkRuc("1234").problems[0], /13 digits/);
  assert.ok(checkRuc("9990010937001").problems.some((p) => /province/.test(p)));
  assert.ok(checkRuc("1770010937001").problems.some((p) => /third digit/.test(p)));
  assert.ok(checkRuc("1790010937000").problems.some((p) => /establishment/.test(p)));
});

const first48 = "2710202601" + "1790010937001" + "1" + "001001" + "000000123" + "12345678" + "1";

test("clave de acceso: sum 490, 490 mod 11 = 6, digit 5 (recomputed outside this file)", () => {
  assert.equal(first48.length, 48);
  assert.equal(accessKeyDigit(first48), "5");
  const ok = checkAccessKey(first48 + "5");
  assert.equal(ok.ok, true);
  assert.equal(ok.parts.ruc, "1790010937001");
});

test("check digit 11 becomes 0 and 10 becomes 1", () => {
  let zero = 0, one = 0;
  for (let n = 0; n < 3000; n++) {
    const b = String(n).padStart(48, "0");
    const r = [...b].reverse().reduce((a, d, i) => a + Number(d) * (2 + (i % 6)), 0) % 11;
    if (r === 0) { assert.equal(accessKeyDigit(b), "0"); zero++; }
    if (r === 1) { assert.equal(accessKeyDigit(b), "1"); one++; }
  }
  assert.ok(zero > 100 && one > 100);
});

test("clave de acceso problems: length, date, environment, digit, inner RUC", () => {
  assert.match(checkAccessKey("123").problems[0], /49 digits/);
  const badDate = "3102202601" + first48.slice(10);
  assert.ok(checkAccessKey(badDate + accessKeyDigit(badDate)).problems.some((p) => /date/.test(p)));
  const badEnv = first48.slice(0, 23) + "3" + first48.slice(24);
  assert.ok(checkAccessKey(badEnv + accessKeyDigit(badEnv)).problems.some((p) => /environment/.test(p)));
  assert.match(checkAccessKey(first48 + "4").problems[0], /last digit should be 5/);
  const badRuc = first48.slice(0, 10) + "1790010938001" + first48.slice(23);
  assert.ok(checkAccessKey(badRuc + accessKeyDigit(badRuc)).problems.some((p) => /RUC inside/.test(p)));
});

test("single-digit substitutions in a key: every one changes the check digit (weights 2..7 are coprime to 11)", () => {
  let missed = 0, total = 0;
  for (let i = 0; i < 48; i++) for (const c of "0123456789") {
    if (c === first48[i]) continue;
    total++;
    if (accessKeyDigit(first48.slice(0, i) + c + first48.slice(i + 1)) === "5") missed++;
  }
  assert.equal(total, 432);
  assert.equal(missed, 0);
});

test("establishment digits of a 13-digit RUC carry no check: single-digit typos there pass", () => {
  for (const [ruc, passing] of [["1790016919001", 26], ["1760001550001", 35]]) {
    let pass = 0, total = 0;
    for (let i = 0; i < 13; i++) for (const c of "0123456789") {
      if (c === ruc[i]) continue;
      total++;
      if (checkRuc(ruc.slice(0, i) + c + ruc.slice(i + 1)).ok) pass++;
    }
    assert.equal(total, 117);
    assert.equal(pass, passing, ruc);
  }
});
