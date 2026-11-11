// Hill-climbing (annealed large-neighbourhood search) on the starter, 2026-11-11.
//
// eval/starter-search.mjs samples random starters and keeps the best; past 22 teams it sees only a
// few hundred in 20 s and the table stays far above the floor. This climbs instead: from the table's
// starter, remove k pairs (3 to 10), re-pair the freed residues with the freed differences by
// randomised backtracking, and accept the new starter by simulated annealing on its score.
//
// Two facts keep the search small:
// - The step is a relabelling. The starter S with step k gives, round for round, the same
//   timetable as the starter k^-1 S with step 1, with every team t renamed k^-1 t (team p fixed).
//   Carry-over does not depend on names, so the search runs at step 1 only and loses nothing.
// - The cyclic carry-over matrix does not depend on the start; a start only chooses which
//   round-to-round transition the non-cyclic count drops. So one matrix per starter, then each
//   start is an O(N) correction.
//
// Score: the least non-cyclic carry-over over every start, with all N teams ("even") and with team
// p as the bye ("odd"), as eval/starter-search.mjs scores them. Seeded, but each climb stops on the
// clock, so a slower machine can stop earlier and print a different table; the built-in entries are
// checked by starter.test.mjs, not by re-running this.
//
// Env: SLICE (seconds per climb before a fresh random restart, default 2; the table used 1),
// TEMP_SCALE (annealing start temperature as a share of score / p, default 0.02).
//
// node eval/starter-anneal.mjs [seconds per size and parity] [sizes...]
//   (default 30 s; sizes: the table's N from 10 to 40)
// Output: one JSON line per size and parity (before -> after), then the STARTERS literal, which keeps
// the old entry wherever the climb did not beat it.
import { carryOverFromOpponents, starterOpp, STARTERS } from "../carryover.mjs";
import { mulberry32 } from "../calc.mjs";

const secs = Number(process.argv[2] || 30);
const TEMP = Number(process.env.TEMP_SCALE || 0.02);
const SLICE = Number(process.env.SLICE || 2);
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(STARTERS).map(Number).filter((N) => N >= 10);

const mod = (a, p) => ((a % p) + p) % p;
function inverse(k, p) {
  for (let x = 1; x < p; x++) if ((k * x) % p === 1) return x;
  throw new Error(`${k} has no inverse mod ${p}`);
}

/** The table entry [step, x1, y1, ...] as a step-1 starter [[x, y], ...] (relabelled by step^-1). */
export function toStepOne(entry, p) {
  const [step, ...flat] = entry;
  const inv = inverse(step, p);
  const pairs = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([mod(flat[i] * inv, p), mod(flat[i + 1] * inv, p)]);
  return pairs;
}

/** Least non-cyclic carry-over over every start, step 1, with n real teams (N or N - 1). */
export function scoreStarter(N, n, pairs) {
  const p = N - 1;
  // opp[r][t] for r = 0 .. p - 1 at start 0.
  const opp = starterOpp(N, pairs, { step: 1, start: 0 });
  const c = new Int32Array(N * N);
  // For each team, its real rounds in order; the cyclic transitions between consecutive ones.
  const realRounds = [];
  for (let t = 0; t < n; t++) {
    const rs = [];
    for (let r = 0; r < p; r++) if (opp[r][t] < n) rs.push(r);
    realRounds.push(rs);
    for (let i = 0; i < rs.length; i++) c[opp[rs[i]][t] * N + opp[rs[(i + 1) % rs.length]][t]]++;
  }
  let cyc = 0;
  for (let i = 0; i < N * N; i++) cyc += c[i] * c[i];
  let best = Infinity, bestStart = 0;
  const touched = [];
  for (let start = 0; start < p; start++) {
    // Season runs rounds start, start + 1, ..., start - 1: each team drops the transition from its
    // last real round before `start` (cyclically) to its first real round at or after `start`.
    let v = cyc;
    for (let t = 0; t < n; t++) {
      const rs = realRounds[t];
      let j = 0;
      while (j < rs.length && rs[j] < start) j++;
      const next = rs[j % rs.length], prev = rs[(j - 1 + rs.length) % rs.length];
      const cell = opp[prev][t] * N + opp[next][t];
      v -= 2 * c[cell] - 1;
      c[cell]--;
      touched.push(cell);
    }
    while (touched.length) c[touched.pop()]++;
    if (v < best) { best = v; bestStart = start; }
  }
  return { value: best, start: bestStart, cyclic: cyc };
}

