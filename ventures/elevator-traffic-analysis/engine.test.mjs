import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightTime, personsFromLoad, reversalAndStops, distanceTo, upPeak, searchDesigns, normalise, summarise, EXAMPLE } from './engine.mjs';
import { tripSample, simulate, demandSweep, rng } from './sim.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

// Integrate a symmetric jerk-limited move step by step, independently of the
// closed forms: ramp acceleration up at j to at most a, hold, ramp down so
// velocity peaks at most v, cruise, then mirror. Returns the time to cover d.
function integratedFlight(d, { speed: v, acceleration: a, jerk: j }) {
  // Find the peak velocity reached for distance d by bisection on the
  // distance an accelerate-then-decelerate move covers with that peak.
  const accelPhase = (vp) => {
    const ap = Math.min(a, Math.sqrt(vp * j)); // peak acceleration reachable for vp
    const t = vp / ap + ap / j; // time to reach vp
    return { ap, t, dist: (vp * t) / 2 };
  };
  let lo = 0;
  let hi = v;
  if (2 * accelPhase(v).dist <= d) {
    const ph = accelPhase(v);
    return 2 * ph.t + (d - 2 * ph.dist) / v;
  }
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (2 * accelPhase(mid).dist < d) lo = mid;
    else hi = mid;
  }
  return 2 * accelPhase(lo).t;
}

// A brute-force check that an accelerate phase reaching peak velocity vp
// really covers vp*t/2 (the profile is symmetric about its midpoint).
function stepDistance(vp, a, j, dt = 1e-5) {
  const ap = Math.min(a, Math.sqrt(vp * j));
  const t1 = ap / j;
  const t2 = vp / ap - ap / j; // hold time at ap
  let acc = 0;
  let vel = 0;
  let x = 0;
  const T = 2 * t1 + t2;
  for (let t = 0; t < T; t += dt) {
    const jerk = t < t1 ? j : t < t1 + t2 ? 0 : -j;
    acc += jerk * dt;
    vel += acc * dt;
    x += vel * dt;
  }
  return { x, vel, T };
}

test('the symmetric-profile shortcut used below matches brute-force integration', () => {
  for (const [vp, a, j] of [[2.5, 1, 1.5], [1, 1, 1.5], [0.4, 1, 1.5]]) {
    const s = stepDistance(vp, a, j);
    close(s.vel, vp, 1e-3, 'peak velocity');
    close(s.x, (vp * s.T) / 2, 2e-3, 'distance');
  }
});

test('flight time closed forms (Peters 2000, eqs 13-15) agree with an integrated profile in all three regimes', () => {
  const kin = { speed: 2.5, acceleration: 1.0, jerk: 1.5 };
  // Boundaries: av/j + v^2/a = 1.667 + 6.25 = 7.917 m; 2a^3/j^2 = 0.889 m.
  for (const d of [0.2, 0.5, 0.889, 1, 2, 3.3, 5, 7.9, 7.917, 8, 20, 100]) close(flightTime(d, kin), integratedFlight(d, kin), 1e-6, `d=${d}`);
  const fast = { speed: 6, acceleration: 1.2, jerk: 1.8 };
  for (const d of [0.5, 2, 4, 10, 40, 300]) close(flightTime(d, fast), integratedFlight(d, fast), 1e-6, `d=${d}`);
  assert.equal(flightTime(0, kin), 0);
  close(flightTime(3, { ...kin, startDelay: 0.5 }) - flightTime(3, kin), 0.5, 1e-12);
});

test('flight time is continuous and increasing across the regime boundaries', () => {
  const kin = { speed: 2.5, acceleration: 1.0, jerk: 1.5 };
  for (const b of [(2 * 1 ** 3) / 1.5 ** 2, (1 * 2.5) / 1.5 + 2.5 ** 2 / 1]) close(flightTime(b - 1e-9, kin), flightTime(b + 1e-9, kin), 1e-6, 'boundary');
  let prev = 0;
  for (let d = 0.05; d < 30; d += 0.05) {
    const t = flightTime(d, kin);
    assert.ok(t > prev, `not increasing at ${d}`);
    prev = t;
  }
});

test('rated persons are rated load / 75 kg rounded down', () => {
  assert.deepEqual([630, 800, 1000, 1275, 1600, 2000].map(personsFromLoad), [8, 10, 13, 17, 21, 26]);
});

test('equal floors reduce to the classic formulae, and one passenger stops once at the middle floor on average', () => {
  const N = 10;
  const P = 9.6;
  const { H, S } = reversalAndStops(Array(N).fill(50), P);
  close(S, N * (1 - (1 - 1 / N) ** P), 1e-9, 'S');
  let h = N;
  for (let i = 1; i < N; i++) h -= (i / N) ** P;
  close(H, h, 1e-9, 'H');
  const one = reversalAndStops(Array(N).fill(1), 1);
  close(one.S, 1, 1e-12);
  close(one.H, (N + 1) / 2, 1e-12);
  // Everyone to one floor: one stop, at that floor.
  const single = reversalAndStops([0, 0, 40, 0], 12);
  close(single.S, 1, 1e-12);
  close(single.H, 3, 1e-12);
});

test('distance to a fractional floor interpolates within that floor', () => {
  const rises = [5, 3, 4];
  assert.equal(distanceTo(0, rises), 0);
  assert.equal(distanceTo(2, rises), 8);
  assert.equal(distanceTo(2.5, rises), 10);
  assert.equal(distanceTo(3, rises), 12);
});

