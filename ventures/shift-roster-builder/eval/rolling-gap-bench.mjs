// How much could a joint multi-week solve gain over the rolling plan? Upper bound, measured.
//   node eval/rolling-gap-bench.mjs [P=10] [S=28] [sets=6] [weeks=4]
// For seeded staff/shift sets (same generator as ilp-export.mjs), plan `weeks` weeks with planWeeks (each week solved
// on its own, carry-over of rest gap, streak and tough tally), then compare each week's open hours with the proven
// floor of the SAME week solved fresh (no carry-over). A joint solve cannot beat the fresh floor, so
// (rolling open - fresh floor) summed over weeks is the most a joint solve could ever recover. Hard rules only.
import { planWeeks, parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 10), S = Number(process.argv[3] || 28), sets = Number(process.argv[4] || 6), W = Number(process.argv[5] || 4);
let seed = 20261101 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const opts = { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, exactMs: 8000, restarts: 2, iterations: 2000, reducedCostFixing: true };
let totRoll = 0, totFresh = 0, totFloor = 0, weeksTested = 0, worse = 0;
for (let c = 0; c < sets; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const plan = planWeeks(st, sh, { weeks: W, ...opts });
  if (plan.error) { console.log("set", c, "error", plan.error); continue; }
  const fresh = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, opts);
  const floor = fresh.optimality ? fresh.optimality.forcedOpenHours : null;
  const freshOpen = fresh.unfilledHours;
  const rolls = plan.weeks.map((w) => w.roster.unfilledHours);
  console.log(`set ${c}: fresh floor ${floor} h, fresh open ${freshOpen} h, rolling open by week ${rolls.join(", ")}`);
  for (const r of rolls) { totRoll += r; totFresh += freshOpen; if (floor != null) totFloor += floor; weeksTested++; if (r > freshOpen) worse++; }
}
console.log(`weeks ${weeksTested}: rolling open ${totRoll} h, fresh open ${totFresh} h, proven floor ${totFloor} h; weeks worse than fresh ${worse}`);
console.log(`carry-over cost (rolling - fresh): ${totRoll - totFresh} h; search gap (fresh - floor): ${totFresh - totFloor} h`);
console.log(`ceiling on a joint solve's coverage gain: ${totRoll - totFloor} h of ${totRoll} h open`);
