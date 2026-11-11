// Refill search for whole timetables (2026-11-11, after eval/starter-climb.mjs).
//
// Starters are a small family: a timetable fixed by one pairing of Z_p, every round a shift of the
// first. At 12 teams no starter found by sampling, annealing or the O(p) climb goes below 156
// non-cyclic (floor 120), and the annealing search in lowCarryOverRounds stops at 152 to 156. This
// script searches all round robins instead, with a large-neighbourhood move that the annealer's
// swaps cannot make in one step:
//
//   pick w rounds (2 to 5, anywhere in the season), take their games out (together they form a
//   w-regular graph), and refill those w slots with every way of splitting that graph into w
//   perfect matchings, in any order, by depth-first search; keep the refill with the least total
//   carry-over (ties at random, so the search walks plateaus), never a worse one.
//
// The DFS builds one round team by team and adds the carry-over cells each game creates on the
// spot: when team a meets b in round r, a carries over prev(a) -> b from round r - 1 and b -> next(a)
// into round r + 1 (rounds outside the window are fixed; inside it, the later round adds the cell).
// A cell already holding c costs 2c + 1 - 1 = 2c above the floor, so any branch whose excess passes
// the incumbent's is cut. Every accepted timetable is re-scored with carryOverFromOpponents.
//
// Only "all N teams play" is searched. For a league with a bye (N - 1 real teams) the result is
// scored with each of the N teams as the bye and the best kept, as lowCarryOverRounds does with a
// built-in timetable.
//
// node eval/round-refill.mjs <N> [seconds] [seed] [restarts]
//   prints one JSON line per improvement and a final line with the timetable (opp[r][t]).

import { carryOverFromOpponents, circleOpp, starterOpp, STARTERS } from "../carryover.mjs";

const N = Number(process.argv[2] || 12);
const seconds = Number(process.argv[3] || 60);
const seed = Number(process.argv[4] || 1);
const from = process.argv[5] || "starter"; // "starter" or "circle"
const temp = Number(process.argv[6] || 0); // excess a move may add (0: never worse)
// "bye": search for N - 1 real teams, team N - 1 the bye in every round
const BYE = process.argv[7] === "bye" ? N - 1 : -1;
const score = (o) => (BYE < 0 ? value(o) : valueWithBye(o, BYE));
const TRANSITIONS = BYE < 0 ? N * (N - 2) : (N - 1) * (N - 3);
const R = N - 1;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(seed);

/** Non-cyclic carry-over with all N teams playing, from opp[r][t]. */
export function value(opp) {
  const c = new Int32Array(N * N);
  let v = 0;
  for (let r = 0; r + 1 < opp.length; r++) for (let t = 0; t < N; t++) { const i = opp[r][t] * N + opp[r + 1][t]; v += 2 * c[i] + 1; c[i]++; }
  return v;
}

/** Value with team `bye` sitting out every round (its games are byes), as coeOf scores it. */
export function valueWithBye(opp, bye) {
  const c = new Int32Array(N * N);
  let v = 0;
  for (let t = 0; t < N; t++) {
    if (t === bye) continue;
    let prev = -1;
    for (let r = 0; r < opp.length; r++) {
      const o = opp[r][t];
      if (o === bye) continue;
      if (prev >= 0) { const i = prev * N + o; v += 2 * c[i] + 1; c[i]++; }
      prev = o;
    }
  }
  return v;
}

function startOpp() {
  const entry = STARTERS[N]?.[BYE < 0 ? "even" : "odd"];
  if (!entry || from === "circle") return circleOpp(N);
  const [step, ...flat] = entry;
  const pairs = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  let best = null, bv = Infinity;
  for (let start = 0; start < R; start++) { const o = starterOpp(N, pairs, { step, start }); const v = score(o); if (v < bv) { bv = v; best = o; } }
  return best;
}

/**
 * Refill the rounds at positions W (sorted) of opp in place with the least-carry-over split of
 * their games; returns the new value (never above `cur`).
 */
