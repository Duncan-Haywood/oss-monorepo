// Hostile and odd plans through --stack's stackFloors: none throws, bad ones come back
// as a refusal with a reason. Probed by hand 2026-11-09. Invented plans only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stackFloors } from "./stackfloors.mjs";
import { textNumberErrors } from "./numfields.mjs";

const W = (id, x = {}) => ({ id, length: 100, ...x });
const A = (walls, extra = {}) => ({ name: "A", plan: { walls, ...extra } });

test("odd tee values and prototype-like wall names never throw", () => {
  for (const w of [W("a", { tee: null }), W("a", { tee: "x" }), W("__proto__", { tee: { wall: "__proto__" } }), W("a", { tee: { wall: "constructor" } })]) {
    const r = stackFloors([A([w])]);
    assert.equal(r.ok, true);
    assert.ok(r.plan.walls[0].id.startsWith("A "));
  }
});

test("bad shapes are refused with a reason, not thrown", () => {
  const bad = [[A("abc")], [{ name: "A", plan: null }], [A([W("a")]), null], [A([W("a")]), { name: "B", plan: { walls: [null] } }], {}, null, []];
  for (const f of bad) {
    const r = stackFloors(/** @type {any} */ (f));
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  }
});

test("floor names that join to the same wall name are refused", () => {
  const r = stackFloors([{ name: "A b", plan: { walls: [W("c")] } }, { name: "A", plan: { walls: [W("b c")] } }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /same stacked wall name/);
});

test("the input plans are not changed", () => {
  const f = [A([W("a", { tee: { wall: "a" } })], { stock: [{ size: "2x4", length: 96, price: 3 }] })];
  const before = JSON.stringify(f);
  stackFloors(f);
  assert.equal(JSON.stringify(f), before);
});

test("textNumberErrors tolerates non-objects and rejects text, NaN and huge prices", () => {
  for (const d of [null, undefined, 5, "x"]) assert.deepEqual(textNumberErrors(d, ["a"]), []);
  assert.equal(textNumberErrors({ a: "12", b: NaN, unitPrice: -1, p2price: 2e9 }, ["a", "b", "unitPrice", "p2price"]).length, 4);
});
