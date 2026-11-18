// The pricing oracle's chain bound (2026-11-11): with it on or off, makeSetPricer must return the same best value, and that
// value must equal brute force over every valid set of the person (openFloorByPricing enumerates them on small weeks).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, makeSetPricer, makeScorePricer, openFloorByPricing, openFloorByColumnGeneration, scoreBoundByColumnGeneration } from "./calc.mjs";

function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${8 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(12); return `${days[rnd(5)]},${a},${Math.min(24, a + 3 + rnd(7))},${1 + rnd(2)}`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots, rnd };
}

test("chain bound: the oracle's best set value equals brute force, with the bound on and off, across rest and daily rules", () => {
  let checked = 0, tighter = 0;
  for (let c = 0; c < 60; c++) {
    const { staff, slots, rnd } = seededWeek(4242 + c * 97, 3 + (c % 3), 9 + (c % 6));
    const options = { minRestHours: [10, 0, 8, 12][c % 4], maxDailyHours: c % 5 === 0 ? 8 : 0 };
    const ctx = buildContext(staff, slots, options);
    const sets = openFloorByPricing(staff, slots, options).cov.sets;
    const on = makeSetPricer(ctx), off = makeSetPricer(ctx, { chainBound: false });
    for (let trial = 0; trial < 6; trial++) {
      const w = Float64Array.from(slots, () => (rnd(4) === 0 ? 0 : rnd(1000) / 10));
      for (let p = 0; p < staff.length; p++) {
        // Some trials hold one shift the person can take and ban another, the way branch-and-price nodes do.
        const own = sets[p].filter((f) => f.length).flat();
        const need = trial % 3 === 1 && own.length ? [own[rnd(own.length)]] : [];
        const ban = new Set(trial % 3 === 2 && own.length ? [own[rnd(own.length)]] : []);
        let truth = -Infinity;
        for (const f of sets[p]) {
          if (f.some((s) => ban.has(s)) || !need.every((s) => f.includes(s))) continue;
          const v = f.reduce((a, s) => a + w[s], 0);
          if (v > truth) truth = v;
        }
        const a = on(p, w, need, ban), b = off(p, w, need, ban);
        if (truth === -Infinity) { assert.equal(a.set, null, `case ${c} p${p}`); continue; }
        assert.ok(a.exact && b.exact);
        assert.ok(Math.abs(a.value - truth) < 1e-6, `case ${c} p${p} trial ${trial}: chain bound ${a.value} vs brute force ${truth}`);
        assert.ok(Math.abs(b.value - truth) < 1e-6, `case ${c} p${p} trial ${trial}: knapsack only ${b.value} vs brute force ${truth}`);
        assert.ok(Math.abs(a.set.reduce((t, s) => t + w[s], 0) - a.value) < 1e-6);
        assert.ok(sets[p].some((f) => f.length === a.set.length && f.every((s) => a.set.includes(s))), `case ${c} p${p}: set not valid`);
        assert.ok(a.nodes <= b.nodes, `case ${c} p${p}: chain bound searched ${a.nodes} nodes, knapsack only ${b.nodes}`);
        checked++;
        if (a.nodes < b.nodes) tighter++;
      }
    }
  }
  assert.ok(checked > 500, `only ${checked} oracle calls checked`);
  assert.ok(tighter > 0, "the chain bound never cut a node");
});

test("chain bound: column generation reaches the same proven floor with the bound on and off", () => {
  for (let c = 0; c < 12; c++) {
    const { staff, slots } = seededWeek(99 + c * 31, 4 + (c % 3), 10 + (c % 5));
    const a = openFloorByColumnGeneration(staff, slots, {}, {});
    const b = openFloorByColumnGeneration(staff, slots, {}, { chainBound: false });
    assert.ok(a.proven && b.proven, `case ${c}`);
    assert.ok(Math.abs(a.floor - b.floor) < 1e-6, `case ${c}: ${a.floor} vs ${b.floor}`);
  }
});

