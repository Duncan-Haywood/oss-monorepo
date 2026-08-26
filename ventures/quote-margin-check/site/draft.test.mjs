import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
}

globalThis.localStorage = new FakeStorage();
const { loadDraft, saveDraft, clearDraft } = await import("./draft.mjs");

test("drafts round-trip through local storage", () => {
  const draft = { currency: "EUR", price: "1800", delivery_hours: "12" };
  assert.equal(saveDraft(draft), true);
  assert.deepEqual(loadDraft(), draft);
});

test("invalid or missing drafts are ignored", () => {
  clearDraft();
  assert.equal(loadDraft(), null);
  localStorage.setItem("quote-margin-check:draft", "[]");
  assert.equal(loadDraft(), null);
  localStorage.setItem("quote-margin-check:draft", "not json");
  assert.equal(loadDraft(), null);
});

test("clearing a draft removes it", () => {
  saveDraft({ price: "2000" });
  assert.equal(clearDraft(), true);
  assert.equal(loadDraft(), null);
});
