import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
}

globalThis.localStorage = new FakeStorage();
const { saveQuote, listSavedQuotes, deleteQuote, clearSavedQuotes } = await import("./history.mjs");
const quote = { currency: "USD", price: 1200, delivery_hours: 10, admin_hours: 1, revision_hours: 2, overhead: 50, subcontractor_cost: 0, target_hourly_rate: 100 };

test("saves and lists a local quote snapshot", () => {
  clearSavedQuotes();
  const saved = saveQuote("Website refresh", quote);
  assert.equal(listSavedQuotes()[0].name, "Website refresh");
  assert.deepEqual(listSavedQuotes()[0].quote, quote);
  assert.equal(listSavedQuotes()[0].id, saved.id);
});

test("saving the same name replaces the older snapshot", () => {
  clearSavedQuotes();
  saveQuote("Retainer", quote);
  saveQuote(" Retainer ", { ...quote, price: 1500 });
  assert.equal(listSavedQuotes().length, 1);
  assert.equal(listSavedQuotes()[0].quote.price, 1500);
});

test("rejects blank names and deletes by id", () => {
  clearSavedQuotes();
  assert.throws(() => saveQuote("  ", quote));
  const saved = saveQuote("One-off", quote);
  assert.equal(deleteQuote(saved.id), true);
  assert.deepEqual(listSavedQuotes(), []);
  assert.equal(deleteQuote(saved.id), false);
});

test("ignores malformed stored history", () => {
  localStorage.setItem("quote-margin-check:saved-quotes", "not json");
  assert.deepEqual(listSavedQuotes(), []);
});
