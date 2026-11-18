// Branch-and-price by column generation (columnGenerationOpen in bnp.mjs, pricing oracle makeSetPricer in calc.mjs) on the
// seeded bench weeks: the same weeks as bnp-bench.mjs, and the big rolling-gap weeks where one person has over 60,000 valid
// sets, so the enumerated LP (branchAndPriceOpen) is skipped by the engine.
//   node eval/cg-bench.mjs P S [cases=4] [nodeLimit=2000] [ms=60000]   (SEED=20261101 gives the rolling-gap-bench.mjs sets;
//   INC=h sets the incumbent for every case; ENUM=1 also runs the enumerated LP when the sets fit under 60,000 per person)
// Hard rules only. The incumbent is the HiGHS optimum recorded in the README for the default-seed weeks when known.
import { parseStaff, parseShifts, openFloorByPricing, openFloorByColumnGeneration } from "../calc.mjs";
import { branchAndPriceOpen } from "../bnp.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 10), S = Number(process.argv[3] || 28), cases = Number(process.argv[4] || 4);
const nodeLimit = Number(process.argv[5] || 2000), ms = Number(process.argv[6] || 60000);
const ILP = { "8x22": [57, 4, 98, 35], "10x28": [110, 93, 57, 78, 89, 99, 61, 39], "12x30": [92, 75, 47, 22] };
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
console.log("case  enum-sets  enum-floor  CG-rootLP  CG-floor  incumbent  CG-best  proven  nodes  columns  ms");
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const inc = process.env.INC ? Number(process.env.INC) : process.env.SEED ? Infinity : ILP[`${P}x${S}`]?.[c] ?? Infinity;
  let enumSets = "-", enumFloor = "-";
  if (process.env.ENUM) {
    const pf = openFloorByPricing(staff, slots, { exact: true });
    if (pf) { enumSets = pf.sets; enumFloor = branchAndPriceOpen(pf.cov.sets, pf.cov.len, { incumbentOpen: inc, nodeLimit, ms }).floor; }
    else enumSets = "over cap";
  }
  const r = openFloorByColumnGeneration(staff, slots, { exact: true }, { incumbentOpen: inc, nodeLimit, ms });
  console.log([c, enumSets, enumFloor, r.rootLP.toFixed(2), r.floor, inc === Infinity ? "-" : inc, r.best ?? "-", r.proven, r.stats.nodes, r.stats.columns, r.stats.ms].join("\t"));
}
