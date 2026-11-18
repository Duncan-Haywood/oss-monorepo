// EntityTable (step.mjs) must answer exactly as the Map it replaced
// (eval/entity-table-2026-11-18.md).
import test from "node:test";
import assert from "node:assert/strict";
import { EntityTable, parseStep } from "./step.mjs";

function same(t, m) {
  assert.equal(t.size, m.size);
  assert.deepEqual([...t.keys()], [...m.keys()]);
  assert.deepEqual([...t.values()], [...m.values()]);
  assert.deepEqual([...t.entries()], [...m.entries()]);
  assert.deepEqual([...t], [...m]);
  const seen = []; t.forEach((v, k, self) => { assert.equal(self, t); seen.push([k, v]); });
  assert.deepEqual(seen, [...m]);
  for (const k of [...m.keys(), 0, -1, 1.5, 99999999, "1", NaN]) {
    assert.equal(t.get(k), m.get(k), `get(${k})`);
    assert.equal(t.has(k), m.has(k), `has(${k})`);
  }
}

test("same answers as a Map: out of order, gaps, a repeated number", () => {
  const ids = [5, 3, 2000, 4, 3, 70000, 1, 2000];
  const t = new EntityTable(), m = new Map();
  ids.forEach((id, i) => { const e = { id, i }; t.set(id, e); m.set(id, e); });
  assert.equal(t._map, null, "stays an array");
  same(t, m);
  t.trim();
  same(t, m);
});

test("moves to a Map for numbers an array would hold badly, and keeps the order", () => {
  for (const odd of [2 ** 31, 5e9, -3, 2.5, 4 * 3 + 1048576 + 1]) {
    const t = new EntityTable(), m = new Map();
    for (const id of [3, 1, 2, odd, 7, 1]) { const e = { id }; t.set(id, e); m.set(id, e); }
    assert.notEqual(t._map, null, `${odd} moves it`);
    same(t, m);
  }
});

test("the order list grows past its first block", () => {
  const t = new EntityTable(), m = new Map();
  for (let i = 3000; i > 0; i--) { t.set(i * 3, i); m.set(i * 3, i); }
  same(t.trim(), m);
});

test("parseStep: a repeated number keeps its first place and the last record, as with a Map", () => {
  const p = parseStep("DATA;\n#2=IFCWALL('a');\n#1=IFCSLAB('b');\n#2=IFCDOOR('c');\n#9=IFCWALL($);\nENDSEC;");
  assert.deepEqual([...p.entities.keys()], [2, 1, 9]);
  assert.equal(p.entities.get(2).type, "IFCDOOR");
  assert.deepEqual(p.entities.get(2).args, ["c"]);
  assert.equal(p.entities.size, 3);
});

test("an entity's arguments: an offset until read, then kept or not by the policy", () => {
  const p = parseStep("DATA;\n#1=IFCWALL('a',(1.,2.));\n#2=IFCCARTESIANPOINT((1.,2.));\nENDSEC;");
  p.policy.keep = (t) => t !== "IFCCARTESIANPOINT";
  const w = p.entities.get(1), pt = p.entities.get(2);
  assert.equal(typeof w._a, "number");
  assert.deepEqual(w.args, ["a", [1, 2]]);
  assert.ok(Array.isArray(w._a), "kept");
  assert.deepEqual(pt.args, [[1, 2]]);
  assert.equal(typeof pt._a, "number", "not kept");
  assert.equal(pt.shallowArgs.length, 1);
  pt.args = [[3, 4]];
  assert.deepEqual(pt.args, [[3, 4]], "a set value is kept");
});
