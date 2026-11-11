// Carry-over effect: who you play right after whom.
//
// In a round robin, team k "carries over" team i to team j when k plays i and then plays j in its
// next game. If i is the strongest side (or plays a bruising style), j keeps meeting opponents who
// have just faced i. Russell (1980) measured this with the carry-over matrix c[i][j] (how many teams
// play i and then j next) and the carry-over effect value COE = sum of c[i][j]^2. Every team plays
// n - 1 games, so the c[i][j] sum to a fixed total and COE is smallest when they are spread evenly:
// ideally every c[i][j] is 0 or 1. The circle method, the textbook construction this site uses,
// is close to the worst case: the same few pairs carry over again and again.
//
// This module measures COE on any schedule (built here or read from a published fixture list) and
// searches for a round robin with a low COE and, after that, as few home/away breaks as it can.
// Pure functions, seeded, no DOM, so the page, the CLI and the tests share it.

import { mulberry32 } from "./calc.mjs";

/**
 * Carry-over matrix from each team's opponents in playing order. `opponents[k]` is team k's list of
 * opponent indexes in the order k plays them (byes skipped). With `cyclic` the last opponent also
 * carries over to the first, Russell's original definition, used for the published lower bounds.
 * Returns { matrix, value, max, pairs, total, lowerBound }: value is sum c^2, max the largest entry,
 * pairs the count of (i, j) with c >= 2, total the sum of entries, and lowerBound the least value any
 * schedule with that total could have (entries as even as possible; reached only if the schedule
 * allows it).
 */
export function carryOverFromOpponents(opponents, { cyclic = false } = {}) {
  const n = opponents.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (const seq of opponents) {
    const L = seq.length;
    const steps = cyclic ? L : L - 1;
    for (let s = 0; s < steps; s++) matrix[seq[s]][seq[(s + 1) % L]]++;
  }
  let value = 0, max = 0, pairs = 0, total = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = matrix[i][j];
    value += v * v; total += v;
    if (v > max) max = v;
    if (v >= 2) pairs++;
  }
  // c[i][i] is always 0 and c[i][j] needs i != j, so the total spreads over n(n-1) cells.
  const cells = n * (n - 1);
  const q = Math.floor(total / cells), r = total - q * cells;
  const lowerBound = cells ? r * (q + 1) ** 2 + (cells - r) * q * q : 0;
  return { matrix, value, max, pairs, total, lowerBound };
}

/** Each team's opponents in order from schedule rounds (`{ matches: [{ home, away }] }` or [h, a] pairs). */
export function opponentsFromRounds(rounds, n) {
  const opp = Array.from({ length: n }, () => []);
  for (const r of rounds) {
    for (const m of r.matches) {
      const [h, a] = Array.isArray(m) ? m : [m.home, m.away];
      opp[h].push(a); opp[a].push(h);
    }
  }
  return opp;
}

/** Carry-over of a schedule (built by buildSchedule, or any { teams, rounds }). Non-cyclic: a season does not wrap. */
export function carryOver(schedule, opts = {}) {
  const n = schedule.teams.length;
  return carryOverFromOpponents(opponentsFromRounds(schedule.rounds, n), opts);
}

// ------------------------------------------------------------------ search

// The search works on N (even) teams; an odd league adds a phantom team N - 1 whose opponent has
// the bye. A state is opp[r][t] = opponent of t in round r. Two moves keep it a valid round robin:
// swapping two whole rounds (the order) and the partial round swap of the sports-scheduling
// literature: in rounds r and s the matches form disjoint even cycles; swapping the r and s
// opponents of every team on one cycle leaves both rounds perfect matchings and every pair still
// meeting exactly once.

export function circleOpp(N) {
  const rounds = [];
  for (let r = 0; r < N - 1; r++) {
    const o = new Int16Array(N);
    o[r] = N - 1; o[N - 1] = r;
    for (let k = 1; k < N / 2; k++) {
      const a = (r + k) % (N - 1), b = (r - k + (N - 1)) % (N - 1);
      o[a] = b; o[b] = a;
    }
    rounds.push(o);
  }
  return rounds;
}