function refill(opp, W, cur, slack = 0, nodeCap = 5e4) {
  const inW = new Uint8Array(R);
  for (const r of W) inW[r] = 1;
  // counts of every cell not touching a window round
  const c = new Int32Array(N * N);
  let base = 0, placedFixed = 0;
  for (let r = 0; r + 1 < R; r++) {
    if (inW[r] || inW[r + 1]) continue;
    for (let t = 0; t < N; t++) {
      if (t === BYE || opp[r][t] === BYE || opp[r + 1][t] === BYE) continue; // with a bye, only cells between real games are counted (a lower bound)
      const i = opp[r][t] * N + opp[r + 1][t]; base += 2 * c[i] + 1; c[i]++; placedFixed++;
    }
  }
  // the games to place: adjacency of the w-regular graph
  const free = Array.from({ length: N }, () => new Uint8Array(N));
  for (const r of W) for (let t = 0; t < N; t++) free[t][opp[r][t]] = 1;
  const transitions = TRANSITIONS; // every cell placed adds 1 at the floor
  const baseExcess = base - placedFixed;
  const target = cur - transitions + slack; // excess to beat or tie (plus the slack a move may add)
  let best = null, bestEx = Infinity, ties = 0, nodes = 0;
  const cur2 = W.map(() => new Int16Array(N).fill(-1));
  const order = Array.from({ length: N }, (_, i) => i);
  function addCell(i) { const d = 2 * c[i]; c[i]++; return d; }
  function placeRound(k, ex) {
    if (k === W.length) {
      if (BYE >= 0) {
        // the counted cells are a lower bound; score the refill exactly
        const trial = opp.slice();
        W.forEach((r, j) => { trial[r] = cur2[j]; });
        ex = score(trial) - transitions - baseExcess;
        if (baseExcess + ex > target) return;
      }
      if (ex < bestEx || (ex === bestEx && rand() * ++ties < 1)) {
        if (ex < bestEx) ties = 1;
        bestEx = ex; best = cur2.map((o) => o.slice());
      }
      if (slack > 0 && rand() < 0.5) nodes = nodeCap; // a kick: take a random refill within the slack, not the best
      return;
    }
    const r = W[k];
    const prev = r > 0 ? (inW[r - 1] ? cur2[k - 1] : opp[r - 1]) : null;
    const next = r + 1 < R && !inW[r + 1] ? opp[r + 1] : null;
    const o = cur2[k];
    function pick(ex2) {
      if (++nodes > nodeCap) return;
      let a = -1;
      for (let i = 0; i < N; i++) if (o[order[i]] < 0) { a = order[i]; break; }
      if (a < 0) { placeRound(k + 1, ex2); return; }
      const start = Math.floor(rand() * N);
      for (let s = 0; s < N; s++) {
        const b = (start + s) % N;
        if (b === a || o[b] >= 0 || !free[a][b]) continue;
        // cells this game creates
        const cells = [];
        if (a !== BYE && b !== BYE) {
          if (prev) { if (prev[a] !== BYE) cells.push(prev[a] * N + b); if (prev[b] !== BYE) cells.push(prev[b] * N + a); }
          if (next) { if (next[a] !== BYE) cells.push(b * N + next[a]); if (next[b] !== BYE) cells.push(a * N + next[b]); }
        }
        let d = 0;
        for (const i of cells) d += addCell(i);
        if (baseExcess + ex2 + d <= target && baseExcess + ex2 + d <= bestEx + baseExcess) {
          o[a] = b; o[b] = a; free[a][b] = free[b][a] = 0;
          pick(ex2 + d);
          o[a] = -1; o[b] = -1; free[a][b] = free[b][a] = 1;
        }
        for (const i of cells) c[i]--;
      }
    }
    pick(ex);
  }
  // shuffle team order a little so ties break differently
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  placeRound(0, 0);
  if (!best) return cur;
  W.forEach((r, k) => { opp[r] = best[k]; });
  return transitions + baseExcess + bestEx;
}

function search() {
  let opp = startOpp().map((o) => Int16Array.from(o));
  let cur = score(opp);
  const startValue = cur;
  let bestV = cur, bestOpp = opp.map((o) => o.slice());
  const deadline = Date.now() + seconds * 1000;
  let moves = 0, stall = 0, restarts = 0;
  while (Date.now() < deadline) {
    const w = 2 + Math.floor(rand() * Math.min(4, R - 1));
    const set = new Set();
    // half the time a contiguous window, half anywhere
    if (rand() < 0.5) { const i = Math.floor(rand() * (R - w + 1)); for (let k = 0; k < w; k++) set.add(i + k); }
    else while (set.size < w) set.add(Math.floor(rand() * R));
    const W = [...set].sort((x, y) => x - y);
    const before = cur;
    cur = refill(opp, W, cur, temp > 0 && rand() < 0.05 ? Math.ceil(rand() * temp) : 0);
    moves++;
    if (cur < bestV) {
      bestV = cur; bestOpp = opp.map((o) => o.slice()); stall = 0;
      console.log(JSON.stringify({ N, value: bestV, moves, restarts, ms: seconds * 1000 - (deadline - Date.now()) }));
    } else if (cur === before) stall++;
    if (stall > 1500) {
      // stuck on a plateau: restart from the start timetable with its rounds in a random order
      // (most seeds settle in the first seconds, and a good seed finds far lower values)
      opp = startOpp().map((o) => Int16Array.from(o));
      for (let i = R - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opp[i], opp[j]] = [opp[j], opp[i]]; }
      cur = score(opp); stall = 0; restarts++;
    }
  }
  return { bestV, bestOpp, startValue, moves, restarts };
}

const { bestV, bestOpp, startValue, moves, restarts } = search();
const real = BYE < 0 ? N : N - 1;
const opponents = Array.from({ length: real }, (_, t) => bestOpp.map((o) => o[t]).filter((u) => u !== BYE));
const check = carryOverFromOpponents(opponents, { cyclic: false });
if (check.value !== bestV) throw new Error(`score mismatch: ${check.value} vs ${bestV}`);
// sanity: every pair once
const met = new Set();
for (const o of bestOpp) for (let t = 0; t < N; t++) { if (o[o[t]] !== t || o[t] === t) throw new Error("not a matching"); if (t < o[t]) { const k = t * N + o[t]; if (met.has(k)) throw new Error("pair twice"); met.add(k); } }
if (met.size !== (N * (N - 1)) / 2) throw new Error("not a round robin");
let bye = -1, byeV = Infinity;
for (let t = 0; t < N; t++) { const v = valueWithBye(bestOpp, t); if (v < byeV) { byeV = v; bye = t; } }
console.log(JSON.stringify({ N, teams: real, seed, seconds, start: startValue, value: bestV, floor: TRANSITIONS, max: check.max, bye, valueWithBye: byeV, floorWithBye: (N - 1) * (N - 3), moves, restarts, opp: bestOpp.map((o) => Array.from(o)) }));
