// node eval/score-dive-backtrack-bench.mjs P S cases [budget=P]   (SEED=n picks the seed; weeks as score-cg-scale-bench.mjs)
// Pay bound (scoreBoundByColumnGeneration), dive only (nodeLimit 1): incumbent = annealed roster. Weeks where the dive without
// retries leaves a gap; does backtracking close it?
import { parseStaff, parseShifts, buildRoster, scoreBoundByColumnGeneration } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2]), S = Number(process.argv[3]), cases = Number(process.argv[4]), B = Number(process.argv[5] || P);
let seed = Number(process.env.SEED || 5) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const opts = { balance: 60, restarts: 2, iterations: 4000, exact: false };
let miss = 0, closed = 0, better = 0;
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, opts);
  const cfg = { incumbentScore: r.score, tolerance: 0.5, nodeLimit: 1, ms: 60000 };
  const a = scoreBoundByColumnGeneration(staff, slots, opts, { ...cfg, diveBacktrack: 0 });
  if (a.proven) continue;
  miss++;
  const b = scoreBoundByColumnGeneration(staff, slots, opts, { ...cfg, diveBacktrack: B });
  const ga = Math.min(r.score, a.best ?? Infinity) - a.floor, gb = Math.min(r.score, b.best ?? Infinity) - b.floor;
  if (b.proven) closed++; if (gb < ga - 1e-6) better++;
  console.log(c, "gap no-retry", ga.toFixed(2), a.stats.ms + "ms", "| retries", b.stats.diveRetries ?? 0, "gap", gb.toFixed(2), b.proven ? "proven" : "open", b.stats.ms + "ms");
}
console.log(`P=${P} S=${S} seed ${process.env.SEED || 5}, budget ${B}: ${miss} of ${cases} weeks open after the dives without retries; backtracking proves ${closed}, narrows ${better}`);
