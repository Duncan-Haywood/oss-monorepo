// Local search for starters (2026-11-11, after eval/starter-search.mjs).
//
// The sampled table in carryover.mjs (STARTERS) came from scoring random starters with the full
// O(N^2) carry-over count at every step and start, 122 to 289 starters in 20 s past 30 teams. This
// replaces the sampling with a fast exact score and a large-neighbourhood search.
//
// The fast score. Take the starter with step 1 (step k with starter S is the same timetable as
// step 1 with S / k, up to a relabelling of the teams, which leaves carry-over unchanged). Write
// f(u) for the partner of u in the starter and f(0) = infinity. Team t meets r + f(t - r) in round
// r, so the carry-over cells it fills are translates of (f(u), f(u - 1) + 1) for u = t - r, and
// summed over the p = N - 1 rounds of a cyclic timetable each cell count c(a, b) between two
// finite teams depends only on b - a:
//
//   D(d) = #{ u not 0 or 1 : f(u - 1) + 1 - f(u) = d (mod p) } + [d = 1]       (all N teams play)
//   D(d) = #{ u not 0 or 1 : f(u - 1) + 1 - f(u) = d } + [f(-1) + 2 - f(1) = d]  (team p is the bye)
//
// The [d = 1] term is team p (it meets r then r + 1); with a bye, the skip over round t joins
// u = 1 to u = -1. The cells next to team p each hold 1. So the cyclic carry-over is
// p * sum_d D(d)^2 + 2p (even) or p * sum_d D(d)^2 (odd): an O(p) score instead of O(N^2) per
// start, and the floor (every count 0 or 1) is D(d) = 1 for every nonzero d. The script checks
// the formula against carryOverFromOpponents on every result.
//
// The search. Start from random starters; a move frees k random pairs (2k residues and their k
// difference classes) and re-pairs those residues, by backtracking, so the freed classes are used
// once each; it keeps the best re-pairing (ties at random) when it is no worse, and restarts after
// a long stall. At the end the best few starters per size are scored exactly with the non-cyclic
// count at every start, as bestStarterOpp does at run time.
//
// node eval/starter-climb.mjs [seconds per size and parity] [sizes...]
//   (default 30 s; sizes: the even N from 6 to 40 that are not powers of two)
// Output: one JSON line per size and parity, then the STARTERS literal for carryover.mjs.
import { carryOverFromOpponents, starterOpp, STARTERS } from "../carryover.mjs";
import { mulberry32 } from "../calc.mjs";

const secs = Number(process.argv[2] || 30);
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [6, 10, 12, 14, 18, 20, 22, 24, 26, 28, 30, 34, 36, 38, 40];

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));

/** sum_d D(d)^2 for the starter whose partner map is f (f[0] unused, Int16Array of length p). */
export function cyclicScore(f, p, odd) {
  const D = new Int16Array(p);
  for (let u = 2; u < p; u++) D[(((f[u - 1] + 1 - f[u]) % p) + p) % p]++;
  if (odd) D[(((f[p - 1] + 2 - f[1]) % p) + p) % p]++;
  else D[1 % p]++;
  let s = 0;
  for (let d = 0; d < p; d++) s += D[d] * D[d];
  return s;
}

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

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function cls(d, p) { d = ((d % p) + p) % p; return Math.min(d, p - d); }

/**
 * Free k pairs of f and try every re-pairing of their residues that uses the freed difference
 * classes once each (capped at `cap` completions). Calls visit(f) on each; f is restored after.
 */
