// Does a timetable search priced on the proved break floor close the gaps the page's list leaves?
// (README "Pricing the break floor".) For one size and seed of a single round robin: the page's
// list (12 tries, 4 squeezes, 4 regrounded seasons), its frontier and widest break gap; then
// floorPricedSingleRounds from the frontier's lowest-carry-over season at caps across that gap
// (every `--step` breaks from the season's own breaks minus `--step` down to the gap's floor + 1)
// and from the season under the gap at the same caps, each with `--iterations` moves. Reports
// the frontier before and after, the least carry-over at each break budget and the time.
//
//   node eval/floor-priced.mjs <teams> <seed> [--iterations 3000] [--step 2] [--cache dir] [--page] [--deals p] [--floor-only]
//
// `--floor-only`: price every timetable on its break floor alone, as before 2026-11-13's "Pricing the
// balanced least" (the default now prices the least balanced choice once the floor is within the cap).
//
// `--deals p`: re-deal three rounds at once (threeRoundDeals) on a share p of the moves (default 0.15,
// CARRY_OVER_DEALS, what the page runs; --deals 0 is the swap-only search of the section before).
//
// `--page` runs what the page runs instead of the sweep: carryOverFloorPriced (CARRY_OVER_FLOOR_PRICED
// seasons, from the season above the gap at its breaks - 2, - 4, ...).
//
// One JSON line; eval/floor-priced.txt holds the runs behind the README.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { carryOverTry, carryOverSqueezes, carryOverPolish, floorPricedSingleRounds, carryOverFloorPriced, CARRY_OVER_FLOOR_PRICED, CARRY_OVER_GAP, CARRY_OVER_SQUEEZE, CARRY_OVER_POLISH } from "../carryover.mjs";
import { frontierOf } from "./frontier-gap.mjs";

const n = +process.argv[2], seed = +process.argv[3];
const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const balanced = !process.argv.includes("--floor-only"), deals = +opt("--deals", 0.15), iterations = +opt("--iterations", 3000), stepB = +opt("--step", 2), cache = opt("--cache", null);
const t0 = Date.now();
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
const tList = Date.now() - t0;
const cand = (xs) => xs.map((t, i) => ({ index: i, coe: t.coe, breaks: t.breaks }));
const before = frontierOf(cand(all)); // least carry-over first, so breaks fall along it
let gi = 1;
for (let i = 1; i < before.length; i++) if (before[i - 1].breaks - before[i].breaks > before[gi - 1].breaks - before[gi].breaks) gi = i;
const top = before[gi - 1], under = before[gi];
const caps = [];
for (let c = top.breaks - stepB; c > under.breaks; c -= stepB) caps.push(c);
const t1 = Date.now();
const runs = [];
if (process.argv.includes("--page")) for (const r of carryOverFloorPriced(n, all.map((t, i) => ({ ...t, index: i })), { seed, count: CARRY_OVER_FLOOR_PRICED, iterations, deals, balanced })) {
  runs.push({ from: "page", cap: r.maxBreaks, result: `${r.coe}/${r.breaks}`, floor: r.floor, proved: r.leastProved, floors: r.floors, walks: r.walks, dealt: r.dealt, s: null, r });
}
else for (const [name, from] of [["top", top], ["under", under]]) for (const cap of caps) {
  const s = Date.now();
  const r = floorPricedSingleRounds(n, all[from.index], { seed, maxBreaks: cap, iterations, deals, balanced });
  runs.push({ from: name, cap, result: r && `${r.coe}/${r.breaks}`, floor: r?.floor, proved: r?.leastProved, floors: r?.floors, walks: r?.walks, dealt: r?.dealt, s: +((Date.now() - s) / 1000).toFixed(1), r });
}
const tRuns = Date.now() - t1;
const added = runs.filter((x) => x.r).map((x, k) => ({ index: all.length + k, coe: x.r.coe, breaks: x.r.breaks }));
const after = frontierOf([...cand(all), ...added]);
const lab = (x) => `${x.coe}/${x.breaks}${x.index >= all.length ? "*" : ""}`;
const lo = Math.min(...before.map((x) => x.breaks)), hi = Math.max(...before.map((x) => x.breaks));
const least = (f, k) => Math.min(...f.filter((x) => x.breaks <= k).map((x) => x.coe));
const cuts = [];
for (let k = lo; k <= hi; k++) cuts.push((least(before, k) - least(after, k)) / least(before, k));
const gapCuts = cuts.slice(under.breaks - lo, top.breaks - lo);
console.log(JSON.stringify({
  teams: n, seed, iterations, deals, balanced,
  gap: `${top.coe}/${top.breaks} .. ${under.coe}/${under.breaks}`,
  runs: runs.map(({ r, ...x }) => x),
  before: before.map(lab).join(" "), after: after.map(lab).join(" "),
  joined: after.filter((x) => x.index >= all.length).length,
  meanCut: +(100 * cuts.reduce((a, b) => a + b, 0) / cuts.length).toFixed(2),
  gapMeanCut: +(100 * gapCuts.reduce((a, b) => a + b, 0) / gapCuts.length).toFixed(2),
  maxCut: +(100 * Math.max(...cuts)).toFixed(1),
  listS: +(tList / 1000).toFixed(1), floorPricedS: +(tRuns / 1000).toFixed(1),
}));
