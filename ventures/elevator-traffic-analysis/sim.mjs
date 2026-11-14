// Monte Carlo checks of the up-peak round trip time formula.
//
// 1. tripSample: cars that always carry the formula's P passengers (a random
//    whole number with mean P), destinations drawn by floor population, run
//    with the same kinematics and door times as the formula. Measures how far
//    the closed-form RTT (which uses average stops, an average reversal floor
//    and an average distance between stops) is from the mean of real trips.
//
// 2. simulate: an up-peak hour with passengers arriving at the lobby at
//    random (a Poisson process) and a simple lobby dispatcher. Gives waiting
//    times, which the RTT method cannot, and shows where the system saturates.
//    The dispatcher is ours and deliberately plain: the queue fills one car
//    at a time, and the next car opens to the queue once the current one has
//    a full load boarding; a car leaves when full or a dwell time after its
//    doors open. Real group controllers differ, so read the waits as
//    indicative.
//
// Both are seeded, so a given input always gives the same numbers.

import { normalise, personsFromLoad, flightTime, upPeak } from './engine.mjs';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(raw) {
  const x = normalise(raw);
  const pops = x.floors.map((f) => f.population);
  const U = pops.reduce((s, u) => s + u, 0);
  const cdf = [];
  let c = 0;
  for (const u of pops) cdf.push((c += u / U));
  const heights = [];
  let h = x.expressRise;
  for (const f of x.floors) heights.push((h += f.rise));
  const kin = { speed: x.speed, acceleration: x.acceleration, jerk: x.jerk, startDelay: x.startDelay };
  const pick = (r) => {
    const u = r();
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return { x, U, heights, kin, pick, CC: x.persons ?? personsFromLoad(x.ratedLoad) };
}

// Time for one up trip and the express return, starting with the doors
// closing at the lobby and ending with the doors open at the lobby again,
// for passengers with the given destination floor indices. Returns the time
// and, per destination, the time from door close to doors open there.
function tripTime(dests, s) {
  const { x, heights, kin } = s;
  const counts = new Map();
  for (const d of dests) counts.set(d, (counts.get(d) || 0) + 1);
  const stops = [...counts.keys()].sort((p, q) => p - q);
  const door = x.doorOpen - x.advanceOpening;
  let t = x.doorClose; // doors close at the lobby
  let at = 0;
  const arrive = new Map();
  for (const f of stops) {
    t += flightTime(heights[f] - at, kin) + door;
    arrive.set(f, t);
    t += counts.get(f) * x.unloadTime + x.doorClose;
    at = heights[f];
  }
  t += flightTime(at, kin) + door; // express back to the lobby
  return { t, stops: stops.length, top: stops.length ? stops[stops.length - 1] + 1 : 0, arrive };
}

// Fixed-load trips: the formula's own assumptions, sampled.
export function tripSample(raw, { trips = 20000, seed = 7 } = {}) {
  const s = setup(raw);
  const r = rng(seed);
  const formula = upPeak(raw);
  const P = formula.P;
  const lo = Math.floor(P);
  let sumT = 0;
  let sumT2 = 0;
  let sumS = 0;
  let sumH = 0;
  for (let k = 0; k < trips; k++) {
    const n = lo + (r() < P - lo ? 1 : 0);
    const dests = [];
    for (let i = 0; i < n; i++) dests.push(s.pick(r));
    const trip = tripTime(dests, s);
    const rtt = (trip.t + n * s.x.loadTime) * (1 + s.x.lossesPct / 100);
    sumT += rtt;
    sumT2 += rtt * rtt;
    sumS += trip.stops;
    sumH += trip.top;
  }
  const mean = sumT / trips;
  const sd = Math.sqrt(Math.max(0, sumT2 / trips - mean * mean));
  return {
    trips,
    meanRtt: mean,
    sdRtt: sd,
    seMean: sd / Math.sqrt(trips),
    meanStops: sumS / trips,
    meanTop: sumH / trips,
    formulaRtt: formula.rtt,
    formulaStops: formula.S,
    formulaTop: formula.H,
    gapPct: ((formula.rtt - mean) / mean) * 100,
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// An up-peak period with random arrivals. demandPct is the arrival rate as a
// percentage of the served population per five minutes.
export function simulate(raw, { demandPct = 12, duration = 3600, warmup = 600, dwell = 8, seed = 11 } = {}) {
  if (!(demandPct > 0) || demandPct > 100) throw new Error('demand must be between 0 and 100% per five minutes');
  if (!(duration > warmup) || duration > 6 * 3600) throw new Error('duration must exceed the warm-up and be at most six hours');
  const s = setup(raw);
  const { x, CC } = s;
  const r = rng(seed);
  const rate = ((demandPct / 100) * s.U) / 300; // persons per second
  const arrivals = [];
  for (let t = -Math.log(1 - r()) / rate; t < duration; t += -Math.log(1 - r()) / rate) arrivals.push({ t, dest: s.pick(r) });
  // Cars become available at the lobby with doors open; all start there.
  const ready = Array.from({ length: x.lifts }, () => x.doorOpen - x.advanceOpening);
  let lobbyFree = 0; // when the next car may open to the queue
  let next = 0;
  const waits = [];
  const journeys = [];
  const loads = [];
  const departures = [];
  let queuePeak = 0;
  while (next < arrivals.length) {
    let car = 0;
    for (let c = 1; c < ready.length; c++) if (ready[c] < ready[car]) car = c;
    const open = Math.max(ready[car], lobbyFree);
    let cur = open;
    let lastStart = open;
    const aboard = [];
    while (aboard.length < CC && next < arrivals.length) {
      const p = arrivals[next];
      const deadline = aboard.length ? Math.max(open + dwell, cur) : Infinity;
      if (p.t > deadline) break;
      const start = Math.max(cur, p.t);
      let waiting = 0;
      for (let k = next; k < arrivals.length && arrivals[k].t <= start; k++) waiting++;
      if (waiting > queuePeak) queuePeak = waiting;
      aboard.push({ ...p, board: start });
      lastStart = start;
      cur = start + x.loadTime;
      next++;
    }
    if (!aboard.length) break;
    const depart = aboard.length >= CC ? cur : Math.max(open + dwell, cur);
    // A full car's last passenger is stepping in: the next car may take the queue.
    lobbyFree = aboard.length >= CC ? lastStart : depart;
    const trip = tripTime(aboard.map((p) => p.dest), s);
    const back = depart + trip.t * (1 + x.lossesPct / 100);
    ready[car] = back;
    if (depart >= warmup && depart <= duration) {
      departures.push(depart);
      loads.push(aboard.length);
    }
    for (const p of aboard) {
      if (p.t < warmup) continue;
      waits.push(p.board - p.t);
      journeys.push(depart + trip.arrive.get(p.dest) - p.t);
    }
  }
  waits.sort((p, q) => p - q);
  journeys.sort((p, q) => p - q);
  const mean = (a) => (a.length ? a.reduce((s2, v) => s2 + v, 0) / a.length : NaN);
  const gaps = departures.slice(1).map((d, i) => d - departures[i]);
  const carried = loads.reduce((s2, v) => s2 + v, 0);
  const span = departures.length > 1 ? departures[departures.length - 1] - departures[0] : NaN;
  return {
    demandPct,
    passengers: waits.length,
    meanWait: mean(waits),
    p90Wait: quantile(waits, 0.9),
    maxWait: waits.length ? waits[waits.length - 1] : NaN,
    meanJourney: mean(journeys),
    meanLoad: mean(loads),
    meanInterval: mean(gaps),
    carriedPctPer5min: departures.length > 1 ? ((carried * 300) / span / s.U) * 100 : NaN,
    queuePeak,
    capacity: CC,
  };
}

// Waiting time against demand, for a chart. Each point averages `reps` seeds.
export function demandSweep(raw, { from = 2, to = null, steps = 10, reps = 3, ...opts } = {}) {
  const top = to ?? Math.max(from + 1, upPeak(raw).pctPop * 1.25);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const d = from + ((top - from) * i) / (steps - 1);
    const runs = Array.from({ length: reps }, (_, k) => simulate(raw, { ...opts, demandPct: d, seed: 101 + k * 7919 }));
    const avg = (key) => runs.reduce((s2, q) => s2 + q[key], 0) / runs.length;
    out.push({ demandPct: d, meanWait: avg('meanWait'), p90Wait: avg('p90Wait'), meanLoad: avg('meanLoad'), meanInterval: avg('meanInterval'), carriedPctPer5min: avg('carriedPctPer5min') });
  }
  return out;
}