/** COE over real teams only (a phantom's "games" are byes and are skipped). */
function coeOf(opp, n, cyclic) {
  const R = opp.length;
  const N = opp[0].length;
  const c = new Int32Array(N * N);
  let value = 0;
  for (let k = 0; k < n; k++) {
    let first = -1, prev = -1;
    for (let r = 0; r < R; r++) {
      const o = opp[r][k];
      if (o >= n) continue;
      if (prev >= 0) { const idx = prev * N + o; value += 2 * c[idx] + 1; c[idx]++; }
      else first = o;
      prev = o;
    }
    if (cyclic && prev >= 0 && first >= 0 && prev !== first) { const idx = prev * N + first; value += 2 * c[idx] + 1; c[idx]++; }
  }
  return value;
}

/**
 * Partial team swap: the smallest set of rounds, starting from round r, over which teams a and b
 * meet the same opponents; swapping a and b in just those rounds keeps every pair meeting once.
 * Needed because the circle method is a perfect 1-factorization whenever n - 1 is prime (every two
 * rounds form one long cycle), so partial round swaps alone cannot leave it.
 */
function teamSwapRounds(opp, a, b, r) {
  const R = opp.length;
  const inS = new Uint8Array(R);
  const S = [r]; inS[r] = 1;
  const roundOf = (t, o) => { for (let q = 0; q < R; q++) if (opp[q][t] === o) return q; return -1; };
  for (;;) {
    const X = new Set(), Y = new Set();
    for (const q of S) { const x = opp[q][a], y = opp[q][b]; if (x !== b) X.add(x); if (y !== a) Y.add(y); }
    let add = -1;
    for (const y of Y) if (!X.has(y)) { add = roundOf(a, y); break; }
    if (add < 0) for (const x of X) if (!Y.has(x)) { add = roundOf(b, x); break; }
    if (add < 0) return S;
    if (inS[add]) return S; // cannot happen for a valid round robin; stop safely
    inS[add] = 1; S.push(add);
  }
}

function swapTeamsIn(opp, S, a, b) {
  for (const q of S) {
    const o = opp[q], oa = o[a], ob = o[b];
    if (oa === b) continue;
    o[a] = ob; o[b] = oa; o[oa] = b; o[ob] = a;
  }
}

function cycleOf(opp, r, s, t) {
  const cyc = [];
  let x = t;
  do {
    cyc.push(x);
    const y = opp[r][x];
    cyc.push(y);
    x = opp[s][y];
  } while (x !== t);
  return cyc;
}

/**
 * A round robin (as [{ matches: [[home, away]], bye }], the shape roundRobin returns) chosen for a
 * low carry-over value, then home/away set for few breaks. Simulated annealing from the circle
 * method over round swaps and partial round swaps, seeded, so the same seed gives the same rounds.
 * `effort` scales the iterations (1 is about a quarter of a second for 20 teams in Node).
 * Returns { rounds, coe, circleCoe, lowerBound, breaks, iterations }.
 */
export function lowCarryOverRounds(n, { seed = 1, effort = 1, cyclic = false, breakWeight = 0 } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const rand = mulberry32(seed);
  let opp = circleOpp(N);
  const circleCoe = coeOf(opp, n, cyclic);
  const R = N - 1;
  let cur = circleCoe;
  let best = cur, bestOpp = opp.map((o) => o.slice());
  const lb = carryOverFromOpponents(opponentsFromOpp(opp, n), { cyclic }).lowerBound;
  // each step costs about N * N, so the budget is in steps of work, not a fixed count
  const iterations = N <= 6 ? 20000 : Math.max(2000, Math.round((effort * 4e7) / (N * N)));
  let T0 = Math.max(4, cur / (N * 4));
  if (N <= 2) return finish(bestOpp, n, cyclic, circleCoe, lb, 0, seed);
  const coeCost = (o) => coeOf(o, n, cyclic);
  ({ best, bestOpp } = anneal(opp, coeCost, { iterations, T0, rand, stopAt: lb }));
  if (breakWeight > 0) {
    // second pass: trade some carry-over for fewer home/away breaks, scored with a fast greedy
    // venue pass; the full venue search runs once on the result
    const mixed = (o) => coeOf(o, n, cyclic) + breakWeight * greedyBreaks(o, n);
    const start = bestOpp.map((o) => o.slice());
    ({ bestOpp } = anneal(start, mixed, { iterations: Math.round(iterations / 2), T0: T0 / 2, rand, stopAt: -Infinity }));
  }
  return finish(bestOpp, n, cyclic, circleCoe, lb, iterations, seed);
}

