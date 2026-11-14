// Column generation's time share on big weeks (calc.mjs scoreCGBudgetMs, README "Room for the clique LP on the biggest weeks"):
// half of what is left, unless that would leave the open-hours clique LP less than its expected cost; then what leaves it that
// cost plus 1 s, never under 1 s.
import test from "node:test";
import assert from "node:assert/strict";
import { _internals } from "./calc.mjs";

const { scoreCGBudgetMs, cliqueCostMs } = _internals;

test("weeks whose clique LP fits after the half keep the half", () => {
  for (const S of [60, 120, 245, 304, 326]) assert.equal(scoreCGBudgetMs(17000, S), 8500, `S=${S}`);
});

test("on 400-copy weeks the clique LP gets its expected cost plus a second", () => {
  const left = 17000, cg = scoreCGBudgetMs(left, 400);
  assert.ok(cg < 8500);
  assert.ok(Math.abs(left - cg - (cliqueCostMs(400) + 1000)) < 1e-6);
});

test("never under 1 s, and the share only ever shrinks", () => {
  for (let left = 0; left <= 60000; left += 500) {
    for (const S of [100, 245, 330, 360, 400]) {
      const cg = scoreCGBudgetMs(left, S), half = Math.max(1000, left / 2);
      assert.ok(cg >= 1000 && cg <= half, `left=${left} S=${S} cg=${cg}`);
      if (left - half >= cliqueCostMs(S)) assert.equal(cg, half);
    }
  }
});

test("cliqueRoom: false and cliqueFloor: false keep the plain half", () => {
  assert.equal(scoreCGBudgetMs(17000, 400, { cliqueRoom: false }), 8500);
  assert.equal(scoreCGBudgetMs(17000, 400, { cliqueFloor: false }), 8500);
});
