import test from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

test("recordUsage increments named events and honors opt-out", () => {
  const storage = memoryStorage();
  recordUsage(storage, false, "calculation");
  recordUsage(storage, false, "early_pay_compared");
  recordUsage(storage, true, "early_pay_compared");
  const stored = JSON.parse(storage.getItem("invoice-terms-usage-v1"));
  assert.equal(stored.calculation, 1);
  assert.equal(stored.early_pay_compared, 1);
});

test("recordUsage does nothing without storage", () => {
  assert.doesNotThrow(() => recordUsage(null, false, "calculation"));
});
