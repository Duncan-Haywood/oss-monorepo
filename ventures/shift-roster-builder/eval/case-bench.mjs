// One 8 x 22 week at a time with a big exact budget: is an unproven week short on search or on the bound?
//   ONLY=3 node eval/case-bench.mjs [exactNodes=100000] [exactMs=20000]   (DUMP=1 prints the week)
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P=8,S=22;let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const nodesArg=Number(process.argv[2]||100000), ms=Number(process.argv[3]||20000);
for (let c = 0; c < 4; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if(process.env.ONLY&&c!=Number(process.env.ONLY))continue;
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, flowBalance: true, balance: 60, exactNodes:nodesArg, exactMs: ms, restarts: 2, iterations: 2000, reducedCostFixing:true });
  const o=r.optimality; const open=r.unfilled.reduce((a,u)=>a+(u.slot.end-u.slot.start)/60,0);
  console.log(c,o.status,"covProven",o.coverageProven,"forced",o.forcedOpenHours,"open",open,"gap",o.gap.toFixed(2),"nodes",o.nodes);
  if(process.env.DUMP&&!o.coverageProven){console.log(st);console.log(sh);console.log(JSON.stringify(r.unfilled.map(u=>u.slot)))}
}
