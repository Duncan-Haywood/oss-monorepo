import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ENTRIES, readHistory, saveHistoryEntry, clearHistory } from "./history.mjs";

function withStorage(run) {
  const values = new Map();
  global.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try { run(); } finally { delete global.localStorage; }
}

test("history saves newest entries and caps retained quotes", () => withStorage(() => {
  const quote = { price: 100 };
  const report = { effective_hourly_rate: 50 };
  for (let i = 0; i < MAX_ENTRIES + 2; i += 1) {
    saveHistoryEntry(`Quote ${i}`, quote, report, new Date(2026, 0, i + 1));
  }
  const history = readHistory();
  assert.equal(history.length, MAX_ENTRIES);
  assert.equal(history[0].label, `Quote ${MAX_ENTRIES + 1}`);
  assert.equal(history.at(-1).label, "Quote 2");
}));

test("history can be cleared", () => withStorage(() => {
  saveHistoryEntry("Example", {}, {});
  clearHistory();
  assert.deepEqual(readHistory(), []);
}));
