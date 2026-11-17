// Up-peak lift (elevator) traffic analysis.
//
// The round trip time method follows R. D. Peters, "Improvements to the Up
// Peak Round Trip Time Calculation", International Journal of Elevator
// Engineers 3(1), 2000, which restates Barney and dos Santos's generally
// accepted formulae (Elevator Traffic Analysis Design and Control, 2nd edn,
// 1985) and adds flight times from jerk-limited kinematics, a correction for
// lifts that do not reach rated speed between stops, unequal floor heights and
// an express zone term. Equation numbers below are that paper's. The code is
// our own; only the published formulae are borrowed.
//
// Units: metres, seconds, kilograms, persons.

export const SOURCE = {
  peters2000: 'R. D. Peters, "Improvements to the Up Peak Round Trip Time Calculation", International Journal of Elevator Engineers 3(1), 2000',
  barney1985: 'G. C. Barney and S. M. dos Santos, Elevator Traffic Analysis Design and Control, 2nd edn, Peter Peregrinus, 1985',
};

// Example building: a 12-storey office above the entrance lobby.
export const EXAMPLE = Object.freeze({
  name: 'Example: 12 office floors above the lobby',
  lifts: 4,
  ratedLoad: 1275,          // kg
  capacityFactor: 80,       // % of rated persons on an average up-peak trip
  speed: 2.5,               // m/s
  acceleration: 1.0,        // m/s^2
  jerk: 1.5,                // m/s^3
  startDelay: 0.5,          // s, motor start allowance
  doorOpen: 2.0,            // s
  doorClose: 3.0,           // s
  advanceOpening: 0,        // s
  loadTime: 1.2,            // s per person boarding
  unloadTime: 1.2,          // s per person alighting
  expressRise: 0,           // m of unserved floors passed above the lobby
  lossesPct: 0,             // % added to the round trip time
  floors: Array.from({ length: 12 }, (_, i) => ({ name: `L${i + 1}`, rise: 3.6, population: 90 })),
});

// Persons a car is rated for, counted the EN 81-20 way: rated load / 75 kg,
// rounded down.
export function personsFromLoad(ratedLoadKg) {
  return Math.floor(ratedLoadKg / 75 + 1e-9);
}

// Shortest move (m) in which a lift starting and ending at rest reaches rated
// speed. A slow lift (v < a^2/j) reaches rated speed before it reaches full
// acceleration, so its peak acceleration is sqrt(vj) instead of a.
export function ratedSpeedDistance({ speed: v, acceleration, jerk: j }) {
  const a = Math.min(acceleration, Math.sqrt(v * j));
  return (a * a * v + v * v * j) / (j * a);
}

// Flight time over a distance d for a lift with rated speed v, acceleration a
// and jerk j, starting and ending at rest (Peters 2000, eqs 13-15), plus a
// motor start allowance. For a slow lift the same formulae hold with the
// peak acceleration sqrt(vj) in place of a (see ratedSpeedDistance).
export function flightTime(d, { speed: v, acceleration, jerk: j, startDelay = 0 }) {
  if (!(d > 0)) return 0;
  const a = Math.min(acceleration, Math.sqrt(v * j));
  if (d >= ratedSpeedDistance({ speed: v, acceleration, jerk: j })) return d / v + a / j + v / a + startDelay; // reaches rated speed
  if (d >= (2 * a ** 3) / (j * j)) return (a / j) * (1 + Math.sqrt(1 + (4 * d * j * j) / a ** 3)) + startDelay; // reaches a, not v
  return Math.cbrt((32 * d) / j) + startDelay; // never reaches a
}

// Distance from the lobby to a (possibly fractional) floor position h, where
// floor k sits at the sum of the rises of floors 1..k (Peters 2000, eq 17).
export function distanceTo(h, rises) {
  const whole = Math.min(Math.floor(h), rises.length);
  let d = 0;
  for (let i = 0; i < whole; i++) d += rises[i];
  const frac = h - whole;
  if (frac > 0 && whole < rises.length) d += frac * rises[whole];
  return d;
}

