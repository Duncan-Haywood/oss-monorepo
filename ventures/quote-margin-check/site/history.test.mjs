import test from "node:test";
import assert from "node:assert/strict";
import { loadHistory, saveHistory, clearHistory } from "./history.mjs";

function fakeStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("history is bounded and newest first", () => {
  globalThis.localStorage = fakeStorage();
  clearHistory();
  for (let i = 0; i < 12; i += 1) saveHistory({ currency: "USD", price: i });
  const entries = loadHistory();
  assert.equal(entries.length, 10);
  assert.equal(entries[0].quote.price, 11);
  assert.equal(entries.at(-1).quote.price, 2);
});

test("clearHistory removes locally saved quotes", () => {
  globalThis.localStorage = fakeStorage();
  saveHistory({ currency: "EUR", price: 50 });
  assert.equal(clearHistory().length, 0);
  assert.deepEqual(loadHistory(), []);
});
