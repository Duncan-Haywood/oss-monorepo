// The priced clique LP's score floor (calc.mjs cliqueScoreFloor, README "A pay floor for big weeks"): a lower bound on every
// roster's score from the clique LP with each person-shift column costed at a linear floor of what the shift adds (pay at the
// person's rate, differentials, burden, avoid, tough, prefer bonus) and the fairness and shortfall terms as convex functions of
// weekly hours. Checked against the brute-force best score on tiny seeded weeks across the pay and penalty settings, and on the
// 60 x 168 weeks of eval/end-to-end.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, _internals } from "./calc.mjs";

const { buildContext, ownerValid, scoreOwner, cliqueScoreFloor, cliqueOpenFloor, BIG } = _internals;

function seededWeek(seed, P, S, { daily = false, prev = false, soft = false, tough = false, mins = false } = {}) {
  const days = ["Mon", "Tue", "Sat"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => {
    const extra = [
      daily && rnd(2) ? `daily: ${[6, 8, 10][rnd(3)]}` : "",
      prev && rnd(2) ? `prev: Sun ${[8, 10, 11][rnd(3)]}pm` : "",
      soft && rnd(2) ? `avoid: ${["Mon", "Tue 6pm-close", "Sat"][rnd(3)]}` : "",
      soft && rnd(2) ? `prefer: ${["Tue", "Mon 6am-12pm", "Sat"][rnd(3)]}` : "",
      tough && rnd(2) ? `tough: ${rnd(4)}` : "",
    ].filter(Boolean);
    const max = [8, 11, 13, 16, 24][rnd(5)];
    return [`P${p}`, 10 + rnd(12), max, mins ? Math.min(max, [0, 4, 8, 12][rnd(4)]) : 0, `Mon-Sat ${5 + rnd(3)}-${18 + rnd(6)}`, ...extra].join(",");
  }).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 5 + rnd(11); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  const ps = parseStaff(st);
  assert.deepEqual(ps.errors, [], st);
  return { staff: ps.staff, slots: parseShifts(sh).slots };
}

function leastScore(ctx) {
  const owner = new Array(ctx.S).fill(-1);
  let least = Infinity;
  const rec = (i) => {
    if (i === ctx.S) { if (ownerValid(ctx, owner)) least = Math.min(least, scoreOwner(ctx, owner).total); return; }
    for (let p = 0; p < ctx.P; p++) { if (!ctx.elig[p][i]) continue; owner[i] = p; rec(i + 1); }
    owner[i] = -1; rec(i + 1);
  };
  rec(0);
  return least;
}

test("the priced clique LP never bounds above the brute-force best score, across pay and penalty settings", () => {
  let checked = 0, close = 0;
  const gaps = [];
  for (let seed = 1; seed < 161; seed++) {
    const variant = { daily: seed % 3 === 1, prev: seed % 2 === 0, soft: seed % 4 < 2, tough: seed % 5 < 2, mins: seed % 3 !== 2 };
    const { staff, slots } = seededWeek(seed * 6271, 3, 6, variant);
    const options = {
      minRestHours: [0, 8, 10, 12][seed % 4], maxDailyHours: seed % 5 === 0 ? 8 : 0,
      balance: [0, 25, 100][seed % 3], toughBalance: seed % 5 < 2 ? [10, 40][seed % 2] : 0,
      burdenPct: seed % 6 === 0 ? 12 : 0, otAfter: seed % 7 === 0 ? 10 : 40, otMult: seed % 11 === 0 ? 0.9 : 1.5,
      dailyOtAfter: seed % 8 === 0 ? 6 : 0, mealAfter: seed % 9 === 0 ? 5 : 0,
      diffWhen: seed % 4 === 3 ? "Sat; 6pm-6am" : "", diffPerHour: seed % 4 === 3 ? 2 : 0, diffPct: seed % 8 === 3 ? 10 : 0,
      splitPremium: seed % 10 === 0 ? 15 : 0,
    };
    const ctx = buildContext(staff, slots, options);
    const least = leastScore(ctx);
    const r = cliqueScoreFloor(ctx);
    assert.ok(r, `seed ${seed}: LP failed`);
    assert.ok(r.bound <= least + 1e-6, `seed ${seed}: bound ${r.bound} above best ${least}`);
    assert.ok(r.bound <= r.lp + 1e-3, `seed ${seed}: dual bound ${r.bound} above LP ${r.lp}`);
    // With no bonuses, never weaker than BIG x the open-hours LP bound beyond rounding: the priced LP keeps every row of it.
    if (!staff.some((q) => q.prefer)) {
      const f = cliqueOpenFloor(ctx);
      assert.ok(r.bound >= BIG * f.bound - 1e-2, `seed ${seed}: ${r.bound} under ${BIG * f.bound}`);
    }
    checked++;
    const gap = least - r.bound;
    gaps.push(gap);
    if (gap <= 0.5) close++;
  }
  gaps.sort((a, b) => a - b);
  console.log(`score floor: ${checked} weeks, within $0.50 of the best on ${close}, median gap $${gaps[gaps.length >> 1].toFixed(2)}, largest $${gaps[gaps.length - 1].toFixed(2)}`);
  assert.equal(checked, 160);
});

test("on the 60 x 168 weeks the score floor leaves dollars, not the pay bill, open", () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const P = 60, S = 168;
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const out = [];
  for (let c = 0; c < 2; c++) {
    const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const ctx = buildContext(parseStaff(st).staff, parseShifts(sh).slots, { exact: true });
    out.push(cliqueScoreFloor(ctx));
  }
  // Week 0: 300 open hours are least (HiGHS); the roster the engine holds scores about 30,020,010 (README). Week 1: column
  // generation proves 30,819,981.75 (eval/end-to-end.out.txt). The floor sits under both and within $100 of them.
  assert.ok(out[0].bound > BIG * 300 && out[0].bound < 30020010 && out[0].bound > 30020010 - 100, String(out[0].bound));
  assert.ok(out[1].bound <= 30819981.75 + 1e-6 && out[1].bound > 30819981.75 - 1, String(out[1].bound));
});