function anneal(opp, costOf, { iterations, T0, rand, stopAt }) {
  const R = opp.length, N = opp[0].length;
  let cur = costOf(opp);
  let best = cur, bestOpp = opp.map((o) => o.slice());
  for (let it = 0; it < iterations && best > stopAt; it++) {
    const T = T0 * (1 - it / iterations) + 0.05;
    const r = Math.floor(rand() * R);
    let s = Math.floor(rand() * (R - 1)); if (s >= r) s++;
    const mv = rand();
    if (mv < 0.4) {
      const a = Math.floor(rand() * N);
      let b = Math.floor(rand() * (N - 1)); if (b >= a) b++;
      const S = teamSwapRounds(opp, a, b, r);
      if (S.length >= R) continue;
      swapTeamsIn(opp, S, a, b);
      const v = costOf(opp);
      if (v <= cur || rand() < Math.exp((cur - v) / T)) cur = v;
      else swapTeamsIn(opp, S, a, b);
    } else if (mv < 0.6) {
      [opp[r], opp[s]] = [opp[s], opp[r]];
      const v = costOf(opp);
      if (v <= cur || rand() < Math.exp((cur - v) / T)) cur = v;
      else [opp[r], opp[s]] = [opp[s], opp[r]];
    } else {
      const t = Math.floor(rand() * N);
      const cyc = cycleOf(opp, r, s, t);
      if (cyc.length === N) continue; // the whole round: same as a round swap
      const swap = () => { for (const x of cyc) { const a = opp[r][x]; opp[r][x] = opp[s][x]; opp[s][x] = a; } };
      swap();
      const v = costOf(opp);
      if (v <= cur || rand() < Math.exp((cur - v) / T)) cur = v;
      else swap();
    }
    if (cur < best) { best = cur; bestOpp = opp.map((o) => o.slice()); }
  }
  return { best, bestOpp };
}

/** Breaks after the greedy venue pass alone (no annealing): a cheap stand-in inside the search. */
function greedyBreaks(opp, n) {
  const R = opp.length, N = opp[0].length;
  const phase = new Int8Array(N).fill(-1);
  let changes = 0;
  for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) {
    const u = opp[r][t];
    if (t > u) continue;
    if (u >= n) { phase[t] = -1; continue; } // a bye resets the streak, as countBreaks does
    const keepT = phase[t] < 0 ? 0 : (phase[t] === 1 ? 1 : -1);
    const keepU = phase[u] < 0 ? 0 : (phase[u] === 0 ? 1 : -1);
    const tPhase = keepT + keepU >= 0 ? 1 : 0;
    if (phase[t] >= 0 && phase[t] !== tPhase) changes++;
    if (phase[u] >= 0 && phase[u] !== 1 - tPhase) changes++;
    phase[t] = tPhase; phase[u] = 1 - tPhase;
  }
  return changes;
}

function opponentsFromOpp(opp, n) {
  const out = Array.from({ length: n }, () => []);
  for (const o of opp) for (let t = 0; t < n; t++) if (o[t] < n) out[t].push(o[t]);
  return out;
}

