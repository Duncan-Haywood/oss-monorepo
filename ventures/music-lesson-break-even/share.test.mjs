import test from "node:test";
import assert from "node:assert/strict";
import { encodeShare, decodeShare } from "./share.mjs";

const FULL_INPUT = {
  lessonPrice: 60,
  lessonsPerWeek: 20,
  weeksPerYear: 48,
  cancelRate: 10,
  prepMinutes: 10,
  travelMinutes: 0,
  monthlyCosts: 200,
  targetPay: 40000,
};

test("round-trips every teaching-week field through a share link", () => {
  const hash = encodeShare(FULL_INPUT);
  const decoded = decodeShare(hash);
  assert.deepEqual(decoded, FULL_INPUT);
});

test("accepts a leading '#' the same as a bare fragment", () => {
  const hash = encodeShare(FULL_INPUT);
  assert.deepEqual(decodeShare(`#${hash}`), decodeShare(hash));
});

test("string-valued form inputs encode the same as numbers", () => {
  const stringInput = Object.fromEntries(
    Object.entries(FULL_INPUT).map(([key, value]) => [key, String(value)])
  );
  assert.deepEqual(decodeShare(encodeShare(stringInput)), FULL_INPUT);
});

test("a negative or non-finite field is dropped, not carried through as-is", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, lessonPrice: -5, travelMinutes: NaN }));
  assert.equal("lessonPrice" in decoded, false);
  assert.equal("travelMinutes" in decoded, false);
  assert.equal(decoded.lessonsPerWeek, 20);
});

test("a lesson price of zero still round-trips (falsy is not the same as absent)", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, lessonPrice: 0, travelMinutes: 0 }));
  assert.equal(decoded.lessonPrice, 0);
  assert.equal(decoded.travelMinutes, 0);
});

test("returns null for garbage input rather than throwing", () => {
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare("not json"), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2, 3]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify({ unrelated: "field" }))), null);
});

test("a partial payload decodes to only the fields it carries", () => {
  const decoded = decodeShare(encodeShare({ lessonPrice: 45, lessonsPerWeek: 15 }));
  assert.deepEqual(decoded, { lessonPrice: 45, lessonsPerWeek: 15 });
});
