// Does the whole-score column generation keep to its time share on big weeks? Runs buildRoster on the end-to-end generator's
// weeks (eval/end-to-end.mjs, same seed rule) at the default 20 s budget and prints column generation's share, its time, and
// where that time went (LP solves vs pricing calls, the longest single call of each).
//   node eval/cg-overrun.mjs P S cases [first]     OPTS='{...}' adds buildRoster options.
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 90), S = Number(process.argv[3] || 252), cases = Number(process.argv[4] || 3), first = Number(process.argv[5] || 0);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
console.log(`== ${P} x ${S}, options ${JSON.stringify({ timeBudgetMs: 20000, ...extra })}`);
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < first) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000, ...extra });
  const ms = Date.now() - t0, o = r.optimality || {}, g = o.scoreCG || {};
  console.log(`week ${c}: ${slots.length} copies, open ${r.unfilledHours} h, ${o.status}, gap $${(o.gap ?? 0).toFixed(2)}, ${ms} ms total; cg share ${g.shareMs ?? "-"} ms, cg ${g.ms} ms (lp ${g.lpMs}, longest ${g.maxLpMs}; pricing ${g.pricingMs}, longest ${g.maxPricingMs}; ${g.rounds} rounds, ${g.pricingCalls} calls), clique ${o.cliqueFloor ? "ran" : "skipped"}`);
  console.log(`  ${Object.entries(r.timings).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