/** Remove k random pairs and re-pair the freed residues with the freed differences (randomised). */
function neighbour(pairs, p, k, rand, cap = 2000) {
  const idx = new Set();
  while (idx.size < k) idx.add(Math.floor(rand() * pairs.length));
  const keep = pairs.filter((_, i) => !idx.has(i));
  const free = [], diffs = new Uint8Array(p);
  for (const i of idx) {
    const [x, y] = pairs[i];
    free.push(x, y);
    const d = mod(y - x, p);
    diffs[Math.min(d, p - d)] = 1;
  }
  const used = new Map(free.map((x) => [x, false]));
  const out = [];
  let tries = 0;
  const rec = () => {
    if (++tries > cap) return false;
    const x = free.find((u) => !used.get(u));
    if (x === undefined) return true;
    used.set(x, true);
    const cand = free.filter((y) => !used.get(y));
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const y of cand) {
      const d = mod(y - x, p), e = Math.min(d, p - d);
      if (!diffs[e]) continue;
      used.set(y, true); diffs[e] = 0; out.push([x, y]);
      if (rec()) return true;
      out.pop(); used.set(y, false); diffs[e] = 1;
    }
    used.set(x, false);
    return false;
  };
  if (!rec()) return null;
  const key = (q) => q.map(([x, y]) => (x < y ? `${x},${y}` : `${y},${x}`)).sort().join(" ");
  const next = keep.concat(out);
  return key(next) === key(pairs) ? null : next;
}

/** Annealed climb from `pairs` for `ms` milliseconds; returns the best starter seen. */
export function climb(N, n, pairs, ms, seed) {
  const p = N - 1;
  const rand = mulberry32(seed);
  let cur = pairs, curV = scoreStarter(N, n, cur).value;
  let best = cur, bestV = curV;
  const t0 = Date.now();
  let iters = 0, accepted = 0, moves = 0;
  const T0 = TEMP * curV / p, kMin = Math.min(3, (p - 1) / 2), kMax = Math.min(10, (p - 1) / 2);
  while (Date.now() - t0 < ms) {
    iters++;
    const frac = (Date.now() - t0) / ms;
    const T = T0 * (1 - frac) + 1e-9;
    const k = kMin + Math.floor(rand() * (kMax - kMin + 1));
    const nb = neighbour(cur, p, k, rand);
    if (!nb) continue;
    moves++;
    const v = scoreStarter(N, n, nb).value;
    if (v <= curV || rand() < Math.exp((curV - v) / T)) {
      cur = nb; curV = v; accepted++;
      if (v < bestV) { best = nb; bestV = v; }
    }
  }
  return { pairs: best, value: bestV, iters, moves, accepted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = {};
  for (const N of sizes) {
    const p = N - 1;
    table[N] = {};
    for (const [key, n] of [["even", N], ["odd", N - 1]]) {
      const old = STARTERS[N][key];
      const before = scoreStarter(N, n, toStepOne(old, p)).value;
      // Half the time from this parity's entry, half from the other's (the odd 22-team entry can
      // help the even one and back); keep the better.
      // Multi-start: short climbs (SLICE seconds) from both table entries, then from fresh random
      // starters, until the time is up; keep the best.
      let r = null;
      const rand = mulberry32(N * 104729 + n);
      const t0 = Date.now();
      const seeds = [toStepOne(old, p), toStepOne(STARTERS[N][key === "even" ? "odd" : "even"], p)];
      let restarts = 0;
      while (Date.now() - t0 < secs * 1000) {
        let from = seeds[restarts];
        while (!from) from = neighbour(seeds[0], p, (p - 1) / 2, rand, 1e6);
        const c = climb(N, n, from, Math.min(SLICE * 1000, secs * 1000 - (Date.now() - t0)), N * 104729 + n * 31 + restarts);
        restarts++;
        if (!r || c.value < r.value) r = c;
      }
      r.restarts = restarts;
      const seqs = (opp) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));
      // Cross-check the fast score against the reference counter at the chosen start.
      const { start: s0 } = scoreStarter(N, n, r.pairs);
      const flat = carryOverFromOpponents(seqs(starterOpp(N, r.pairs, { step: 1, start: s0 })));
      if (flat.value !== r.value) throw new Error(`score mismatch at ${N}/${n}: ${flat.value} vs ${r.value}`);
      const cyc = carryOverFromOpponents(seqs(starterOpp(N, r.pairs, { step: 1, start: s0 })), { cyclic: true });
      const improved = r.value < before;
      console.log(JSON.stringify({ N, teams: n, before, after: r.value, floor: flat.lowerBound, max: flat.max, cyclic: cyc.value, cyclicFloor: cyc.lowerBound, restarts: r.restarts }));
      table[N][key] = improved ? [1, ...r.pairs.flat()] : old;
    }
  }
  console.log("export const STARTERS = {");
  for (const [N, e] of Object.entries(table)) console.log(`  ${N}: { even: [${e.even.join(", ")}], odd: [${e.odd.join(", ")}] },`);
  console.log("};");
}
