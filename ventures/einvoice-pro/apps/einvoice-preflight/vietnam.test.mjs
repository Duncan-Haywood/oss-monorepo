import assert from "node:assert/strict";
import test from "node:test";
import { checkMst, checkDigit } from "./vietnam.mjs";

test("pinned on python-stdnum's example (sum 167, 167 mod 11 = 2, digit 8) and its invalid twin", () => {
  assert.equal(checkDigit("010023348"), "8");
  for (const c of ["0100233488", "0100233488-001", "0100233488 001"]) assert.equal(checkMst(c).ok, true, c);
  assert.equal(checkMst("0100233488").kind, "business");
  assert.equal(checkMst("0100233488-001").kind, "branch");
  assert.match(checkMst("0100233480").problems[0], /tenth digit should be 8/);
});

test("a remainder of 0 has no check digit", () => {
  let none = 0;
  for (let n = 0; n < 3000; n++) {
    const b = String(n).padStart(9, "0");
    if (checkDigit(b) === null) { none++; assert.equal(checkMst(b + "0").ok, false, b); }
  }
  assert.ok(none > 100);
});

test("12 digits pass as a citizen ID by length only; other shapes fail", () => {
  assert.equal(checkMst("001234567890").ok, true);
  assert.match(checkMst("001234567890").kind, /length only/);
  for (const bad of ["", "123", "01002334881", "0100233488-00", "0100233488-000"]) assert.equal(checkMst(bad).ok, false, bad);
});

test("single-digit substitutions in the first nine digits are never missed", () => {
  const base = "010023348";
  let missed = 0, total = 0;
  for (let i = 0; i < 9; i++) for (const c of "0123456789") {
    if (c === base[i]) continue;
    total++;
    if (checkMst(base.slice(0, i) + c + base.slice(i + 1) + "8").ok) missed++;
  }
  assert.equal(total, 81);
  // weights are coprime to 11, so one changed digit always changes the sum mod 11
  assert.equal(missed, 0);
});
