import test from "node:test";
import assert from "node:assert/strict";
import { deleteSavedQuote, listSavedQuotes, saveQuote } from "./library.mjs";
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
test("saves, updates, lists, and deletes a quote", () => {
  const quote = { currency: "USD", price: 1200, delivery_hours: 10, admin_hours: 2, revision_hours: 1, overhead: 50, subcontractor_cost: 0, target_hourly_rate: 80 };
  const saved = saveQuote("Website refresh", quote); assert.deepEqual(listSavedQuotes()[0].quote, quote);
  saveQuote("website refresh", { ...quote, price: 1300 }); assert.equal(listSavedQuotes().length, 1); assert.equal(listSavedQuotes()[0].quote.price, 1300);
  assert.equal(deleteSavedQuote(saved.id), true); assert.deepEqual(listSavedQuotes(), []);
});
test("rejects blank and overlong names", () => { assert.throws(() => saveQuote(" ", {}), /quote name/); assert.throws(() => saveQuote("x".repeat(81), {}), /quote name/); });
