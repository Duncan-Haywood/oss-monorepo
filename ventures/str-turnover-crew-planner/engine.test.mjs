import test from "node:test";
import assert from "node:assert/strict";
import { parseJobs, parseClock, normalizeOptions, simulate, optimize, plan, summarize, jobValue, clock, money, MAX_JOBS } from "./engine.mjs";

test("clock parsing and formatting", () => {
  assert.equal(parseClock("8:30"), 510);
  assert.equal(parseClock("1:30pm"), 810);
  assert.equal(parseClock("12am"), 0);
  assert.equal(parseClock("12:15 PM"), 735);
  assert.equal(parseClock("25:00"), null);
  assert.equal(parseClock("9:75"), null);
  assert.equal(parseClock("13pm"), null);
  assert.equal(clock(810), "13:30");
});

test("parse reports line numbers, derives the latest start, and never throws", () => {
  const r = parseJobs("name,fee\nA,abc,1,30,11:00,15:00,1,1\nB,50,5,30,11am,3pm,1,1\nShort,10\nC,50,5,0,11:00,15:00,1,1\nD,50,5,300,11:00,15:00,1,1\nE,50,5,30,noon,15:00,1,1\nF,50,5,30,11:00,15:00,x,1\nG,50,5,30,11:00,15:00,-3,-4,note, with comma");
  assert.equal(r.jobs.length, 2);
  assert.equal(r.jobs[0].latest, 15 * 60 - 30);
  assert.equal(r.jobs[1].x, -3);
  assert.equal(r.jobs[1].note, "note,with comma");
  assert.match(r.errors[0], /^line 2: fee must be a number/);
  assert.ok(r.errors.some((e) => /^line 4: expected name/.test(e)));
  assert.ok(r.errors.some((e) => /^line 5: clean minutes must be above zero/.test(e)));
  assert.ok(r.errors.some((e) => /^line 6: the clean \(300 min\) does not fit/.test(e)));
  assert.ok(r.errors.some((e) => /^line 7: checkout must be a time/.test(e)));
  assert.ok(r.errors.some((e) => /^line 8: miles east must be a number/.test(e)));
  assert.equal(parseJobs("").jobs.length, 0);
});

test("simulate agrees with hand arithmetic", () => {
  const o = normalizeOptions({ perMile: 1, hourly: 60, speed: 60, circuity: 1, shiftStart: "08:00", shiftEnd: "17:00", crews: 1 });
  // 3 miles east: arrive 08:03, checkout 08:10 so wait 7, 30 minute clean.
  const jobs = [{ name: "a", price: 100, materials: 10, service: 30, earliest: 8 * 60 + 10, latest: 10 * 60, x: 3, y: 0 }];
  const r = simulate([0], jobs, o);
  assert.ok(r.feasible);
  assert.ok(Math.abs(r.stops[0].wait - 7) < 1e-9);
  assert.ok(Math.abs(jobValue(jobs[0], o) - 60) < 1e-9);
  assert.ok(Math.abs(r.profit - (60 - 6 - 6)) < 1e-9);
  assert.ok(Math.abs(r.home - (490 + 30 + 3)) < 1e-9);
  assert.equal(simulate([0], [{ ...jobs[0], latest: 8 * 60 + 5 }], o).feasible, false);
  assert.equal(simulate([0], jobs, { ...o, shiftEnd: 8 * 60 + 40 }).feasible, false);
  assert.equal(simulate([], jobs, o).profit, 0);
});

function* orders(items) {
  yield [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = items.filter((_, k) => k !== i);
    for (const tail of orders(rest)) yield [items[i], ...tail];
  }
}

// Reference: give every job to one of the crews or to nobody, then try every
// order for every crew.
function bruteBest(jobs, o) {
  const n = jobs.length;
  let best = 0;
  const assign = new Array(n).fill(0);
  const walk = (i) => {
    if (i === n) {
      let total = 0;
      for (let c = 1; c <= o.crews; c += 1) {
        const mine = assign.flatMap((a, k) => (a === c ? [k] : []));
        let cb = -Infinity;
        for (const seq of orders(mine)) {
          if (seq.length !== mine.length) continue;
          const r = simulate(seq, jobs, o);
          if (r.feasible) cb = Math.max(cb, r.profit);
        }
        if (cb === -Infinity) return;
        total += cb;
      }
      best = Math.max(best, total);
      return;
    }
    for (let a = 0; a <= o.crews; a += 1) {
      assign[i] = a;
      walk(i + 1);
    }
  };
  walk(0);
  return best;
}

test("optimize equals brute force over every assignment and order, for 1 to 3 crews", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let multi = 0;
  for (let trial = 0; trial < 90; trial += 1) {
    const n = 1 + Math.floor(rnd() * 5);
    const crews = 1 + (trial % 3);
    const o = normalizeOptions({ perMile: rnd() * 1.2, hourly: 10 + rnd() * 50, speed: 20 + rnd() * 30, circuity: 1 + rnd() * 0.5, shiftStart: "08:00", shiftEnd: `${14 + Math.floor(rnd() * 5)}:00`, crews });
    const jobs = Array.from({ length: n }, (_, i) => {
      const earliest = 480 + Math.floor(rnd() * 360);
      return { name: `j${i}`, price: 40 + rnd() * 300, materials: rnd() * 60, service: 30 + Math.floor(rnd() * 120), earliest, latest: earliest + Math.floor(rnd() * 150), x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
    });
    const best = bruteBest(jobs, o);
    const opt = optimize(jobs, o);
    assert.ok(Math.abs(opt.profit - best) < 1e-6, `trial ${trial}: ${opt.profit} vs ${best}`);
    const seen = new Set();
    let replay = 0;
    for (const order of opt.crews) {
      const r = simulate(order, jobs, o);
      assert.ok(r.feasible);
      replay += r.profit;
      for (const k of order) {
        assert.ok(!seen.has(k), "a job is given to two crews");
        seen.add(k);
      }
    }
    assert.ok(opt.crews.length <= crews);
    assert.ok(Math.abs(replay - opt.profit) < 1e-6);
    if (opt.crews.length > 1) multi += 1;
  }
  assert.ok(multi > 5, "the random cases should use more than one crew");
});

