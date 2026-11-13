// The fewest breaks a fixed timetable allows, exactly, in the browser.
//
// A break is two consecutive rounds a team plays at the same ground (a bye resets the run, as
// carryover.mjs teamBreaks counts). Who meets whom in which round is fixed; only who hosts each
// match is free. eval/orient-maxsat.py proves the least with a MaxSAT solver (python-sat), which a
// page cannot run. This module gets the same number with a dynamic programme over rounds: in a
// single round robin each match belongs to one round, and a team's break between rounds r and r + 1
// depends only on the hosts of round r and round r + 1, so the hosts of one round are a state
// (2^k of them for k matches) and the least breaks up to round r + 1 is
//
//   f[r + 1](y) = min over x of f[r](x) + #teams playing in both rounds at the same ground,
//
// with the ground mask of a state precomputed as a bitmask of the teams at home, so one transition
// is one xor and one popcount. 20 teams: 19 rounds x 1,024 x 1,024 states, about 20 M popcounts.
//
// The programme ignores the balance rule (each team's home and away games within one); the least it
// finds is therefore a floor for the tool's own rules. A seeded depth-first walk back over its table
// then looks for a balanced host choice at the floor, then at the floor + 1, and so on, pruning a
// branch once a team can no longer end within one. A level walked to the end with nothing found
// proves that many breaks impossible, so the first balanced hit is the least (`proved`), within a
// step budget. Checked against MaxSAT in eval/orient-dp.txt.
//
// A home-and-away season keeps one host per pair (at home in leg one, away in leg two), which ties
// rounds far apart, so the programme cannot model it exactly; run over both legs with every match
// free it gives a valid floor (`relaxed: true`). Pure functions, no DOM, seeded.

import { mulberry32 } from "./calc.mjs";

/** Largest number of matches in a round the exact programme takes (2^12 states, 24 or 25 teams). */
export const ORIENT_MAX_MATCHES = 12;

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Matches of each round among real teams (byes dropped), lower index first. */
function roundMatches(opp, n) {
  return opp.map((o) => {
    const ms = [];
    for (let t = 0; t < n; t++) { const u = o[t]; if (u < n && t < u) ms.push([t, u]); }
    return ms;
  });
}

/** Bitmask of the teams at home for every host choice x of one round's matches (bit k: lower hosts). */
function homeMasks(ms) {
  const S = 1 << ms.length, H = new Uint32Array(S);
  for (let x = 0; x < S; x++) {
    let h = 0;
    for (let k = 0; k < ms.length; k++) h |= 1 << ((x >>> k) & 1 ? ms[k][0] : ms[k][1]);
    H[x] = h >>> 0;
  }
  return H;
}

/**
 * Least breaks for the timetable `opp` (opp[r][t] = t's opponent in round r, >= n a bye), the
 * hosts free per match. Returns { floor, least, proved, breaks, venues, balanced, steps } or null
 * when a round has more than `maxMatches` matches or n > 32. floor: least breaks with every match
 * free. least: least breaks with every team's home and away games within one over `span` rounds
 * (default all), null when the walk found none within `budget` steps and `maxSlack` over the floor;
 * proved: no balanced choice has fewer. venues[r][t] is 1 when t is at home in round r and has
 * `breaks` breaks (least, else floor and unbalanced). `seed` orders the walk.
 */
