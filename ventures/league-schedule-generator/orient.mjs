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
// free it gives a valid floor (relaxedBreakFloor). pairLeastBreaks prices the pair and balance rules
// back in and branches on pairs (README "Fewest breaks of a home-and-away season, proved"). Pure
// functions, no DOM, seeded.

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
  const Arr = fr.constructor; // Int32Array for whole breaks, Float64Array for priced host bits
  let T = new Arr(1 << kA);
  for (let x = 0; x < T.length; x++) { let z = 0; for (let p = 0; p < kA; p++) z |= ((x >>> order[p]) & 1) << p; T[z] = fr[x]; }
  const yPos = new Int32Array(kB).fill(-1);
  let Lx = kA, Ly = 0;
  for (let p = 0; p < kA; p++) {
    const e = edges[order[p]];
    let add = 0;
    for (const [j] of e) if (yPos[j] < 0) yPos[j] = Ly + add++;
    const lx = Lx - 1, ly = Ly + add, xm = (1 << lx) - 1, ym = (1 << Ly) - 1;
    const N = new Arr(1 << (lx + ly));
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
  const g = new Arr(1 << kB);
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
/**
 * A home-and-away season's timetable as the pair model: rounds' matches and home masks as
 * leastBreaks has them, plus each pair's two games ([first round, k, second round, k]) and, per
 * round and match, its pair. null when a round has more than maxMatches matches, n > 32, or a pair
 * does not meet exactly twice.
 */
function pairModel(opp, n, maxMatches, span) {
  if (n > 32) return null;
  const R = opp.length;
  const M = roundMatches(opp, n);
  if (M.some((ms) => ms.length > maxMatches)) return null;
  const H = M.map(homeMasks);
  const plays = opp.map((o) => { let p = 0; for (let t = 0; t < n; t++) if (o[t] < n) p |= 1 << t; return p >>> 0; });
  const pid = new Map(), pairs = [];
  let bad = false;
  const mp = M.map((ms, r) => ms.map(([a, b], k) => {
    const key = a * 64 + b;
    let p = pid.get(key);
    if (p == null) { p = pairs.length; pid.set(key, p); pairs.push([r, k, -1, -1]); }
    else if (pairs[p][2] < 0) { pairs[p][2] = r; pairs[p][3] = k; }
    else bad = true;
    return p;
  }));
  if (bad || pairs.some((q) => q[2] < 0)) return null;
  const odd = new Int32Array(n);
  for (let r = 0; r < span; r++) for (let t = 0; t < n; t++) if (opp[r][t] < n) odd[t] ^= 1;
  return { R, M, H, plays, mp, pairs, P: pairs.length, odd, span, n };
}

const BIG = 1e6;

/**
 * The Lagrangian floor of the pair model with some pairs' hosts fixed (fix[p]: 1 the pair's lower
 * team hosts its first game, 0 the higher one does, -1 free). The pair rule (each pair's two games at
 * opposite grounds: h1 + h2 = 1, h = 1 when the lower team hosts) and the balance rule (home minus
 * away over rounds 0..span-1 within -odd_t..odd_t) are priced: lam per pair, nu per team, updated in
 * place by a Polyak subgradient. A fixed pair is forced in the programme by a large price on its
 * other host bit. Each iteration's argmin, its first-game hosts kept and the return games flipped,
 * gives a season keeping the pair rule; balanced ones bound the answer from above.
 *
 * Stops after `iters` iterations, once the floor reaches `stopAt` (nothing below it is wanted), or
 * when the step dies out. Returns { bound, s (the last argmin's pair violations), pick, upper,
 * upperX }.
 */
function lagrange(m, fix, lam, nu, { iters, stopAt = Infinity, target = Infinity, balance = true }) {
  const { R, M, H, plays, mp, pairs, P, odd, span, n } = m;
  const unary = (r) => {
    const ms = M[r], u = new Float64Array(1 << ms.length), c = new Float64Array(ms.length);
    let off = 0;
    for (let k = 0; k < ms.length; k++) {
      const p = mp[r][k], first = pairs[p][0] === r;
      if (fix[p] >= 0) {
        // the bit this game's host takes: fix in the first game, its opposite in the return game
        const want = first ? fix[p] : fix[p] ^ 1;
        if (want) { off += BIG; c[k] = -BIG; } else c[k] = BIG;
      } else c[k] = lam[p];
      if (balance && r < span) {
        // the lower team a: 2 bit - 1; the higher b: 1 - 2 bit
        const [a, b] = ms[k];
        c[k] += 2 * (nu[a] - nu[b]); off += nu[b] - nu[a];
      }
    }
    u[0] = off;
    for (let x = 1; x < u.length; x++) { const lo = x & -x; u[x] = u[x ^ lo] + c[31 - Math.clz32(lo)]; }
    return u;
  };
  const solve = () => {
    const f = [unary(0)];
    for (let r = 0; r + 1 < R; r++) {
      const g = minPlusStep(f[r], M[r], M[r + 1]), u = unary(r + 1);
      for (let y = 0; y < g.length; y++) g[y] += u[y];
      f.push(g);
    }
    const last = f[R - 1];
    let y = 0;
    for (let j = 1; j < last.length; j++) if (last[j] < last[y]) y = j;
    const pick = new Int32Array(R);
    pick[R - 1] = y;
    for (let r = R - 1; r > 0; r--) {
      const A = H[r - 1], both = (plays[r - 1] & plays[r]) >>> 0, fr = f[r - 1], By = H[r][pick[r]];
      let bx = 0, bv = Infinity;
      for (let x = 0; x < A.length; x++) { const v = fr[x] + popcount(~(A[x] ^ By) & both); if (v < bv) { bv = v; bx = x; } }
      pick[r - 1] = bx;
    }
    let sl = 0;
    for (let p = 0; p < P; p++) if (fix[p] < 0) sl += lam[p];
    if (balance) for (let t = 0; t < n; t++) sl += Math.abs(nu[t]) * odd[t];
    return { val: last[y] - sl, pick };
  };
  const bit = (x, r, k) => (x[r] >>> k) & 1;
  let best = -Infinity, upper = Infinity, upperX = null, theta = 2, stall = 0, s = null, pick = null;
  for (let it = 0; it < iters; it++) {
    const sol = solve();
    pick = sol.pick;
    const val = sol.val;
    if (val > best + 1e-9) { best = val; stall = 0; } else if (++stall >= 15) { theta /= 2; stall = 0; }
    const rep = repairPairs(m, pick, balance);
    if (rep.b < upper) { upper = rep.b; upperX = rep.x; }
    const bound = Math.ceil(best - 1e-6);
    if (bound >= stopAt || bound >= Math.min(upper, target)) break;
    s = new Int8Array(P);
    let norm = 0;
    for (let p = 0; p < P; p++) {
      if (fix[p] >= 0) continue;
      const [r1, k1, r2, k2] = pairs[p];
      s[p] = bit(pick, r1, k1) + bit(pick, r2, k2) - 1;
      norm += s[p] * s[p];
    }
    const sn = new Float64Array(n);
    if (balance) {
      const d = homeDiffs(m, pick);
      for (let t = 0; t < n; t++) {
        if (nu[t] === 0 && Math.abs(d[t]) <= odd[t]) continue;
        const sg = nu[t] > 0 ? 1 : nu[t] < 0 ? -1 : Math.sign(d[t]);
        sn[t] = d[t] - sg * odd[t];
        norm += sn[t] * sn[t];
      }
    }
    if (norm === 0) break; // the argmin keeps both rules and the prices are at rest
    const goal = Math.min(upper, target);
    const step = theta * Math.max((Number.isFinite(goal) ? goal : val + 4) - val, 0.5) / norm;
    for (let p = 0; p < P; p++) if (fix[p] < 0) lam[p] += step * s[p];
    for (let t = 0; t < n; t++) nu[t] += step * sn[t];
    if (theta < 1e-3) break;
  }
  if (!s) {
    s = new Int8Array(P);
    for (let p = 0; p < P; p++) if (fix[p] < 0) { const [r1, k1, r2, k2] = pairs[p]; s[p] = bit(pick, r1, k1) + bit(pick, r2, k2) - 1; }
  }
  return { bound: Math.ceil(best - 1e-6), s, pick, upper, upperX, lam, nu };
}

/** Home minus away per team over rounds 0..span-1 for host choices x. */
function homeDiffs(m, x) {
  const { H, plays, span, n } = m, d = new Int32Array(n);
  for (let r = 0; r < span; r++) {
    const h = H[r][x[r]];
    for (let t = 0; t < n; t++) if ((plays[r] >>> t) & 1) d[t] += (h >>> t) & 1 ? 1 : -1;
  }
  return d;
}

/** Each pair's first-game hosts from x, the return game at the other ground: { b breaks (Infinity when unbalanced), x }. */
function repairPairs(m, pick, balance = true) {
  const { R, H, plays, pairs } = m, x = Array.from(pick);
  for (const [r1, k1, r2, k2] of pairs) {
    const want = ((x[r1] >>> k1) & 1) ^ 1;
    if (((x[r2] >>> k2) & 1) !== want) x[r2] ^= 1 << k2;
  }
  let b = 0;
  for (let r = 0; r + 1 < R; r++) b += popcount(~(H[r][x[r]] ^ H[r + 1][x[r + 1]]) & plays[r] & plays[r + 1]);
  if (balance && homeDiffs(m, x).some((v) => Math.abs(v) > 1)) b = Infinity;
  return { b, x };
}

function venuesOf(m, opp, x) {
  return opp.map((o, r) => {
    const v = new Uint8Array(o.length), h = m.H[r][x[r]];
    for (let t = 0; t < m.n; t++) if (o[t] < m.n) v[t] = (h >>> t) & 1;
    return v;
  });
}

/**
 * The least breaks of a home-and-away season's timetable under the tool's rules (one host per pair,
 * at the other ground in the return game; each team's home and away games within one over rounds
 * 0..span-1, leg one), by branch and bound on pairs with the Lagrangian floor above.
 *
 * relaxedBreakFloor runs the programme over both legs with every match free; that floor is loose
 * (19 teams' 1,311 timetable: 74, MaxSAT 85). Pricing the pair rule back in does nothing on its own:
 * flipping every host keeps every break and negates each pair's violation h1 + h2 - 1 (and each
 * team's home minus away), so the priced bound is even in the prices and peaks at zero. Fixing one
 * pair's hosts (any season can be flipped to it, same breaks, same balance) breaks that symmetry, and
 * then the priced floor rises (74 -> 78 at that timetable). Branching on the pairs the floor's argmin
 * breaks closes the rest where the tree stays small; each node starts from its parent's prices.
 *
 * `upperHint` (a season's breaks already in hand) prunes from the start; only strictly fewer are
 * searched for then, and `venues` is null if none exists. Returns { floor (the root's), relaxed,
 * least, proved, venues, nodes, ms } or null when the model does not fit (pairModel). `least` is
 * the fewest found (or upperHint), proved when the tree was walked to the end within `maxNodes`
 * nodes. The budget counts nodes, not time, so a share link rebuilds the same season anywhere.
 */
export function pairLeastBreaks(opp, n, { maxMatches = ORIENT_MAX_MATCHES, span = opp.length >> 1, upperHint = Infinity, maxNodes = 400, rootIters = 300, nodeIters = 40, balance = true } = {}) {
  const m = pairModel(opp, n, maxMatches, span);
  if (!m) return null;
  const t0 = Date.now();
  const relaxed = relaxedBreakFloor(opp, n, { maxMatches });
  let inc = upperHint, incX = null, nodes = 0, complete = true;
  const fix0 = new Int8Array(m.P).fill(-1);
  fix0[0] = 1;
  const root = lagrange(m, fix0, new Float64Array(m.P), new Float64Array(n), { iters: rootIters, target: inc, balance });
  const floor = Math.max(relaxed ?? 0, root.bound);
  if (root.upper < inc) { inc = root.upper; incX = root.upperX; }
  // depth first; each entry carries its fixes and the prices it starts from
  const stack = [{ fix: fix0, res: root }];
  while (stack.length) {
    if (nodes >= maxNodes) { complete = false; break; }
    const nd = stack.pop();
    let res = nd.res;
    if (!res) {
      nodes++;
      res = lagrange(m, nd.fix, nd.lam, nd.nu, { iters: nodeIters, stopAt: inc, target: inc, balance });
      if (res.upper < inc) { inc = res.upper; incX = res.upperX; }
    }
    if (res.bound >= inc) continue;
    // branch on the free pair the argmin breaks with the largest price; with none broken (the
    // argmin keeps the pair rule but not the balance), on the first free pair of an unbalanced team
    let bp = -1, bw = -1;
    for (let p = 0; p < m.P; p++) if (nd.fix[p] < 0 && res.s[p] !== 0 && Math.abs(res.lam[p]) > bw) { bw = Math.abs(res.lam[p]); bp = p; }
    if (bp < 0) {
      const d = homeDiffs(m, res.pick);
      for (let p = 0; p < m.P && bp < 0; p++) {
        if (nd.fix[p] >= 0) continue;
        const [r1, k1] = m.pairs[p], [a, b] = m.M[r1][k1];
        if (Math.abs(d[a]) > m.odd[a] || Math.abs(d[b]) > m.odd[b]) bp = p;
      }
    }
    if (bp < 0) for (let p = 0; p < m.P && bp < 0; p++) if (nd.fix[p] < 0) bp = p;
    if (bp < 0) continue; // every pair fixed: the argmin is the season, already counted as upper
    const [r1, k1] = m.pairs[bp];
    const first = (res.pick[r1] >>> k1) & 1;
    // the argmin's side last on the stack, so it is walked first
    for (const v of [first ^ 1, first]) {
      const fix = Int8Array.from(nd.fix);
      fix[bp] = v;
      stack.push({ fix, lam: Float64Array.from(res.lam), nu: Float64Array.from(res.nu), res: null });
    }
  }
  const proved = complete;
  const least = Number.isFinite(inc) ? inc : null;
  return { floor: Math.min(floor, least ?? floor), relaxed, least, proved: proved && least != null, venues: incX ? venuesOf(m, opp, incX) : null, nodes, ms: Date.now() - t0 };
}
