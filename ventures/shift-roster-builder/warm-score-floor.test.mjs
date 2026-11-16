// The priced clique LP started from the open-hours clique LP's optimal basis (calc.mjs warmBasis, README "The pay floor from the
// open-hours LP's basis"): the warm start must take, and must land on the same LP value and dual bound as the cold solve, across
// the pay and penalty settings the score floor covers (daily caps, last week's finishes, avoid and prefer windows, tough shifts,
// minimum hours, fairness, burden, overtime, differentials).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, cliqueScoreFloor, cliqueOpenFloor, scoreFloorPlan } = _internals;

function seededWeek(seed, P, S, { daily = false, prev = false, soft = false, tough = false, mins = false } = {}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Sat"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => {
    const extra = [
      daily && rnd(2) ? `daily: ${[6, 8, 10][rnd(3)]}` : "",
      prev && rnd(2) ? `prev: Sun ${[8, 10, 11][rnd(3)]}pm` : "",
      soft && rnd(2) ? `avoid: ${["Mon", "Tue 6pm-close", "Sat"][rnd(3)]}` : "",
      soft && rnd(2) ? `prefer: ${["Tue", "Mon 6am-12pm", "Sat"][rnd(3)]}` : "",
      tough && rnd(2) ? `tough: ${rnd(4)}` : "",
    ].filter(Boolean);
    const max = [8, 16, 24, 32, 40][rnd(5)];
    return [`P${p}`, 10 + rnd(12), max, mins ? Math.min(max, [0, 4, 8, 12][rnd(4)]) : 0, `Mon-Sat ${5 + rnd(3)}-${18 + rnd(6)}`, ...extra].join(",");
  }).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 6, 8, 10][rnd(5)]; const a = 5 + rnd(11); return `${days[rnd(5)]},${a},${Math.min(24, a + L)},${1 + rnd(2)}`; }).join("\n");
  const ps = parseStaff(st);
  assert.deepEqual(ps.errors, [], st);
  return { staff: ps.staff, slots: parseShifts(sh).slots };
}

test("the warm-started priced clique LP reaches the cold solve's value and bound", () => {
  let warmTook = 0, fewer = 0, pivWarm = 0, pivCold = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const variant = { daily: seed % 3 === 1, prev: seed % 2 === 0, soft: seed % 4 < 2, tough: seed % 5 < 2, mins: seed % 3 !== 2 };
    const { staff, slots } = seededWeek(seed * 7919, 4 + (seed % 9), 8 + (seed % 17), variant);
    const options = {
      minRestHours: [0, 8, 10, 12][seed % 4], maxDailyHours: seed % 5 === 0 ? 8 : 0,
      balance: [0, 25, 100][seed % 3], toughBalance: seed % 5 < 2 ? [10, 40][seed % 2] : 0,
      burdenPct: seed % 6 === 0 ? 12 : 0, otAfter: seed % 7 === 0 ? 10 : 40, otMult: seed % 11 === 0 ? 0.9 : 1.5,
      diffWhen: seed % 4 === 3 ? "Sat; 6pm-6am" : "", diffPerHour: seed % 4 === 3 ? 2 : 0,
    };
    const ctx = buildContext(staff, slots, options);
    const open = cliqueOpenFloor(ctx);
    assert.ok(open && open.carry, `seed ${seed}: no open-hours basis`);
    const cold = cliqueScoreFloor(ctx);
    const warm = cliqueScoreFloor(ctx, { warm: open.carry });
    assert.ok(cold && warm, `seed ${seed}: LP failed`);
    const tol = 1e-6 * Math.max(1, Math.abs(cold.lp));
    assert.ok(Math.abs(warm.lp - cold.lp) <= tol, `seed ${seed}: warm LP ${warm.lp} vs cold ${cold.lp}`);
    assert.ok(Math.abs(warm.bound - cold.bound) <= tol, `seed ${seed}: warm bound ${warm.bound} vs cold ${cold.bound}`);
    if (warm.warm) warmTook++;
    if (warm.pivots < cold.pivots) fewer++;
    pivWarm += warm.pivots; pivCold += cold.pivots;
  }
  console.log(`warm score floor: ${N} weeks, warm start taken on ${warmTook}, fewer pivots on ${fewer}, pivots ${pivWarm} warm vs ${pivCold} cold`);
  assert.equal(warmTook, N, "the open-hours basis should always map into the priced LP");
  assert.ok(pivWarm < pivCold, "the warm start should save pivots overall");
});

test("a basis from a different week is refused and the priced LP falls back to a cold solve", () => {
  const a = seededWeek(11, 5, 10), b = seededWeek(12, 5, 14);
  const ca = buildContext(a.staff, a.slots, {}), cb = buildContext(b.staff, b.slots, {});
  const carry = cliqueOpenFloor(ca).carry;
  const cold = cliqueScoreFloor(cb), warm = cliqueScoreFloor(cb, { warm: carry });
  assert.equal(warm.warm, false);
  assert.ok(Math.abs(warm.bound - cold.bound) <= 1e-6 * Math.max(1, Math.abs(cold.bound)));
});

