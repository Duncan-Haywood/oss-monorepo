// Search for cyclic "near-whist" base rounds for 4k+2 players (6, 10, 14, ...).
//
// No whist design exists for 4k+2 players: each player has 4k+1 others, an odd number, so the
// partnerships cannot all be used once ((4k+2)(4k+1)/2 pairs is odd, and a game uses two). The
// best possible is: every pair partners exactly once except a perfect matching of 2k+1 pairs, who
// never partner but face each other twice; every other pair meets as opponents once or twice;
// each round seats k tables and 2 players sit out, everyone sits out exactly twice over 4k+2 rounds
// and plays 4k games.
//
// Cyclic construction on Z_n (n = 4k+2): a base round of k tables [a, b, x, y] (a&b vs x&y) on 4k
// of the n points, the other 2 sitting out; round g adds g to every seat. A pair at distance d
// (1 <= d <= 2k) recurs n times over the rounds, once per player pair; distance 2k+1 = n/2 only
// n/2 times, so each such pair (the "matching" {x, x+2k+1}) is hit twice per base occurrence.
// Conditions on the base round:
//   partner distances: each of 1..2k exactly once, never 2k+1;
//   opponent distances: each of 1..2k at most twice, 2k+1 exactly once.
// (4k opponent slots = 2(2k) - 1 + 1, so exactly one distance in 1..2k is used once.)
//
// Method: simulated annealing on a permutation of Z_n (first 4k entries are the tables), swap
// moves, restarts. Usage: node eval/near-whist-search.mjs 6 46 [secondsPerSize] [seed]
import { mulberry32 } from "../calc.mjs";

export function baseCost(n, perm) {
  const k = (n - 2) / 4, h = n / 2;
  const pc = new Int16Array(h + 1), oc = new Int16Array(h + 1);
  const dist = (a, b) => { const d = (a - b + n) % n; return d > h ? n - d : d; };
  for (let t = 0; t < k; t++) {
    const [a, b, x, y] = perm.slice(4 * t, 4 * t + 4);
    pc[dist(a, b)]++; pc[dist(x, y)]++;
    oc[dist(a, x)]++; oc[dist(a, y)]++; oc[dist(b, x)]++; oc[dist(b, y)]++;
  }
  let c = 0;
  for (let d = 1; d < h; d++) { c += Math.abs(pc[d] - 1); c += Math.max(0, oc[d] - 2); }
  c += 2 * pc[h] + Math.abs(oc[h] - 1);
  return c;
}

export function searchNearWhist(n, { seconds = 60, seed = 1 } = {}) {
  if (n % 4 !== 2 || n < 6) throw new Error("n must be 4k+2, at least 6");
  const k = (n - 2) / 4, h = n / 2;
  const rng = mulberry32(seed);
  const deadline = Date.now() + seconds * 1000;
  const D = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => { const d = (a - b + n) % n; return d > h ? n - d : d; }));
  // Incremental counts: a swap only touches the (at most two) tables holding the swapped seats.
  const pcost = (d, c) => (d === h ? 2 * c : Math.abs(c - 1));
  const ocost = (d, c) => (d === h ? Math.abs(c - 1) : Math.max(0, c - 2));
  let restarts = 0, steps = 0;
  while (Date.now() < deadline) {
    restarts++;
    const perm = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const pc = new Int16Array(h + 1), oc = new Int16Array(h + 1);
    let c = 0;
    for (let d = 1; d <= h; d++) c += pcost(d, 0) + ocost(d, 0);
    const bumpP = (d, s) => { c -= pcost(d, pc[d]); pc[d] += s; c += pcost(d, pc[d]); };
    const bumpO = (d, s) => { c -= ocost(d, oc[d]); oc[d] += s; c += ocost(d, oc[d]); };
    const table = (t, s) => {
      const a = perm[4 * t], b = perm[4 * t + 1], x = perm[4 * t + 2], y = perm[4 * t + 3];
      bumpP(D[a][b], s); bumpP(D[x][y], s);
      bumpO(D[a][x], s); bumpO(D[a][y], s); bumpO(D[b][x], s); bumpO(D[b][y], s);
    };
    for (let t = 0; t < k; t++) table(t, 1);
    let temp = 1.5;
    for (let it = 0; it < 200000 && c > 0; it++) {
      steps++;
      const i = Math.floor(rng() * 4 * k);
      const j = Math.floor(rng() * n);
      const ti = i >> 2, tj0 = j < 4 * k ? j >> 2 : -1;
      if (i === j) continue;
      const tj = tj0 === ti ? -1 : tj0; // a swap inside one table re-pairs it: count that table once
      const c0 = c;
      table(ti, -1); if (tj >= 0) table(tj, -1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
      table(ti, 1); if (tj >= 0) table(tj, 1);
      if (!(c <= c0 || rng() < Math.exp((c0 - c) / temp))) {
        table(ti, -1); if (tj >= 0) table(tj, -1);
        [perm[i], perm[j]] = [perm[j], perm[i]];
        table(ti, 1); if (tj >= 0) table(tj, 1);
      }
      temp = Math.max(0.05, temp * 0.99995);
    }
    if (c === 0) {
      if (baseCost(n, perm) !== 0) throw new Error("incremental cost drifted");
      // Translate so the base round's tables are stated with 0 sitting out (any fixed form will do).
      const out = perm.slice(4 * k);
      const shift = (n - out[0]) % n;
      const tables = Array.from({ length: k }, (_, t) => perm.slice(4 * t, 4 * t + 4).map((p) => (p + shift) % n));
      return { n, mods: [n], tables, restarts, steps };
    }
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("near-whist-search.mjs")) {
  const lo = +process.argv[2] || 6, hi = +process.argv[3] || 46, secs = +process.argv[4] || 60, seed = +process.argv[5] || 1;
  for (let n = lo; n <= hi; n++) {
    if (n % 4 !== 2) continue;
    const t = Date.now();
    const r = searchNearWhist(n, { seconds: secs, seed });
    console.log(JSON.stringify({ n, mods: [n], kind: "near", ms: Date.now() - t, restarts: r?.restarts ?? null, tables: r ? r.tables : null }));
  }
}
