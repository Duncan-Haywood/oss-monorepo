// The shift cut under a short-vs-over weight (2026-11-11) on both real POS exports (same public mirrors and SHA-256 as
// eval/short-cost.mjs; downloaded, not committed). --short-cost staffs each hour for the r/(1+r) share of its past dates,
// but until now the backtest scored that headcount profile, not the shifts cut from it: a run shorter than --min-shift
// was always stretched to it, and those spare hours never showed. Here every full week after the first four is planned
// from the weeks before it and scored as r x short + over three ways, for the fractile rule with every earlier week equal:
//   profile    the headcount profile itself (what the backtest scored before)
//   plain cut  the shifts the old cut makes from it (always stretch a short run)
//   cost cut   the cost-aware cut (stretch to the cheapest window, or leave the run unstaffed when that is cheaper)
//   avg cut    the plain average (no --short-cost), cut the old way: what --from-sales gives without the flag
// The cost-cut minus plain-cut and cost-cut minus avg-cut differences are paired over the tested weeks with a normal 95%
// interval. Costs are person-hours a week, minimum staff 1, --max-shift 8.
// Output: eval/cost-cut.out.txt.   node eval/cost-cut.mjs [korean.csv french.csv]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const RS = [1 / 3, 1, 3];
const MIN_SHIFTS = [4, 6];
const f = (x) => x.toFixed(1);
const q = (b) => b.methods.find((m) => m.id === "q-all");
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name}`);
  console.log("splh   min-shift  r     profile: short over cost | plain cut: short over sched cost | cost cut: short over sched cost | cost - plain (95% CI)    | avg cut cost  cost - avg cut (95% CI)");
  for (const splh of F.splh) for (const minShift of MIN_SHIFTS) for (const r of RS) {
    const base = { splh, shortCost: r, minShift };
    const p = q(backtestSales(text, base));
    const plainB = backtestSales(text, { ...base, shifts: true, costCut: false });
    const costB = backtestSales(text, { ...base, shifts: true });
    const a = q(plainB), c = q(costB);
    // Paired differences week by week: every run scores the same weeks in the same order.
    const paired = (wx, wy) => {
      const d = wx.map((x, k) => x - wy[k]);
      const md = d.reduce((x, y) => x + y, 0) / d.length;
      const sd = Math.sqrt(d.reduce((x, y) => x + (y - md) ** 2, 0) / Math.max(1, d.length - 1));
      const half = 1.96 * sd / Math.sqrt(d.length);
      return `${md >= 0 ? "+" : ""}${f(md)} (${f(md - half)} to ${f(md + half)})`;
    };
    const vsPlain = paired(costB.perWeek["q-all"], plainB.perWeek["q-all"]);
    // The average row cut the old way (since 2026-11-11 the average's own cut is priced too unless costCut is false).
    const vsAvg = paired(costB.perWeek["q-all"], plainB.perWeek.all);
    const avgCut = plainB.methods[0];
    console.log(`${String(splh).padEnd(7)}${String(minShift).padEnd(11)}${r.toFixed(2).padEnd(6)}${f(p.short).padStart(13)} ${f(p.over).padStart(4)} ${f(p.miss).padStart(5)} | ${f(a.short).padStart(16)} ${f(a.over).padStart(4)} ${f(a.scheduled).padStart(5)} ${f(a.miss).padStart(5)} | ${f(c.short).padStart(15)} ${f(c.over).padStart(4)} ${f(c.scheduled).padStart(5)} ${f(c.miss).padStart(5)} | ${vsPlain.padEnd(23)}| ${f(avgCut.miss).padStart(12)}  ${vsAvg}`);
  }
}
