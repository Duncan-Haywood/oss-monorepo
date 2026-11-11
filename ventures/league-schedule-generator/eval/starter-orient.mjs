// Home/away for a starter timetable in O(p), and a climb that prices breaks inside the move
// (2026-11-11, after eval/starter-breaks.mjs).
//
// eval/starter-breaks.mjs rescored a pool of 250 near-best starters on carry-over + 10 x the breaks
// of the full venue search (assignVenues), 30 to 160 s a size, because the venue search is far
// too slow to run inside a climb's move. This script gives a starter timetable a home/away that is
// scored in closed form, so the climb can price breaks on every move.
//
// The shift orientation. At step 1 (any step is a relabelling), round r plays every starter pair
// {x, y} as {x + r, y + r} and team r against the fixed team p. Give each pair a host, x or y, and
// keep it in every round; let the fixed team alternate (home in even rounds, or in odd ones). Write
// H(u) = 1 when position u hosts (H(f(u)) = 1 - H(u)). Team t sits at position u = t - r in round r,
// so its home/away run is H read backwards from t, with position 0 the game against team p.
// Every ordinary team hosts once per pair plus maybe the fixed team: balanced, always.
//
// Breaks. Let E be the number of u in 2 .. p - 1 with H(u) = H(u - 1). Team t's p rounds walk every
// adjacency of the cycle 0 .. p - 1 except the one between t + 1 and t, so each of those E
// adjacencies is a break for p - 1 teams. With all N playing, the two adjacencies through position 0
// give each team one more break or none, (p - 1) / 2 + (p - 1) / 2 in all whatever H(1) and
// H(p - 1) are (the fixed team alternates over the p - 1 other rounds), and the fixed team has none:
//
//   breaks = (p - 1) (E + 1)   (all N teams play)        breaks = (p - 1) E   (team p is the bye)
//
// The circle method {i, -i} has E = 0: the familiar N - 2 breaks, and none with a bye.
// Minimising E. Put g(u) = H(u) XOR (u mod 2); a break at u is a change of g between u - 1 and u.
// A pair x < y needs H(x) != H(y), so the number of changes in (x, y] is odd when y - x is even and
// even when it is odd. E is the fewest changes meeting all (p - 1) / 2 parities, found exactly by
// walking every orientation in Gray-code order (2^((p - 1) / 2 - 1), O(1) per step), or, inside
// the climb, by a few sweeps of single-pair flips (an upper bound; the pool is then scored exactly).
// carryover.mjs shiftOrientation (exact) and shiftVenues build the venues for the product. The
// script checks the formula against a direct count on every result, and scores every result with
// assignVenues too. The climb's pick is printed as `entry`; STARTERS_SHIFT keeps the ones whose
// carry-over + 10 x shift breaks beats every built-in entry (eval/starter-orient.txt).
//
// node eval/starter-orient.mjs [seconds per size and parity] [weight] [sizes...]
//   (default 30 s, weight 10, sizes: every size with a STARTERS_WEIGHTED or STARTERS entry)
import { carryOverFromOpponents, starterOpp, assignVenues, venueCost, shiftOrientation, shiftVenues, STARTERS, STARTERS_WEIGHTED } from "../carryover.mjs";
import { mulberry32 } from "../calc.mjs";
import { cyclicScore, toPairs } from "./starter-climb.mjs";

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));
const pairsOf = ([step, ...flat]) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return { step, pairs: out }; };
const partner = (pairs, p) => { const f = new Int16Array(p); for (const [x, y] of pairs) { f[x] = y; f[y] = x; } return f; };

/** Breaks of venues (venues[r][t] truthy = home), counted the way teamBreaks counts them. */
export function countBreaks(venues, opp, n) {
  let b = 0;
  for (let t = 0; t < n; t++) {
    let last = null;
    for (let r = 0; r < opp.length; r++) {
      if (opp[r][t] >= n) { last = null; continue; }
      const v = venues[r][t] ? 1 : 0;
      if (last === v) b++;
      last = v;
    }
  }
  return b;
}

/** E for host bits H (H[u] for u in 1 .. p - 1): equal neighbours among positions 1 .. p - 1. */
export function equalNeighbours(H, p) {
  let e = 0;
  for (let u = 2; u < p; u++) if (H[u] === H[u - 1]) e++;
  return e;
}

/** The least E over every orientation, exactly (carryover.mjs shiftOrientation: a Gray-code walk). */
export const leastE = shiftOrientation;

/**
 * An upper bound on E by single-pair flips (for the climb). Deterministic, so a starter always
 * gets the same cost: two starts, every pair hosted by its smaller residue, and every pair hosted
 * so that H follows the parity of the smaller residue (E = 0 when every pair has an odd difference).
 */
