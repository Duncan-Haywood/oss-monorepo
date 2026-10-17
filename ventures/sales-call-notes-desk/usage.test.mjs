import { test } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function store() {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  delete globalThis.__usageOptOut;
}

test("counts events locally and opt-out removes them and sticks", () => {
  store();
  record("replies_written"); record("replies_written");
  assert.equal(readUsage().replies_written, 2);
  setUsageOptOut(true);
  assert.deepEqual(readUsage(), {});
  record("replies_written");
  assert.deepEqual(readUsage(), {});
  delete globalThis.__usageOptOut;
  assert.equal(usageOptedOut(), true);
  setUsageOptOut(false);
  record("csv_downloaded");
  assert.equal(readUsage().csv_downloaded, 1);
});

test("a broken store never throws", () => {
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  delete globalThis.__usageOptOut;
  assert.doesNotThrow(() => { record("x"); readUsage(); setUsageOptOut(true); });
});