// The pay oracle (makeScorePricer) took the same bound later on 2026-11-11: best of sum w - personScore over a person's valid
// sets. Brute force scores every valid set through the oracle itself (holding the set and banning every other shift leaves it
// nothing to add, so it returns the set and its personScore), then the search with the bound on and off must reach that value.
test("chain bound in the pay oracle: best value equals brute force, on and off, across rest, daily, overtime and fairness rules", () => {
  let checked = 0, tighter = 0;
  for (let c = 0; c < 48; c++) {
    const { staff, slots, rnd } = seededWeek(777 + c * 53, 3 + (c % 3), 9 + (c % 6));
    const options = { minRestHours: [10, 0, 8, 12][c % 4], maxDailyHours: c % 5 === 0 ? 8 : 0, balance: [0, 60, 100][c % 3], otAfter: c % 2 ? 20 : 40, dailyOtAfter: c % 7 === 0 ? 8 : 0, splitPremium: c % 4 === 1 ? 15 : 0 };
    const ctx = buildContext(staff, slots, options);
    const sets = openFloorByPricing(staff, slots, options).cov.sets;
    const on = makeScorePricer(ctx), off = makeScorePricer(ctx, { chainBound: false });
    const all = [...slots.keys()];
    for (let trial = 0; trial < 5; trial++) {
      // Duals the size of a shift's pay or a little above it, so some sets are worth taking and the bound has to cut.
      const w = Float64Array.from(slots, (s) => (rnd(5) === 0 ? 0 : ((s.end - s.start) / 60) * (5 + rnd(40))));
      for (let p = 0; p < staff.length; p++) {
        const own = sets[p].filter((f) => f.length).flat();
        const need = trial % 3 === 1 && own.length ? [own[rnd(own.length)]] : [];
        const ban = new Set(trial % 3 === 2 && own.length ? [own[rnd(own.length)]] : []);
        let truth = -Infinity;
        for (const f of sets[p]) {
          if (f.some((s) => ban.has(s)) || !need.every((s) => f.includes(s))) continue;
          const only = on(p, w, f, new Set(all.filter((s) => !f.includes(s))));
          const v = f.reduce((a, s) => a + w[s], 0) - only.cost;
          if (v > truth) truth = v;
        }
        const a = on(p, w, need, ban), b = off(p, w, need, ban);
        if (truth === -Infinity) { assert.equal(a.set, null, `case ${c} p${p}`); continue; }
        assert.ok(a.exact && b.exact);
        assert.ok(Math.abs(a.value - truth) < 1e-6, `case ${c} p${p} trial ${trial}: chain bound ${a.value} vs brute force ${truth}`);
        assert.ok(Math.abs(b.value - truth) < 1e-6, `case ${c} p${p} trial ${trial}: knapsack only ${b.value} vs brute force ${truth}`);
        assert.ok(a.nodes <= b.nodes, `case ${c} p${p}: chain bound searched ${a.nodes} nodes, knapsack only ${b.nodes}`);
        checked++;
        if (a.nodes < b.nodes) tighter++;
      }
    }
  }
  assert.ok(checked > 400, `only ${checked} oracle calls checked`);
  assert.ok(tighter > 0, "the chain bound never cut a node in the pay oracle");
});

test("chain bound in the pay oracle: the whole-score bound is the same with it on and off", () => {
  for (let c = 0; c < 8; c++) {
    const { staff, slots } = seededWeek(313 + c * 41, 4 + (c % 3), 10 + (c % 5));
    const options = { balance: 60 };
    const a = scoreBoundByColumnGeneration(staff, slots, options, {});
    const b = scoreBoundByColumnGeneration(staff, slots, options, { chainBound: false });
    assert.ok(a.proven && b.proven, `case ${c}`);
    assert.ok(Math.abs(a.floor - b.floor) < 1e-6, `case ${c}: ${a.floor} vs ${b.floor}`);
  }
});
