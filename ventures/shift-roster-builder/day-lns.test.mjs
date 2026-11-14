// Day-by-day exact reassignment (calc.mjs assignRows, dayReassign; README "Re-solving one day at a time"): the assignment solver
// against brute force on small matrices, and each day of dayReassign's roster checked against brute force over that day's
// staffing with every other day held, on seeded weeks across rest gaps, daily caps, last week's finishes, minimum hours, fairness,
// avoid and prefer windows and overtime.
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, _internals } from "./calc.mjs";

const { buildContext, ownerValid, scoreOwner, assignRows, dayReassign } = _internals;

test("assignRows finds the least-cost assignment, as brute force does", () => {
  let seed = 77;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) / 8388608; };
  for (let t = 0; t < 400; t++) {
    const n = 1 + (t % 4), m = n + (t % 3);
    const a = Float64Array.from({ length: n * m }, () => (rnd() < 0.2 ? 1e15 : Math.round(rnd() * 1000) / 10));
    let least = Infinity;
    const used = new Array(m).fill(false);
    const rec = (r, sum) => {
      if (r === n) { least = Math.min(least, sum); return; }
      for (let j = 0; j < m; j++) if (!used[j]) { used[j] = true; rec(r + 1, sum + a[r * m + j]); used[j] = false; }
    };
    rec(0, 0);
    const col = assignRows(a, n, m);
    assert.equal(new Set(col).size, n);
    let got = 0;
    for (let r = 0; r < n; r++) got += a[r * m + col[r]];
    assert.ok(Math.abs(got - least) < 1e-6, `trial ${t}: ${got} vs ${least}`);
  }
});

function seededWeek(seed, P, S, { daily = false, prev = false, soft = false, mins = false } = {}) {
  const days = ["Mon", "Tue", "Sat"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => {
    const extra = [
      daily && rnd(2) ? `daily: ${[6, 8, 10][rnd(3)]}` : "",
      prev && rnd(2) ? `prev: Sun ${[8, 10, 11][rnd(3)]}pm` : "",
      soft && rnd(2) ? `avoid: ${["Mon", "Tue 6pm-close", "Sat"][rnd(3)]}` : "",
      soft && rnd(2) ? `prefer: ${["Tue", "Mon 6am-12pm", "Sat"][rnd(3)]}` : "",
    ].filter(Boolean);
    const max = [8, 11, 13, 16, 24][rnd(5)];
    return [`P${p}`, 10 + rnd(12), max, mins ? Math.min(max, [0, 4, 8, 12][rnd(4)]) : 0, `Mon-Sat ${5 + rnd(3)}-${18 + rnd(6)}`, ...extra].join(",");
  }).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 5 + rnd(11); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  const ps = parseStaff(st);
  assert.deepEqual(ps.errors, [], st);
  return { staff: ps.staff, slots: parseShifts(sh).slots };
}

// Least score over every way to staff day d (each copy open or given to one eligible person) with the other days as in `owner`,
// keeping only rosters that are valid and give each person at most one shift that day (the neighbourhood dayReassign searches).
function bestDay(ctx, owner, d) {
  const rows = [];
  for (let i = 0; i < ctx.S; i++) if (ctx.slots[i].day === d) rows.push(i);
  const o = Array.from(owner);
  let least = Infinity;
  const rec = (k) => {
    if (k === rows.length) {
      const per = new Map();
      for (const i of rows) if (o[i] >= 0) per.set(o[i], (per.get(o[i]) || 0) + 1);
      if ([...per.values()].some((v) => v > 1) || !ownerValid(ctx, o)) return;
      least = Math.min(least, scoreOwner(ctx, o).total);
      return;
    }
    const i = rows[k];
    o[i] = -1; rec(k + 1);
    for (let p = 0; p < ctx.P; p++) if (ctx.elig[p][i]) { o[i] = p; rec(k + 1); }
    o[i] = owner[i];
  };
  rec(0);
  return least;
}

test("dayReassign keeps every rule, never raises the score, and leaves no day that brute force can staff for less", () => {
  let improved = 0, checkedDays = 0;
  for (let seed = 1; seed < 121; seed++) {
    const variant = { daily: seed % 3 === 1, prev: seed % 2 === 0, soft: seed % 4 < 2, mins: seed % 3 !== 2 };
    const { staff, slots } = seededWeek(seed * 4099, 3, 6, variant);
    const options = {
      minRestHours: [0, 8, 10, 12][seed % 4], maxDailyHours: seed % 5 === 0 ? 8 : 0, balance: [0, 25, 100][seed % 3],
      otAfter: seed % 7 === 0 ? 10 : 40, dailyOtAfter: seed % 8 === 0 ? 6 : 0,
    };
    const ctx = buildContext(staff, slots, options);
    // Start from a greedy roster: each copy, in order, to the first person who can take it.
    const start = new Array(ctx.S).fill(-1);
    for (let i = 0; i < ctx.S; i++) for (let p = 0; p < ctx.P; p++) {
      if (!ctx.elig[p][i]) continue;
      start[i] = p;
      if (ownerValid(ctx, start)) break;
      start[i] = -1;
    }
    const before = scoreOwner(ctx, start).total;
    const out = dayReassign(ctx, start, { rounds: 50 });
    assert.ok(ownerValid(ctx, out), `seed ${seed}: invalid roster`);
    const after = scoreOwner(ctx, out).total;
    assert.ok(after <= before + 1e-6, `seed ${seed}: ${after} > ${before}`);
    if (after < before - 1e-6) improved++;
    // Sweeps stop when no day changes, so every day is at its best given the others (within each person-one-shift limit).
    const lists = scoreOwner(ctx, out).lists;
    for (const d of new Set(ctx.slots.map((s) => s.day))) {
      const two = lists.some((l) => l.filter((i) => ctx.slots[i].day === d).length > 1);
      if (two) continue; // a person on two shifts that day sits it out, so the day is not fully re-solved
      checkedDays++;
      assert.ok(bestDay(ctx, out, d) >= after - 1e-6, `seed ${seed}, day ${d}: brute force ${bestDay(ctx, out, d)} < ${after}`);
    }
  }
  assert.ok(improved >= 30, `improved ${improved}`);
  assert.ok(checkedDays >= 200, `checked ${checkedDays}`);
});

test("buildRoster does not run the pass on a week the exact check proves", () => {
  const staff = parseStaff("Ana,15,40\nBen,16,40\nCal,14,30").staff;
  const slots = parseShifts("Mon,9,17,2\nTue,9,17,2\nWed,9,17,1").slots;
  const r = buildRoster(staff, slots, { exact: true });
  assert.equal(r.optimality.status === "optimal" || r.optimality.status === "improved", true);
  assert.equal(r.optimality.dayLNS, null);
});
