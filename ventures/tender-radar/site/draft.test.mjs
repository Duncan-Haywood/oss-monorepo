import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

globalThis.localStorage = new MemoryStorage();

const { loadDraft, saveDraft, clearDraft } = await import("./draft.mjs");

test("drafts round-trip through local storage", () => {
  const draft = { csv: "title,deadline\nRoof,2026-09-18", category: "roofing", minimum: "20000", through: "", hideClosed: true };
  assert.equal(saveDraft(draft), true);
  assert.deepEqual(loadDraft(), draft);
});

test("no draft yet reads as null, not an error", () => {
  clearDraft();
  assert.equal(loadDraft(), null);
});

test("invalid or missing drafts are ignored", () => {
  localStorage.removeItem("tender-radar:draft");
  assert.equal(loadDraft(), null);
  localStorage.setItem("tender-radar:draft", "[]");
  assert.equal(loadDraft(), null);
  localStorage.setItem("tender-radar:draft", "not json");
  assert.equal(loadDraft(), null);
});

test("clearing a draft removes it", () => {
  saveDraft({ csv: "x" });
  assert.equal(clearDraft(), true);
  assert.equal(loadDraft(), null);
});