test("buildRoster reports the warm start and `scoreFloorWarm: false` turns it off", () => {
  // Two weeks only: each build spends seconds in the exact search's root bound before the pay floor runs.
  let ran = 0;
  for (let seed = 1; seed < 3; seed++) {
    const { staff, slots } = seededWeek(seed * 104729, 8, 24, { mins: true, soft: seed % 2 === 0 });
    const base = { seed, exact: true, scoreCG: false, exactMs: 1, exactNodes: 1, cliqueFloor: true, scoreFloor: true, dayLNS: false };
    const on = buildRoster(staff, slots, base);
    const off = buildRoster(staff, slots, { ...base, scoreFloorWarm: false });
    const so = on.optimality?.scoreFloor, sf = off.optimality?.scoreFloor;
    if (!so || !sf) continue; // proven before the pay floor ran
    assert.equal(so.warm, true, `seed ${seed}: warm start not taken`);
    assert.equal(sf.warm, false, `seed ${seed}: scoreFloorWarm: false still warm`);
    assert.ok(Math.abs(so.bound - sf.bound) <= 1e-6 * Math.max(1, Math.abs(sf.bound)), `seed ${seed}: ${so.bound} vs ${sf.bound}`);
    ran++;
  }
  assert.ok(ran >= 1, `the pay floor ran on only ${ran} weeks`);
});

test("the warm-sized gate: with the open-hours basis the pay floor always runs warm, stopped the reserve past the budget", () => {
  // README "A warm-sized gate for the pay floor" (2026-11-16): the warm solve's time does not follow the cold formula, so the
  // formula no longer decides when a basis is in hand; the solve gets the time left plus `scoreFloorReserveMs`. The reserve defaults to 30% of the budget, at most 6 s (README "The pay floor's
  // reserve, sized from the full solve": 6 s at the 20 s default, pre-registered in eval/pay-floor-reserve-prereg.md).
  const big = { budgetMs: 20000, copies: 245, carry: true };
  assert.deepEqual(scoreFloorPlan({}, { ...big, leftMs: 900 }), { mode: "try", reserve: 6000, untilMs: 6900 });
  // Lots of time left: the old gate ran it with no deadline; now it is still bounded by the time left plus the reserve.
  assert.deepEqual(scoreFloorPlan({}, { ...big, leftMs: 9000 }), { mode: "try", reserve: 6000, untilMs: 15000 });
  // The budget already spent: the reserve alone.
  assert.equal(scoreFloorPlan({}, { ...big, leftMs: -40 }).untilMs, 6000);
  // A shorter budget gets a shorter reserve (30% of it), a longer one no more than 6 s; an explicit value wins.
  assert.equal(scoreFloorPlan({}, { ...big, budgetMs: 3000, leftMs: 0 }).reserve, 900);
  assert.equal(scoreFloorPlan({}, { ...big, budgetMs: 60000, leftMs: 0 }).reserve, 6000);
  assert.equal(scoreFloorPlan({ scoreFloorReserveMs: 1500 }, { ...big, leftMs: 900 }).untilMs, 2400);
  // Reserve 0 is the 2026-11-14 try (stopped at the budget's end); under 250 ms it is skipped.
  assert.equal(scoreFloorPlan({ scoreFloorReserveMs: 0 }, { ...big, leftMs: 100 }).mode, "skip");
  assert.deepEqual(scoreFloorPlan({ scoreFloorReserveMs: 0 }, { ...big, leftMs: 900 }), { mode: "try", reserve: 0, untilMs: 900 });
  // No budget, or scoreFloor: true: no deadline. scoreFloor: false: never.
  assert.equal(scoreFloorPlan({}, { ...big, budgetMs: 0, leftMs: -1 }).mode, "run");
  assert.equal(scoreFloorPlan({ scoreFloor: true }, { ...big, leftMs: 0 }).mode, "run");
  assert.equal(scoreFloorPlan({ scoreFloor: false }, { ...big, leftMs: 1e9 }).mode, "skip");
  // No basis, or the try or warm start turned off: the cold formula alone (4 s x (copies / 245)^4.5).
  for (const o of [{ scoreFloorTry: false }, { scoreFloorWarm: false }, {}]) {
    const carry = !(Object.keys(o).length === 0);
    assert.equal(scoreFloorPlan(o, { ...big, carry, leftMs: 4100 }).mode, "run", JSON.stringify(o));
    assert.equal(scoreFloorPlan(o, { ...big, carry, leftMs: 3900 }).mode, "skip", JSON.stringify(o));
  }
});

test("the pay floor's skip reasons, and a try once the budget is spent only with scoreFloorSpent", () => {
  // README "The pay floor once the budget is spent" (2026-11-16, pre-registered in eval/pay-floor-spent-prereg.md).
  const { scoreFloorSkip } = _internals;
  const clique = { carry: {} }, big = { budgetMs: 20000, copies: 245, carry: true };
  const tryPlan = scoreFloorPlan({}, { ...big, leftMs: -300 });
  assert.equal(tryPlan.mode, "try");
  assert.equal(tryPlan.untilMs, 6000, "a spent budget leaves the reserve alone");
  assert.equal(scoreFloorSkip({}, { clique: null, proven: false, spent: false, plan: tryPlan }), "noClique");
  assert.equal(scoreFloorSkip({}, { clique, proven: true, spent: false, plan: tryPlan }), "proven");
  assert.equal(scoreFloorSkip({ scoreFloor: false }, { clique, proven: false, spent: false, plan: tryPlan }), "off");
  assert.equal(scoreFloorSkip({}, { clique, proven: false, spent: false, plan: tryPlan }), null);
  assert.equal(scoreFloorSkip({}, { clique, proven: false, spent: true, plan: tryPlan }), "spent");
  assert.equal(scoreFloorSkip({ scoreFloorSpent: true }, { clique, proven: false, spent: true, plan: tryPlan }), null);
  // No basis: the cold formula decides, and a spent budget never fits it.
  const coldPlan = scoreFloorPlan({ scoreFloorSpent: true }, { ...big, carry: false, leftMs: -300 });
  assert.equal(scoreFloorSkip({ scoreFloorSpent: true }, { clique: { carry: null }, proven: false, spent: true, plan: coldPlan }), "noBasis");
});
