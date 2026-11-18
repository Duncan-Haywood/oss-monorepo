// buildRoster end to end with the exact check on, on the cg-scale-bench weeks (same generator and seed rule), with no time
// budget: where does the time go? Prints each stage's milliseconds (result.timings) and the proof status.
//   node eval/end-to-end.mjs [P=40] [S=112] [cases=2] [first=0]
// OPTS='{"...":...}' merges extra buildRoster options (e.g. '{"timeBudgetMs":20000}').
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 40), S = Number(process.argv[3] || 112), cases = Number(process.argv[4] || 2), first = Number(process.argv[5] || 0);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
console.log(`${P} people, ${S} shift lines, exact on, options ${JSON.stringify(extra)}`);
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < first) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: 0, ...extra });
  const ms = Date.now() - t0;
  const o = r.optimality || {};
  const t = Object.entries(r.timings).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`week ${c}: ${slots.length} copies, open ${r.unfilledHours} h, ${r.unfilledSlots} shifts, pay $${r.cost.toFixed(2)}, status ${o.status}, coverage proven ${o.coverageProven}, gap $${(o.gap ?? 0).toFixed(2)}, ${ms} ms total`);
  console.log(`  ${t}`);
  if (o.scoreCG) console.log(`  scoreCG proven ${o.scoreCG.proven}, root ${o.scoreCG.rootLP?.toFixed?.(2)}, bound ${o.scoreCG.bound?.toFixed?.(2)}, nodes ${o.scoreCG.nodes}, ${o.scoreCG.ms} ms`);
}
