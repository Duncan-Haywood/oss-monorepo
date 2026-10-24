// Open-hours floor from pricing shifts (Lagrangian) against the exact coverage pass's proven floor, on the ejection-bench weeks.
//   node eval/pricing-bench.mjs [cases=8] [people=8] [shifts=22]
import { parseStaff, parseShifts, buildRoster, openFloorByPricing } from "../calc.mjs";

const cases = Number(process.argv[2] || 8), P = Number(process.argv[3] || 8), S = Number(process.argv[4] || 22);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
let seed = 20261022 + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let sf = 0, sp = 0, so = 0;
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, { exact: true, exactNodes: 30000, exactMs: 20000 });
  const open = r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  const t0 = Date.now();
  const L = openFloorByPricing(staff, slots, {}, { incumbentOpen: open });
  console.log(`case ${c}: roster open ${open} h, flow/search floor ${r.optimality.forcedOpenHours} h, pricing floor ${L ? L.floor.toFixed(1) : "n/a"} h (${L ? L.sets : 0} sets, ${Date.now() - t0} ms)`);
  so += open; sf += r.optimality.forcedOpenHours; sp += L ? L.floor : NaN;
}
console.log(`${P} x ${S}: open ${so} h, existing floor ${sf} h, pricing floor ${sp.toFixed(1)} h`);
