// The day-by-day reassignment pass (calc.mjs dayReassign, buildRoster's dayLNS) by its time slice, on the cg-scale-bench weeks
// (same generator and seed rule as eval/end-to-end.mjs). Prints the score before and after the pass, the lower bound, and the gap.
//   node eval/day-lns.mjs [P=60] [S=168] [week=0] [ms list=0,500,2000,5000]
// OPTS='{"...":...}' merges buildRoster options (default {"timeBudgetMs":20000}).
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const list = (process.argv[5] || "0,500,2000,5000").split(",").map(Number);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : { timeBudgetMs: 20000 };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  for (const ms of list) {
    const t0 = Date.now();
    const r = buildRoster(staff, slots, { exact: true, ...extra, ...(ms > 0 ? { dayLNSMs: ms } : { dayLNS: false }) });
    const o = r.optimality, d = o.dayLNS;
    console.log(`${P} x ${S} week ${c}, dayLNS ${ms > 0 ? `${ms} ms` : "off"}: score ${r.score.toFixed(2)}, lower bound ${o.lowerBound.toFixed(2)}, gap $${o.gap.toFixed(2)}, status ${o.status}` +
      `${d ? `; pass ${d.before.toFixed(2)} -> ${d.after.toFixed(2)} in ${d.kicks} kicks, ${d.ms} ms` : ""}; ${Date.now() - t0} ms total`);
  }
}
