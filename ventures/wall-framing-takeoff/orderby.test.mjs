import { test } from "node:test";
import assert from "node:assert/strict";
import { orderByFromLines } from "./orderby.mjs";

test("trusses: need 2026-06-01 (Mon), 28 d lead + 3 d buffer = 2026-05-01 (Fri)", () => {
  const r = orderByFromLines("Trusses, 28, 3, 2026-06-01, Acme Truss");
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].orderBy, "2026-05-01"); // 06-01 minus 31 d = 05-01 (Fri)
  assert.equal(r.rows[0].supplier, "Acme Truss");
});
test("a result that lands on a weekend rolls back to Friday", () => {
  // need 2026-06-08 minus 10 d = 2026-05-29 Fri; minus 9 d = 05-30 Sat -> Fri 05-29
  assert.equal(orderByFromLines("Windows, 9, 0, 2026-06-08").rows[0].orderBy, "2026-05-29");
});
test("late items against today", () => {
  const r = orderByFromLines("Windows, 42, 0, 2026-06-01", "2026-05-01");
  assert.equal(r.rows[0].status, "late");
  assert.equal(r.rows[0].earliestStart, "2026-06-12");
  assert.equal(r.rows[0].daysLate, 11);
});
test("bad lines are refused with a reason; comments and blanks are skipped", () => {
  assert.equal(orderByFromLines("Trusses, x, 0, 2026-06-01").ok, false);
  assert.equal(orderByFromLines("Trusses, 5, 0, 2026-13-45").ok, false);
  assert.equal(orderByFromLines("a, b").ok, false);
  assert.equal(orderByFromLines("# note\n\nDoors, 5, 0, 2026-06-01").ok, true);
  assert.equal(orderByFromLines("").ok, false);
});
