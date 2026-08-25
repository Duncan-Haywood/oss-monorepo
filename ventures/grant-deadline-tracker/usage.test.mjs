import test from "node:test";
import assert from "node:assert/strict";
import { countUsage, usageAllowed } from "./usage.mjs";

test("usage is aggregate, opt-out, and storage failures are harmless", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  countUsage("grant-added", storage);
  countUsage("grant-added", storage);
  assert.deepEqual(JSON.parse(values.get("grant-deadline-tracker:usage")), { "grant-added": 2 });
  values.set("grant-deadline-tracker:usage-off", "1");
  assert.equal(usageAllowed(storage), false);
  assert.doesNotThrow(() => countUsage("grant-added", { getItem() { throw new Error("blocked"); } }));
});