function finish(opp, n, cyclic, circleCoe, lowerBound, iterations, seed) {
  const venues = assignVenues(opp, n, seed);
  const rounds = opp.map((o, r) => {
    const matches = [];
    let bye = null;
    for (let t = 0; t < o.length; t++) {
      const u = o[t];
      if (t > u) continue;
      if (u >= n) { bye = t; continue; }
      if (t >= n) { bye = u; continue; }
      matches.push(venues[r][t] ? [t, u] : [u, t]);
    }
    return { leg: 0, matches, bye };
  });
  const coe = coeOf(opp, n, cyclic);
  let breaks = 0;
  for (let t = 0; t < n; t++) breaks += teamBreaks(venues, opp, t, n);
  return { rounds, coe, circleCoe, lowerBound, breaks, iterations };
}

function teamBreaks(venues, opp, t, n) {
  let last = null, b = 0;
  for (let r = 0; r < opp.length; r++) {
    if (opp[r][t] >= n) { last = null; continue; }
    const v = venues[r][t];
    if (last === v) b++;
    last = v;
  }
  return b;
}

/**
 * Home/away for a fixed opponent table: venues[r][t] is true when t is at home in round r (the two
 * sides of a match always disagree). Annealing over single-match flips with cost breaks plus a heavy
 * penalty for any team whose home and away games differ by more than one. A team's first game
 * alternates from its team number so the search starts from a reasonable pattern.
 */
export function assignVenues(opp, n, seed = 1, restarts = 8) {
  let best = null, bestCost = Infinity;
  for (let k = 0; k < restarts; k++) {
    const v = assignVenuesOnce(opp, n, (seed * 7919 + k * 104729) >>> 0);
    const c = venueCost(v, opp, n);
    if (c < bestCost) { best = v; bestCost = c; }
  }
  return best;
}

/** Breaks plus 50 per game of home/away imbalance beyond one: the venue search's cost. */
export function venueCost(venues, opp, n) {
  let c = 0;
  for (let t = 0; t < n; t++) {
    let h = 0, g = 0;
    for (let r = 0; r < opp.length; r++) if (opp[r][t] < n) { g++; if (venues[r][t]) h++; }
    const d = Math.abs(2 * h - g);
    c += teamBreaks(venues, opp, t, n) + (d > 1 ? 50 * (d - 1) : 0);
  }
  return c;
}

function assignVenuesOnce(opp, n, seed) {
  const R = opp.length, N = opp[0].length;
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const venues = opp.map(() => new Uint8Array(N));
  // Start greedy, in "phase" terms: phase = venue XOR round parity, so an alternating team keeps
  // one phase and every break is a phase change. Each match takes the orientation that keeps its
  // two teams' phases from the round before; ties go to a seeded coin.
  const phase = new Int8Array(N).fill(-1);
  for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) {
    const u = opp[r][t];
    if (t > u) continue;
    const keepT = phase[t] < 0 ? 0 : (phase[t] === 1 ? 1 : -1); // +1 favours t phase 1
    const keepU = phase[u] < 0 ? 0 : (phase[u] === 0 ? 1 : -1); // +1 favours t phase 1 (u phase 0)
    const score = keepT + keepU;
    const tPhase = score > 0 ? 1 : score < 0 ? 0 : (rand() < 0.5 ? 1 : 0);
    if (t < n && u < n) { phase[t] = tPhase; phase[u] = 1 - tPhase; }
    const home = (tPhase ^ (r & 1)) === 1;
    venues[r][t] = home ? 1 : 0; venues[r][u] = home ? 0 : 1;
  }
  const homeCount = new Int32Array(N);
  for (let r = 0; r < R; r++) for (let t = 0; t < n; t++) if (opp[r][t] < n && venues[r][t]) homeCount[t]++;
  const games = new Int32Array(N);
  for (let r = 0; r < R; r++) for (let t = 0; t < n; t++) if (opp[r][t] < n) games[t]++;
  const imb = (t) => { const d = Math.abs(2 * homeCount[t] - games[t]); return d > 1 ? (d - 1) : 0; };
  const local = (r, t) => {
    // breaks touching round r for team t
    if (t >= n || opp[r][t] >= n) return 0;
    let b = 0;
    const v = venues[r][t];
    if (r > 0 && opp[r - 1][t] < n && venues[r - 1][t] === v) b++;
    if (r < R - 1 && opp[r + 1][t] < n && venues[r + 1][t] === v) b++;
    return b;
  };
  const PEN = 50;
  let cost = 0;
  for (let t = 0; t < n; t++) cost += teamBreaks(venues, opp, t, n) + PEN * imb(t);
  const iters = Math.max(5000, 60 * R * N);
  for (let it = 0; it < iters; it++) {
    const T = 1.5 * (1 - it / iters) + 0.02;
    const r = Math.floor(rand() * R);
    const t = Math.floor(rand() * N);
    const u = opp[r][t];
    if (t >= n || u >= n) continue;
    const before = local(r, t) + local(r, u) + PEN * (imb(t) + imb(u));
    const ht = venues[r][t];
    venues[r][t] = ht ? 0 : 1; venues[r][u] = ht ? 1 : 0;
    homeCount[t] += ht ? -1 : 1; homeCount[u] += ht ? 1 : -1;
    const after = local(r, t) + local(r, u) + PEN * (imb(t) + imb(u));
    const d = after - before;
    if (d <= 0 || rand() < Math.exp(-d / T)) cost += d;
    else { venues[r][t] = ht; venues[r][u] = ht ? 0 : 1; homeCount[t] += ht ? 1 : -1; homeCount[u] += ht ? -1 : 1; }
  }
  return venues;
}

