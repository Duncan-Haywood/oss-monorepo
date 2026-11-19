// searchBest stops evaluating a candidate once it has more thin cuts than the best so
// far (perf, 2026-11-18). That is exact only if the winner and the count of layouts
// tried are what the full search gives: this pins both against a plain loop over the
// same candidates with the unbounded evaluateLayout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, evaluateLayout, searchBest, betterLayout, axisCandidates, estimateCells, validateSpec } from "./calc.mjs";

function fullSearch(spec) {
  const cellsEst = estimateCells(spec);
  const n = cellsEst < 2000 ? 16 : cellsEst < 10000 ? 10 : 6;
  const diag = spec.pattern === "diagonal";
  const swaps = spec.tileW === spec.tileH ? [false] : [false, true];
  let best = null;
  let tried = 0;
  for (const swap of swaps) {
    const lay = { angle: diag ? 45 : 0, swap };
    for (const ox of axisCandidates(spec, 0, lay, n)) {
      for (const oy of axisCandidates(spec, 1, lay, n)) {
        const r = evaluateLayout(spec, { ...lay, ox, oy });
        tried++;
        if (!best || betterLayout(r, best)) best = r;
      }
    }
  }
  best.tried = tried;
  return best;
}

test("the sliver cut-off finds the same best layout as the full search", () => {
  let seed = 9001;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let checked = 0;
  for (let n = 0; n < 24; n++) {
    const pattern = ["grid", "brick", "diagonal"][n % 3];
    const roomW = 1200 + Math.floor(rnd() * 2000), roomH = 1200 + Math.floor(rnd() * 2000);
    const obstacles = rnd() < 0.6 ? [{ x: Math.floor(rnd() * roomW * 0.5), y: Math.floor(rnd() * roomH * 0.5), w: 200 + Math.floor(rnd() * 600), h: 200 + Math.floor(rnd() * 600) }] : [];
    const spec = {
      ...DEFAULTS, roomW, roomH, pattern, obstacles, tileW: 150 + Math.floor(rnd() * 450), tileH: 150 + Math.floor(rnd() * 450),
      grout: Math.floor(rnd() * 6), wallGap: rnd() < 0.5 ? 0 : 8, brickShift: [0.5, 1 / 3, 0.25][n % 3], minCut: [50, 0, 120][Math.floor(rnd() * 3)],
      tilesPerBox: 10, boxPrice: 30,
    };
    if (validateSpec(spec).length) continue;
    assert.deepEqual(searchBest(spec), fullSearch(spec), `${pattern} #${n}`);
    checked++;
  }
  assert.ok(checked >= 15, `only ${checked} rooms checked`);
});
