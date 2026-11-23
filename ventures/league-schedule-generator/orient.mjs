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

import { mulberry32 } from "./rng.mjs";
import { MINPLUS_WASM } from "./wasm/minplus-wasm.mjs";

// minPlusStep's elimination steps in WebAssembly (wasm/minplus.c, README "minPlusStep in
// WebAssembly"): the same table, bit for bit, 0.80 -> 0.15 ms a step at 12 matches. Null when WebAssembly or
// SIMD is unavailable (old browsers), and then the JS loop below runs. MINPLUS_JS = 1 in the
// environment forces the JS loop (eval/minplus-bench.mjs compares the two).
const MP = (() => {
  try {
    if (typeof process !== "undefined" && process.env && process.env.MINPLUS_JS === "1") return null;
    if (typeof WebAssembly !== "object") return null;
    const bin = typeof atob === "function" ? Uint8Array.from(atob(MINPLUS_WASM), (c) => c.charCodeAt(0)) : null;
    if (!bin || !WebAssembly.validate(bin)) return null;
    const ex = new WebAssembly.Instance(new WebAssembly.Module(bin), {}).exports;
    const buf = ex.memory.buffer, cap = ex.cap(), io = ex.io();
    return {
      cap, io, lut: new Int32Array(buf, ex.lut(), 64 + 1024), inu: ex.in_i32u, outs: ex.out_i32s,
      luto: new Int32Array(buf, ex.luto(), 64 + 1024), pb: new Int32Array(buf, ex.pb(), io),
      chain: ex.chain_i32, chainMin: ex.chain_min, top: ex.top, narrowed: ex.narrowed,
      i32: { step: ex.step_i32, inp: ex.in_i32, out: ex.out_i32, io: new Int32Array(buf, ex.pi(), io) },
      f64: { step: ex.step_f64, inp: ex.in_f64, out: ex.out_f64, io: new Float64Array(buf, ex.pf(), io) },
    };
  } catch { return null; }
})();
export const MINPLUS_WASM_ON = !!MP;

/** Largest number of matches in a round the exact programme takes by default (2^12 states, 24 or 25
 * teams). The floor-priced search passes FLOOR_PRICED_MAX_MATCHES: 13 (26 teams) since the int16 step
 * (README "Whole-break tables in int16"), 14 (28 teams) since 2026-11-15's balance-guided walk and
 * under-the-gap start (README "Starting under the gap"), 15 (30 teams) since 2026-11-17's chained trial
 * steps (README "A trial's steps kept in the module"); leastBreaks' other callers keep 12, so their
 * cost is unchanged. */
export const ORIENT_MAX_MATCHES = 12;
export const FLOOR_PRICED_MAX_MATCHES = 15;

