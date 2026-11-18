import test from "node:test";
import assert from "node:assert/strict";
import { standings, tieBreakNotes } from "./calc.mjs";

const T = ["A", "B", "C"];
test("goal difference separates level teams", () => {
  const rows = standings(T, [{ a: 0, b: 2, ga: 3, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 0 }]);
  const n = tieBreakNotes(rows);
  assert.equal(n.length, 1);
  assert.equal(n[0].by, "goal difference");
  assert.equal(n[0].above, "A");
  assert.equal(n[0].unresolved, false);
});
test("head to head is named when the table uses it", () => {
  const rows = standings(T, [{ a: 0, b: 1, ga: 1, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 0 }, { a: 2, b: 0, ga: 1, gb: 0 }], { headToHead: true });
  const n = tieBreakNotes(rows);
  assert.ok(n.every((x) => x.by !== "points"));
});
test("a pair level on everything is flagged unresolved", () => {
  const rows = standings(T, [{ a: 0, b: 1, ga: 1, gb: 1 }]);
  const n = tieBreakNotes(rows);
  assert.ok(n.some((x) => x.unresolved && /play-off or a draw/.test(x.text)));
});
test("no notes when points differ", () => {
  assert.deepEqual(tieBreakNotes(standings(T, [{ a: 0, b: 1, ga: 1, gb: 0 }]).slice(0, 2)), []);
});
