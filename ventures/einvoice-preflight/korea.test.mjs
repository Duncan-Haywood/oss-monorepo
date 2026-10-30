import assert from "node:assert/strict";
import test from "node:test";
import { checkKoreanBrn } from "./korea.mjs";

test("accepts a number worked by hand and formats it", () => {
  // 1,2,4,8,1,0,0,9,9 x 1,3,7,1,3,7,1,3,5 = 1+6+28+8+3+0+0+27+45 = 118, +floor(45/10)=4 -> 122; (10-2)%10 = 8
  const x = checkKoreanBrn("124-81-00998");
  assert.equal(x.ok, true);
  assert.equal(x.formatted, "124-81-00998");
});

test("every single-digit change to a valid number is caught", () => {
  const good = "1248100998";
  for (let i = 0; i < 10; i++) for (let d = 0; d < 10; d++) {
    if (String(d) === good[i]) continue;
    const bad = good.slice(0, i) + d + good.slice(i + 1);
    assert.equal(checkKoreanBrn(bad).ok, false, bad);
  }
});

test("rejects bad shapes", () => {
  for (const v of ["", "12481009", "12481009988", "124810099a"]) assert.equal(checkKoreanBrn(v).ok, false, v);
});