export function quickE(f, p) {
  const xs = [];
  for (let x = 1; x < p; x++) if (x < f[x]) xs.push(x);
  let best = Infinity;
  const H = new Uint8Array(p);
  const eq = (u) => (u >= 2 && u < p && H[u] === H[u - 1] ? 1 : 0);
  for (let k = 0; k < 2; k++) {
    for (const x of xs) { const b = k === 0 ? 1 : x % 2; H[x] = b; H[f[x]] = 1 - b; }
    let E = equalNeighbours(H, p), improved = true;
    while (improved && E > 0) {
      improved = false;
      for (const x of xs) {
        const y = f[x];
        const us = [x, x + 1, y, y + 1].filter((u, i, a) => a.indexOf(u) === i);
        let before = 0, after = 0;
        for (const u of us) before += eq(u);
        H[x] ^= 1; H[y] ^= 1;
        for (const u of us) after += eq(u);
        if (after < before) { E += after - before; improved = true; } else { H[x] ^= 1; H[y] ^= 1; }
      }
    }
    if (E < best) best = E;
    if (best === 0) break;
  }
  return best;
}

export const shiftBreaks = (E, p, odd) => (p - 1) * (E + (odd ? 0 : 1));

/** Exact score of the starter f: non-cyclic carry-over + weight x shift-orientation breaks. */
export function scoreShift(N, n, f, weight) {
  const p = N - 1, odd = n < N;
  const pairs = toPairs(f, p);
  const opp = starterOpp(N, pairs, { step: 1 });
  const coe = carryOverFromOpponents(seqs(opp, n)).value;
  const { E, H } = leastE(f, p);
  const breaks = shiftBreaks(E, p, odd);
  const venues = shiftVenues(N, f, H);
  const counted = countBreaks(venues, opp, n);
  if (counted !== breaks) throw new Error(`break formula ${breaks} != counted ${counted} at N=${N} n=${n}`);
  if (venueCost(venues, opp, n) !== counted) throw new Error(`shift orientation unbalanced at N=${N} n=${n}`);
  return { coe, E, breaks, score: coe + weight * breaks, pairs, opp, venues };
}

/** Breaks from the full venue search, as eval/starter-breaks.mjs scores them. */
export function searchedBreaks(opp, n) { return countBreaks(assignVenues(opp, n, 1, 4), opp, n); }

// --- the climb: the O(p) carry-over score of eval/starter-climb.mjs plus weight x (p - 1) x E ---

function shuffle(a, rand) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const cls = (d, p) => { d = ((d % p) + p) % p; return Math.min(d, p - d); };

function randomStarter(p, rand) {
  const used = new Uint8Array(p), diff = new Uint8Array(p), f = new Int16Array(p);
  const rec = () => {
    let x = 1;
    while (x < p && used[x]) x++;
    if (x >= p) return true;
    used[x] = 1;
    const cand = [];
    for (let y = 1; y < p; y++) if (!used[y]) cand.push(y);
    shuffle(cand, rand);
    for (const y of cand) {
      const e = cls(y - x, p);
      if (diff[e]) continue;
      used[y] = 1; diff[e] = 1; f[x] = y; f[y] = x;
      if (rec()) return true;
      used[y] = 0; diff[e] = 0;
    }
    used[x] = 0;
    return false;
  };
  return rec() ? f : null;
}

function repair(f, p, k, rand, visit, cap = 600) {
  const starts = [];
  for (let x = 1; x < p; x++) if (x < f[x]) starts.push(x);
  shuffle(starts, rand);
  const freed = [], classes = new Uint8Array(p);
  for (const x of starts.slice(0, k)) { freed.push(x, f[x]); classes[cls(f[x] - x, p)] = 1; }
  const free = new Uint8Array(p);
  for (const x of freed) free[x] = 1;
  shuffle(freed, rand);
  // saved after the shuffle: the restore below pairs freed[i] with saved[i]
  const saved = freed.map((x) => f[x]);
  let count = 0;
  const rec = () => {
    if (count >= cap) return;
    let x = -1;
    for (const y of freed) if (free[y]) { x = y; break; }
    if (x < 0) { count++; visit(f); return; }
    free[x] = 0;
    for (const y of freed) {
      if (!free[y]) continue;
      const e = cls(y - x, p);
      if (!classes[e]) continue;
      classes[e] = 0; free[y] = 0; f[x] = y; f[y] = x;
      rec();
      classes[e] = 1; free[y] = 1;
    }
    free[x] = 1;
  };
  rec();
  freed.forEach((x, i) => { f[x] = saved[i]; });
}

