// Once coverage is proven (open hours == proven floor), how far is the roster's pay from the lower bound?
//   node eval/pay-gap-bench.mjs [P=8] [S=22] [sets=12]
// Same seeded generator as rolling-gap-bench.mjs. Score units: 100,000 per open hour, then cents of pay and balance terms (so gap/100 is dollars).
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 8), S = Number(process.argv[3] || 22), sets = Number(process.argv[4] || 12);
let seed = 20261101 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const opts = { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, exactMs: 8000, restarts: 2, iterations: 2000, reducedCostFixing: true };
let proven = 0, closed = 0; const gaps = [];
for (let c = 0; c < sets; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, opts);
  const o = r.optimality;
  if (!o) { console.log(c, "no optimality"); continue; }
  const cov = o.coverageProven;
  const pay = r.cost;
  console.log(`week ${c}: ${o.status}, coverage proven ${cov}, open ${r.unfilledHours} h (floor ${o.forcedOpenHours}), pay $${pay.toFixed(2)}, pay gap $${(o.gap / 100).toFixed(2)} = ${(o.gap / pay).toFixed(3)}% of pay`);
  if (cov) { proven++; gaps.push(o.gap); if (o.status === "optimal" || o.gap <= o.tolerance * 100) closed++; }
}
gaps.sort((a, b) => a - b);
console.log(`coverage proven on ${proven}/${sets} weeks; pay gap closed on ${closed}; median gap (cents) ${gaps[gaps.length >> 1]?.toFixed(1)}, max ${gaps.at(-1)?.toFixed(1)}`);
