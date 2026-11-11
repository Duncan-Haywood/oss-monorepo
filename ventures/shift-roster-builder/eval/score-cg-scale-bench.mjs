// Whole-score column generation (scoreBoundByColumnGeneration) on bigger weeks than score-cg-bench.mjs: the incumbent is the
// annealed roster with no exact step (exact: false), so this measures how far the bound alone proves the pay and penalties.
// Same generator as cg-scale-bench.mjs (about 2.8 shift lines per person).
//   node eval/score-cg-scale-bench.mjs P S [cases=3] [ms=60000]
import { parseStaff, parseShifts, buildRoster, scoreBoundByColumnGeneration } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 12), S = Number(process.argv[3] || 34), cases = Number(process.argv[4] || 3), ms = Number(process.argv[5] || 60000);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const opts = { balance: 60, restarts: 2, iterations: 4000, exact: false };
console.log(`${P} people, ${S} shift lines, ${ms} ms per week`);
console.log("case  copies  anneal-score  cg-root  cg-bound  cg-best  gap$  proven  nodes  columns  inexact  ms");
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, opts);
  const b = scoreBoundByColumnGeneration(staff, slots, opts, { incumbentScore: r.score, tolerance: 0.5, nodeLimit: 100000, ms });
  const best = Math.min(r.score, b.best ?? Infinity);
  console.log([c, slots.length, r.score.toFixed(2), b.rootLP.toFixed(2), b.floor.toFixed(2), b.best == null ? "-" : b.best.toFixed(2), (best - b.floor).toFixed(2), b.proven, b.stats.nodes, b.stats.columns, b.stats.inexactPricing, b.stats.ms].join("\t"));
}