/** Predecessor entries a balanced walk keeps at most (4 bytes each: 16 MB), balancedWalk nearOf. */
const NEAR_CACHE = 4000000;
// balancedWalk tries a round's equally cheap host choices in order of how even they leave the
// teams' home and away counts (README "Starting under the gap"); WALK_UNGUIDED = 1 in the environment
// keeps the old seeded order, for comparison (eval/walk-guide.mjs)
// the share of a walk's budget the guided pass gets: 0.1 left fewest walks out of budget over the
// page's lists at 22 to 28 teams (33 of 960 at 20 seeds, 36 at 0.5, 40 unguided; eval/walk-guide.txt)
const GUIDE_SHARE = +(typeof process !== "undefined" && process.env && process.env.GUIDE_SHARE || 0.1);
const GUIDE = !(typeof process !== "undefined" && process.env && process.env.WALK_UNGUIDED === "1");

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
  // one entry from another: x differs from x without its lowest set bit k only in match k's host,
  // so a table costs one xor an entry, not a loop over the matches (once minPlusStep ran in
  // WebAssembly this loop was as slow as the step itself; README "minPlusStep in WebAssembly")
  const S = 1 << ms.length, H = new Uint32Array(S), sw = new Int32Array(ms.length);
  let h0 = 0;
  for (let k = 0; k < ms.length; k++) { h0 |= 1 << ms[k][1]; sw[k] = (1 << ms[k][0]) ^ (1 << ms[k][1]); }
  H[0] = h0 >>> 0;
  for (let x = 1; x < S; x++) { const lb = x & -x; H[x] = (H[x ^ lb] ^ sw[31 - Math.clz32(lb)]) >>> 0; }
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
// below 13 matches (26 teams) the symmetric step's extra planning costs what the halved tables save
// (uncontended, per step: 24 teams 0.055 ms both ways, 26 teams 0.11 -> 0.10, 28 teams 0.23 -> 0.19,
// 30 teams 0.45-0.47 -> 0.38; 16 to 22 teams slower by 0.005-0.02 ms)
const SYM_MIN_MATCHES = 13;
export function minPlusStep(fr, A, B, { sym = false } = {}) {
  // `sym`: the caller promises fr[x] = fr[~x] (every whole-break table of floorTable is: flipping
  // every host of every round leaves every team's breaks as they were). Then g is symmetric too, and
  // one of B's host bits can be fixed at 0: its match's two edges become unary costs on fr's bits,
  // the step runs on |B| - 1 bits, and the other half of g is read from the first (README "Half the
  // table: flipping every host"). WebAssembly only; the JS loop below ignores the flag, which gives
  // the same table.
  if (sym && MP && fr.constructor === Int32Array && A.length >= SYM_MIN_MATCHES && B.length >= 2) {
    const r = symStep(fr, A, B);
    if (r) return r;
  }
  return plainStep(fr, A, B, null);
}

function symStep(fr, A, B) {
  const { Bs, u } = symArgs(A, B);
  return plainStep(fr, A, Bs, u);
}
// fix the first B bit the elimination meets, so every table after the first step is halved
// (on 30-team rounds: 0.44 -> 0.35 ms a step; always the last bit 0.39; scoring every bit by
// its tables' size picks better bits but costs more than it saves)
function symArgs(A, B) {
  let j0 = B.length - 1;
  { const { edges, order } = elimOrder(A, B); for (const i of order) if (edges[i].length) { j0 = edges[i][0][0]; break; } }
  const [c, d] = B[j0], u = [0, 0, 0, 0, j0];
  A.forEach(([a, b], i) => {
    // team t of A's match i (ra 1: the lower team there) breaks when x_i ^ y ^ (ra ^ rb) is 0, so
    // with y fixed at 0 when x_i equals ra ^ rb (rb 1: the lower team of B's match)
    for (const [t, ra] of [[a, 1], [b, 0]]) {
      if (t === c) { u[0] = 1 << i; u[1] = ra ^ 1; }
      if (t === d) { u[2] = 1 << i; u[3] = ra; }
    }
  });
  return { Bs: B.filter((_, i) => i !== j0), u };
}

/** minPlusStep's edges (per A match, [B match, flip] for each team that plays in both rounds) and
 * its elimination order of A's host bits. */
function elimOrder(A, B) {
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
  return { edges, order };
}

// the module's two lookups that move a table's bits to their places (orient.mjs perm, in the module)
// (a place of -1 drops that bit)
function setLut(L, pos, k) {
  L.fill(0);
  for (let v = 0; v < 64; v++) { let z = 0; for (let p = 0; p < Math.min(k, 6); p++) if (pos[p] >= 0) z |= ((v >>> p) & 1) << pos[p]; L[v] = z; }
  for (let v = 0; v < 1 << Math.max(0, k - 6); v++) { let z = 0; for (let p = 6; p < k; p++) if (pos[p] >= 0) z |= ((v >>> (p - 6)) & 1) << pos[p]; L[64 + v] = z; }
}

/** One step's plan for the module: every elimination step's sizes and edge bits, where x's bits go
 * in (xPos) and where the output's bits are (ys over outK bits, hb the symmetric step's folded bit,
 * tm the last table's mask). Planned in full first, so a table too big for the module's buffers falls
 * back to JS before anything is written; null then. */