export function leastBreaks(opp, n, { maxMatches = ORIENT_MAX_MATCHES, span = opp.length, seed = 1, budget = 5000000, maxSlack = 10 } = {}) {
  if (n > 32) return null;
  const R = opp.length;
  const M = roundMatches(opp, n);
  if (M.some((ms) => ms.length > maxMatches)) return null;
  const H = M.map(homeMasks);
  const plays = opp.map((o) => { let p = 0; for (let t = 0; t < n; t++) if (o[t] < n) p |= 1 << t; return p >>> 0; });
  // f[r][x]: least breaks in rounds 0..r with round r's hosts x
  const f = [new Int32Array(H[0].length)];
  for (let r = 0; r + 1 < R; r++) {
    const A = H[r], B = H[r + 1], both = (plays[r] & plays[r + 1]) >>> 0, fr = f[r];
    const g = new Int32Array(B.length).fill(0x3fffffff);
    for (let x = 0; x < A.length; x++) {
      const fx = fr[x], ax = A[x];
      for (let y = 0; y < B.length; y++) {
        // same ground in both rounds = not (home xor home), among teams playing both
        const c = fx + popcount(~(ax ^ B[y]) & both);
        if (c < g[y]) g[y] = c;
      }
    }
    f.push(g);
  }
  const last = f[R - 1];
  let floor = Infinity;
  for (let y = 0; y < last.length; y++) if (last[y] < floor) floor = last[y];

  const rand = mulberry32(seed >>> 0);
  const g = new Int32Array(n); // games so far (within span), home minus away, per team
  const after = []; // after[r][t]: games t plays within span in rounds r..R-1
  {
    const cnt = new Int32Array(n);
    for (let r = R - 1; r >= 0; r--) {
      if (r < span) for (let t = 0; t < n; t++) if (opp[r][t] < n) cnt[t]++;
      after[r] = Int32Array.from(cnt);
    }
  }
  const pick = new Int32Array(R);
  let steps = 0, found = null, complete = true;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const apply = (r, x, sign) => {
    if (r >= span) return;
    const h = H[r][x];
    for (let t = 0; t < n; t++) if ((plays[r] >>> t) & 1) g[t] += sign * (((h >>> t) & 1) ? 1 : -1);
  };
  // rounds r..R-1 chosen: each team can still end within one only if |home - away| <= 1 + games left
  const feasible = (r) => {
    for (let t = 0; t < n; t++) if (Math.abs(g[t]) > after[0][t] - after[r][t] + 1) return false;
    return true;
  };
  // walk rounds from the last back to the first. f[r][y] is the least cost to come; `slack` is how
  // many breaks over that the rest of the walk may still spend and keep the total within the target.
  const walk = (r, y, slack) => {
    if (found) return;
    if (steps >= budget) { complete = false; return; }
    steps++;
    pick[r] = y;
    apply(r, y, 1);
    if (r === 0) {
      let ok = true;
      for (let t = 0; t < n; t++) if (Math.abs(g[t]) > 1) { ok = false; break; }
      if (ok) found = Int32Array.from(pick);
    } else if (feasible(r)) {
      const A = H[r - 1], both = (plays[r - 1] & plays[r]) >>> 0, fr = f[r - 1], target = f[r][y], By = H[r][y];
      const prev = [];
      for (let x = 0; x < A.length; x++) {
        const extra = fr[x] + popcount(~(A[x] ^ By) & both) - target;
        if (extra <= slack) prev.push([x, extra]);
      }
      shuffle(prev).sort((p, q) => p[1] - q[1]);
      for (const [x, extra] of prev) { walk(r - 1, x, slack - extra); if (found || !complete) break; }
    }
    apply(r, y, -1);
  };
  // the least balanced host choice: try the floor, then one break more, and so on. A level searched
  // to the end with nothing found proves no balanced choice has that many breaks.
  let least = null, proved = true;
  for (let k = 0; k <= maxSlack && !found; k++) {
    const ends = [];
    for (let y = 0; y < last.length; y++) if (last[y] - floor <= k) ends.push([y, last[y] - floor]);
    shuffle(ends).sort((p, q) => p[1] - q[1]);
    for (const [y, extra] of ends) { walk(R - 1, y, k - extra); if (found || !complete) break; }
    if (found) least = floor + k;
    if (!complete) { proved = false; break; }
  }
  const choice = found || plainTraceback(f, H, plays, R, floor);
  const venues = opp.map((o, r) => {
    const v = new Uint8Array(o.length), h = H[r][choice[r]];
    for (let t = 0; t < n; t++) if (o[t] < n) v[t] = (h >>> t) & 1;
    return v;
  });
  return { floor, least, proved: least != null && proved, breaks: least ?? floor, venues, balanced: !!found, steps };
}

/** One optimal host choice per round, first predecessor found (no balance preference). */
function plainTraceback(f, H, plays, R, least) {
  const pick = new Int32Array(R);
  let y = 0;
  while (f[R - 1][y] !== least) y++;
  pick[R - 1] = y;
  for (let r = R - 1; r > 0; r--) {
    const A = H[r - 1], both = (plays[r - 1] & plays[r]) >>> 0, fr = f[r - 1], target = f[r][y], By = H[r][y];
    let x = 0;
    while (fr[x] + popcount(~(A[x] ^ By) & both) !== target) x++;
    pick[r - 1] = x; y = x;
  }
  return pick;
}

/** Breaks of venues on opp, counted as carryover.mjs teamBreaks (a bye resets the run). */
export function countBreaks(venues, opp, n) {
  let b = 0;
  for (let t = 0; t < n; t++) {
    let last = null;
    for (let r = 0; r < opp.length; r++) {
      if (opp[r][t] >= n) { last = null; continue; }
      const v = venues[r][t];
      if (last === v) b++;
      last = v;
    }
  }
  return b;
}

/**
 * A floor on the breaks of a home-and-away season's timetable: leastBreaks over both legs with every
 * match free (the pair-keeps-one-host rule dropped). Never above the tool's least. null when too big.
 */
export function relaxedBreakFloor(opp, n, opts = {}) {
  const r = leastBreaks(opp, n, { ...opts, budget: 0 });
  return r && r.floor;
}
