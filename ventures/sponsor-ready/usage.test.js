const test = require("node:test");
const assert = require("node:assert/strict");

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new FakeStorage();
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });

const { recordUsage, isUsageEnabled, setUsageEnabled, STORAGE_KEY } = require("./usage.js");

test("records aggregate event counts without payloads", () => {
  recordUsage("scan_completed");
  recordUsage("scan_completed");
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const keys = Object.keys(stored);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^scan_completed:\d{4}-\d{2}-\d{2}$/);
  assert.equal(stored[keys[0]], 2);
});

test("opt out is reversible", () => {
  setUsageEnabled(false);
  assert.equal(isUsageEnabled(), false);
  recordUsage("summary_copied");
  const after = localStorage.getItem(STORAGE_KEY);
  const parsed = after ? JSON.parse(after) : {};
  assert.equal(Object.keys(parsed).some((key) => key.startsWith("summary_copied:")), false);
  setUsageEnabled(true);
  assert.equal(isUsageEnabled(), true);
});

test("Do Not Track disables counting", () => {
  navigator.doNotTrack = "1";
  localStorage.removeItem(STORAGE_KEY);
  recordUsage("scan_started");
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  navigator.doNotTrack = undefined;
});