/**
 * Climb on (cyclic carry-over) + weight x (shift breaks), both O(p): p sum D^2 (+ 2p) plus
 * weight (p - 1)(quickE + [even]). Keeps a pool of the best `poolSize` distinct starters.
 */
export function climbWeighted(N, odd, ms, seed, weight, poolSize = 400, seeds = []) {
  const p = N - 1;
  const rand = mulberry32(seed);
  const cost = (f) => p * cyclicScore(f, p, odd) + weight * shiftBreaks(quickE(f, p), p, odd);
  const pool = new Map();
  let best = Infinity, restarts = 0, moves = 0;
  const t0 = Date.now();
  const keep = (f, c) => {
    const key = Array.from(f).join(",");
    if (pool.has(key)) return;
    pool.set(key, { cost: c, f: Int16Array.from(f) });
    if (pool.size > poolSize * 1.5) {
      const sorted = [...pool.entries()].sort((a, b) => a[1].cost - b[1].cost);
      for (const [k] of sorted.slice(poolSize)) pool.delete(k);
    }
  };
  while (Date.now() - t0 < ms) {
    let f = restarts < seeds.length ? Int16Array.from(seeds[restarts]) : randomStarter(p, rand);
    if (!f) continue;
    restarts++;
    let c = cost(f), stall = 0;
    while (stall < 200 + 20 * p && Date.now() - t0 < ms) {
      moves++;
      const k = 2 + Math.floor(rand() * Math.min(3, (p - 1) / 2 - 1));
      let next = null, nextC = Infinity, ties = 0;
      repair(f, p, k, rand, (g) => {
        const s = cost(g);
        if (s < nextC) { nextC = s; next = Int16Array.from(g); ties = 1; }
        else if (s === nextC && rand() * ++ties < 1) next = Int16Array.from(g);
      });
      if (next && nextC <= c) { if (nextC < c) stall = 0; else stall++; f = next; c = nextC; } else stall++;
      keep(f, c);
      if (c < best) best = c;
    }
  }
  return { best, pool: [...pool.values()].sort((a, b) => a.cost - b.cost).slice(0, poolSize), restarts, moves, ms: Date.now() - t0 };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const secs = Number(process.argv[2] || 30);
  const weight = Number(process.argv[3] || 10);
  const POOL = Number(process.env.POOL || 60);
  const sizes = process.argv.length > 4 ? process.argv.slice(4).map(Number) : Object.keys(STARTERS).map(Number);
  for (const N of sizes) {
    const p = N - 1;
    for (const [key, n] of [["even", N], ["odd", N - 1]]) {
      const odd = key === "odd";
      // the entries lowCarryOverRounds starts from with a weight, scored both ways
      const entries = [["STARTERS", STARTERS[N]?.[key]], ["STARTERS_WEIGHTED", STARTERS_WEIGHTED[N]?.[key]]].filter(([, e]) => e);
      const before = {};
      const seedsF = [];
      for (const [name, e] of entries) {
        const { step, pairs } = pairsOf(e);
        // step k is starter pairs / k at step 1, renamed: rescale so the formulas (step 1) apply
        let inv = 1;
        while ((inv * step) % p !== 1) inv++;
        const f = partner(pairs.map(([x, y]) => [(x * inv) % p, (y * inv) % p]), p);
        const s = scoreShift(N, n, f, weight);
        const searched = searchedBreaks(starterOpp(N, pairs, { step }), n);
        before[name] = { coe: s.coe, shiftBreaks: s.breaks, searchBreaks: searched, score: s.coe + weight * Math.min(s.breaks, searched) };
        seedsF.push(f);
      }
      const r = climbWeighted(N, odd, secs * 1000, N * 31337 + (odd ? 5 : 2), weight, POOL, seedsF);
      let pick = null;
      for (const c of r.pool) {
        const s = scoreShift(N, n, c.f, weight);
        if (!pick || s.score < pick.score || (s.score === pick.score && s.coe < pick.coe)) pick = { ...s, f: c.f };
      }
      const searched = searchedBreaks(pick.opp, n);
      const prevBest = Math.min(...Object.values(before).map((b) => b.score));
      console.log(JSON.stringify({ N, teams: n, weight, before, climbed: { coe: pick.coe, E: pick.E, shiftBreaks: pick.breaks, searchBreaks: searched, score: pick.coe + weight * Math.min(pick.breaks, searched) }, gain: prevBest - (pick.coe + weight * Math.min(pick.breaks, searched)), restarts: r.restarts, moves: r.moves, entry: [1, ...pick.pairs.flat()] }));
    }
  }
}
