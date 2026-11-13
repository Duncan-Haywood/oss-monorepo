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
// computed without the 2^k x 2^k double loop (minPlusStep): a team plays one match a round, so the
// cost couples each host bit of round r to at most two of round r + 1, and eliminating round r's
// bits one at a time along those paths and cycles takes about k * 2^(k + 2) additions. 20 teams:
// 19 rounds x some 40 thousand, where the double loop took 19 x 1,024 x 1,024 popcounts
// (2026-11-13, README "A faster break floor").
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
 * One step of the programme, g[y] = min over x of fr[x] + #teams playing in both rounds at the same
 * ground, for the matches A of round r (fr indexed by their host choice x) and B of round r + 1,
 * without the 2^|A| x 2^|B| double loop. A team plays one match a round, so each of A's host bits
 * meets at most two of B's, and the bits form paths and cycles. Eliminating A's bits one at a time
 * along them keeps a table over the bits not yet eliminated and B's bits met so far, at most
 * 2^(|A| + 1) or so entries: about |A| * 2^(|A| + 2) additions in all, where the double loop took
 * 4^|A| popcounts (12 matches: some 200 thousand against 16.7 million). Same numbers exactly
 * (orient.test.mjs checks it against the double loop).
 */
export function minPlusStep(fr, A, B) {
  const kA = A.length, kB = B.length;
  const inB = new Map();
  B.forEach(([c, d], j) => { inB.set(c, [j, 1]); inB.set(d, [j, 0]); });
  // edges[i]: [j, flip] per team of A's match i that plays in B's match j; the team breaks when
  // x_i ^ y_j ^ flip is 0 (flip: the team is the lower in one match and not in the other)
  const edges = A.map(([a, b]) => {
    const e = [];
    for (const [t, ra] of [[a, 1], [b, 0]]) { const q = inB.get(t); if (q) e.push([q[0], ra ^ q[1]]); }
    return e;
  });
  const yAdj = Array.from({ length: kB }, () => []);
  edges.forEach((e, i) => { for (const [j] of e) yAdj[j].push(i); });
  // elimination order: walk each path from an end, each cycle from anywhere
  const order = [], seen = new Uint8Array(kA);
  const visit = (s) => {
    const st = [s];
    while (st.length) {
      const i = st.pop();
      if (seen[i]) continue;
      seen[i] = 1; order.push(i);
      for (const [j] of edges[i]) for (const i2 of yAdj[j]) if (!seen[i2]) st.push(i2);
    }
  };
  const ends = (i) => { const ys = new Set(edges[i].map((q) => q[0])); let m = 0; for (const j of ys) m += yAdj[j].length - 1; return m; };
  for (let i = 0; i < kA; i++) if (!seen[i] && ends(i) < 2) visit(i);
  for (let i = 0; i < kA; i++) if (!seen[i]) visit(i);
  // the table's bits, low to high: A's bits not yet eliminated (the next one at bit 0), then B's
  // bits in the order they were met
  let T = new Int32Array(1 << kA);
  for (let x = 0; x < T.length; x++) { let z = 0; for (let p = 0; p < kA; p++) z |= ((x >>> order[p]) & 1) << p; T[z] = fr[x]; }
  const yPos = new Int32Array(kB).fill(-1);
  let Lx = kA, Ly = 0;
  for (let p = 0; p < kA; p++) {
    const e = edges[order[p]];
    let add = 0;
    for (const [j] of e) if (yPos[j] < 0) yPos[j] = Ly + add++;
    const lx = Lx - 1, ly = Ly + add, xm = (1 << lx) - 1, ym = (1 << Ly) - 1;
    const N = new Int32Array(1 << (lx + ly));
    const e0 = e.length > 0 ? yPos[e[0][0]] : -1, f0 = e.length > 0 ? e[0][1] : 0;
    const e1 = e.length > 1 ? yPos[e[1][0]] : -1, f1 = e.length > 1 ? e[1][1] : 0;
    // the bits of z that hold the y bits of this x's edges; a team breaks at x = 0 when its y bit
    // equals its flip, else at x = 1
    const b0 = e0 >= 0 ? 1 << (e0 + lx) : 0, b1 = e1 >= 0 ? 1 << (e1 + lx) : 0;
    const v0 = f0 ? b0 : 0, v1 = f1 ? b1 : 0;
    for (let z = 0; z < N.length; z++) {
      const base = ((z & xm) << 1) | (((z >>> lx) & ym) << Lx);
      let c0 = T[base], c1 = T[base | 1];
      if (b0) { if ((z & b0) === v0) c0++; else c1++; }
      if (b1) { if ((z & b1) === v1) c0++; else c1++; }
      N[z] = c0 < c1 ? c0 : c1;
    }
    T = N; Lx = lx; Ly = ly;
  }
  // B's bits no A bit met (a match of two teams that both sat out round r) are free
  for (let j = 0; j < kB; j++) if (yPos[j] < 0) yPos[j] = Ly++;
  const g = new Int32Array(1 << kB);
  for (let y = 0; y < g.length; y++) { let z = 0; for (let j = 0; j < kB; j++) z |= ((y >>> j) & 1) << yPos[j]; g[y] = T[z & (T.length - 1)]; }
  return g;
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
  for (let r = 0; r + 1 < R; r++) f.push(minPlusStep(f[r], M[r], M[r + 1]));
  const last = f[R - 1];
  let floor = Infinity;
  for (let y = 0; y < last.length; y++) if (last[y] < floor) floor = last[y];

  const w = balancedWalk(f, H, plays, opp, n, { span, seed, budget, maxSlack, floor });
  const { least, found, steps } = w, proved = w.proved;
  const choice = found || plainTraceback(f, H, plays, R, floor);
  const venues = opp.map((o, r) => {
    const v = new Uint8Array(o.length), h = H[r][choice[r]];
    for (let t = 0; t < n; t++) if (o[t] < n) v[t] = (h >>> t) & 1;
    return v;
  });
  return { floor, least, proved, breaks: least ?? floor, venues, balanced: !!found, steps };
}

