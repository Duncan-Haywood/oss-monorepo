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

const { recordUsage, isUsageEnabled, setUsageEnabled, STORAGE_KEY, OPT_OUT_KEY } = require("./usage.js");

test("records aggregate event counts without any payload beyond name and day", () => {
  localStorage.removeItem(STORAGE_KEY);
  recordUsage("report_generated");
  recordUsage("report_generated");
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const keys = Object.keys(stored);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^report_generated:\d{4}-\d{2}-\d{2}$/);
  assert.equal(stored[keys[0]], 2);
});

test("opt-out disables counting and can be re-enabled", () => {
  localStorage.removeItem(STORAGE_KEY);
  setUsageEnabled(false);
  assert.equal(isUsageEnabled(), false);
  recordUsage("report_generated");
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  setUsageEnabled(true);
  assert.equal(isUsageEnabled(), true);
  assert.equal(localStorage.getItem(OPT_OUT_KEY), null);
});

test("honors Do Not Track even without an explicit opt-out", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(OPT_OUT_KEY);
  Object.defineProperty(globalThis, "navigator", { value: { doNotTrack: "1" }, configurable: true });
  assert.equal(isUsageEnabled(), false);
  recordUsage("report_generated");
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
});

test("never records the lockfile contents or package names, only an event name", () => {
  localStorage.removeItem(STORAGE_KEY);
  recordUsage("report_generated");
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const payload = JSON.stringify(stored);
  assert.doesNotMatch(payload, /node_modules/);
  assert.doesNotMatch(payload, /lockfileVersion/);
});
