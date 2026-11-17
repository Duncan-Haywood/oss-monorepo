// Does a longer per-week exact budget prove more weeks of a multi-week plan? The page's planner passes exactMs: 4000 to
// planWeeks (each week's buildRoster), half the builder's 8000 default. This plans the same weeks at several budgets and
// prints, per planned week, the time, open hours, pay and proof status, plus a per-budget summary.
//   node eval/plan-budget.mjs templates [weeks=4]
//   node eval/plan-budget.mjs P S [cases=2] [weeks=4]       (the cg-scale-bench / auto-exact generator and seed rule)
// BUDGETS=4000,8000,16000 picks the exactMs values (that is the default). Options mirror the page's planner call.
import { planWeeks, TEMPLATES } from "../calc.mjs";
const budgets = (process.env.BUDGETS || "4000,8000,16000").split(",").map(Number);
const page = { minRestHours: 10, maxConsecDays: 6, maxDailyHours: 0, otAfter: 40, otMult: 1.5, burdenPct: 0, balance: 25, toughBalance: 0, exact: "auto" };
const proven = (r) => r.optimality?.status === "optimal" || r.optimality?.status === "improved";
const totals = new Map(budgets.map((b) => [b, { weeks: 0, proven: 0, open: 0, pay: 0, ms: 0, score: 0 }]));
function plan(label, staffText, shiftsText, weeks) {
  console.log(label);
  for (const b of budgets) {
    const t0 = Date.now();
    const at = [];
    const p = planWeeks(staffText, shiftsText, { ...page, weeks, weekStart: "2026-11-16", exactMs: b, onWeek: () => at.push(Date.now()) });
    if (p.error) { console.log(`  exactMs ${b}: error ${p.error}`); continue; }
    const t = totals.get(b);
    let prev = t0;
    const cells = p.weeks.map((w, i) => {
      const ms = at[i] - prev; prev = at[i];
      const r = w.roster;
      t.weeks++; t.proven += proven(r) ? 1 : 0; t.open += r.unfilledHours; t.pay += r.cost; t.score += Number(r.score); t.ms += ms;
      return `w${w.week} ${String(ms).padStart(6)} ms, open ${String(r.unfilledHours).padStart(3)} h, pay $${r.cost.toFixed(2)}, score ${Number(r.score).toFixed(2)}, ${r.optimality?.status ?? "none"}`;
    });
    console.log(`  exactMs ${String(b).padStart(5)}: total ${Date.now() - t0} ms, open ${p.totalOpenHours} h, pay $${p.totalCost.toFixed(2)}`);
    for (const c of cells) console.log(`    ${c}`);
  }
}
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
if (process.argv[2] === "templates") {
  const weeks = Number(process.argv[3] || 4);
  for (const [k, t] of Object.entries(TEMPLATES)) plan(`${k} (${weeks} weeks)`, t.staff(), t.shifts(), weeks);
} else {
  const P = Number(process.argv[2] || 20), S = Number(process.argv[3] || 56), cases = Number(process.argv[4] || 2), weeks = Number(process.argv[5] || 4);
  let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  for (let c = 0; c < cases; c++) {
    const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    plan(`${P} x ${S} case ${c} (${weeks} weeks)`, st, sh, weeks);
  }
}
console.log("summary (all plans above):");
for (const [b, t] of totals) console.log(`  exactMs ${String(b).padStart(5)}: ${t.proven} of ${t.weeks} weeks proven, open ${t.open} h, pay $${t.pay.toFixed(2)}, score ${t.score.toFixed(2)}, ${(t.ms / 1000).toFixed(1)} s`);