function wasmPlan(A, B, unary, eo = elimOrder(A, B)) {
  const kA = A.length, kB = B.length, { edges, order } = eo;
  const xPos = new Int32Array(kA);
  for (let p = 0; p < kA; p++) xPos[order[p]] = p;
  const plan = [], yp = new Int32Array(kB).fill(-1);
  let lx0 = kA, ly0 = 0, fits = (1 << kA) <= MP.cap;
  for (let p = 0; p < kA && fits; p++) {
    const e = edges[order[p]];
    let add = 0;
    for (const [j] of e) if (yp[j] < 0) yp[j] = ly0 + add++;
    const lx = lx0 - 1, ly = ly0 + add;
    if ((1 << (lx + ly)) > MP.cap) fits = false;
    plan.push([lx, ly, ly0, e.length > 0 ? yp[e[0][0]] : 0, e.length > 0 ? e[0][1] : 0, e.length > 0 ? 1 : 0,
      e.length > 1 ? yp[e[1][0]] : 0, e.length > 1 ? e[1][1] : 0, e.length > 1 ? 1 : 0]);
    lx0 = lx; ly0 = ly;
  }
  if (!(fits && (1 << kA) <= MP.io && (1 << (kB + (unary ? 1 : 0))) <= MP.io)) return null;
  const tm = (1 << (lx0 + ly0)) - 1; // the last table's size, as T.length - 1 in the JS loop
  // B's bits no A bit met (a match of two teams that both sat out round r) are free
  for (let j = 0; j < kB; j++) if (yp[j] < 0) yp[j] = ly0++;
  if (!unary) return { kA, xPos, plan, ys: yp, outK: kB, tm, hb: 0, unary };
  // the fixed bit back at j0; its lookup place is never read (the fold clears that bit)
  const j0 = unary[4], ys = new Int32Array(kB + 1);
  for (let j = 0; j <= kB; j++) ys[j] = j < j0 ? yp[j] : j === j0 ? 0 : yp[j - 1];
  return { kA, xPos, plan, ys, outK: kB + 1, tm, hb: 1 << j0, unary };
}

// a plan's input from w.io into the module, and its steps; returns where the output is (swap)
function wasmIn(w, q) {
  setLut(MP.lut, q.xPos, q.kA);
  if (q.unary) MP.inu(q.kA, q.unary[0], q.unary[1], q.unary[2], q.unary[3]); else w.inp(q.kA);
  return wasmSteps(w, q, 0);
}
function wasmSteps(w, q, swap) {
  for (const s of q.plan) { w.step(swap, ...s); swap ^= 1; }
  return swap;
}

/**
 * The least of min over y of (fr stepped through rounds[0] -> rounds[1] -> ... -> rounds[last])[y]
 * + b[y] (b null: the table's own least), with every step's table kept in the module (README "A
 * trial's steps kept in the module"): between steps the last output goes straight into the next
 * input layout (chain_i32), so no table is copied out, sliced and copied back in. The same number as
 * minPlusStep's chain, bit for bit; null when the module is off or a table does not fit, and the
 * caller then steps as before. `sym` as minPlusStep's (fr symmetric under flipping every host).
 */
