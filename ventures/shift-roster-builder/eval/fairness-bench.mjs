// Does --tough-balance even out weekend, closing and opening shifts over 8 weeks? Seeded crews, three settings, same shifts every week.
//   node eval/fairness-bench.mjs [crews=12] [weeks=8] [mode=open|narrow]
// mode narrow: only some people can close (a third), some only open or work days, so tough shifts cannot be spread freely.
import { planWeeks, planFairness } from "../calc.mjs";

const crews = Number(process.argv[2] || 12), weeks = Number(process.argv[3] || 8), mode = process.argv[4] || "open";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
let seed = 20261022;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const settings = [0, 40, 100];
const tot = settings.map(() => ({ spread: 0, sd: 0, open: 0, cost: 0, flagged: 0 }));
for (let c = 0; c < crews; c++) {
  const P = 6 + rnd(3);
  // Everyone can work any day 6:00-24:00, so the only thing that differs is the wage and weekly cap; fairness is then a pure choice.
  const st = Array.from({ length: P }, (_, p) => `P${p},${14 + rnd(6)},${24 + rnd(3) * 8},,${mode === "narrow" ? ["", "Mon-Sun 6-20", "Mon-Sun 6-20"][p % 3] : ""}`).join("\n");
  const sh = [];
  for (let d = 0; d < 7; d++) {
    sh.push(`${days[d]},6,14,1`, `${days[d]},14,23,1`);
    if (d >= 4) sh.push(`${days[d]},11,19,1`);
  }
  settings.forEach((tb, i) => {
    const plan = planWeeks(st, sh.join("\n"), { weeks, weekStart: "2026-11-02", toughBalance: tb, exact: false, restarts: 2, iterations: 1500 });
    if (plan.error) throw new Error(plan.error);
    const f = planFairness(plan), t = f.rows.map((r) => r.tough), mean = t.reduce((a, b) => a + b, 0) / t.length;
    tot[i].spread += f.spread; tot[i].sd += Math.sqrt(t.reduce((a, b) => a + (b - mean) ** 2, 0) / t.length);
    tot[i].open += plan.totalOpenHours; tot[i].cost += plan.totalCost; tot[i].flagged += f.flag ? 1 : 0;
  });
}
console.log(`${crews} seeded crews of 6-8, ${weeks} weeks each, mode ${mode}`);
settings.forEach((tb, i) => {
  const x = tot[i];
  console.log(`toughBalance ${String(tb).padStart(3)}: mean max-min tough shifts ${(x.spread / crews).toFixed(2)}, mean std dev ${(x.sd / crews).toFixed(2)}, flagged ${x.flagged}/${crews}, mean payroll ${(x.cost / crews).toFixed(0)}, mean open hours ${(x.open / crews).toFixed(1)}`);
});