// ------------------------------------------------------------ double round robin as a whole

/**
 * A double round robin searched as a whole for low carry-over, instead of mirroring one half.
 * Mirroring repeats each team's opponent order, so every carry-over count doubles (worst 6 for 18
 * and 20 teams). Here the season keeps the usual "phased" shape (each half is a complete round
 * robin, and each pair meets once at each ground, home in one half, away in the other), but the
 * second half's rounds are searched jointly with the first, with the same moves (round swaps,
 * partial team swaps, partial round swaps) applied inside one half at a time. The cost is the
 * non-cyclic carry-over value over all 2(N-1) rounds, plus a heavy penalty for a team meeting the
 * same opponent in two consecutive games (possible only across the halfway line, a bye between
 * included), plus `breakWeight`
 * times an estimate of home/away breaks. Venues are then set by annealing over pairs: flipping a
 * pair flips both its games, so home/away stays one each.
 * Returns { rounds (leg 0 then leg 1), coe, mirroredCoe, lowerBound, breaks, backToBack, iterations }.
 */
export function lowCarryOverDouble(n, { seed = 1, effort = 1, breakWeight = 0 } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const R = N - 1;
  const rand = mulberry32((seed * 2654435761) >>> 0);
  const single = (s) => {
    const o = circleOpp(N);
    if (N <= 2) return o;
    const it = N <= 6 ? 20000 : Math.max(2000, Math.round((effort * 4e7) / (N * N)));
    const halfLb = carryOverFromOpponents(opponentsFromOpp(o, n)).lowerBound;
    return anneal(o, (x) => coeOf(x, n, false), { iterations: it, T0: Math.max(4, coeOf(o, n, false) / (N * 4)), rand: mulberry32(s), stopAt: halfLb }).bestOpp;
  };
  const first = single(seed);
  const mirroredCoe = coeOf([...first, ...first], n, false);
  // Two starts, the better kept: the mirrored season itself (so the result is never worse than
  // mirroring on this cost) and an independent low-carry-over second half; each is then annealed
  // as a whole.
  const cost = (o) => coeOf(o, n, false) + 1000 * backToBackOf(o, n) + (breakWeight > 0 ? breakWeight * doubleGreedyBreaks(o, n) : 0);
  const starts = [[...first, ...first], [...first, ...single(seed + 7777)]].map((st) => st.map((o) => o.slice()));
  const lb = carryOverFromOpponents(opponentsFromOpp(starts[0], n)).lowerBound;
  const iterations = Math.round(effort * Math.min(60000, Math.max(3000, 2e7 / (N * N))));
  let opp = starts[0], bestCost = cost(opp);
  if (N > 2) {
    for (const st of starts) {
      const T0 = Math.max(4, coeOf(st, n, false) / (N * 8));
      const res = annealHalves(st, R, cost, { iterations, T0, rand, stopAt: breakWeight > 0 ? -Infinity : lb });
      if (res.best < bestCost) { bestCost = res.best; opp = res.bestOpp; }
    }
  }
  const venues = assignVenuesDouble(opp, n, seed);
  const rounds = opp.map((o, r) => {
    const matches = [];
    let bye = null;
    for (let t = 0; t < o.length; t++) {
      const u = o[t];
      if (t > u) continue;
      if (u >= n) { bye = t; continue; }
      if (t >= n) { bye = u; continue; }
      matches.push(venues[r][t] ? [t, u] : [u, t]);
    }
    return { leg: r < R ? 0 : 1, matches, bye };
  });
  let breaks = 0;
  for (let t = 0; t < n; t++) breaks += teamBreaks(venues, opp, t, n);
  return { rounds, coe: coeOf(opp, n, false), mirroredCoe, lowerBound: lb, breaks, backToBack: backToBackOf(opp, n), iterations };
}

