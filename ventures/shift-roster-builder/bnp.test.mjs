import test from "node:test";
import assert from "node:assert/strict";
import { branchAndPriceOpen, columnGenerationOpen, hourUnit, solveLP } from "./bnp.mjs";
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, openFloorByPricing, openFloorByColumnGeneration, buildRoster } from "./calc.mjs";

// Least open hours by trying every combination of one valid set per person (small weeks only).
function bruteOpen(sets, len) {
  const P = sets.length, S = len.length, total = len.reduce((a, b) => a + b, 0);
  const used = new Uint8Array(S);
  let best = 0;
  const go = (p, covered) => {
    if (p === P) { if (covered > best) best = covered; return; }
    for (const f of sets[p]) {
      if (f.some((s) => used[s])) continue;
      for (const s of f) used[s] = 1;
      go(p + 1, covered + f.reduce((a, s) => a + len[s], 0));
      for (const s of f) used[s] = 0;
    }
  };
  go(0, 0);
  return total - best;
}

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${8 + rnd(4) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}

test("branch-and-price finds the least open hours that brute force finds, on 40 small random weeks", () => {
  for (let c = 0; c < 40; c++) {
    const { staff, slots } = seededWeek(9001 + c * 37, 3 + (c % 2), 7 + (c % 4));
    const pf = openFloorByPricing(staff, slots, {});
    const truth = bruteOpen(pf.cov.sets, pf.cov.len);
    const r = branchAndPriceOpen(pf.cov.sets, pf.cov.len); // no incumbent: it must find a roster and prove it
    assert.equal(r.proven, true, `case ${c}`);
    assert.ok(Math.abs(r.floor - truth) < 1e-9, `case ${c}: floor ${r.floor} vs brute force ${truth}`);
    assert.ok(Math.abs(r.best - truth) < 1e-9, `case ${c}: roster ${r.best} vs brute force ${truth}`);
    assert.ok(r.rootLP <= truth + 1e-9, `case ${c}: LP ${r.rootLP} above the optimum ${truth}`);
    // The roster it returns is real: each covered shift held by someone, and each person's shifts one of their valid sets.
    for (let p = 0; p < staff.length; p++) {
      const mine = [...r.roster.keys()].filter((s) => r.roster[s] === p);
      assert.ok(pf.cov.sets[p].some((f) => f.length === mine.length && f.every((s) => mine.includes(s))), `case ${c}: person ${p}`);
    }
  }
});

test("with the optimum as incumbent and a tiny node limit the floor is still a valid bound", () => {
  for (let c = 0; c < 15; c++) {
    const { staff, slots } = seededWeek(4242 + c * 11, 4, 10);
    const pf = openFloorByPricing(staff, slots, {});
    const truth = bruteOpen(pf.cov.sets, pf.cov.len);
    const r = branchAndPriceOpen(pf.cov.sets, pf.cov.len, { incumbentOpen: truth, nodeLimit: 2 });
    assert.ok(r.floor <= truth + 1e-9, `case ${c}: floor ${r.floor} above ${truth}`);
    if (r.proven) assert.equal(r.floor, truth);
  }
});

test("a person with no valid set beyond the empty one leaves their shifts open", () => {
  const sets = [[[]], [[], [0]]];
  const r = branchAndPriceOpen(sets, [4, 6]);
  assert.equal(r.floor, 6);
  assert.equal(r.proven, true);
});

test("hourUnit finds the grid shift lengths share", () => {
  assert.equal(hourUnit([4, 6, 8]), 1);
  assert.equal(hourUnit([4.5, 6]), 0.5);
  assert.equal(hourUnit([4.25, 6]), 0.25);
  assert.equal(hourUnit([4.1, 6]), 0);
});

test("buildRoster reports the branch-and-price proof in the optimality object", () => {
  const { staff, slots } = seededWeek(777, 4, 12);
  const r = buildRoster(staff, slots, { exact: true, iterations: 500, restarts: 1 });
  assert.ok(r.optimality.forcedOpenHours <= r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0) + 1e-9);
});

