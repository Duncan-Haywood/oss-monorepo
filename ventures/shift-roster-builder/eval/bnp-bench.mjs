// Branch-and-price (bnp.mjs) on the seeded bench weeks of eval/ilp-export.mjs: does the exact Dantzig-Wolfe LP with
// branching prove the least open hours where the engine's priced floor stops short?
//   node eval/bnp-bench.mjs P S [cases=4] [nodeLimit=5000] [ms=60000]   (INC=h sets the incumbent for every case)
// Same generator and seed as ilp-export.mjs and scale-bench.mjs. Hard rules only. The incumbent handed to branch-and-price is
// the HiGHS optimum recorded in the README for these weeks when known (so the run measures the proof alone), else none.
import { parseStaff, parseShifts, openFloorByPricing } from "../calc.mjs";
import { branchAndPriceOpen } from "../bnp.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 8), S = Number(process.argv[3] || 22), cases = Number(process.argv[4] || 4);
const nodeLimit = Number(process.argv[5] || 5000), ms = Number(process.argv[6] || 60000);
// HiGHS optima from eval/ilp-check.py (README, "Coverage plateau pass" and "More plateau walks").
const ILP = { "8x22": [57, 4, 98, 35], "10x28": [110, 93, 57, 78, 89, 99, 61, 39], "12x30": [92, 75, 47, 22] };
let seed = Number(process.env.SEED || 20261022) + P * 100 + S; // SEED=20261101 gives the rolling-gap-bench.mjs sets
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
console.log("case  sets   priced-floor  DW-LP   bnp-floor  ILP  proven  nodes  ms");
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const pf = openFloorByPricing(staff, slots, { exact: true });
  const opt = process.env.INC ? Number(process.env.INC) : process.env.SEED ? Infinity : ILP[`${P}x${S}`]?.[c] ?? Infinity;
  const r = branchAndPriceOpen(pf.cov.sets, pf.cov.len, { incumbentOpen: opt, nodeLimit, ms });
  console.log([c, pf.sets, pf.floor.toFixed(2), r.rootLP.toFixed(2), r.floor, opt === Infinity ? "-" : opt, r.proven, r.stats.nodes, r.stats.ms].join("\t"));
}