function chainLeast(fr, rounds, b, sym) {
  if (!MP || fr.constructor !== Int32Array || rounds.length < 2) return null;
  const qs = [];
  for (let r = 0; r + 1 < rounds.length; r++) {
    const A = rounds[r], B = rounds[r + 1];
    let q;
    if (sym && A.length >= SYM_MIN_MATCHES && B.length >= 2) { const { Bs, u } = symArgs(A, B); q = wasmPlan(A, Bs, u); }
    else q = wasmPlan(A, B, null);
    if (!q) return null;
    qs.push(q);
  }
  const w = MP.i32;
  w.io.set(fr);
  let swap = wasmIn(w, qs[0]);
  // int16 tables: a step adds at most one break per team (32), so the chain cannot overflow while the
  // input's top plus that stays under the module's NARROW_MAX (30000); else run the plain steps
  if (MP.narrowed() && MP.top() + 34 * qs.length >= 29000) return null;
  for (let i = 1; i < qs.length; i++) {
    const p = qs[i - 1], q = qs[i], u = q.unary || [0, 0, 0, 0];
    // the composite permutation, in the next input's layout: its bit xPos[j] is the round's match j,
    // which sits at the last output's bit ys[j] (none when the output dropped it: a free bit past
    // its table, or the folded bit)
    const cs = new Int32Array(q.kA).fill(-1), tb = 31 - Math.clz32(p.tm + 1);
    let mm = 0, qm = 0;
    for (let j = 0; j < q.kA; j++) {
      const d = q.xPos[j];
      if (p.hb === 1 << j) { qm = 1 << d; continue; }
      if (p.ys[j] < tb) { cs[d] = p.ys[j]; mm |= 1 << p.ys[j]; }
    }
    setLut(MP.luto, cs, q.kA);
    const at = (m) => (m ? 1 << q.xPos[31 - Math.clz32(m)] : 0);
    MP.chain(q.kA, at(u[0]), u[1], at(u[2]), u[3], swap, mm, qm);
    swap = wasmSteps(w, q, swap ^ 1);
  }
  const last = qs[qs.length - 1];
  if (b) { setLut(MP.lut, last.ys, last.outK); MP.pb.set(b); }
  return MP.chainMin(last.outK, swap, last.tm, last.hb, b ? 1 : 0);
}

// unary: null for the plain step, or [m0, f0, m1, f1, j0] for symStep (j0: where the fixed bit
// goes back in B's order) (WebAssembly path only: null when
// the tables do not fit the module, and minPlusStep then runs the plain step)
function plainStep(fr, A, B, unary) {
  const kA = A.length, kB = B.length;
  const eo = elimOrder(A, B), { edges, order } = eo;
  // the table's bits, low to high: A's bits not yet eliminated (the next one at bit 0), then B's
  // bits in the order they were met
  // x's bits moved to their places in the table by two lookups of six bits each, not a loop over
  // the bits of every x
  const perm = (pos, k) => {
    const lo = Math.min(k, 6), L = new Int32Array(1 << lo), Hh = new Int32Array(1 << Math.max(0, k - 6));
    for (let v = 0; v < L.length; v++) { let z = 0; for (let p = 0; p < lo; p++) z |= ((v >>> p) & 1) << pos[p]; L[v] = z; }
    for (let v = 0; v < Hh.length; v++) { let z = 0; for (let p = 6; p < k; p++) z |= ((v >>> (p - 6)) & 1) << pos[p]; Hh[v] = z; }
    return (x) => L[x & 63] | Hh[x >>> 6];
  };
  const Arr = fr.constructor; // Int32Array for whole breaks, Float64Array for priced host bits
  if (MP && (Arr === Int32Array || Arr === Float64Array)) {
    const q = wasmPlan(A, B, unary, eo);
    if (q) {
      const w = Arr === Float64Array ? MP.f64 : MP.i32;
      w.io.set(fr);
      const swap = wasmIn(w, q);
      setLut(MP.lut, q.ys, q.outK);
      if (unary) MP.outs(q.outK, swap, q.tm, q.hb); else w.out(q.outK, swap, q.tm);
      return w.io.slice(0, 1 << q.outK);
    }
  }
  const xPos = new Int32Array(kA);
  for (let p = 0; p < kA; p++) xPos[order[p]] = p;
  if (unary) return null;
  const xz = perm(xPos, kA);
  let T = new Arr(1 << kA);
  for (let x = 0; x < T.length; x++) T[xz(x)] = fr[x];
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
    // a team breaks at x = 0 when the y bit of its edge (bit s of z) equals its flip, else at
    // x = 1: d = (bit ^ flip) & present is 1 for a break at x = 1, and present - d for one at x = 0.
    // Branch-free; with the lookup permutations below, a 12-match step 0.68-0.77 ms -> 0.59-0.70 ms
    // (eval/minplus-bench.mjs, README "A backward table").
    const m0 = e0 >= 0 ? 1 : 0, m1 = e1 >= 0 ? 1 : 0, s0 = e0 >= 0 ? e0 + lx : 0, s1 = e1 >= 0 ? e1 + lx : 0;
    const both = m0 + m1;
    for (let z = 0; z < N.length; z++) {
      const base = ((z & xm) << 1) | (((z >>> lx) & ym) << Lx);
      const d = ((((z >>> s0) ^ f0) & m0) + (((z >>> s1) ^ f1) & m1));
      const c0 = T[base] + both - d, c1 = T[base | 1] + d;
      N[z] = c0 < c1 ? c0 : c1;
    }
    T = N; Lx = lx; Ly = ly;
  }
  // B's bits no A bit met (a match of two teams that both sat out round r) are free
  for (let j = 0; j < kB; j++) if (yPos[j] < 0) yPos[j] = Ly++;
  const g = new Arr(1 << kB);
  const yz = perm(yPos, kB), tm = T.length - 1;
  for (let y = 0; y < g.length; y++) g[y] = T[yz(y) & tm];
  return g;
}

