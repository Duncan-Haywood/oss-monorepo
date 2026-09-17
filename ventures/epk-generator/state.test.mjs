import test from "node:test";
import assert from "node:assert/strict";
import { saveDraft, loadDraft, clearDraft } from "./state.mjs";

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

test("loadDraft returns {} with no storage or no saved draft", () => {
  assert.deepEqual(loadDraft(null), {});
  assert.deepEqual(loadDraft(new FakeStorage()), {});
});

test("saveDraft then loadDraft round-trips known fields", () => {
  const storage = new FakeStorage();
  const data = { artistName: "Nova", bio: "Line one.\n\nLine two.", streamingLinksRaw: "Spotify | https://x" };
  assert.equal(saveDraft(storage, data), true);
  assert.deepEqual(loadDraft(storage), data);
});

test("saveDraft drops unknown fields and empty strings", () => {
  const storage = new FakeStorage();
  saveDraft(storage, { artistName: "Nova", notAField: "x", tagline: "" });
  assert.deepEqual(loadDraft(storage), { artistName: "Nova" });
});

test("saveDraft with an all-empty object clears any existing draft", () => {
  const storage = new FakeStorage();
  saveDraft(storage, { artistName: "Nova" });
  assert.equal(saveDraft(storage, {}), true);
  assert.deepEqual(loadDraft(storage), {});
});

test("loadDraft rejects a corrupted or foreign value rather than throwing", () => {
  const storage = new FakeStorage();
  storage.setItem("epk-generator-draft", "not json");
  assert.deepEqual(loadDraft(storage), {});
  storage.setItem("epk-generator-draft", JSON.stringify({ v: 99, data: { artistName: "x" } }));
  assert.deepEqual(loadDraft(storage), {});
});

test("clearDraft removes a saved draft", () => {
  const storage = new FakeStorage();
  saveDraft(storage, { artistName: "Nova" });
  assert.equal(clearDraft(storage), true);
  assert.deepEqual(loadDraft(storage), {});
});

test("saveDraft/loadDraft/clearDraft with no storage do not throw", () => {
  assert.equal(saveDraft(null, { artistName: "Nova" }), false);
  assert.equal(clearDraft(null), false);
});
