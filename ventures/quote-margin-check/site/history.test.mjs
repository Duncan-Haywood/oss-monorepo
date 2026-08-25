import test from "node:test";
import assert from "node:assert/strict";
import { listReviews, saveReview, clearReviews, MAX_REVIEWS } from "./history.mjs";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("saves latest review and replaces the same quote", () => {
  globalThis.localStorage = storage();
  const quote = { currency: "USD", price: 100 };
  assert.equal(saveReview(quote, { effective_hourly_rate: 50 }, "2026-08-25T00:00:00Z"), true);
  assert.equal(saveReview(quote, { effective_hourly_rate: 60 }, "2026-08-25T01:00:00Z"), true);
  assert.equal(listReviews().length, 1);
  assert.equal(listReviews()[0].report.effective_hourly_rate, 60);
});

test("bounds history and clears it", () => {
  globalThis.localStorage = storage();
  for (let price = 0; price < MAX_REVIEWS + 2; price += 1) saveReview({ currency: "USD", price }, { effective_hourly_rate: price }, `2026-08-${String(price + 1).padStart(2, "0")}T00:00:00Z`);
  assert.equal(listReviews().length, MAX_REVIEWS);
  assert.equal(listReviews()[0].quote.price, MAX_REVIEWS + 1);
  clearReviews();
  assert.deepEqual(listReviews(), []);
});

test("malformed local data is ignored", () => {
  globalThis.localStorage = { getItem: () => "not json", setItem() {}, removeItem() {} };
  assert.deepEqual(listReviews(), []);
});
