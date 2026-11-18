import test from "node:test";
import assert from "node:assert/strict";
import { gangOpenings } from "./ganged.mjs";
import { budgetDiff, diffText } from "./compare.mjs";

const wall = (openings) => ({ walls: [{ id: "a", length: 200, openings }] });

test("gangOpenings refuses hostile plans with a reason", () => {
  for (const [p, re] of [
    [null, /plan must be an object/],
    [{ walls: [null] }, /wall 1 must be an object/],
    [{ walls: "x" }, /walls must be a list/],
    [wall("x"), /openings must be a list/],
    [wall([null]), /opening 1 must be an object/],
    [wall([{ offset: "10", width: 30 }]), /numeric offset and width/],
    [wall([{ offset: NaN, width: 30 }]), /numeric offset and width/],
  ]) assert.throws(() => gangOpenings(p), re);
});

test("gangOpenings still gangs a good plan", () => {
  const g = gangOpenings(wall([{ kind: "window", offset: 10, width: 30, height: 40, headerHeight: 80 }, { kind: "window", offset: 42, width: 30, height: 40, headerHeight: 80 }]));
  assert.equal(g.plan.walls[0].openings.length, 1);
});

test("budgetDiff and diffText refuse hostile budgets with a reason", () => {
  const ok = { lines: [{ section: "L", item: "x", unit: "ea", qty: 1, amount: 2 }], total: 2 };
  for (const [a, b, re] of [
    [null, ok, /base budget must be an object/],
    [{}, ok, /base budget needs a list of lines/],
    [ok, { lines: [null] }, /revised budget line 1 must be an object/],
    [ok, { lines: [{ section: 1, item: "x" }] }, /text section and item/],
    [ok, { lines: [{ section: "L", item: "x", qty: "3" }] }, /quantity that is not a number/],
    [ok, { lines: [], total: NaN }, /total is not a number/],
  ]) assert.throws(() => budgetDiff(a, b), re);
  assert.throws(() => diffText({}), /result of budgetDiff/);
  assert.match(diffText(budgetDiff(ok, ok)).join("\n"), /No line changed/);
});
