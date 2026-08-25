import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
}

globalThis.localStorage = new FakeStorage();
const { saveDraft, loadDraft, clearDraft, hasDraft } = await import("./drafts.mjs");

test("drafts round-trip locally without changing their fields", () => {
  const quote = { currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 };
  assert.equal(hasDraft(), false);
  assert.equal(saveDraft(quote), true);
  assert.deepEqual(loadDraft(), quote);
  assert.equal(hasDraft(), true);
});

test("clearing a draft removes it", () => {
  assert.equal(clearDraft(), true);
  assert.equal(loadDraft(), null);
  assert.equal(hasDraft(), false);
});

test("malformed local data is treated as absent", () => {
  localStorage.setItem("quote-margin-check:current-draft", "not-json");
  assert.equal(loadDraft(), null);
  assert.equal(hasDraft(), false);
});
