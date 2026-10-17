import test from "node:test";
import assert from "node:assert/strict";
import { parseSignings, parseClock, normalizeOptions, simulate, optimize, plan, summarize, signingValue, clock, money, MAX_JOBS } from "./engine.mjs";

const O = normalizeOptions({});

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

test("parse reports line numbers and never throws", () => {
  const r = parseSignings("name,price\nA,abc,1,30,08:00,10:00,1,1\nB,50,5,30,8am,10am,1,1\nShort,10\nC,50,5,0,08:00,10:00,1,1\nD,50,5,30,10:00,09:00,1,1\nE,50,5,30,noon,10:00,1,1\nF,50,5,30,08:00,10:00,x,1\nG,50,5,30,08:00,10:00,-3,-4,note, with comma");
  assert.equal(r.signings.length, 2);
  assert.equal(r.signings[1].x, -3);
  assert.equal(r.signings[1].note, "note,with comma");
  assert.match(r.errors[0], /^line 2: price must be a number/);
  assert.ok(r.errors.some((e) => /^line 4: expected name/.test(e)));
  assert.ok(r.errors.some((e) => /^line 5: service minutes must be above zero/.test(e)));
  assert.ok(r.errors.some((e) => /^line 6: latest start is before/.test(e)));
  assert.ok(r.errors.some((e) => /^line 7: window opens must be a time/.test(e)));
  assert.ok(r.errors.some((e) => /^line 8: miles east must be a number/.test(e)));
  assert.equal(parseSignings("").signings.length, 0);
});

test("simulate agrees with hand arithmetic", () => {
  const o = normalizeOptions({ perMile: 1, hourly: 60, speed: 60, circuity: 1, shiftStart: "08:00", shiftEnd: "17:00" });
  // signing 3 miles east: drive 3 min, window opens 08:10 so wait 7 min, 30 min service.
  const signings = [{ name: "a", price: 100, materials: 10, service: 30, earliest: 8 * 60 + 10, latest: 10 * 60, x: 3, y: 0 }];
  const r = simulate([0], signings, o);
  assert.ok(r.feasible);
  assert.ok(Math.abs(r.stops[0].wait - 7) < 1e-9);
  assert.ok(Math.abs(r.stops[0].start - 490) < 1e-9);
  // value 100 - 10 - 30 = 60; drive out 3 + 3 min cost 3 each way ($3 miles + $3 time)
  assert.ok(Math.abs(signingValue(signings[0], o) - 60) < 1e-9);
  assert.ok(Math.abs(r.profit - (60 - 6 - 6)) < 1e-9);
  assert.ok(Math.abs(r.home - (490 + 30 + 3)) < 1e-9);
  assert.equal(simulate([0], [{ ...signings[0], latest: 8 * 60 + 5 }], o).feasible, false);
  assert.equal(simulate([0], signings, { ...o, shiftEnd: 8 * 60 + 40 }).feasible, false);
  assert.equal(simulate([], signings, o).profit, 0);
});

function* subsetsOrdered(n) {
  function* rec(used, seq) {
    yield seq;
    for (let k = 0; k < n; k += 1) if (!(used & (1 << k))) yield* rec(used | (1 << k), [...seq, k]);
  }
  yield* rec(0, []);
}

test("optimize equals brute force over every ordering of every subset", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let tight = 0;
  for (let trial = 0; trial < 120; trial += 1) {
    const n = 1 + Math.floor(rnd() * 6);
    const o = normalizeOptions({ perMile: rnd() * 1.2, hourly: 10 + rnd() * 60, speed: 20 + rnd() * 30, circuity: 1 + rnd() * 0.5, shiftStart: "08:00", shiftEnd: `${14 + Math.floor(rnd() * 5)}:00` });
    const signings = Array.from({ length: n }, (_, i) => {
      const earliest = 480 + Math.floor(rnd() * 360);
      return { name: `j${i}`, price: 40 + rnd() * 400, materials: rnd() * 120, service: 15 + Math.floor(rnd() * 90), earliest, latest: earliest + Math.floor(rnd() * 150), x: rnd() * 30 - 15, y: rnd() * 30 - 15 };
    });
    let best = 0;
    let feasibleAny = 0;
    for (const seq of subsetsOrdered(n)) {
      const r = simulate(seq, signings, o);
      if (r.feasible) {
        feasibleAny += seq.length > 0 ? 1 : 0;
        best = Math.max(best, r.profit);
      }
    }
    const opt = optimize(signings, o);
    assert.ok(Math.abs(opt.profit - best) < 1e-6, `trial ${trial}: ${opt.profit} vs ${best}`);
    const replay = simulate(opt.order, signings, o);
    assert.ok(replay.feasible);
    assert.ok(Math.abs(replay.profit - opt.profit) < 1e-6);
    if (feasibleAny > 1 && opt.order.length > 1) tight += 1;
  }
  assert.ok(tight > 20, "the random cases should exercise multi-signing routes");
});