test("a second crew never lowers the day and the third never lowers it either", () => {
  const rows = Array.from({ length: 9 }, (_, i) => `T${i},${120 + i * 11},15,${60 + (i % 4) * 30},1${i % 3}:00,${15 + (i % 3)}:00,${(i * 3) % 11 - 5},${(i * 7) % 13 - 6}`).join("\n");
  const parsed = parseJobs(rows);
  assert.deepEqual(parsed.errors, []);
  const day = (crews) => plan(parsed, { crews }).profit;
  assert.ok(day(2) >= day(1) - 1e-9);
  assert.ok(day(3) >= day(2) - 1e-9);
});

test("a declined job's quoted minimum fee makes the optimizer take it", () => {
  const p0 = plan(parseJobs("A,300,50,120,11:00,13:00,2,2\nB,120,10,120,11:00,13:00,3,-3\nC,90,10,60,11:00,18:00,1,1"), { crews: 1 });
  assert.ok(p0.declined.length >= 1);
  for (const d of p0.declined.filter((x) => x.minPrice !== null)) {
    const jobs = p0.jobs.map((j, i) => (i === d.index ? { ...j, price: d.minPrice + 0.01 } : j));
    assert.ok(optimize(jobs, p0.options).crews.flat().includes(d.index), d.name);
    const below = p0.jobs.map((j, i) => (i === d.index ? { ...j, price: d.minPrice - 1 } : j));
    assert.ok(!optimize(below, p0.options).crews.flat().includes(d.index), `${d.name} below`);
  }
});

test("a turnover that cannot be reached in its window is declined with no fee", () => {
  const p = plan(parseJobs("Far,500,0,30,11:00,11:40,50,50\nNear,100,10,60,11:00,16:00,1,1"));
  const far = p.declined.find((d) => d.name === "Far");
  assert.match(far.reason, /cannot be reached/);
  assert.equal(far.minPrice, null);
  assert.equal(p.accepted, 1);
});

test("plan never does worse than either baseline, and baselines are feasible", () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 30; t += 1) {
    const rows = Array.from({ length: 8 }, (_, i) => `J${i},${80 + Math.floor(rnd() * 200)},${Math.floor(rnd() * 50)},${45 + Math.floor(rnd() * 120)},${9 + Math.floor(rnd() * 4)}:00,${15 + Math.floor(rnd() * 3)}:00,${Math.floor(rnd() * 20 - 10)},${Math.floor(rnd() * 20 - 10)}`);
    const p = plan(parseJobs(rows.join("\n")), { crews: 1 + (t % 3) });
    for (const b of p.baselines) {
      assert.ok(p.profit >= b.profit - 1e-9);
      for (const c of b.crews) assert.ok(simulate(c, p.jobs, p.options).feasible);
    }
    assert.ok(p.upliftVsBest >= -1e-9);
    assert.ok(p.profit >= 0);
  }
});

test("unprofitable queue yields an empty plan", () => {
  const p = plan(parseJobs("A,20,15,60,09:00,17:00,10,10"));
  assert.equal(p.accepted, 0);
  assert.equal(p.profit, 0);
  assert.equal(summarize(p).status, "none");
  assert.equal(summarize({ jobs: [] }).status, "none");
});

test("bad options and oversize queues throw readable messages", () => {
  assert.throws(() => normalizeOptions({ speed: 0 }), /speed/);
  assert.throws(() => normalizeOptions({ circuity: 0.5 }), /circuity/);
  assert.throws(() => normalizeOptions({ perMile: "x" }), /perMile/);
  assert.throws(() => normalizeOptions({ crews: 4 }), /crews must be a whole number from 1 to 3/);
  assert.throws(() => normalizeOptions({ crews: 1.5 }), /crews/);
  assert.throws(() => normalizeOptions({ shiftStart: "17:00", shiftEnd: "08:00" }), /shiftEnd/);
  assert.throws(() => normalizeOptions({ shiftEnd: "later" }), /shiftEnd/);
  const rows = Array.from({ length: MAX_JOBS + 1 }, (_, i) => `J${i},100,0,10,09:00,17:00,1,1`).join("\n");
  assert.throws(() => plan(parseJobs(rows)), /at most 12 turnovers/);
});

test("a twelve turnover queue with three crews solves quickly", () => {
  const rows = Array.from({ length: MAX_JOBS }, (_, i) => `J${i},${120 + i * 9},10,45,09:00,17:00,${(i * 3) % 11 - 5},${(i * 7) % 13 - 6}`).join("\n");
  const t0 = Date.now();
  const p = plan(parseJobs(rows), { crews: 3 });
  assert.ok(p.accepted > 0);
  assert.ok(Date.now() - t0 < 20000, `took ${Date.now() - t0}ms`);
});

test("money formats", () => {
  assert.equal(money(-3.456), "-$3.46");
});
