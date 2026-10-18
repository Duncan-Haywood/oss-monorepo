import { test } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function store() {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  delete globalThis.__usageOptOut;
}

test("counts events locally and honours the opt-out across page loads", () => {
  store();
  record("basis_run"); record("basis_run");
  assert.equal(readUsage().basis_run, 2);
  setUsageOptOut(true);
  assert.deepEqual(readUsage(), {});
  delete globalThis.__usageOptOut; // a fresh page load
  assert.equal(usageOptedOut(), true);
  record("basis_run");
  assert.deepEqual(readUsage(), {});
});