/**
 * The least balanced host choice over a forward table f (f[r][x]: least breaks in rounds 0..r with
 * round r's hosts x), H (home masks) and plays: a seeded depth-first walk back from the last round
 * at floor, floor + 1, ... floor + maxSlack, each level walked to the end proving that many breaks
 * impossible. Returns { least, found (the host choice per round), proved, steps }; least null when
 * nothing was found within maxSlack or the budget ran out.
 */
function balancedWalk(f, H, plays, opp, n, { span = opp.length, seed = 1, budget = 5000000, maxSlack = 10, floor }) {
  const R = opp.length, last = f[R - 1];
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
  return { least, found, proved: least != null && proved, steps };
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

/**
 * The break floor of a single round robin's timetable kept as its forward table, so a search that
 * changes a few rounds prices the change without the whole programme: rounds before the first
 * changed one keep their table, and the programme reruns from there (R - lo transitions instead of
 * R - 1, about half on a random move). `trial(lo)` prices the timetable as `opp` now stands, with
 * rounds 0..lo-1 unchanged since the last `commit`; `commit()` keeps the last trial's table (call it
 * only right after the trial it accepts; the caller undoes a refused move instead). Same floor as
 * leastBreaks(opp, n).floor. null when a round has more than ORIENT_MAX_MATCHES matches. `opp` is
 * read live (the caller moves it).
 */
export function floorTable(opp, n) {
  const R = opp.length;
  if (n > 32 || roundMatches(opp, n).some((ms) => ms.length > ORIENT_MAX_MATCHES)) return null;
  const playsOf = (r) => { let p = 0; for (let t = 0; t < n; t++) if (opp[r][t] < n) p |= 1 << t; return p >>> 0; };
  let H = [], plays = [], fwd = [], ms = [], pending = null;
  const run = (lo) => {
    const h = H.slice(0, lo), p = plays.slice(0, lo), f = fwd.slice(0, lo), m = ms.slice(0, lo);
    for (let r = lo; r < R; r++) {
      m[r] = roundMatches([opp[r]], n)[0]; h[r] = homeMasks(m[r]); p[r] = playsOf(r);
      f[r] = r === 0 ? new Int32Array(h[0].length) : minPlusStep(f[r - 1], m[r - 1], m[r]);
    }
    let best = Infinity;
    for (const v of f[R - 1]) if (v < best) best = v;
    pending = { h, p, f, m };
    return best;
  };
  const commit = () => { if (pending) { H = pending.h; plays = pending.p; fwd = pending.f; ms = pending.m; pending = null; } };
  // the least balanced host choice of the last trial's timetable (or the committed one), at most
  // `maxBreaks` breaks, by balancedWalk over its table: no programme to rerun. null when none is
  // within maxBreaks or the walk ran out of `budget` steps (then { least: null, proved: false }).
  const balanced = (maxBreaks, { seed = 1, budget = 50000 } = {}) => {
    const t = pending || { h: H, p: plays, f: fwd };
    let fl = Infinity;
    for (const v of t.f[R - 1]) if (v < fl) fl = v;
    if (fl > maxBreaks) return { least: null, proved: true, floor: fl };
    const w = balancedWalk(t.f, t.h, t.p, opp, n, { seed, budget, maxSlack: maxBreaks - fl, floor: fl });
    return { least: w.least, proved: w.proved || (w.least == null && w.steps < budget), floor: fl };
  };
  const floor = run(0);
  commit();
  return { floor, trial: (lo) => run(lo), commit, balanced };
}
