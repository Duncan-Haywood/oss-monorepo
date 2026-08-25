import test from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, saveDraft } from "./drafts.mjs";

class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.get(key) ?? null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
}

const quote = {
  currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5,
  revision_hours: 6, overhead: 180, subcontractor_cost: 300,
  target_hourly_rate: 75,
};

test("saves and loads a local draft without changing its fields", () => {
  const storage = new FakeStorage();
  assert.equal(saveDraft(quote, storage), true);
  assert.deepEqual(loadDraft(storage), quote);
});

test("missing, malformed, and unknown drafts are ignored", () => {
  const storage = new FakeStorage();
  assert.equal(loadDraft(storage), null);
  storage.setItem("quote-margin-check:draft", "not json");
  assert.equal(loadDraft(storage), null);
  storage.setItem("quote-margin-check:draft", JSON.stringify({ version: 2, quote }));
  assert.equal(loadDraft(storage), null);
});

test("clearing a draft removes it", () => {
  const storage = new FakeStorage();
  saveDraft(quote, storage);
  assert.equal(clearDraft(storage), true);
  assert.equal(loadDraft(storage), null);
});
