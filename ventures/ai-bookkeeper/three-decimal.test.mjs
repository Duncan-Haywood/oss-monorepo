import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("a KWD amount with a third decimal is flagged, not silently rounded", () => {
  const r = readStatement(`Date,Description,Amount,Currency\n2026-01-15,Coffee,-1.234,KWD\n2026-01-16,Refund,2.500,KWD\n`);
  assert.deepEqual(r.rows.map((x) => x.cents), [-123, 250]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /Line 2: KWD amounts have three decimals/);
});

test("a two-decimal currency with three decimals is left alone", () => {
  const r = readStatement(`Date,Description,Amount,Currency\n2026-01-15,Fuel,-1.234,USD\n`);
  assert.deepEqual(r.problems, []);
});
