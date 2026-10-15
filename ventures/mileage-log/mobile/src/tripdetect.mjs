// Automatic drive detection from a stream of GPS fixes: the part of a mileage
// tracker a web page cannot do (it needs a background location task). Pure
// functions, no platform imports, so the same code runs in the phone app and
// under `node --test`.
//
// A fix is { lat, lon, t (ms since epoch), speed (m/s or null), accuracy (m) }.
// step(state, fix) returns { state, trip }, where trip is non-null when a drive
// has just ended. flush(state) ends a drive that is still open (app shutdown).

import { haversineMiles } from "../../calc.mjs";

export const DEFAULTS = {
  maxAccuracy: 50,       // metres; worse fixes are ignored
  startSpeed: 4.5,       // m/s (~10 mph) counts as driving, not walking or cycling
  startFixes: 2,         // consecutive driving fixes needed to open a trip
  stopSpeed: 1.2,        // m/s below this counts as stopped
  stopDwellMs: 5 * 60e3, // stopped this long ends the trip (traffic lights do not)
  maxJumpSpeed: 70,      // m/s (~157 mph): an implied speed above this is a GPS glitch
  minStep: 0.01,         // miles; ignore jitter smaller than ~16 m while moving
  minMiles: 0.2,         // shorter drives are dropped (moving the car, parking lots)
  minDurationMs: 60e3,
  runGapMs: 2 * 60e3,    // moving fixes this far apart are not one run (OS paused updates between them)
};

export const initial = () => ({ mode: "idle", last: null, run: [], runOrigin: null, trip: null, stoppedSince: null });

const M_PER_MILE = 1609.344;

// Speed in m/s: the device value when present, else derived from the previous fix.
function speedOf(prev, fix) {
  if (fix.speed != null && fix.speed >= 0) return fix.speed;
  if (!prev) return 0;
  const dt = (fix.t - prev.t) / 1000;
  if (dt <= 0) return 0;
  return (haversineMiles(prev, fix) * M_PER_MILE) / dt;
}

export function step(state, fix, options = {}) {
  const o = { ...DEFAULTS, ...options };
  if (fix.accuracy != null && fix.accuracy > o.maxAccuracy) return { state, trip: null };
  if (state.last && fix.t <= state.last.t) return { state, trip: null };

  // Phones stop delivering fixes once parked (pausesUpdatesAutomatically), so a
  // drive can stay open for hours. A silence as long as the dwell time means the
  // car stopped: close that drive where it last moved, then treat this fix as
  // the first of a new one. Without this, two drives hours apart merge into one.
  if (state.mode === "driving" && state.last && fix.t - state.last.t >= o.stopDwellMs) {
    const closed = finish(state.trip, o);
    const r = step(initial(), fix, options); // no stale origin: its time and place are hours old
    return { state: r.state, trip: closed || r.trip };
  }
  if (state.mode === "idle" && state.run.length && state.last && fix.t - state.last.t > o.runGapMs) {
    return step(initial(), fix, options);
  }

  // Reject teleports: the implied speed between two fixes cannot be a car.
  if (state.last) {
    const dt = (fix.t - state.last.t) / 1000;
    const implied = (haversineMiles(state.last, fix) * M_PER_MILE) / dt;
    if (implied > o.maxJumpSpeed) return { state, trip: null };
  }

  const v = speedOf(state.last, fix);
  const moving = v >= o.startSpeed;
  const stopped = v < o.stopSpeed;
  const prev = state.last;
  const next = { ...state, last: fix };

  if (state.mode === "idle") {
    if (!moving) return { state: { ...next, run: [], runOrigin: null }, trip: null };
    // The trip began at the fix before the run, where the car was still parked.
    const runOrigin = state.run.length ? state.runOrigin : prev;
    const run = [...state.run, fix];
    if (run.length < o.startFixes) return { state: { ...next, run, runOrigin }, trip: null };
    const first = runOrigin || run[0];
    const trip = { startFix: first, endFix: fix, lastMoving: fix, miles: 0, fixes: 1, lastCounted: first };
    let t = trip;
    for (const f of run) t = advance(t, f, o);
    return { state: { ...next, mode: "driving", run: [], runOrigin: null, trip: t, stoppedSince: null }, trip: null };
  }

  // driving
  let t = state.trip;
  let stoppedSince = state.stoppedSince;
  if (stopped) {
    if (stoppedSince == null) stoppedSince = fix.t;
    if (fix.t - stoppedSince >= o.stopDwellMs) {
      return { state: { ...initial(), last: fix }, trip: finish(t, o) };
    }
    return { state: { ...next, trip: t, stoppedSince }, trip: null };
  }
  stoppedSince = null;
  t = advance(t, fix, o);
  return { state: { ...next, trip: t, stoppedSince }, trip: null };
}

function advance(t, fix, o) {
  const d = haversineMiles(t.lastCounted, fix);
  if (d < o.minStep) return { ...t, endFix: fix, lastMoving: fix };
  return { ...t, miles: t.miles + d, fixes: t.fixes + 1, lastCounted: fix, endFix: fix, lastMoving: fix };
}

function finish(t, o) {
  // The drive ended when the car last moved, not when the dwell timer fired.
  const endedAt = t.lastMoving.t;
  const startedAt = t.startFix.t;
  const miles = Math.round(t.miles * 10) / 10;
  if (t.miles < o.minMiles || endedAt - startedAt < o.minDurationMs) return null;
  return {
    startedAt,
    endedAt,
    miles,
    from: { lat: t.startFix.lat, lon: t.startFix.lon },
    to: { lat: t.lastMoving.lat, lon: t.lastMoving.lon },
  };
}

// Close a drive the OS stopped reporting on. Call it with the current time when
// the app comes to the foreground: if nothing has moved for the dwell time, the
// drive is over and is returned like any other.
export function settle(state, now, options = {}) {
  const o = { ...DEFAULTS, ...options };
  if (state.mode !== "driving" || now - state.trip.lastMoving.t < o.stopDwellMs) return { state, trip: null };
  return { state: { ...initial(), last: state.last }, trip: finish(state.trip, o) };
}

export function flush(state, options = {}) {
  const o = { ...DEFAULTS, ...options };
  if (state.mode !== "driving") return { state: initial(), trip: null };
  return { state: initial(), trip: finish(state.trip, o) };
}

// Runs a whole recorded track; handy for tests and for replaying a saved day.
export function detectTrips(fixes, options = {}) {
  let state = initial();
  const trips = [];
  for (const f of fixes) {
    const r = step(state, f, options);
    state = r.state;
    if (r.trip) trips.push(r.trip);
  }
  const end = flush(state, options);
  if (end.trip) trips.push(end.trip);
  return trips;
}