/**
 * Least breaks for the timetable `opp` (opp[r][t] = t's opponent in round r, >= n a bye), the
 * hosts free per match. Returns { floor, least, proved, breaks, venues, balanced, steps } or null
 * when a round has more than `maxMatches` matches or n > 32. floor: least breaks with every match
 * free. least: least breaks with every team's home and away games within one over `span` rounds
 * (default all), null when the walk found none within `budget` steps and `maxSlack` over the floor;
 * proved: no balanced choice has fewer. venues[r][t] is 1 when t is at home in round r and has
 * `breaks` breaks (least, else floor and unbalanced). `seed` orders the walk. `nearCache` caps the
 * predecessor entries the walk keeps (balancedWalk nearOf); it changes the time, never the answer.
 */
export function leastBreaks(opp, n, { maxMatches = ORIENT_MAX_MATCHES, span = opp.length, seed = 1, budget = 5000000, maxSlack = 10, nearCache = NEAR_CACHE } = {}) {
  if (n > 32) return null;
  const R = opp.length;
  const M = roundMatches(opp, n);
  // 16 matches at most: the walk packs a host choice in 16 bits (balancedWalk nearOf)
  if (M.some((ms) => ms.length > Math.min(maxMatches, 16))) return null;
  const H = M.map(homeMasks);
  const plays = opp.map((o) => { let p = 0; for (let t = 0; t < n; t++) if (o[t] < n) p |= 1 << t; return p >>> 0; });
  // f[r][x]: least breaks in rounds 0..r with round r's hosts x
  const f = [new Int32Array(H[0].length)];
  for (let r = 0; r + 1 < R; r++) f.push(minPlusStep(f[r], M[r], M[r + 1]));
  const last = f[R - 1];
  let floor = Infinity;
  for (let y = 0; y < last.length; y++) if (last[y] < floor) floor = last[y];

  const w = balancedWalk(f, H, plays, opp, n, { span, seed, budget, maxSlack, floor, nearCache });
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
function balancedWalk(f, H, plays, opp, n, { span = opp.length, seed = 1, budget = 5000000, maxSlack = 10, floor, nearCache = NEAR_CACHE }) {
  const R = opp.length, last = f[R - 1];
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
  let steps = 0, found = null, complete = true, guide = GUIDE, rand = mulberry32(seed >>> 0), limit = budget;
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
  // nearOf(r, y): round r - 1's host choices x within maxSlack of the least way into (r, y), as
  // x | extra << 16 in x order. A walk comes back to the same (r, y) many times (at every slack
  // level, and from every branch that reaches it: 24 teams, 3.5 million scans of 4,096 choices over
  // 16,828 distinct states, README "A walk that remembers its predecessors"), so each list is
  // scanned once and kept, up to `nearCache` entries in all (0 keeps none: every visit scans afresh,
  // as before; the tests compare the two). Filtering a kept list by the current
  // slack gives the same choices in the same order as a fresh scan, so the seeded shuffle draws the
  // same numbers and the walk returns the same host choice.
  const near = Array.from({ length: R }, () => new Map());
  let kept = 0;
  const nearOf = (r, y) => {
    const m = near[r];
    let a = m.get(y);
    if (a) return a;
    const A = H[r - 1], both = (plays[r - 1] & plays[r]) >>> 0, fr = f[r - 1], target = f[r][y], By = H[r][y];
    const xs = [];
    for (let x = 0; x < A.length; x++) {
      const extra = fr[x] + popcount(~(A[x] ^ By) & both) - target;
      if (extra <= maxSlack) xs.push(x | (extra << 16));
    }
    a = Int32Array.from(xs);
    if (kept + a.length <= nearCache) { m.set(y, a); kept += a.length; }
    return a;
  };
  // walk rounds from the last back to the first. f[r][y] is the least cost to come; `slack` is how
  // many breaks over that the rest of the walk may still spend and keep the total within the target.
  const walk = (r, y, slack) => {
    if (found) return;
    if (steps >= limit) { complete = false; return; }
    steps++;
    pick[r] = y;
    apply(r, y, 1);
    if (r === 0) {
      let ok = true;
      for (let t = 0; t < n; t++) if (Math.abs(g[t]) > 1) { ok = false; break; }
      if (ok) found = Int32Array.from(pick);
    } else if (feasible(r)) {
      const near = nearOf(r, y), prev = [];
      for (let i = 0; i < near.length; i++) { const extra = near[i] >>> 16; if (extra <= slack) prev.push([near[i] & 0xffff, extra]); }
      shuffle(prev);
      if (guide && r - 1 < span) {
        const A = H[r - 1], pl = plays[r - 1];
        for (const q of prev) { const h = A[q[0]]; let s = 0; for (let t = 0; t < n; t++) if ((pl >>> t) & 1) { const v = g[t] + (((h >>> t) & 1) ? 1 : -1); s += v * v; } q.push(s); }
        prev.sort((p, q) => p[1] - q[1] || p[2] - q[2]);
      } else prev.sort((p, q) => p[1] - q[1]);
      for (const [x, extra] of prev) { walk(r - 1, x, slack - extra); if (found || !complete) break; }
    }
    apply(r, y, -1);
  };
  // the least balanced host choice: try the floor, then one break more, and so on. A level searched
  // to the end with nothing found proves no balanced choice has that many breaks.
  //
  // Two passes (README "Starting under the gap"): first with the balance guide (a round's equally
  // cheap host choices tried in order of how even they leave the teams' home and away counts) on
  // a tenth of the budget (GUIDE_SHARE); if that runs out, the old seeded order on the rest, from the first level the
  // guided pass did not finish (a finished level is proved whatever the order). The guide finds most
  // seasons' least in one step a round, but on a few it is worse than a shuffle, and being
  // deterministic it gives every seed the same bad luck.
  let least = null, proved = true, k0 = 0;
  const levels = () => {
    for (let k = k0; k <= maxSlack && !found; k++) {
      const ends = [];
      for (let y = 0; y < last.length; y++) if (last[y] - floor <= k) ends.push([y, last[y] - floor]);
      shuffle(ends).sort((p, q) => p[1] - q[1]);
      for (const [y, extra] of ends) { walk(R - 1, y, k - extra); if (found || !complete) break; }
      if (found) least = floor + k;
      if (!complete) return false;
      k0 = k + 1;
    }
    return true;
  };
  if (guide) {
    limit = Math.floor(budget * GUIDE_SHARE);
    if (!levels()) {
      guide = false; complete = true; limit = budget; rand = mulberry32(seed >>> 0);
      g.fill(0);
      proved = levels();
    }
  } else proved = levels();
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
 * The break floor of a single round robin's timetable kept as a forward and a backward table, so a
 * search that changes a few rounds prices the change without the whole programme. `trial(lo, hi)`
 * prices the timetable as `opp` now stands, with only rounds lo..hi changed since the last `commit`
 * (hi defaults to the last round): the forward table runs over lo..hi from round lo - 1's, and one
 * more step meets the backward table of round hi + 1 (bwd[r][x]: least breaks in rounds r..R-1 with
 * round r's hosts x), so a move reruns only its own span, not everything after it (README "A
 * backward table"). Tables a trial needs and a commit left stale (forward past the last committed
 * span, backward before it) are brought up to date on the way, from rounds the move did not touch.
 * `commit()` keeps the last trial's rounds (call it only right after the trial it accepts; the
 * caller undoes a refused move instead). Same floor as leastBreaks(opp, n).floor. null when a round
 * has more than `maxMatches` (ORIENT_MAX_MATCHES) matches. `opp` is read live (the caller moves it).
 */
// floorTable's tables all start at zero and every step is symmetric under flipping all hosts, so
// each is symmetric and its steps take minPlusStep's `sym` (README "Half the table: flipping every host"); FLOOR_SYM = 0
// in the environment turns it off, for comparison
const SYM = { sym: !(typeof process !== "undefined" && process.env && process.env.FLOOR_SYM === "0") };
// FLOOR_CHAIN = 0 in the environment steps every trial in JS land as before, for comparison
const CHAIN = !(typeof process !== "undefined" && process.env && process.env.FLOOR_CHAIN === "0");
export function floorTable(opp, n, { maxMatches = ORIENT_MAX_MATCHES, chain = true } = {}) {
  const R = opp.length;
  if (n > 32 || roundMatches(opp, n).some((ms) => ms.length > maxMatches)) return null;
  const playsOf = (r) => { let p = 0; for (let t = 0; t < n; t++) if (opp[r][t] < n) p |= 1 << t; return p >>> 0; };
  // committed rounds: matches, home masks, who plays
  const ms = [], H = [], plays = [];
  for (let r = 0; r < R; r++) { ms[r] = roundMatches([opp[r]], n)[0]; H[r] = homeMasks(ms[r]); plays[r] = playsOf(r); }
  // fwd[r] is current for r <= fv, bwd[r] for r >= bv (bwd[R - 1] is all zeros, always current)
  const fwd = [], bwd = [];
  bwd[R - 1] = new Int32Array(H[R - 1].length);
  let fv = -1, bv = R - 1, pending = null;
  const forwardTo = (to) => {
    for (let r = fv + 1; r <= to; r++) fwd[r] = r === 0 ? new Int32Array(H[0].length) : minPlusStep(fwd[r - 1], ms[r - 1], ms[r], SYM);
    if (to > fv) fv = to;
  };
  const backwardTo = (to) => {
    for (let r = bv - 1; r >= to; r--) bwd[r] = minPlusStep(bwd[r + 1], ms[r + 1], ms[r], SYM);
    if (to < bv) bv = to;
  };
  // a trial's tables, stepped in JS land: f[i] for round lo + i, from the committed tables before lo
  const tables = (lo, hi, m) => {
    const f = [];
    for (let r = lo; r <= hi; r++) {
      const i = r - lo;
      f[i] = r === 0 ? new Int32Array(1 << m[0].length) : minPlusStep(i ? f[i - 1] : fwd[r - 1], i ? m[i - 1] : ms[r - 1], m[i], SYM);
    }
    return f;
  };
  const run = (lo, hi = R - 1) => {
    if (!(lo >= 0 && hi < R && lo <= hi)) throw new Error("trial needs 0 <= lo <= hi < rounds");
    forwardTo(lo - 1);
    if (hi < R - 1) backwardTo(hi + 1);
    const m = [], p = [];
    for (let r = lo; r <= hi; r++) { const i = r - lo; m[i] = roundMatches([opp[r]], n)[0]; p[i] = playsOf(r); }
    // the trial's steps chained in the module (README "A trial's steps kept in the module"): only
    // its least comes back; its tables and home masks are rebuilt if it is committed or walked
    // (about one trial in ten at 30 teams)
    if (CHAIN && chain) {
      const rounds = (lo > 0 ? [ms[lo - 1]] : []).concat(m, hi < R - 1 ? [ms[hi + 1]] : []);
      const best = chainLeast(lo > 0 ? fwd[lo - 1] : new Int32Array(1 << m[0].length), rounds, hi < R - 1 ? bwd[hi + 1] : null, SYM.sym);
      if (best != null) { pending = { lo, hi, m, h: null, p, f: null, full: null }; return best; }
    }
    const f = tables(lo, hi, m);
    let best = Infinity;
    const last = f[hi - lo];
    if (hi === R - 1) { for (const v of last) if (v < best) best = v; }
    else {
      const g = minPlusStep(last, m[hi - lo], ms[hi + 1], SYM), b = bwd[hi + 1];
      for (let y = 0; y < g.length; y++) if (g[y] + b[y] < best) best = g[y] + b[y];
    }
    pending = { lo, hi, m, h: m.map(homeMasks), p, f, full: null };
    return best;
  };
  // a chained trial's tables and home masks, when a commit or a walk needs them
  const filled = () => {
    if (!pending.f) { pending.f = tables(pending.lo, pending.hi, pending.m); pending.h = pending.m.map(homeMasks); }
    return pending;
  };
  // the whole forward table, home masks and plays of the last trial's timetable (or the committed
  // one), for a balanced walk: rounds after the trial's span are run forward from it here
  const whole = () => {
    if (!pending) { forwardTo(R - 1); return { f: fwd, h: H, p: plays }; }
    if (pending.full) return pending.full;
    const { lo, hi, m, h, p, f } = filled();
    const F = fwd.slice(0, lo).concat(f), Hs = H.slice(0, lo).concat(h), P = plays.slice(0, lo).concat(p);
    for (let r = hi + 1; r < R; r++) {
      F[r] = minPlusStep(F[r - 1], r - 1 === hi ? m[hi - lo] : ms[r - 1], ms[r], SYM);
      Hs[r] = H[r]; P[r] = plays[r];
    }
    pending.full = { f: F, h: Hs, p: P };
    return pending.full;
  };
  const commit = () => {
    if (!pending) return;
    const { lo, hi, m, h, p, f, full } = filled();
    for (let r = lo; r <= hi; r++) { ms[r] = m[r - lo]; H[r] = h[r - lo]; plays[r] = p[r - lo]; fwd[r] = f[r - lo]; }
    if (full) { for (let r = hi + 1; r < R; r++) fwd[r] = full.f[r]; fv = R - 1; } else fv = hi;
    // backward tables after the span are untouched; at and before it they are stale
    bv = hi < R - 1 ? Math.max(bv, hi + 1) : R - 1;
    pending = null;
  };
  // the least balanced host choice of the last trial's timetable (or the committed one), at most
  // `maxBreaks` breaks, by balancedWalk over its forward table. null when none is within maxBreaks
  // or the walk ran out of `budget` steps (then { least: null, proved: false }).
  const balanced = (maxBreaks, { seed = 1, budget = 50000 } = {}) => {
    const t = whole();
    let fl = Infinity;
    for (const v of t.f[R - 1]) if (v < fl) fl = v;
    if (fl > maxBreaks) return { least: null, proved: true, floor: fl };
    const w = balancedWalk(t.f, t.h, t.p, opp, n, { seed, budget, maxSlack: maxBreaks - fl, floor: fl });
    return { least: w.least, proved: w.proved || (w.least == null && w.steps < budget), floor: fl };
  };
  forwardTo(R - 1);
  let floor = Infinity;
  for (const v of fwd[R - 1]) if (v < floor) floor = v;
  return { floor, trial: (lo, hi) => run(lo, hi), commit, balanced };
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
