// Open hours the engine leaves on seeded weeks (same generator as ilp-export.mjs), for comparing coverPass neighbourhoods.
//   node eval/cover-bench.mjs P S [cases=8] [first=0]   (ILP optimum: eval/ilp-check.py on eval/ilp-export.mjs output)
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 10), S = Number(process.argv[3] || 28), cases = Number(process.argv[4] || 8), first = Number(process.argv[5] || 0);
let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const res = [];
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < first) continue;
  const t = Date.now();
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, exactMs: 20000, restarts: 2, iterations: 2000, reducedCostFixing: true, coverBranch: true, coverBranchNodes: 60, coverBranchMs: 4000 });
  res.push(`w${c + 1}: ${r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0)} h open, floor ${r.optimality.forcedOpenHours} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  console.log(res[res.length - 1]);
}
