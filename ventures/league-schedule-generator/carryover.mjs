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
  // In a single round robin c[i][i] is always 0, so the total spreads over n(n-1) cells; in a
  // double one a team can meet the same side twice running (end of one leg, start of the next),
  // so when a schedule does that the diagonal counts too.
  let diagonal = 0;
  for (let i = 0; i < n; i++) diagonal += matrix[i][i];
  const cells = diagonal ? n * n : n * (n - 1);
  const q = Math.floor(total / cells), r = total - q * cells;
  const lowerBound = cells ? r * (q + 1) ** 2 + (cells - r) * q * q : 0;
  return { matrix, value, max, pairs, total, lowerBound, repeats: diagonal };
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
function teamSwapRounds(opp, a, b, r, lo = 0, hi = opp.length) {
  const inS = new Uint8Array(opp.length);
  const S = [r]; inS[r] = 1;
  const roundOf = (t, o) => { for (let q = lo; q < hi; q++) if (opp[q][t] === o) return q; return -1; };
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

/**
 * Carry-over under a cap on breaks. Starts from the circle method with the fewest breaks it allows
 * (n - 2 for an even league, the least any round robin can have; venues from assignVenues), then
 * anneals carry-over alone over oriented timetables: every move carries each match's home and away
 * with it, and a move is kept only if the season still has at most `maxBreaks` breaks (default
 * the start's count) and every team's home and away games differ by at most one. Moves are the
 * three of lowCarryOverRounds (partial team swap, where a takes over b's match and ground in each
 * round of the swap; round swap; partial round swap) plus flipping one match's venue. This is the
 * fewest-breaks end of the trade, where the breakWeight pass is the low-carry-over end.
 * Returns the lowCarryOverRounds shape plus { maxBreaks }.
 */
export function lowCarryOverCappedRounds(n, { seed = 1, effort = 1, cyclic = false, maxBreaks = null } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const R = N - 1;
  const rand = mulberry32((seed * 40503 + 7) >>> 0);
  const circle = circleOpp(N);
  const circleCoe = coeOf(circle, n, cyclic);
  const lb = carryOverFromOpponents(opponentsFromOpp(circle, n), { cyclic }).lowerBound;
  const opp = circle;
  const ven = assignVenues(opp, n, seed);
  const breaksOf = () => { let b = 0; for (let t = 0; t < n; t++) b += teamBreaks(ven, opp, t, n); return b; };
  const balanced = (ts) => {
    for (const t of ts) {
      if (t >= n) continue;
      let h = 0, g = 0;
      for (let r = 0; r < R; r++) if (opp[r][t] < n) { g++; h += ven[r][t]; }
      if (Math.abs(2 * h - g) > 1) return false;
    }
    return true;
  };
  const startBreaks = breaksOf();
  const cap = maxBreaks == null ? startBreaks : Math.max(startBreaks, maxBreaks);
  let curBreaks = startBreaks;
  const iterations = N <= 6 ? 20000 : Math.max(2000, Math.round((effort * 4e7) / (N * N)));
  let cur = coeOf(opp, n, cyclic);
  let best = cur, bestOpp = opp.map((o) => o.slice()), bestVen = ven.map((v) => v.slice());
  const T0 = Math.max(4, cur / (N * 4));
  // a timetable move either keeps every team's ground in each round (the pattern stays; the move
  // must leave a team at home facing one away) or carries each match's ground with it (the pattern
  // changes; the cap and the balance are checked)
  const fits = (q) => {
    const o = opp[q], h = ven[q];
    for (let t = 0; t < n; t++) { const u = o[t]; if (u < n && h[t] === h[u]) return false; }
    return true;
  };
  let curCoe = cur;
  const odd = N > n, everyone = Array.from({ length: n }, (_, t) => t);
  for (let it = 0; it < iterations && best > lb && N > 2; it++) {
    const T = T0 * (1 - it / iterations) + 0.05;
    const r = Math.floor(rand() * R);
    let s = Math.floor(rand() * (R - 1)); if (s >= r) s++;
    const mv = rand();
    const keep = rand() < 0.5; // keep the pattern, or carry grounds with the matches
    let undo, fitsNow, touched = null, flip = false;
    if (mv < 0.4) {
      const a = Math.floor(rand() * N);
      let b = Math.floor(rand() * (N - 1)); if (b >= a) b++;
      const S = teamSwapRounds(opp, a, b, r);
      if (S.length >= R) continue;
      undo = () => {
        if (!keep) for (const q of S) {
          if (opp[q][a] === b) continue;
          const x = ven[q][a]; ven[q][a] = ven[q][b]; ven[q][b] = x;
        }
        swapTeamsIn(opp, S, a, b);
      };
      fitsNow = () => S.every(fits);
      touched = [a, b];
    } else if (mv < 0.55) {
      undo = () => { [opp[r], opp[s]] = [opp[s], opp[r]]; if (!keep) [ven[r], ven[s]] = [ven[s], ven[r]]; };
      fitsNow = () => fits(r) && fits(s);
    } else if (mv < 0.9) {
      const t = Math.floor(rand() * N);
      const cyc = cycleOf(opp, r, s, t);
      if (cyc.length === N) continue;
      undo = () => {
        for (const x of cyc) {
          const a = opp[r][x]; opp[r][x] = opp[s][x]; opp[s][x] = a;
          if (!keep) { const v = ven[r][x]; ven[r][x] = ven[s][x]; ven[s][x] = v; }
        }
      };
      fitsNow = () => fits(r) && fits(s);
    } else {
      // flip one match's venue: the timetable, and so the carry-over, is unchanged
      const t = Math.floor(rand() * N), u = opp[r][t];
      if (t >= n || u >= n) continue;
      undo = () => { ven[r][t] ^= 1; ven[r][u] ^= 1; };
      touched = [t, u]; flip = true;
    }
    undo(); // the move and its undo are the same swap
    // keeping the pattern, a move must still put a home team against an away one, and leaves the
    // breaks and the balance alone; carrying grounds, a round or partial round swap moves whole
    // grounds between two rounds (each team's home count is unchanged), while a team swap or a
    // flip can tip a team's balance
    // With a bye (odd league) any timetable move can hand a team the bye in another round, which
    // changes its breaks and its home count, so then everything is rechecked.
    if (keep && !flip && !fitsNow()) { undo(); continue; }
    if (odd ? !balanced(everyone) : (!keep || flip) && touched && !balanced(touched)) { undo(); continue; }
    const nb = keep && !flip && !odd ? curBreaks : breaksOf();
    const nc = flip ? curCoe : coeOf(opp, n, cyclic);
    if (nb > cap || !(nc <= curCoe || rand() < Math.exp((curCoe - nc) / T))) { undo(); continue; }
    curCoe = nc; curBreaks = nb;
    if (curCoe < best) { best = curCoe; bestOpp = opp.map((o) => o.slice()); bestVen = ven.map((x) => x.slice()); }
  }
  const rounds = bestOpp.map((o, r) => {
    const matches = [];
    let bye = null;
    for (let t = 0; t < N; t++) {
      const u = o[t];
      if (t > u) continue;
      if (u >= n) { bye = t; continue; }
      matches.push(bestVen[r][t] ? [t, u] : [u, t]);
    }
    return { leg: 0, matches, bye };
  });
  let breaks = 0;
  for (let t = 0; t < n; t++) breaks += teamBreaks(bestVen, bestOpp, t, n);
  return { rounds, coe: coeOf(bestOpp, n, cyclic), circleCoe, lowerBound: lb, breaks, iterations, maxBreaks: cap };
}

// `blocks` splits the rounds into legs that must each stay a round robin of their own (a double
// round robin played leg by leg); every move picks one block and stays inside it.
function anneal(opp, costOf, { iterations, T0, rand, stopAt, blocks = [[0, opp.length]] }) {
  const N = opp[0].length;
  let cur = costOf(opp);
  let best = cur, bestOpp = opp.map((o) => o.slice());
  for (let it = 0; it < iterations && best > stopAt; it++) {
    const T = T0 * (1 - it / iterations) + 0.05;
    const [lo, hi] = blocks[blocks.length === 1 ? 0 : Math.floor(rand() * blocks.length)];
    const R = hi - lo;
    const r = lo + Math.floor(rand() * R);
    let s = lo + Math.floor(rand() * (R - 1)); if (s >= r) s++;
    const mv = rand();
    if (mv < 0.4) {
      const a = Math.floor(rand() * N);
      let b = Math.floor(rand() * (N - 1)); if (b >= a) b++;
      const S = teamSwapRounds(opp, a, b, r, lo, hi);
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

// ------------------------------------------------------------------ double round robin as a whole

// Mirroring the first leg (the same rounds again, home and away swapped) repeats every carry-over
// step, so every count c[i][j] doubles and the value roughly quadruples. Here the second leg is its
// own ordered round robin, searched together with the first: each pair still meets once per leg
// (phased, as buildSchedule plays leg by leg), and the second meeting is at the other team's ground,
// so every team has n - 1 home and n - 1 away games. The value is counted over the whole season,
// including the step from the last game of leg one to the first of leg two.

/** Breaks over the whole season when `host` (who hosts each pair in leg one) sets every venue. */
function hostBreaks(opp, n, R, host) {
  const N = opp[0].length;
  let b = 0;
  for (let t = 0; t < n; t++) {
    let last = -1;
    for (let r = 0; r < opp.length; r++) {
      const u = opp[r][t];
      if (u >= n) { last = -1; continue; }
      const h1 = host[Math.min(t, u) * N + Math.max(t, u)] === t ? 1 : 0;
      const h = r < R ? h1 : 1 - h1;
      if (h === last) b++;
      last = h;
    }
  }
  return b;
}

/**
 * A double round robin with a low carry-over value over the whole season. Leg one starts from
 * lowCarryOverRounds, leg two from a copy of it, then both are annealed together (moves stay inside
 * a leg). `breakWeight` adds a pass that trades carry-over for fewer home/away breaks, as in the
 * single version. Returns { rounds (2(N-1), leg 0 then leg 1), coe, mirroredCoe, circleCoe,
 * lowerBound, breaks, iterations }; mirroredCoe is the value the same leg one would score mirrored.
 * `maxBreaks` (a season cap) replaces `breakWeight` with caps: leg one is lowCarryOverCappedRounds
 * at `legBreaks` (default a third of the season cap) and leg two moves on carry-over alone without
 * the season going over `maxBreaks` (or over the fewest its starts allow, if that is more).
 */
export function lowCarryOverDoubleRounds(n, { seed = 1, effort = 1, breakWeight = 0, maxBreaks = null, legBreaks = null } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const R = N - 1;
  const rand = mulberry32((seed * 2654435761) >>> 0);
  // with a season cap, leg one is the capped search at half of it (each leg's breaks are about
  // the same, as leg two starts as leg one backwards)
  const capped = maxBreaks != null;
  const single = capped
    ? lowCarryOverCappedRounds(n, { seed, effort, maxBreaks: legBreaks ?? Math.floor(maxBreaks / 3) })
    : lowCarryOverRounds(n, { seed, effort, breakWeight });
  const leg1 = oppFromRounds(single.rounds, N, n);
  // host[t * N + u] = t when t hosts u in leg one (the single search's home/away)
  const host = new Int16Array(N * N).fill(-1);
  for (const r of single.rounds) for (const [h, a] of r.matches) { host[Math.min(h, a) * N + Math.max(h, a)] = h; }
  let opp = [...leg1.map((o) => o.slice()), ...leg1.map((o) => o.slice())];
  const mirroredCoe = coeOf(opp, n, false);
  const circleCoe = coeOf([...circleOpp(N), ...circleOpp(N)], n, false);
  const lb = carryOverFromOpponents(opponentsFromOpp(opp, n)).lowerBound;
  const blocks = [[0, R], [R, 2 * R]];
  const iterations = N <= 4 ? 0 : N <= 6 ? 20000 : Math.max(2000, Math.round((effort * 4e7) / (2 * N * N)));
  if (iterations) {
    // Leg two starts as leg one played backwards with leg one's last round moved to the end (no
    // team meets the same side twice running). Backwards turns each carry-over step i -> j into
    // j -> i, so the counts spread instead of doubling, and each team's home/away pattern is its
    // leg-one pattern reversed and flipped: the same breaks.
    const back = [];
    for (let r = R - 2; r >= 0; r--) back.push(leg1[r].slice());
    back.push(leg1[R - 1].slice());
    opp = [...leg1.map((o) => o.slice()), ...back];
    // a team never meets the same side twice running (last game of leg one, first of leg two)
    const coeCost = (o) => coeOf(o, n, false) + REPEAT_PENALTY * repeatsAcross(o, n, R);
    const startCoe = coeCost(opp);
    const T0 = Math.max(2, startCoe / (N * 16));
    if (capped) {
      // Leg one stays as the capped search left it; leg two moves on carry-over alone under a hard
      // season cap, venues from leg one. Played backwards, nearly every team breaks at the halfway
      // point and again where leg one's last round rejoins (about 2n more breaks), so leg two
      // starts from whichever of three orders is best inside the cap: backwards, the mirror (leg
      // one again, grounds swapped: the fewest breaks, every carry-over count doubled), or the
      // mirror with its first and last rounds swapped. If none fits, the cap rises to the fewest.
      const mirror = leg1.map((o) => o.slice());
      const turned = leg1.map((o) => o.slice());
      [turned[0], turned[R - 1]] = [turned[R - 1], turned[0]];
      const starts = [opp.slice(R), mirror, turned].map((leg) => [...leg1.map((o) => o.slice()), ...leg.map((o) => o.slice())]);
      const fewest = Math.min(...starts.map((o) => hostBreaks(o, n, R, host) + REPEAT_PENALTY * repeatsAcross(o, n, R)));
      const cap = Math.max(maxBreaks, fewest);
      const startCost = (o) => { const b = hostBreaks(o, n, R, host); return coeCost(o) + (b > cap ? 1e9 : 0); };
      opp = starts.reduce((a, b) => (startCost(b) < startCost(a) ? b : a));
      const within = (o) => { const b = hostBreaks(o, n, R, host); return coeCost(o) + (b > cap ? 1e9 : 0); };
      ({ bestOpp: opp } = anneal(opp, within, { iterations, T0, rand, stopAt: -Infinity, blocks: [[R, 2 * R]] }));
    } else if (breakWeight > 0) {
      // Leg one keeps the rounds and home/away the single search chose for it (already traded for
      // breaks); only leg two moves, and its venues follow from leg one, so the breaks in the cost
      // are exact rather than estimated.
      const exact = (o) => coeCost(o) + breakWeight * hostBreaks(o, n, R, host);
      ({ bestOpp: opp } = anneal(opp, exact, { iterations, T0, rand, stopAt: -Infinity, blocks: [[R, 2 * R]] }));
    } else {
      ({ bestOpp: opp } = anneal(opp, coeCost, { iterations, T0, rand, stopAt: lb, blocks }));
    }
  }
  const venues = assignVenuesDouble(opp, n, seed, 6, breakWeight > 0 || capped ? host : null);
  const rounds = opp.map((o, r) => {
    const matches = [];
    let bye = null;
    for (let t = 0; t < N; t++) {
      const u = o[t];
      if (t > u) continue;
      if (u >= n) { bye = t; continue; }
      matches.push(venues[r][t] ? [t, u] : [u, t]);
    }
    return { leg: r < R ? 0 : 1, matches, bye };
  });
  let breaks = 0;
  for (let t = 0; t < n; t++) breaks += teamBreaks(venues, opp, t, n);
  return { rounds, coe: coeOf(opp, n, false), repeats: repeatsAcross(opp, n, R), mirroredCoe, circleCoe, lowerBound: lb, breaks, iterations };
}

const REPEAT_PENALTY = 1000;

/** Teams whose last opponent in leg one is their first in leg two (byes skipped), plus a back-to-back bye. */
function repeatsAcross(opp, n, R) {
  let c = 0;
  for (let t = 0; t < n; t++) {
    let a = -1, b = -1;
    for (let r = R - 1; r >= 0; r--) if (opp[r][t] < n) { a = opp[r][t]; break; }
    for (let r = R; r < opp.length; r++) if (opp[r][t] < n) { b = opp[r][t]; break; }
    if (a >= 0 && a === b) c++;
  }
  // odd league: the same team sitting out the last round of leg one and the first of leg two
  const N = opp[0].length;
  if (N > n && opp[R - 1][N - 1] === opp[R][N - 1]) c++;
  return c;
}

function oppFromRounds(rounds, N, n) {
  return rounds.map((r) => {
    const o = new Int16Array(N);
    for (const [h, a] of r.matches) { o[h] = a; o[a] = h; }
    if (N > n) { const b = r.bye; o[b] = N - 1; o[N - 1] = b; }
    return o;
  });
}

/**
 * Home/away for a double round robin played leg by leg, where each pair's second meeting is at the
 * other ground: one choice per pair (who hosts in leg one) sets both games. Annealing over pair
 * flips, cost = breaks over the whole season plus 50 per game of leg-one imbalance beyond one, with
 * restarts. venues[r][t] is 1 when t is at home in round r.
 */
export function assignVenuesDouble(opp, n, seed = 1, restarts = 6, initialHost = null) {
  const N = opp[0].length, R = opp.length / 2;
  const roundOf = new Int16Array(N * N).fill(-1); // leg-one round of pair (t, u), and leg two at +N*N offset via second table
  const round2 = new Int16Array(N * N).fill(-1);
  for (let r = 0; r < 2 * R; r++) for (let t = 0; t < N; t++) (r < R ? roundOf : round2)[t * N + opp[r][t]] = r;
  const build = (host) => {
    const v = opp.map(() => new Uint8Array(N));
    for (let r = 0; r < 2 * R; r++) for (let t = 0; t < N; t++) {
      const u = opp[r][t];
      const h = host[Math.min(t, u) * N + Math.max(t, u)] === t ? 1 : 0;
      v[r][t] = r < R ? h : 1 - h;
    }
    return v;
  };
  const PEN = 50;
  const teamCost = (v, t) => {
    if (t >= n) return 0;
    let h = 0, g = 0;
    for (let r = 0; r < R; r++) if (opp[r][t] < n) { g++; h += v[r][t]; }
    const d = Math.abs(2 * h - g);
    return teamBreaks(v, opp, t, n) + (d > 1 ? PEN * (d - 1) : 0);
  };
  const start = assignVenues(opp.slice(0, R), n, seed);
  let best = null, bestCost = Infinity;
  for (let k = 0; k < restarts; k++) {
    const rand = mulberry32((seed * 7919 + k * 104729 + 17) >>> 0);
    const host = new Int16Array(N * N).fill(-1);
    for (let r = 0; r < R; r++) for (let t = 0; t < N; t++) {
      const u = opp[r][t];
      if (t < u) host[t * N + u] = k === 0 && initialHost ? initialHost[t * N + u] : (k <= 1 ? start[r][t] : rand() < 0.5) ? t : u;
    }
    const v = build(host);
    let cost = 0;
    for (let t = 0; t < n; t++) cost += teamCost(v, t);
    const iters = Math.max(8000, 80 * R * N);
    // the given host is already good: search it cold so it is only improved on
    const hot = k === 0 && initialHost ? 0.3 : 1.5;
    for (let it = 0; it < iters; it++) {
      const T = hot * (1 - it / iters) + 0.02;
      const r1 = Math.floor(rand() * R), t = Math.floor(rand() * N), u = opp[r1][t];
      if (t >= n || u >= n) continue;
      const r2 = round2[t * N + u];
      const before = teamCost(v, t) + teamCost(v, u);
      const flip = () => { for (const r of [r1, r2]) { v[r][t] ^= 1; v[r][u] ^= 1; } };
      flip();
      const d = teamCost(v, t) + teamCost(v, u) - before;
      if (d <= 0 || rand() < Math.exp(-d / T)) cost += d; else flip();
    }
    if (cost < bestCost) { bestCost = cost; best = v.map((x) => x.slice()); }
  }
  return best;
}

/**
 * Best of several searches. One search is a sample, not the curve: at 20 teams the same settings
 * give 1,678 to 1,820 carry-over and 108 to 124 breaks across seeds (eval/double-frontier.txt).
 * This runs `tries` searches, cycling through `weights` (the break weight inside each search) with
 * a fresh seed per try, and keeps the one with the least carry-over + `pick` x breaks. `pick` is
 * the organiser's trade: 0 keeps the fairest carry-over, a large value the fewest breaks.
 * `effort` scales each search, so tries x effort is the total work (tries 4 at effort 0.25 costs one
 * plain search). Seeded: the same arguments give the same rounds. `onTry(i, candidate)` reports
 * progress (the page's Web Worker posts it). Returns the chosen search's result plus `tries`
 * (every candidate's seed, weight, coe and breaks), `chosen` (its index) and `frontier` (the
 * candidates no other one beats on both counts, by carry-over). `capped` more tries after those
 * run the capped search (lowCarryOverCappedRounds; caps from cappedTryBreaks), the fewest-breaks end
 * of the trade the weights do not reach (eval/capped-breaks.txt).
 */
export function bestCarryOverRounds(n, { double = false, seed = 1, tries = 4, capped = 0, weights = [10, 20, 40, 80], pick = 10, effort = 1, onTry = null } = {}) {
  checkBestOfK(tries, pick);
  if (!Number.isInteger(capped) || capped < 0) throw new Error("capped must be a whole number of 0 or more.");
  const results = [];
  for (let i = 0; i < tries + capped; i++) {
    const t = carryOverTry(n, i, { double, seed, weights, effort, weighted: tries });
    results.push(t);
    if (onTry) onTry(i, candidateOf(t, pick));
  }
  return combineCarryOverTries(results, pick);
}

function checkBestOfK(tries, pick) {
  if (!Number.isInteger(tries) || tries < 1) throw new Error("tries must be a whole number of at least 1.");
  // a NaN pick scores every try NaN, nothing beats Infinity and the result has no rounds at all
  if (typeof pick !== "number" || !Number.isFinite(pick) || pick < 0) throw new Error("pick must be a number of 0 or more (CARRY_OVER_PICK).");
}

/** The seed try i of a best-of-k search uses: try 0 is the base seed itself. */
export function carryOverTrySeed(seed, i) {
  return i === 0 ? seed : ((seed * 7919 + i * 104729) % 2147483647) || 1;
}

/**
 * Try i of bestCarryOverRounds on its own, so a pool of workers can run the tries in parallel and
 * combineCarryOverTries can pick among them: the result is the same whichever thread ran which try.
 * Returns the search result plus { index, seed, breakWeight }.
 */
export function carryOverTry(n, i, { double = false, seed = 1, weights = [10, 20, 40, 80], effort = 1, weighted = Infinity } = {}) {
  if (!Number.isInteger(i) || i < 0) throw new Error("try index must be a whole number of 0 or more.");
  // try 0 is exactly the plain search at `seed` and the first weight, so tries 1 changes nothing
  const s = carryOverTrySeed(seed, i);
  if (i >= weighted && n % 2 === 1) {
    // An odd league: every team sits out once a leg, a bye ends a run of home or away games, and
    // the capped search cannot move a bye without unbalancing someone, so it would return the
    // circle method. A heavy break weight stands in.
    const w = 160 * (i - weighted + 1);
    const r = double ? lowCarryOverDoubleRounds(n, { seed: s, effort, breakWeight: w }) : lowCarryOverRounds(n, { seed: s, effort, breakWeight: w });
    return { ...r, index: i, seed: s, breakWeight: w };
  }
  if (i >= weighted) {
    // a capped try: the fewest-breaks end of the trade (lowCarryOverCappedRounds)
    const caps = cappedTryBreaks(n, i - weighted, double);
    const r = double
      ? lowCarryOverDoubleRounds(n, { seed: s, effort, maxBreaks: caps.season, legBreaks: caps.leg })
      : lowCarryOverCappedRounds(n, { seed: s, effort, maxBreaks: caps.leg });
    return { ...r, index: i, seed: s, breakWeight: null, maxBreaks: double ? caps.season : caps.leg };
  }
  const w = weights[i % weights.length];
  const r = double ? lowCarryOverDoubleRounds(n, { seed: s, effort, breakWeight: w }) : lowCarryOverRounds(n, { seed: s, effort, breakWeight: w });
  return { ...r, index: i, seed: s, breakWeight: w };
}

/**
 * The caps capped try j runs at: j = 0 the least breaks (n - 2 a leg for an even league, the
 * minimum; 3(n - 2) over a home-and-away season, the mirrored minimum), each later try 4 more a leg
 * and 12 more a season (eval/capped-breaks.txt has the curve these were picked from).
 */
export function cappedTryBreaks(n, j, double = false) {
  const base = n % 2 === 0 ? n - 2 : 0;
  return { leg: base + 4 * j, season: double ? 3 * base + 12 * j : null };
}

function candidateOf(t, pick) {
  return { seed: t.seed, breakWeight: t.breakWeight, ...(t.maxBreaks != null ? { maxBreaks: t.maxBreaks } : {}), coe: t.coe, breaks: t.breaks, score: t.coe + pick * t.breaks + (t.repeats || 0) * REPEAT_PENALTY };
}

/**
 * Keep the try with the least carry-over + pick x breaks among results from carryOverTry (one per
 * index 0..k-1, in any order). Ties go to the lower index, as in a serial run, so a pool of any
 * size returns exactly what bestCarryOverRounds returns.
 */
export function combineCarryOverTries(results, pick = 10) {
  checkBestOfK(Array.isArray(results) ? results.length : 0, pick);
  const byIndex = [...results].sort((a, b) => a.index - b.index);
  byIndex.forEach((t, i) => { if (t.index !== i) throw new Error(`carry-over tries must be numbered 0 to ${byIndex.length - 1}; try ${i} is missing.`); });
  const cands = byIndex.map((t) => candidateOf(t, pick));
  let chosen = 0;
  for (let i = 1; i < cands.length; i++) if (cands[i].score < cands[chosen].score) chosen = i;
  const frontier = cands
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => !cands.some((d) => d.coe <= c.coe && d.breaks <= c.breaks && (d.coe < c.coe || d.breaks < c.breaks)))
    .sort((a, b) => a.coe - b.coe || a.breaks - b.breaks);
  const { index, seed, breakWeight, ...best } = byIndex[chosen];
  return { ...best, tries: cands, chosen, frontier, pick };
}

/**
 * Which try indices each of `workers` threads runs: round-robin, so with k tries and w threads the
 * longest queue is ceil(k / w) tries. Thread j gets j, j + w, j + 2w, ...
 */
export function splitCarryOverTries(tries, workers) {
  const w = Math.max(1, Math.min(tries, Math.floor(workers) || 1));
  return Array.from({ length: w }, (_, j) => Array.from({ length: Math.ceil((tries - j) / w) }, (_, q) => j + q * w));
}

/** The organiser's choice among the tries: carry-over + pick x breaks (see bestCarryOverRounds). */
// `fewest` prices a break above any carry-over a capped try saves, so it keeps the capped try at the
// minimum (3(n - 2) over an even home-and-away season) and, among equal breaks, the lower carry-over.
export const CARRY_OVER_PICK = { fair: 0, balanced: 10, breaks: 40, fewest: 1000 };

/** A small, JSON-safe account of a best-of-k search, for the page's read-out and share-safe caching. */
export function carryOverSummary(best) {
  return {
    tries: best.tries.length,
    chosen: best.chosen,
    pick: best.pick,
    coe: best.coe,
    breaks: best.breaks,
    candidates: best.tries.map((c) => ({ coe: c.coe, breaks: c.breaks, breakWeight: c.breakWeight, ...(c.maxBreaks != null ? { maxBreaks: c.maxBreaks } : {}) })),
    frontier: best.frontier.map((c) => ({ coe: c.coe, breaks: c.breaks, index: c.index })),
  };
}