test("column generation gives the enumerated LP, floor and least open hours on 60 small random weeks", () => {
  for (let c = 0; c < 60; c++) {
    const { staff, slots } = seededWeek(9001 + c * 37, 3 + (c % 4), 7 + (c % 9));
    const pf = openFloorByPricing(staff, slots, {});
    const truth = bruteOpen(pf.cov.sets, pf.cov.len);
    const e = branchAndPriceOpen(pf.cov.sets, pf.cov.len);
    const r = openFloorByColumnGeneration(staff, slots, {});
    assert.equal(r.proven, true, `case ${c}`);
    assert.ok(Math.abs(r.rootLP - e.rootLP) < 1e-6, `case ${c}: root LP ${r.rootLP} vs enumerated ${e.rootLP}`);
    assert.ok(Math.abs(r.floor - truth) < 1e-6, `case ${c}: floor ${r.floor} vs brute force ${truth}`);
    assert.ok(Math.abs(r.best - truth) < 1e-6, `case ${c}: roster ${r.best} vs brute force ${truth}`);
    // Each person's shifts in the roster are one of their valid sets (the oracle never returns a set breaking a hard rule).
    for (let p = 0; p < staff.length; p++) {
      const mine = [...r.roster.keys()].filter((s) => r.roster[s] === p);
      assert.ok(pf.cov.sets[p].some((f) => f.length === mine.length && f.every((s) => mine.includes(s))), `case ${c}: person ${p}`);
    }
  }
});

test("column generation's floor stays a valid bound when the node limit or the pricing oracle stops early", () => {
  for (let c = 0; c < 15; c++) {
    const { staff, slots } = seededWeek(4242 + c * 11, 4, 10);
    const pf = openFloorByPricing(staff, slots, {});
    const truth = bruteOpen(pf.cov.sets, pf.cov.len);
    for (const cfg of [{ nodeLimit: 1 }, { maxNodes: 3 }, { maxRounds: 2 }]) {
      const r = openFloorByColumnGeneration(staff, slots, {}, { incumbentOpen: truth, ...cfg });
      assert.ok(r.floor <= truth + 1e-6, `case ${c} ${JSON.stringify(cfg)}: floor ${r.floor} above ${truth}`);
      if (r.proven) assert.ok(Math.abs(r.floor - truth) < 1e-6);
    }
  }
});

test("column generation: a person who must hold a shift no valid set allows makes the node infeasible", () => {
  // One person, shifts 0 and 1 overlap; the oracle refuses any set with both.
  const valid = (f) => !(f.includes(0) && f.includes(1));
  const price = (p, w, need, ban) => {
    let best = null, bv = -Infinity;
    for (const f of [[], [0], [1]]) {
      if (!valid([...f, ...need]) || f.some((s) => ban.has(s))) continue;
      const set = [...new Set([...f, ...need])];
      const v = set.reduce((a, s) => a + w[s], 0);
      if (v > bv) { bv = v; best = set; }
    }
    return { set: best, value: bv, exact: true };
  };
  const r = columnGenerationOpen(1, [4, 6], price);
  assert.equal(r.floor, 4);
  assert.equal(r.proven, true);
});

test("the restricted LP from a 20-person week solves instead of cycling at its optimum", () => {
  // Captured from eval/cg-scale-bench.mjs 20 56, case 1 (seeded synthetic week): 102 rows, 497 columns. Before basic values near
  // zero were snapped to zero, rounding noise kept the anti-cycling rule off and this LP passed 400,000 pivots at objective 78,
  // so buildRoster with exact: true threw "simplex pivot limit".
  const L = JSON.parse(readFileSync(new URL("./eval/fixtures/cycling-lp-20x56.json", import.meta.url), "utf8"));
  const r = solveLP(L.m, L.cols, L.cost, Int32Array.from(L.init));
  assert.ok(r.pivots < 5000, `pivots ${r.pivots}`);
  assert.ok(Math.abs(r.obj - 78) < 1e-6, `objective ${r.obj}`);
  assert.equal(r.infeasible, false);
});