function num(x, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const v = typeof x === 'string' ? Number(x) : x;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
  if (v < min || v > max) throw new Error(`${name} must be between ${min} and ${max}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
  return v;
}

// Checks and normalises an input, filling defaults from EXAMPLE's dynamics.
export function normalise(input) {
  if (!input || typeof input !== 'object') throw new Error('input must be an object');
  const floors = input.floors;
  if (!Array.isArray(floors) || floors.length === 0) throw new Error('add at least one served floor above the lobby');
  if (floors.length > 200) throw new Error('at most 200 served floors');
  const f = floors.map((fl, i) => {
    if (!fl || typeof fl !== 'object') throw new Error(`floor ${i + 1} must have a rise and a population`);
    return {
      name: String(fl.name ?? `Floor ${i + 1}`).slice(0, 40),
      rise: num(fl.rise, `floor ${i + 1} rise`, { min: 0.5, max: 50 }),
      population: num(fl.population, `floor ${i + 1} population`, { min: 0, max: 100000 }),
    };
  });
  const out = {
    lifts: num(input.lifts, 'number of lifts', { min: 1, max: 32, integer: true }),
    ratedLoad: num(input.ratedLoad, 'rated load', { min: 150, max: 10000 }),
    capacityFactor: num(input.capacityFactor ?? 80, 'capacity factor', { min: 1, max: 100 }),
    speed: num(input.speed, 'rated speed', { min: 0.1, max: 20 }),
    acceleration: num(input.acceleration, 'acceleration', { min: 0.1, max: 5 }),
    jerk: num(input.jerk, 'jerk', { min: 0.1, max: 10 }),
    startDelay: num(input.startDelay ?? 0, 'start delay', { min: 0, max: 10 }),
    doorOpen: num(input.doorOpen, 'door opening time', { min: 0, max: 20 }),
    doorClose: num(input.doorClose, 'door closing time', { min: 0, max: 20 }),
    advanceOpening: num(input.advanceOpening ?? 0, 'advance door opening', { min: 0, max: 5 }),
    loadTime: num(input.loadTime, 'loading time per person', { min: 0, max: 10 }),
    unloadTime: num(input.unloadTime, 'unloading time per person', { min: 0, max: 10 }),
    expressRise: num(input.expressRise ?? 0, 'express zone rise', { min: 0, max: 1000 }),
    lossesPct: num(input.lossesPct ?? 0, 'losses', { min: 0, max: 50 }),
    persons: input.persons == null || input.persons === '' ? null : num(input.persons, 'rated persons', { min: 1, max: 200, integer: true }),
    floors: f,
  };
  if (out.advanceOpening > out.doorOpen) throw new Error('advance door opening cannot exceed the door opening time');
  if (f.reduce((s, x) => s + x.population, 0) <= 0) throw new Error('at least one floor needs a population');
  return out;
}

// Average highest reversal floor H (eq 3) and average stops S (eq 4) for P
// passengers whose destinations are drawn with probability U_i / U.
export function reversalAndStops(populations, P) {
  const U = populations.reduce((s, x) => s + x, 0);
  const N = populations.length;
  let H = N;
  let cum = 0;
  for (let j = 0; j < N - 1; j++) {
    cum += populations[j];
    H -= (cum / U) ** P;
  }
  let S = N;
  for (const u of populations) S -= (1 - u / U) ** P;
  return { H, S };
}

// The up-peak round trip time calculation (Peters 2000, eqs 1-12, 17-20).
export function upPeak(raw) {
  const x = normalise(raw);
  const CC = x.persons ?? personsFromLoad(x.ratedLoad);
  const P = (x.capacityFactor / 100) * CC; // eq 1
  const pops = x.floors.map((f) => f.population);
  const rises = x.floors.map((f) => f.rise);
  const Ueff = pops.reduce((s, u) => s + u, 0); // eq 2
  const { H, S } = reversalAndStops(pops, P); // eqs 3, 4
  const tp = (x.loadTime + x.unloadTime) / 2; // eq 5
  const dH = distanceTo(H, rises); // eq 17
  const kin = { speed: x.speed, acceleration: x.acceleration, jerk: x.jerk, startDelay: x.startDelay };
  const hop = dH / S; // average distance between stops
  const flightPerStop = flightTime(hop, kin) - hop / x.speed; // time a stop adds beyond running at rated speed
  const doorsPerStop = x.doorClose + x.doorOpen - x.advanceOpening;
  const ts = flightPerStop + doorsPerStop; // eq 18
  const running = (2 * (dH + x.expressRise)) / x.speed;
  const stopping = (S + 1) * ts;
  const transfer = 2 * P * tp;
  const base = running + stopping + transfer; // eq 20
  const losses = base * (x.lossesPct / 100);
  const rtt = base + losses;
  const interval = rtt / x.lifts; // eq 10
  const handling = (300 * P * x.lifts) / rtt; // eq 11
  const pctPop = (handling * 100) / Ueff; // eq 12
  const avgRise = rises.reduce((s, r) => s + r, 0) / rises.length;
  return {
    input: x,
    persons: CC,
    P,
    Ueff,
    H,
    S,
    dH,
    hop,
    tp,
    tv: avgRise / x.speed,
    tf1: flightTime(avgRise, kin),
    ts,
    flightPerStop,
    doorsPerStop,
    rtt,
    components: { running, stopping, transfer, losses },
    interval,
    handling,
    pctPop,
    reachesSpeedBetweenStops: hop >= ratedSpeedDistance(kin),
  };
}

// Common rated loads (kg) offered for passenger lifts; ISO 4190-1 lists these
// among its sizes. The user can type any other.
export const COMMON_LOADS = [630, 800, 1000, 1275, 1600, 1800, 2000, 2500];
export const COMMON_SPEEDS = [1.0, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0];

// Every combination of lifts, load and speed that meets an interval target
// and a handling-capacity target, cheapest-looking first (fewest lifts, then
// smallest car, then slowest speed). Acceleration and jerk stay as entered.
export function searchDesigns(raw, { maxInterval = 30, minPctPop = 12, lifts = [1, 2, 3, 4, 5, 6, 7, 8], loads = COMMON_LOADS, speeds = COMMON_SPEEDS } = {}) {
  const rows = [];
  for (const L of lifts) {
    for (const load of loads) {
      for (const speed of speeds) {
        const r = upPeak({ ...raw, lifts: L, ratedLoad: load, speed, persons: null });
        rows.push({ lifts: L, ratedLoad: load, speed, persons: r.persons, rtt: r.rtt, interval: r.interval, pctPop: r.pctPop, meets: r.interval <= maxInterval && r.pctPop >= minPctPop });
      }
    }
  }
  const ok = rows.filter((r) => r.meets);
  // Keep only designs that no other passing design beats on every axis.
  const frontier = ok.filter((r) => !ok.some((o) => o !== r && o.lifts <= r.lifts && o.ratedLoad <= r.ratedLoad && o.speed <= r.speed && (o.lifts < r.lifts || o.ratedLoad < r.ratedLoad || o.speed < r.speed)));
  frontier.sort((p, q) => p.lifts - q.lifts || p.ratedLoad - q.ratedLoad || p.speed - q.speed);
  return { checked: rows.length, passing: ok.length, frontier };
}

// A one-paragraph reading of the result, phrased as observations.
export function summarise(r, { maxInterval, minPctPop } = {}) {
  const parts = [
    `${r.input.lifts} lift${r.input.lifts === 1 ? '' : 's'} of ${r.persons} persons (${r.P.toFixed(1)} per trip at ${r.input.capacityFactor}% loading) make a round trip in ${r.rtt.toFixed(1)} s, so a car leaves the lobby every ${r.interval.toFixed(1)} s on average.`,
    `They carry ${r.handling.toFixed(0)} people in five minutes, ${r.pctPop.toFixed(1)}% of the ${r.Ueff.toFixed(0)} people on the served floors.`,
  ];
  if (maxInterval != null) parts.push(r.interval <= maxInterval ? `The interval is within your ${maxInterval} s target.` : `The interval is above your ${maxInterval} s target.`);
  if (minPctPop != null) parts.push(r.pctPop >= minPctPop ? `Handling capacity meets your ${minPctPop}% target.` : `Handling capacity is below your ${minPctPop}% target.`);
  if (!r.reachesSpeedBetweenStops) parts.push('Between average stops the car does not reach rated speed, so the flight-time correction (Peters 2000, eq 18) matters here.');
  return parts.join(' ');
}
