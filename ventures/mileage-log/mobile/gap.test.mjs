import test from "node:test";
import assert from "node:assert/strict";
import { detectTrips } from "./src/tripdetect.mjs";

const T0 = Date.UTC(2026, 6, 14, 13, 0, 0);
const MILE_DEG = 1 / 69.09;
function drive({ startT, miles, v = 15, lat0 = 40, lon = -75, dtSec = 5 }) {
  const out = [];
  const metres = miles * 1609.344;
  const n = Math.ceil(metres / (v * dtSec));
  for (let i = 0; i <= n; i++) {
    const m = Math.min(metres, i * v * dtSec);
    out.push({ lat: lat0 + (m / 1609.344) * MILE_DEG, lon, t: startT + i * dtSec * 1000, speed: v, accuracy: 8 });
  }
  return out;
}
const endOf = (f) => f[f.length - 1];

// iOS stops delivering fixes once the phone has been still for a while, so a
// parked car leaves a long hole in the stream, not five minutes of zero-speed fixes.
test("a long silence after parking ends the first drive; the next drive is its own trip", () => {
  const a = drive({ startT: T0, miles: 4 });
  const parked = { ...endOf(a), t: endOf(a).t + 20e3, speed: 0 };
  const b = drive({ startT: T0 + 3 * 3600e3, miles: 3, lat0: 40.5, lon: -74.9 });
  const trips = detectTrips([...a, parked, ...b]);
  assert.equal(trips.length, 2);
  assert.ok(Math.abs(trips[0].miles - 4) < 0.2, `first drive ${trips[0].miles}`);
  assert.ok(Math.abs(trips[1].miles - 3) < 0.2, `second drive ${trips[1].miles}`);
  assert.equal(trips[0].endedAt, endOf(a).t);
});

test("silence in the middle of a drive that resumes quickly stays one trip", () => {
  const a = drive({ startT: T0, miles: 6 });
  const cut = a.filter((f) => f.t < T0 + 100e3 || f.t > T0 + 160e3); // 60 s tunnel
  const trips = detectTrips(cut);
  assert.equal(trips.length, 1);
  assert.ok(Math.abs(trips[0].miles - 6) < 0.2);
});
