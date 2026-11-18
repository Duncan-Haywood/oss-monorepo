// Does regrounding add seasons to the frontier? (README "Polishing the grounds of the frontier")
// Runs the page's 12 tries and 4 squeezes for one size and seed, then carryOverPolish (every
// season's own timetable through the venue search again, kept when it lands on the frontier), and
// reports the frontier before and after, the polished seasons, the least carry-over at each break
// budget and the polish's time. Carry-over cannot change: the timetable is the same.
//
//   node eval/polish-frontier.mjs <teams> <seed> [d]      (d: home and away; one JSON line)
import { carryOverTry, carryOverSqueezes, carryOverPolish, CARRY_OVER_GAP, CARRY_OVER_SQUEEZE, CARRY_OVER_POLISH } from "../carryover.mjs";
import { frontierOf } from "./frontier-gap.mjs";

const n = +process.argv[2], seed = +process.argv[3], double = process.argv[4] === "d";
const t0 = Date.now();
const tries = [];
for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) tries.push(carryOverTry(n, i, { seed, weighted: 8, double }));
const all = carryOverSqueezes(n, tries, CARRY_OVER_SQUEEZE, { seed });
const t1 = Date.now();
const pol = carryOverPolish(n, all, { seed, count: CARRY_OVER_POLISH });
const ms = Date.now() - t1;
const cand = (xs) => xs.map((t) => ({ index: t.index, coe: t.coe + (t.repeats || 0) * 1000, breaks: t.breaks }));
const before = frontierOf(cand(all)), after = frontierOf(cand([...all, ...pol]));
const lab = (x) => `${x.coe}/${x.breaks}${x.index >= all.length ? "*" : ""}`;
const lo = Math.min(...before.map((x) => x.breaks)), hi = Math.max(...before.map((x) => x.breaks));
const least = (f, k) => Math.min(...f.filter((x) => x.breaks <= k).map((x) => x.coe));
const cuts = [];
for (let k = lo; k <= hi; k++) cuts.push((least(before, k) - least(after, k)) / least(before, k));
console.log(JSON.stringify({
  teams: n, seed, double,
  polished: pol.map((p) => `${all[p.polishedFrom].coe}/${all[p.polishedFrom].breaks} -> ${p.coe}/${p.breaks}`),
  before: before.map(lab).join(" "), after: after.map(lab).join(" "),
  joined: after.filter((x) => x.index >= all.length).length,
  beaten: before.filter((x) => !after.some((y) => y.index === x.index)).length,
  meanCut: +(100 * cuts.reduce((a, b) => a + b, 0) / cuts.length).toFixed(2), maxCut: +(100 * Math.max(...cuts)).toFixed(1),
  searchS: +((t1 - t0) / 1000).toFixed(1), polishS: +(ms / 1000).toFixed(2),
}));
