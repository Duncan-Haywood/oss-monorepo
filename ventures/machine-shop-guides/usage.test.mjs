import test from "node:test";
import assert from "node:assert/strict";
import { recordUsage, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("counts events locally and honours opt-out", () => {
  const s = mem();
  recordUsage("view:index", s);
  recordUsage("view:index", s);
  assert.equal(readUsage(s)["view:index"], 2);
  setUsageOptOut(true, s);
  assert.equal(usageOptedOut(s), true);
  recordUsage("view:index", s);
  assert.deepEqual(readUsage(s), {});
});

test("a missing store is a no-op, not a crash", () => {
  recordUsage("x", null);
  assert.deepEqual(readUsage(null), {});
});
