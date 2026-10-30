import assert from "node:assert/strict";
import test from "node:test";
import { checkIsraeliId } from "./israel.mjs";

test("accepts the hand-worked example and pads short numbers", () => {
  assert.equal(checkIsraeliId("000000018").ok, true);
  assert.equal(checkIsraeliId("18").ok, false); // below 5 digits
  assert.equal(checkIsraeliId("00018").ok, true);
});

test("every single-digit change to a valid number is caught", () => {
  const find = [...Array(10).keys()].map(d => "51429061" + d).filter(x => checkIsraeliId(x).ok);
  assert.equal(find.length, 1);
  const good = find[0];
  for (let i = 0; i < 9; i++) for (let d = 0; d < 10; d++) {
    if (String(d) === good[i]) continue;
    const bad = good.slice(0, i) + d + good.slice(i + 1);
    assert.equal(checkIsraeliId(bad).ok, false, bad);
  }
});

test("labels company numbers and rejects bad shapes", () => {
  const co = [...Array(10).keys()].map(d => "51429061" + d).find(x => checkIsraeliId(x).ok);
  assert.match(checkIsraeliId(co).kind, /company/);
  assert.equal(checkIsraeliId("12a456789").ok, false);
  assert.equal(checkIsraeliId("").ok, false);
  assert.equal(checkIsraeliId("1234567890").ok, false);
});
