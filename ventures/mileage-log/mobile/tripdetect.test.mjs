import test from "node:test";
import assert from "node:assert/strict";
import { detectTrips, step, initial } from "./src/tripdetect.mjs";
import { suggestCategory, toLogTrip } from "./src/classify.mjs";
import { tripMiles, validateTrip, normalizeTrip } from "../calc.mjs";

const T0 = Date.UTC(2026, 6, 14, 13, 0, 0); // Tue 2026-07-14 13:00Z
const MILE_DEG = 1 / 69.09; // degrees of latitude per mile
function drive({ startT, miles, v = 15, lat0 = 40, lon = -75, dtSec = 5, nullSpeed = false }) {
  const out = [];
  const metres = miles * 1609.344;
  const n = Math.ceil(metres / (v * dtSec));
  for (let i = 0; i <= n; i++) {
    const m = Math.min(metres, i * v * dtSec);
    out.push({ lat: lat0 + (m / 1609.344) * MILE_DEG, lon, t: startT + i * dtSec * 1000, speed: nullSpeed ? null : v, accuracy: 8 });
  }
  return out;
}
function park({ at, startT, minutes, dtSec = 30 }) {
  const out = [];
  for (let s = 0; s <= minutes * 60; s += dtSec) out.push({ lat: at.lat, lon: at.lon, t: startT + s * 1000, speed: 0, accuracy: 8 });
  return out;
}
const endOf = (fixes) => fixes[fixes.length - 1];

test("one drive then parking yields one trip with the right miles and times", () => {
  const d = drive({ startT: T0 + 10 * 60e3, miles: 5 });
  const home = park({ at: { lat: 40, lon: -75 }, startT: T0, minutes: 9, dtSec: 60 });
  const stop = park({ at: endOf(d), startT: endOf(d).t + 30e3, minutes: 8 });
  const trips = detectTrips([...home, ...d, ...stop]);
  assert.equal(trips.length, 1);
  assert.ok(Math.abs(trips[0].miles - 5) < 0.2, String(trips[0].miles));
  assert.ok(Math.abs(trips[0].endedAt - endOf(d).t) < 1000);
  assert.ok(trips[0].startedAt <= d[0].t);
  assert.ok(Math.abs(trips[0].to.lat - endOf(d).lat) < 1e-6);
});

test("speed derived from positions when the device gives none", () => {
  const d = drive({ startT: T0 + 60e3, miles: 3, nullSpeed: true });
  const trips = detectTrips([...park({ at: { lat: 40, lon: -75 }, startT: T0, minutes: 1 }), ...d, ...park({ at: endOf(d), startT: endOf(d).t + 30e3, minutes: 7 })]);
  assert.equal(trips.length, 1);
  assert.ok(Math.abs(trips[0].miles - 3) < 0.2);
});

test("a red light does not split a drive; a long stop does", () => {
  const a = drive({ startT: T0, miles: 2 });
  const light = park({ at: endOf(a), startT: endOf(a).t + 5e3, minutes: 2 });
  const b = drive({ startT: endOf(light).t + 5e3, miles: 2, lat0: endOf(a).lat });
  const stop = park({ at: endOf(b), startT: endOf(b).t + 30e3, minutes: 6 });
  assert.equal(detectTrips([...a, ...light, ...b, ...stop]).length, 1);
  const long = park({ at: endOf(a), startT: endOf(a).t + 5e3, minutes: 7 });
  const b2 = drive({ startT: endOf(long).t + 5e3, miles: 2, lat0: endOf(a).lat });
  const stop2 = park({ at: endOf(b2), startT: endOf(b2).t + 30e3, minutes: 6 });
  assert.equal(detectTrips([...a, ...long, ...b2, ...stop2]).length, 2);
});

test("walking, tiny moves and poor-accuracy fixes make no trip", () => {
  const walk = drive({ startT: T0, miles: 1, v: 1.4 });
  assert.equal(detectTrips(walk).length, 0);
  const shortHop = drive({ startT: T0, miles: 0.05 });
  assert.equal(detectTrips([...shortHop, ...park({ at: endOf(shortHop), startT: endOf(shortHop).t + 30e3, minutes: 7 })]).length, 0);
  const bad = drive({ startT: T0, miles: 3 }).map((f) => ({ ...f, accuracy: 300 }));
  assert.equal(detectTrips(bad).length, 0);
});

test("a GPS teleport does not add phantom miles", () => {
  const d = drive({ startT: T0, miles: 4 });
  d.splice(40, 0, { ...d[39], lat: d[39].lat + 5, t: d[39].t + 1000, speed: 15, accuracy: 8 });
  const trips = detectTrips([...d, ...park({ at: endOf(d), startT: endOf(d).t + 30e3, minutes: 7 })]);
  assert.equal(trips.length, 1);
  assert.ok(trips[0].miles < 4.3, String(trips[0].miles));
});

test("a drive still open at shutdown is saved by flush", () => {
  assert.equal(detectTrips(drive({ startT: T0, miles: 3 })).length, 1);
});

test("out-of-order fixes are ignored", () => {
  const f = { lat: 40, lon: -75, t: T0, speed: 0, accuracy: 5 };
  const s = step(initial(), f).state;
  assert.equal(step(s, { ...f, t: T0 - 1000 }).state, s);
});

test("classifier learns a place, explains itself, and stays quiet with too little evidence", () => {
  const office = { lat: 40.5, lon: -75 };
  const hist = [1, 2, 3, 4].map((i) => ({ to: office, from: { lat: 40, lon: -75 }, category: "commute", startedAt: T0 + i * 864e5 }));
  const s = suggestCategory(hist, { to: office, from: { lat: 40, lon: -75 }, startedAt: T0 + 9 * 864e5 });
  assert.equal(s.category, "commute");
  assert.equal(s.auto, true);
  assert.match(s.reason, /4 earlier drives/);
  assert.equal(suggestCategory(hist.slice(0, 1), { to: office, startedAt: T0 }), null);
  assert.equal(suggestCategory(hist, { to: { lat: 41, lon: -75 }, startedAt: T0 }), null);
  const mixed = [...hist, { to: office, category: "business", startedAt: T0 }, { to: office, category: "business", startedAt: T0 }];
  assert.equal(suggestCategory(mixed, { to: office, startedAt: T0 }).auto, false);
});

test("a detected drive becomes a log trip the web app's checks accept", () => {
  const d1 = { startedAt: T0, endedAt: T0 + 20 * 60e3, miles: 12.3, from: {}, to: {} };
  const t = toLogTrip(d1, "business", { to: "Acme site", purpose: "Install visit" });
  assert.equal(t.date, "2026-07-14");
  assert.equal(validateTrip(t).ok, true);
  assert.equal(tripMiles(normalizeTrip(t)), 12.3);
  assert.equal(validateTrip(toLogTrip(d1, "business")).ok, false);
  assert.equal(toLogTrip({ ...d1, startedAt: Date.UTC(2026, 0, 1, 2) }, "personal", { utcOffsetMin: -300 }).date, "2025-12-31");
});

test("the shapes App.js reads from the shared summary exist", async () => {
  const { summarize, toCsv } = await import("../calc.mjs");
  const s = summarize([], { year: 2026 }).summary;
  assert.equal(typeof s.mileageDeduction, "number");
  assert.equal(typeof s.by.business.miles, "number");
  assert.match(toCsv([]), /^date,category/);
});