/** Times a team meets the same opponent in two consecutive games (a bye in between still counts). */
function backToBackOf(opp, n) {
  let c = 0;
  for (let t = 0; t < n; t++) {
    let prev = -1;
    for (let r = 0; r < opp.length; r++) { const o = opp[r][t]; if (o >= n) continue; if (o === prev) c++; prev = o; }
  }
  return c;
}

/** The same moves as `anneal`, each made inside one half (rounds [0, R) or [R, 2R)). */
function annealHalves(opp, R, costOf, { iterations, T0, rand, stopAt = -Infinity }) {
  const N = opp[0].length;
  let cur = costOf(opp);
  let best = cur, bestOpp = opp.map((o) => o.slice());
  for (let it = 0; it < iterations && best > stopAt; it++) {
    const T = T0 * (1 - it / iterations) + 0.05;
    const off = rand() < 0.5 ? 0 : R;
    const sub = opp.slice(off, off + R); // shared rows: in-place edits reach opp
    const r = Math.floor(rand() * R);
    let s = Math.floor(rand() * (R - 1)); if (s >= r) s++;
    const mv = rand();
    const accept = (v) => v <= cur || rand() < Math.exp((cur - v) / T);
    if (mv < 0.4) {
      const a = Math.floor(rand() * N);
      let b = Math.floor(rand() * (N - 1)); if (b >= a) b++;
      const S = teamSwapRounds(sub, a, b, r);
      if (S.length >= R) continue;
      swapTeamsIn(sub, S, a, b);
      const v = costOf(opp);
      if (accept(v)) cur = v; else swapTeamsIn(sub, S, a, b);
    } else if (mv < 0.6) {
      const sw = () => { [opp[off + r], opp[off + s]] = [opp[off + s], opp[off + r]]; };
      sw();
      const v = costOf(opp);
      if (accept(v)) cur = v; else sw();
    } else {
      const t = Math.floor(rand() * N);
      const cyc = cycleOf(sub, r, s, t);
      if (cyc.length === N) continue;
      const sw = () => { for (const x of cyc) { const y = sub[r][x]; sub[r][x] = sub[s][x]; sub[s][x] = y; } };
      sw();
      const v = costOf(opp);
      if (accept(v)) cur = v; else sw();
    }
    if (cur < best) { best = cur; bestOpp = opp.map((o) => o.slice()); }
  }
  return { best, bestOpp };
}

/** Round index, per team and opponent, of their meeting in the other half: link[r][t]. */
function meetingLinks(opp) {
  const R2 = opp.length, R = R2 / 2, N = opp[0].length;
  const where = Array.from({ length: 2 }, () => new Int16Array(N * N).fill(-1));
  for (let r = 0; r < R2; r++) for (let t = 0; t < N; t++) where[r < R ? 0 : 1][t * N + opp[r][t]] = r;
  return opp.map((o, r) => Int16Array.from(o, (u, t) => where[r < R ? 1 : 0][t * N + u]));
}

