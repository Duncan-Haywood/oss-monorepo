// Remembered pair searches (2026-11-15, README "Remembered pair searches", eval/pair-memo.mjs): a pair verdict is reused only
// when every list its search read is unchanged, so a walk with the memo returns exactly what a walk without it returns.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk, coverSlackPass, pairMemo } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };

function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32); }

test("coverPairRisk: with a memo every walk matches the walk without one, over a chain of hand-overs", () => {
  for (const [P, S, wk] of [[20, 56, 2], [12, 36, 0]]) {
    const { staff: st, shifts: sh } = seededWeeks(P, S, wk + 1)[wk];
    const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
    const ctx = buildContext(staff, slots, O);
    let owner = buildRoster(staff, slots, { ...O, seed: 1 }).owner;
    const memo = pairMemo(), rand = rng(P * 7 + wk);
    for (const budget of [40, 500]) {
      for (let step = 0; step < 12; step++) {
        const single = coverRisk(ctx, owner, { budget });
        const plain = coverPairRisk(ctx, owner, { single, budget, keep: true });
        const withMemo = coverPairRisk(ctx, owner, { single, budget, keep: true, memo });
        assert.deepEqual(withMemo, plain, `P=${P} budget ${budget} step ${step}`);
        // Hand one shift to someone else eligible for it (rules may break: the walk is defined on any roster).
        const i = Math.floor(rand() * slots.length);
        const who = [];
        for (let q = 0; q < ctx.P; q++) if (ctx.elig[q][i] && q !== owner[i]) who.push(q);
        if (who.length) { owner = owner.slice(); owner[i] = who[Math.floor(rand() * who.length)]; }
      }
    }
    assert.ok(memo.hits > 0, `the memo was used (P=${P}: ${memo.hits} hits, ${memo.misses} misses)`);
  }
});

test("coverSlackPass: the pair-priced pass takes the same moves with the memo on and off", () => {
  const { staff: st, shifts: sh } = seededWeeks(20, 56, 3)[2];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, O);
  const start = buildRoster(staff, slots, { ...O, seed: 1 }).owner;
  const off = coverSlackPass(ctx, start, { price: 25, pairPrice: 1, rounds: 3 });
  const on = coverSlackPass(ctx, start, { price: 25, pairPrice: 1, pairMemo: true, rounds: 3 });
  assert.deepEqual(on.owner, off.owner);
  assert.equal(on.moves, off.moves);
  assert.equal(on.pairHours, off.pairHours);
  assert.equal(on.pairsSearched, off.pairsSearched);
  assert.equal(off.pairMemoHits, 0);
  assert.ok(on.pairMemoHits > 0);
});

test("buildRoster: coverPairMemo: true turns the memo on and changes nothing else", () => {
  const { staff: st, shifts: sh } = seededWeeks(8, 24, 1)[0];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const base = { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1 };
  const off = buildRoster(staff, slots, base), on = buildRoster(staff, slots, { ...base, coverPairMemo: true });
  assert.deepEqual(on.owner, off.owner);
  assert.equal(off.coverSlack.pairMemoHits, 0);
  assert.equal(on.coverSlack.pairHours, off.coverSlack.pairHours);
});

test("coverPairRisk: handOut orders change only the order shifts are handed out; the pairs walked are the same", () => {
  const { staff: st, shifts: sh } = seededWeeks(12, 36, 1)[0];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, O);
  const owner = buildRoster(staff, slots, { ...O, seed: 1 }).owner;
  const single = coverRisk(ctx, owner);
  const usual = coverPairRisk(ctx, owner, { single, keep: true });
  for (const handOut of ["fewest", "takers"]) {
    const r = coverPairRisk(ctx, owner, { single, keep: true, handOut });
    assert.equal(r.pairs, usual.pairs);
    assert.deepEqual(r.checked.map((c) => [c.a, c.b]), usual.checked.map((c) => [c.a, c.b]));
  }
});