test("a declined signing's quoted minimum price makes the optimizer take it", () => {
  const p0 = plan(parseSignings("A,300,50,60,08:00,09:00,2,2\nB,120,10,60,08:00,09:00,3,-3\nC,90,10,30,08:00,16:00,1,1"));
  assert.ok(p0.declined.length >= 1);
  for (const d of p0.declined.filter((x) => x.minPrice !== null)) {
    const signings = p0.signings.map((j, i) => (i === d.index ? { ...j, price: d.minPrice + 0.01 } : j));
    assert.ok(optimize(signings, p0.options).order.includes(d.index), d.name);
    const below = p0.signings.map((j, i) => (i === d.index ? { ...j, price: d.minPrice - 1 } : j));
    assert.ok(!optimize(below, p0.options).order.includes(d.index), `${d.name} below`);
  }
});

test("a signing that cannot fit its window is declined with no price", () => {
  const p = plan(parseSignings("Far,500,0,30,08:00,08:10,50,50\nNear,100,10,30,08:00,16:00,1,1"));
  const far = p.declined.find((d) => d.name === "Far");
  assert.match(far.reason, /cannot be reached/);
  assert.equal(far.minPrice, null);
  assert.equal(p.accepted, 1);
});

test("plan never does worse than either baseline, and baselines are feasible", () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 40; t += 1) {
    const rows = Array.from({ length: 8 }, (_, i) => `J${i},${50 + Math.floor(rnd() * 300)},${Math.floor(rnd() * 100)},${20 + Math.floor(rnd() * 60)},${8 + Math.floor(rnd() * 6)}:00,${12 + Math.floor(rnd() * 4)}:00,${Math.floor(rnd() * 20 - 10)},${Math.floor(rnd() * 20 - 10)}`);
    const p = plan(parseSignings(rows.join("\n")));
    for (const b of p.baselines) {
      assert.ok(p.profit >= b.profit - 1e-9);
      assert.ok(simulate(b.order, p.signings, p.options).feasible);
    }
    assert.ok(p.upliftVsBest >= -1e-9);
    assert.ok(p.profit >= 0);
  }
});

test("unprofitable queue yields an empty plan", () => {
  const p = plan(parseSignings("A,20,15,60,08:00,16:00,10,10"));
  assert.equal(p.accepted, 0);
  assert.equal(p.profit, 0);
  assert.equal(summarize(p).status, "none");
  assert.equal(summarize({ signings: [] }).status, "none");
});

test("bad options and oversize queues throw readable messages", () => {
  assert.throws(() => normalizeOptions({ speed: 0 }), /speed/);
  assert.throws(() => normalizeOptions({ circuity: 0.5 }), /circuity/);
  assert.throws(() => normalizeOptions({ perMile: "x" }), /perMile/);
  assert.throws(() => normalizeOptions({ shiftStart: "17:00", shiftEnd: "08:00" }), /shiftEnd/);
  assert.throws(() => normalizeOptions({ shiftEnd: "later" }), /shiftEnd/);
  const rows = Array.from({ length: MAX_JOBS + 1 }, (_, i) => `J${i},100,0,10,08:00,16:00,1,1`).join("\n");
  assert.throws(() => plan(parseSignings(rows)), /at most 14 signings/);
});

test("a fourteen signing queue solves quickly", () => {
  const rows = Array.from({ length: MAX_JOBS }, (_, i) => `J${i},${120 + i * 9},10,20,08:00,16:00,${(i * 3) % 11 - 5},${(i * 7) % 13 - 6}`).join("\n");
  const t0 = Date.now();
  const p = plan(parseSignings(rows));
  assert.ok(p.accepted > 0);
  assert.ok(Date.now() - t0 < 20000);
});

test("money formats", () => {
  assert.equal(money(-3.456), "-$3.46");
});