/** Greedy phase pass on the first half; the second half is forced opposite. Breaks counted over the season. */
function doubleGreedyBreaks(opp, n) {
  const R2 = opp.length, R = R2 / 2, N = opp[0].length;
  const home = opp.map(() => new Uint8Array(N));
  const phase = new Int8Array(N).fill(-1);
  for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) {
    const u = opp[r][t];
    if (t > u) continue;
    if (u >= n || t >= n) { phase[t] = -1; phase[u] = -1; continue; }
    const keepT = phase[t] < 0 ? 0 : (phase[t] === 1 ? 1 : -1);
    const keepU = phase[u] < 0 ? 0 : (phase[u] === 0 ? 1 : -1);
    const tPhase = keepT + keepU >= 0 ? 1 : 0;
    phase[t] = tPhase; phase[u] = 1 - tPhase;
    const h = (tPhase ^ (r & 1)) === 1;
    home[r][t] = h ? 1 : 0; home[r][u] = h ? 0 : 1;
  }
  const at = new Int16Array(N * N).fill(-1);
  for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) at[t * N + opp[r][t]] = home[r][t];
  for (let r = R; r < R2; r++) for (let t = 0; t < N; t++) home[r][t] = at[t * N + opp[r][t]] ? 0 : 1;
  let b = 0;
  for (let t = 0; t < n; t++) b += teamBreaks(home, opp, t, n);
  return b;
}

/**
 * Home/away for a phased double round robin: each pair's two games are at opposite grounds. Starts
 * from the greedy first-half pass (second half forced opposite), then anneals over pair flips with
 * restarts; cost is total breaks (home and away counts are equal by construction).
 */
export function assignVenuesDouble(opp, n, seed = 1, restarts = 6) {
  const R2 = opp.length, R = R2 / 2, N = opp[0].length;
  const link = meetingLinks(opp);
  let best = null, bestCost = Infinity;
  for (let k = 0; k < restarts; k++) {
    const rand = mulberry32(((seed * 7919 + k * 104729) ^ 0x51ed270b) >>> 0);
    const v = opp.map(() => new Uint8Array(N));
    // start: alternate by round parity with a seeded per-team phase, first half; second half opposite
    const ph = Uint8Array.from({ length: N }, () => (rand() < 0.5 ? 1 : 0));
    for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) {
      const u = opp[r][t];
      if (t > u) continue;
      const h = ((ph[t] ^ (r & 1)) === 1) ? 1 : (((ph[u] ^ (r & 1)) === 1) ? 0 : (rand() < 0.5 ? 1 : 0));
      v[r][t] = h; v[r][u] = 1 - h;
      const r2 = link[r][t];
      v[r2][t] = 1 - h; v[r2][u] = h;
    }
    const tb = (t) => (t < n ? teamBreaks(v, opp, t, n) : 0);
    let cost = 0;
    for (let t = 0; t < n; t++) cost += tb(t);
    const iters = Math.max(8000, 80 * R2 * N);
    for (let it = 0; it < iters; it++) {
      const T = 1.5 * (1 - it / iters) + 0.02;
      const r = Math.floor(rand() * R);
      const t = Math.floor(rand() * N);
      const u = opp[r][t];
      if (t >= n || u >= n) continue;
      const r2 = link[r][t];
      const before = tb(t) + tb(u);
      const flip = () => { v[r][t] ^= 1; v[r][u] ^= 1; v[r2][t] ^= 1; v[r2][u] ^= 1; };
      flip();
      const d = tb(t) + tb(u) - before;
      if (d <= 0 || rand() < Math.exp(-d / T)) cost += d; else flip();
    }
    if (cost < bestCost) { bestCost = cost; best = v.map((x) => x.slice()); }
  }
  return best;
}
