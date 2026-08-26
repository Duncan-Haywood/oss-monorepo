import test from "node:test";
import assert from "node:assert/strict";
import { countUsage, setUsageEnabled, usageAllowed } from "./usage.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("usage is aggregate, opt-out, and storage failures are harmless", () => {
  const storage = memoryStorage();
  countUsage("audit_completed", storage);
  countUsage("audit_completed", storage);
  countUsage("pass_through_compared", storage);
  assert.deepEqual(JSON.parse(storage.getItem("freight-accessorial-auditor:usage")), {
    audit_completed: 2,
    pass_through_compared: 1,
  });
  setUsageEnabled(false, storage);
  assert.equal(usageAllowed(storage), false);
  assert.doesNotThrow(() =>
    countUsage("audit_completed", {
      getItem() {
        throw new Error("blocked");
      },
    }),
  );
});

test("Do Not Track and Global Privacy Control disable counting", () => {
  const storage = memoryStorage();
  assert.equal(usageAllowed(storage, { doNotTrack: "1" }), false);
  assert.equal(usageAllowed(storage, { globalPrivacyControl: true }), false);
  countUsage("review_exported", storage, { doNotTrack: "1" });
  assert.equal(storage.getItem("freight-accessorial-auditor:usage"), null);
});
