import test from "node:test";
import assert from "node:assert/strict";
import { clearHistory, deleteHistory, listHistory, MAX_ENTRIES, saveHistory } from "./history.mjs";

const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
const quote = { currency: "USD", price: 1000, delivery_hours: 10, admin_hours: 2, revision_hours: 1, overhead: 40, subcontractor_cost: 0, target_hourly_rate: 80 };
const report = { total_hours: 13, direct_costs: 40, effective_hourly_rate: 73.85, target_price: 1080, gap_to_target: -80, cost_coverage: 960 };

test("saves a local review and lists newest first", () => {
  clearHistory();
  const saved = saveHistory(quote, report, "2026-08-25T00:00:00.000Z");
  assert.equal(listHistory().length, 1);
  assert.equal(listHistory()[0].savedAt, saved.savedAt);
  assert.deepEqual(listHistory()[0].quote, quote);
  assert.deepEqual(listHistory()[0].report, report);
});

test("deletes and clears saved reviews", () => {
  const saved = saveHistory(quote, report, "2026-08-25T01:00:00.000Z");
  assert.equal(deleteHistory(saved.id), true);
  assert.equal(listHistory().length, 1);
  assert.equal(clearHistory(), true);
  assert.deepEqual(listHistory(), []);
});

test(`caps history at ${MAX_ENTRIES} entries`, () => {
  clearHistory();
  for (let i = 0; i < MAX_ENTRIES + 3; i += 1) saveHistory({ ...quote, price: i }, report);
  assert.equal(listHistory().length, MAX_ENTRIES);
  assert.equal(listHistory().at(-1).quote.price, 3);
});
