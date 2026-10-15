// Replays simulated days of noisy GPS through the detector: the thresholds in
// tripdetect.mjs are guesses until they survive realistic noise. The tracks are
// synthetic (seeded), not recordings, and say nothing about a real phone.
import test from "node:test";
import assert from "node:assert/strict";
import { detectTrips, step, settle, initial, DEFAULTS } from "./src/tripdetect.mjs";

const T0 = Date.UTC(2026, 6, 14, 12, 0, 0);
const D = 1 / 69.09; // degrees latitude per mile
const M = 1609.344;

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

// A drive along a north-south line with red lights, jitter and optional dropout.
function drive({ t0, lat0, lon = -75, miles, v = 14, dt = 5, r, lights = 0, jitter = 4, dropout = null, nullSpeed = false }) {
  const out = []; const total = miles * M; const lightAt = Array.from({ length: lights }, (_, i) => ((i + 1) / (lights + 1)) * total);
  let m = 0, t = t0, wait = 0;
  while (m < total) {
    if (wait > 0) { wait -= dt; } else {
      m = Math.min(total, m + v * dt);
      const li = lightAt.findIndex((x) => m >= x); if (li >= 0) { lightAt.splice(li, 1); wait = 70; }
    }
    t += dt * 1000;
    const stoppedNow = wait > 0;
    const inDrop = dropout && t >= dropout[0] && t <= dropout[1];
    if (inDrop) continue;
    out.push({ lat: lat0 + (m / M) * D + (gauss(r) * jitter) / 111000, lon: lon + (gauss(r) * jitter) / 85000, t, speed: nullSpeed ? null : stoppedNow ? 0 : Math.max(0, v + gauss(r) * 0.8), accuracy: 5 + r() * 15 });
  }
  return out;
}
function park({ t0, lat, lon = -75, minutes, r, dt = 60, jitter = 6, speedNoise = true }) {
  const out = [];
  for (let s = 0; s <= minutes * 60; s += dt) out.push({ lat: lat + (gauss(r) * jitter) / 111000, lon: lon + (gauss(r) * jitter) / 85000, t: t0 + s * 1000, speed: speedNoise ? Math.abs(gauss(r)) * 0.3 : 0, accuracy: 10 + r() * 30 });
  return out;
}
const last = (a) => a[a.length - 1];

test("a commuter's day: 3 drives with lights and parked jitter are 3 trips with correct miles", () => {
  const r = rng(7);
  const legs = [[3.2, 3], [6.5, 5], [2.0, 1]];
  let t = T0, lat = 40, fixes = [], truth = [];
  for (const [miles, lights] of legs) {
    fixes.push(...park({ t0: t, lat, minutes: 25, r })); t = last(fixes).t + 60e3;
    const d = drive({ t0: t, lat0: lat, miles, lights, r }); fixes.push(...d); truth.push(miles);
    t = last(d).t + 30e3; lat = lat + miles * D;
  }
  fixes.push(...park({ t0: t, lat, minutes: 20, r }));
  const trips = detectTrips(fixes);
  assert.equal(trips.length, 3, JSON.stringify(trips.map((x) => x.miles)));
  trips.forEach((x, i) => assert.ok(Math.abs(x.miles - truth[i]) / truth[i] < 0.08, `trip ${i}: ${x.miles} vs ${truth[i]}`));
});

test("parked GPS jitter with spurious speed never opens a trip", () => {
  const r = rng(11);
  const fixes = park({ t0: T0, lat: 40, minutes: 8 * 60, dt: 30, jitter: 12, r });
  assert.equal(detectTrips(fixes).length, 0);
});

test("a tunnel dropout shorter than the dwell time keeps one trip", () => {
  const r = rng(3);
  const d = drive({ t0: T0, lat0: 40, miles: 8, r, dropout: [T0 + 150e3, T0 + 270e3] });
  const trips = detectTrips([...d, ...park({ t0: last(d).t + 30e3, lat: last(d).lat, minutes: 8, r })]);
  assert.equal(trips.length, 1);
  assert.ok(trips[0].miles > 7.5 && trips[0].miles < 8.3, String(trips[0].miles));
});

test("device without speed (null) is still detected from positions", () => {
  const r = rng(5);
  const d = drive({ t0: T0, lat0: 40, miles: 4, r, nullSpeed: true, lights: 2 });
  const trips = detectTrips([...park({ t0: T0 - 600e3, lat: 40, minutes: 5, r }), ...d, ...park({ t0: last(d).t + 30e3, lat: last(d).lat, minutes: 8, r })]);
  assert.equal(trips.length, 1);
  assert.ok(Math.abs(trips[0].miles - 4) < 0.4, String(trips[0].miles));
});

test("the OS going silent after parking does not merge the next drive into this one", () => {
  const r = rng(9);
  const a = drive({ t0: T0, lat0: 40, miles: 5, r });
  const b = drive({ t0: last(a).t + 3 * 3600e3, lat0: last(a).lat, miles: 4, r });
  const trips = detectTrips([...a, ...b]);
  assert.equal(trips.length, 2, JSON.stringify(trips.map((x) => x.miles)));
  assert.ok(Math.abs(trips[0].miles - 5) < 0.4 && Math.abs(trips[1].miles - 4) < 0.4);
  assert.ok(trips[1].startedAt - trips[0].endedAt > 2.9 * 3600e3);
});

test("silence then a drive from somewhere else (phone off, car moved) does not invent the miles between", () => {
  const r = rng(13);
  const a = drive({ t0: T0, lat0: 40, miles: 3, r });
  const b = drive({ t0: last(a).t + 5 * 3600e3, lat0: 41.5, miles: 2, r }); // ~100 miles away
  const trips = detectTrips([...a, ...b]);
  assert.equal(trips.length, 2);
  assert.ok(trips.every((x) => x.miles < 4), JSON.stringify(trips.map((x) => x.miles)));
});

test("settle closes a drive the OS stopped reporting on, and only after the dwell time", () => {
  const r = rng(21);
  const d = drive({ t0: T0, lat0: 40, miles: 5, r });
  let s = initial();
  for (const f of d) s = step(s, f).state;
  assert.equal(s.mode, "driving");
  assert.equal(settle(s, last(d).t + 60e3).trip, null);      // one minute: red light, still open
  const done = settle(s, last(d).t + DEFAULTS.stopDwellMs);
  assert.ok(done.trip && Math.abs(done.trip.miles - 5) < 0.4);
  assert.equal(done.state.mode, "idle");
  assert.equal(settle(done.state, last(d).t + 3600e3).trip, null); // nothing left to close
});

test("a one-fix burst of speed after a long pause is not a drive", () => {
  const r = rng(2);
  const fixes = [...park({ t0: T0, lat: 40, minutes: 2, r }), { lat: 40.0004, lon: -75, t: T0 + 3 * 3600e3, speed: 9, accuracy: 10 }, ...park({ t0: T0 + 3 * 3600e3 + 30e3, lat: 40.0004, minutes: 10, r })];
  assert.equal(detectTrips(fixes).length, 0);
});
