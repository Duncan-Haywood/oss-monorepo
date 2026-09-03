import test from "node:test";
import assert from "node:assert/strict";
import { encodeShare, decodeShare } from "./share.mjs";

const FULL_INPUT = {
  currency: "USD",
  booking: 180,
  rental_days: 2,
  delivery: 45,
  cleaning: 20,
  damage: 12,
  purchase: 2400,
  life: 180,
  fixed_monthly: 75,
  available: 20,
  target_margin: 35,
};

test("round-trips every booking field through a share link", () => {
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
    Object.entries(FULL_INPUT).map(([key, value]) => [key, key === "currency" ? value : String(value)])
  );
  assert.deepEqual(decodeShare(encodeShare(stringInput)), FULL_INPUT);
});

test("a negative or non-finite field is dropped, not carried through as-is", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, booking: -5, delivery: NaN }));
  assert.equal("booking" in decoded, false);
  assert.equal("delivery" in decoded, false);
  assert.equal(decoded.rental_days, 2);
});

test("a booking price of zero still round-trips (falsy is not the same as absent)", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, booking: 0, target_margin: 0 }));
  assert.equal(decoded.booking, 0);
  assert.equal(decoded.target_margin, 0);
});

test("currency label is trimmed and capped at 8 characters", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, currency: "  a-really-long-label  " }));
  assert.equal(decoded.currency, "a-really");
});

test("an empty or blank currency is dropped rather than carried through as an empty string", () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, currency: "   " }));
  assert.equal("currency" in decoded, false);
});

test("returns null for garbage input rather than throwing", () => {
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare("not json"), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2, 3]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify({ unrelated: "field" }))), null);
});

test("a partial payload decodes to only the fields it carries", () => {
  const decoded = decodeShare(encodeShare({ booking: 250, rental_days: 3 }));
  assert.deepEqual(decoded, { booking: 250, rental_days: 3 });
});
