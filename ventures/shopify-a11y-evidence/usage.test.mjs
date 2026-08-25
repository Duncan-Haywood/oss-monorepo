import test from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

test("usage is aggregate and opt-out", () => {
  const storage = memoryStorage();
  recordUsage(storage);
  recordUsage(storage, true);
  const recorded = JSON.parse(storage.data.get("shopify-a11y-evidence-usage"));
  assert.equal(recorded.report_generated, 1);
  assert.match(recorded.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test("named events increment separately", () => {
  const storage = memoryStorage();
  recordUsage(storage, false, "report_generated");
  recordUsage(storage, false, "comparison_generated");
  recordUsage(storage, false, "comparison_generated");
  const recorded = JSON.parse(storage.data.get("shopify-a11y-evidence-usage"));
  assert.equal(recorded.report_generated, 1);
  assert.equal(recorded.comparison_generated, 2);
});
