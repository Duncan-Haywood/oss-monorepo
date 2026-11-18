// Offline search for the starter table in carryover.mjs (STARTERS), 2026-11-11.
//
// A starter in Z_p (p = N - 1, odd) pairs up the nonzero residues so that the differences +-(y - x)
// of the pairs cover every nonzero residue once. With team p as a fixed point ("infinity") it gives
// a round robin: in round r every pair {x, y} of the starter is shifted by s = step * (r + start)
// (mod p) and s meets infinity (starterOpp). The circle method is the starter {i, -i}; other
// starters spread carry-over far better. This samples random starters (seeded backtracking), every
// step coprime to p and every start, scores the non-cyclic carry-over with all N teams (the "even"
// entry) and with team p as the bye (the "odd" entry, N - 1 teams), and prints the best of each.
//
// node eval/starter-search.mjs [seconds per size] [sizes...]
//   (default 20 s; sizes: the even N from 6 to 40 that are not powers of two)
// Output: one JSON line per size and parity, then the STARTERS literal to paste into carryover.mjs.
import { carryOverFromOpponents, starterOpp } from "../carryover.mjs";
import { mulberry32 } from "../calc.mjs";

const secs = Number(process.argv[2] || 20);
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [6, 10, 12, 14, 18, 20, 22, 24, 26, 28, 30, 34, 36, 38, 40];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function randomStarter(p, rand) {
  const used = new Uint8Array(p), diff = new Uint8Array(p), pairs = [];
  const rec = () => {
    let x = 1;
    while (x < p && used[x]) x++;
    if (x >= p) return true;
    used[x] = 1;
    const cand = [];
    for (let y = 1; y < p; y++) if (!used[y]) cand.push(y);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const y of cand) {
      const d = (y - x + p) % p, e = Math.min(d, p - d);
      if (diff[e]) continue;
      used[y] = 1; diff[e] = 1; pairs.push([x, y]);
      if (rec()) return true;
      pairs.pop(); used[y] = 0; diff[e] = 0;
    }
    used[x] = 0;
    return false;
  };
  return rec() ? pairs : null;
}

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));
const table = {};
for (const N of sizes) {
  const p = N - 1;
  const rand = mulberry32(N * 7919);
  const best = { even: { value: Infinity }, odd: { value: Infinity } };
  const t0 = Date.now();
  let starters = 0;
  while (Date.now() - t0 < secs * 1000) {
    const S = randomStarter(p, rand);
    if (!S) continue;
    starters++;
    for (let step = 1; step < p; step++) {
      if (gcd(step, p) !== 1) continue;
      for (let start = 0; start < p; start++) {
        const opp = starterOpp(N, S, { step, start });
        for (const [key, n] of [["even", N], ["odd", N - 1]]) {
          const v = carryOverFromOpponents(seqs(opp, n)).value;
          if (v < best[key].value) best[key] = { value: v, step, start, pairs: S };
        }
      }
    }
  }
  table[N] = {};
  for (const [key, n] of [["even", N], ["odd", N - 1]]) {
    const b = best[key];
    const opp = starterOpp(N, b.pairs, { step: b.step, start: b.start });
    const flat = carryOverFromOpponents(seqs(opp, n));
    const cyc = carryOverFromOpponents(seqs(opp, n), { cyclic: true });
    console.log(JSON.stringify({ N, teams: n, value: b.value, floor: flat.lowerBound, max: flat.max, cyclic: cyc.value, cyclicFloor: cyc.lowerBound, starters, step: b.step }));
    table[N][key] = [b.step, ...b.pairs.flat()];
  }
}
console.log("export const STARTERS = {");
for (const [N, e] of Object.entries(table)) console.log(`  ${N}: { even: [${e.even.join(", ")}], odd: [${e.odd.join(", ")}] },`);
console.log("};");