test('the example: components add up and the outputs are consistent', () => {
  const r = upPeak(EXAMPLE);
  assert.equal(r.persons, 17);
  close(r.P, 13.6, 1e-12);
  close(r.components.running + r.components.stopping + r.components.transfer, r.rtt, 1e-9);
  close(r.interval * EXAMPLE.lifts, r.rtt, 1e-9);
  close(r.handling, (300 * r.P * 4) / r.rtt, 1e-9);
  close(r.pctPop, (r.handling / 1080) * 100, 1e-9);
  close(r.rtt, 147.03, 0.01, 'rtt pinned');
  close(r.S, 8.325, 0.001);
  close(r.H, 11.585, 0.001);
});

test('when lifts reach rated speed between stops, RTT reduces to 2Htv + (S+1)ts + 2Ptp with ts = T - tv (eqs 7-9)', () => {
  const tall = { ...EXAMPLE, speed: 1.0, acceleration: 1.0, jerk: 2.0, floors: EXAMPLE.floors.map((f) => ({ ...f, rise: 4 })) };
  const r = upPeak(tall);
  assert.ok(r.reachesSpeedBetweenStops);
  const tv = 4 / 1.0;
  const tf1 = flightTime(4, tall);
  const ts = tf1 + tall.doorClose + tall.doorOpen - tv;
  const classic = 2 * r.H * tv + (r.S + 1) * ts + 2 * r.P * r.tp;
  close(r.rtt, classic, 1e-9);
});

test('an express zone adds 2 dX / v, losses scale the whole trip, and advance opening shortens every stop', () => {
  const base = upPeak(EXAMPLE);
  close(upPeak({ ...EXAMPLE, expressRise: 30 }).rtt - base.rtt, 60 / EXAMPLE.speed, 1e-9);
  close(upPeak({ ...EXAMPLE, lossesPct: 5 }).rtt, base.rtt * 1.05, 1e-9);
  close(base.rtt - upPeak({ ...EXAMPLE, advanceOpening: 1 }).rtt, base.S + 1, 1e-9);
});

test('Monte Carlo trips confirm S and H and land within 1% of the formula RTT', () => {
  for (const b of [EXAMPLE, { ...EXAMPLE, floors: EXAMPLE.floors.map((f, i) => ({ ...f, population: 20 + 15 * i })) }, { ...EXAMPLE, ratedLoad: 630, speed: 1.6 }]) {
    const c = tripSample(b, { trips: 40000, seed: 3 });
    // Non-integer P is sampled as a mix of floor(P) and ceil(P); S and H are convex-ish in P, so allow a small gap.
    close(c.meanStops, c.formulaStops, 0.05, 'stops');
    close(c.meanTop, c.formulaTop, 0.05, 'top');
    assert.ok(Math.abs(c.gapPct) < 1, `gap ${c.gapPct}%`);
  }
});

test('integer P: sampled stops match the formula to sampling error', () => {
  const b = { ...EXAMPLE, ratedLoad: 750, capacityFactor: 100 }; // 10 persons, P = 10 exactly
  const c = tripSample(b, { trips: 60000, seed: 9 });
  close(c.meanStops, c.formulaStops, 0.02, 'stops');
  close(c.meanTop, c.formulaTop, 0.02, 'top');
});

test('design search returns only passing, undominated designs', () => {
  const s = searchDesigns(EXAMPLE, { maxInterval: 30, minPctPop: 12 });
  assert.ok(s.frontier.length > 0);
  for (const d of s.frontier) assert.ok(d.interval <= 30 && d.pctPop >= 12);
  assert.deepEqual([s.frontier[0].lifts, s.frontier[0].ratedLoad, s.frontier[0].speed], [5, 1275, 2.5]);
  assert.equal(searchDesigns(EXAMPLE, { maxInterval: 1, minPctPop: 99 }).frontier.length, 0);
});

test('bad input is refused with a reason', () => {
  assert.throws(() => normalise({ ...EXAMPLE, floors: [] }), /at least one served floor/);
  assert.throws(() => normalise({ ...EXAMPLE, lifts: 2.5 }), /whole number/);
  assert.throws(() => normalise({ ...EXAMPLE, speed: 'fast' }), /rated speed must be a number/);
  assert.throws(() => normalise({ ...EXAMPLE, floors: [{ rise: 3, population: 0 }] }), /needs a population/);
  assert.throws(() => normalise({ ...EXAMPLE, advanceOpening: 5 }), /advance door opening/);
});

test('summary reads as observations against the targets', () => {
  const r = upPeak(EXAMPLE);
  const s = summarise(r, { maxInterval: 30, minPctPop: 12 });
  assert.match(s, /above your 30 s target/);
  assert.match(s, /below your 12% target/);
  assert.doesNotMatch(s, /compliant|you must/i);
});

test('simulation: seeded, carries the demand below saturation, and waits grow with demand', () => {
  const a = simulate(EXAMPLE, { demandPct: 6, seed: 5 });
  const b = simulate(EXAMPLE, { demandPct: 6, seed: 5 });
  assert.deepEqual(a, b);
  close(a.carriedPctPer5min, 6, 0.8, 'throughput');
  assert.ok(a.meanLoad <= a.capacity);
  const sweep = demandSweep(EXAMPLE, { from: 3, to: 14, steps: 5, reps: 2 });
  for (let i = 1; i < sweep.length; i++) assert.ok(sweep[i].meanWait > sweep[i - 1].meanWait, 'waits rise');
  // Above saturation every car leaves full.
  close(sweep[sweep.length - 1].meanLoad, 17, 0.2);
  assert.throws(() => simulate(EXAMPLE, { demandPct: 0 }), /demand/);
});

test('rng is deterministic and uniform enough', () => {
  const r = rng(42);
  let s = 0;
  for (let i = 0; i < 100000; i++) s += r();
  close(s / 100000, 0.5, 0.005);
  assert.equal(rng(1)(), rng(1)());
});
