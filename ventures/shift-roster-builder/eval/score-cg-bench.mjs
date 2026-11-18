// Whole-score lower bound by column generation (scoreBoundByColumnGeneration in calc.mjs: costed columns in bnp.mjs and the
// makeScorePricer oracle) against the bound buildRoster's exact search reports, on the weeks of pay-gap-bench.mjs (same seeded
// generator and options). For each week: the roster's score, the exact search's status and gap, then the column-generation
// root LP, its bound after branching, whether it proved the roster best to within the $0.50 tolerance, and its work.
//   node eval/score-cg-bench.mjs [P=8] [S=22] [sets=12] [ms=30000]
// SCORECG=0 turns off the column-generation step inside buildRoster, so the exact-search columns show the old bound.
// Score units are dollars: 100,000 per open hour, then pay and penalties.
import { parseStaff, parseShifts, buildRoster, scoreBoundByColumnGeneration } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 8), S = Number(process.argv[3] || 22), sets = Number(process.argv[4] || 12), ms = Number(process.argv[5] || 30000);
let seed = Number(process.env.SEED || 20261101) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const opts = { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, exactMs: 8000, restarts: 2, iterations: 2000, reducedCostFixing: true, scoreCG: process.env.SCORECG !== "0" };
console.log("week  score  exact-status  exact-gap$  cg-root  cg-bound  cg-gap$  cg-proven  nodes  columns  inexact  cg-ms");
const sum = { weeks: 0, exactOpen: 0, cgProven: 0, exactGap: 0, cgGap: 0 };
for (let c = 0; c < sets; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, opts);
  const o = r.optimality;
  const score = o.bestScore;
  const exactGap = o.status === "bounded" ? o.gap : 0;
  const b = scoreBoundByColumnGeneration(staff, slots, opts, { incumbentScore: score, tolerance: 0.5, nodeLimit: 100000, ms });
  const cgGap = Math.max(0, score - b.floor);
  sum.weeks++; sum.exactGap += exactGap; sum.cgGap += Math.min(exactGap, cgGap);
  if (o.status === "bounded") sum.exactOpen++;
  if (b.proven) sum.cgProven++;
  console.log([c, score.toFixed(2), o.status, exactGap.toFixed(2), b.rootLP.toFixed(2), b.floor.toFixed(2), cgGap.toFixed(2), b.proven, b.stats.nodes, b.stats.columns, b.stats.inexactPricing, b.stats.ms].join("\t"));
}
console.log(`${sum.weeks} weeks: exact search left ${sum.exactOpen} unproven; column generation proved ${sum.cgProven} to within $0.50; total gap $${sum.exactGap.toFixed(2)} -> $${sum.cgGap.toFixed(2)} taking the better bound per week`);
