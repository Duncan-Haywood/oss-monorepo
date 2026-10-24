import { test } from "node:test";
import assert from "node:assert/strict";
import { appendPeriod, loadHistory, saveHistory, forgetHistory } from "./history.mjs";

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("appendPeriod adds one row after the existing history", () => {
  const r = appendPeriod("period,leads,won,revenue\n2025-01,52,6,14400\n", { period: "2025-02", leads: "47", won: "4", revenue: "$9,800" });
  assert.equal(r.text, "period,leads,won,revenue\n2025-01,52,6,14400\n2025-02,47,4,9800");
});

test("appendPeriod starts a history, labels it, and allows blank revenue", () => {
  assert.equal(appendPeriod("", { leads: 10, won: 2, revenue: "" }).text, "period 1,10,2,");
});

test("appendPeriod rejects impossible rows and strips commas from labels", () => {
  assert.ok(appendPeriod("", { leads: 5, won: 6 }).error);
  assert.ok(appendPeriod("", { leads: 0, won: 0 }).error);
  assert.ok(appendPeriod("", { leads: "x", won: 1 }).error);
  assert.ok(appendPeriod("", { leads: 5, won: 1, revenue: "abc" }).error);
  assert.equal(appendPeriod("", { period: "Q1, 2025", leads: 5, won: 1, revenue: 100 }).text, "Q1  2025,5,1,100");
});

test("history round-trips through the store and can be forgotten", () => {
  const s = memory();
  assert.equal(loadHistory(s), null);
  assert.equal(saveHistory({ rows: "a,1,1,1", target: "100", planned: "" }, s), true);
  assert.deepEqual(loadHistory(s), { rows: "a,1,1,1", target: "100", planned: "" });
  forgetHistory(s);
  assert.equal(loadHistory(s), null);
});

test("a blocked or corrupt store never throws", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(loadHistory(broken), null);
  assert.equal(saveHistory({ rows: "x" }, broken), false);
  forgetHistory(broken);
  assert.equal(loadHistory({ getItem: () => "{not json" }), null);
});