function repair(f, p, k, rand, visit, cap = 2000) {
  const starts = [];
  for (let x = 1; x < p; x++) if (x < f[x]) starts.push(x);
  shuffle(starts, rand);
  const freed = [], classes = new Uint8Array(p);
  for (const x of starts.slice(0, k)) { freed.push(x, f[x]); classes[cls(f[x] - x, p)] = 1; }
  const saved = freed.map((x) => f[x]);
  const free = new Uint8Array(p);
  for (const x of freed) free[x] = 1;
  shuffle(freed, rand);
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

function climb(N, odd, ms, seed) {
  const p = N - 1;
  const rand = mulberry32(seed);
  const pool = new Map(); // key -> { score, f }
  let best = Infinity, restarts = 0, moves = 0;
  const floor = p - 1;
  const t0 = Date.now();
  while (Date.now() - t0 < ms && best > floor) {
    let f = randomStarter(p, rand);
    if (!f) continue;
    restarts++;
    let score = cyclicScore(f, p, odd), stall = 0;
    while (stall < 400 + 40 * p && Date.now() - t0 < ms) {
      moves++;
      const k = 2 + Math.floor(rand() * Math.min(4, (p - 1) / 2 - 1));
      let bestNext = null, bestNextScore = Infinity, ties = 0;
      repair(f, p, k, rand, (g) => {
        const s = cyclicScore(g, p, odd);
        if (s < bestNextScore) { bestNextScore = s; bestNext = Int16Array.from(g); ties = 1; }
        else if (s === bestNextScore && rand() * ++ties < 1) bestNext = Int16Array.from(g);
      });
      if (bestNext && bestNextScore <= score) {
        if (bestNextScore < score) stall = 0; else stall++;
        f = bestNext; score = bestNextScore;
      } else stall++;
      if (score <= best + 2) {
        const key = Array.from(f).join(",");
        if (!pool.has(key)) pool.set(key, { score, f: Int16Array.from(f) });
        if (pool.size > 400) {
          const worst = [...pool.entries()].sort((a, b) => b[1].score - a[1].score)[0][0];
          pool.delete(worst);
        }
      }
      if (score < best) best = score;
      if (score <= floor) break;
    }
  }
  return { best, pool: [...pool.values()].sort((a, b) => a.score - b.score), restarts, moves, ms: Date.now() - t0 };
}

const toPairs = (f, p) => { const out = []; for (let x = 1; x < p; x++) if (x < f[x]) out.push([x, f[x]]); return out; };

function exactBest(N, n, pairs) {
  let best = { value: Infinity };
  for (let start = 0; start < N - 1; start++) {
    const opp = starterOpp(N, pairs, { step: 1, start });
    const v = carryOverFromOpponents(seqs(opp, n)).value;
    if (v < best.value) best = { value: v, start };
  }
  return best;
}

function oldBest(N, n) {
  const entry = STARTERS[N]?.[n === N ? "even" : "odd"];
  if (!entry) return null;
  const [step, ...flat] = entry;
  const pairs = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  let v = Infinity;
  for (let start = 0; start < N - 1; start++) v = Math.min(v, carryOverFromOpponents(seqs(starterOpp(N, pairs, { step, start }), n)).value);
  return v;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const table = {};
  for (const N of sizes) {
    const p = N - 1;
    table[N] = {};
    for (const [key, n] of [["even", N], ["odd", N - 1]]) {
      const odd = key === "odd";
      const r = climb(N, odd, secs * 1000, N * 7919 + (odd ? 1 : 0));
      // exact non-cyclic choice among the best cyclic candidates (at most 40)
      let pick = null;
      for (const c of r.pool.filter((c) => c.score === r.best).slice(0, 40)) {
        const pairs = toPairs(c.f, p);
        const e = exactBest(N, n, pairs);
        if (!pick || e.value < pick.value) pick = { ...e, pairs, f: c.f };
      }
      const opp = starterOpp(N, pick.pairs, { step: 1, start: pick.start });
      const cyc = carryOverFromOpponents(seqs(opp, n), { cyclic: true });
      const flat = carryOverFromOpponents(seqs(opp, n));
      const predicted = p * cyclicScore(pick.f, p, odd) + (odd ? 0 : 2 * p);
      if (predicted !== cyc.value) throw new Error(`formula ${predicted} != counted ${cyc.value} at N=${N} ${key}`);
      const before = oldBest(N, n);
      console.log(JSON.stringify({ N, teams: n, value: pick.value, before, floor: flat.lowerBound, max: flat.max, cyclic: cyc.value, cyclicFloor: cyc.lowerBound, restarts: r.restarts, moves: r.moves, seconds: +(r.ms / 1000).toFixed(1) }));
      table[N][key] = before !== null && before <= pick.value ? STARTERS[N][key] : [1, ...pick.pairs.flat()];
    }
  }
  console.log("export const STARTERS = {");
  for (const [N, e] of Object.entries(table)) console.log(`  ${N}: { even: [${e.even.join(", ")}], odd: [${e.odd.join(", ")}] },`);
  console.log("};");
}
