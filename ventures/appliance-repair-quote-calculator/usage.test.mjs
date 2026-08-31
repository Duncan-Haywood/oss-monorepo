import test from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
}

test("records only an aggregate local event", () => {
  const storage = memoryStorage();
  recordUsage(storage, false, "quote_calculated", {});
  recordUsage(storage, false, "quote_calculated", {});
  const stored = JSON.parse(storage.getItem("appliance-repair-usage"));
  assert.equal(stored.quote_calculated, 2);
  assert.equal(typeof stored.last_day, "string");
});

test("honors opt out", () => {
  const storage = memoryStorage();
  recordUsage(storage, true, "quote_calculated", {});
  assert.equal(storage.getItem("appliance-repair-usage"), null);
});

test("records a replace comparison without storing years or prices", () => {
  const storage = memoryStorage();
  recordUsage(storage, false, "replace_compared", {});
  const stored = JSON.parse(storage.getItem("appliance-repair-usage"));
  assert.equal(stored.replace_compared, 1);
  assert.equal(Object.keys(stored).includes("remainingRepairYears"), false);
});

test("honors Do Not Track and Global Privacy Control", () => {
  const storage = memoryStorage();
  recordUsage(storage, false, "quote_calculated", { doNotTrack: "1" });
  recordUsage(storage, false, "summary_copied", { globalPrivacyControl: true });
  assert.equal(storage.getItem("appliance-repair-usage"), null);
});
