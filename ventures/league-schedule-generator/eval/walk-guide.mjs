// How many steps balancedWalk (orient.mjs, through leastBreaks) takes to find the least balanced host
// choice of every distinct season on the page's list, at 20 walk seeds each (README "Starting under
// the gap"). Run it twice, once as is and once with WALK_UNGUIDED=1 (the walk's old order: a seeded
// shuffle of the equally cheap choices, no balance guide), on the same cached list:
//
//   node eval/walk-guide.mjs <teams> <seed> --cache dir [--budget 3000000] [--seeds 20]
//   WALK_UNGUIDED=1 node eval/walk-guide.mjs <teams> <seed> --cache dir
//
// The list is the one eval/floor-priced.mjs builds and caches (list-<teams>-<seed>.json); it is built
// here when the cache has none. One line per season: carry-over/breaks, floor, least, and the steps per
// walk seed (X: the budget ran out). eval/walk-guide.txt holds the runs behind the README.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { carryOverTry, carryOverSqueezes, carryOverPolish, CARRY_OVER_GAP, CARRY_OVER_SQUEEZE, CARRY_OVER_POLISH } from "../carryover.mjs";
import { leastBreaks } from "../orient.mjs";

const n = +process.argv[2], seed = +process.argv[3];
const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const cache = opt("--cache", null), budget = +opt("--budget", 3000000), seeds = +opt("--seeds", 20);
const file = cache ? `${cache}/list-${n}-${seed}.json` : null;
let all = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
if (!all) {
  const tries = [];
  for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) tries.push(carryOverTry(n, i, { seed, weighted: 8 }));
  const sq = carryOverSqueezes(n, tries, CARRY_OVER_SQUEEZE, { seed });
  all = [...sq, ...carryOverPolish(n, sq, { seed, count: CARRY_OVER_POLISH })]
    .map(({ rounds, coe, breaks, index, circleCoe, lowerBound }) => ({ rounds, coe, breaks, index, circleCoe, lowerBound }));
  if (file) { mkdirSync(cache, { recursive: true }); writeFileSync(file, JSON.stringify(all)); }
}
const N = n % 2 ? n + 1 : n;
const oppOf = (st) => {
  const opp = st.rounds.map(() => new Int32Array(N).fill(n));
  st.rounds.forEach((r, k) => { for (const [a, b] of r.matches) { opp[k][a] = b; opp[k][b] = a; } });
  return opp;
};
console.log(`# ${n} teams, list seed ${seed}, ${process.env.WALK_UNGUIDED === "1" ? "unguided (old order)" : "guided"}, budget ${budget}, walk seeds 1-${seeds}`);
const seen = new Set();
let total = 0, fails = 0, walks = 0;
const t0 = Date.now();
for (const st of all) {
  const opp = oppOf(st);
  const key = opp.map((o) => o.join(",")).join(";");
  if (seen.has(key)) continue;
  seen.add(key);
  const steps = [];
  let least = null, floor = null;
  for (let s = 1; s <= seeds; s++) {
    const x = leastBreaks(opp, n, { budget, seed: s, maxMatches: 16 });
    floor = x.floor; least ??= x.least;
    walks++; total += x.steps;
    if (x.least == null) fails++;
    steps.push(x.least == null ? "X" : x.steps);
  }
  console.log(`${st.coe}/${st.breaks} floor ${floor} least ${least} steps ${steps.join(" ")}`);
}
console.log(`# ${walks} walks, ${fails} out of budget, ${total} steps in all, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
