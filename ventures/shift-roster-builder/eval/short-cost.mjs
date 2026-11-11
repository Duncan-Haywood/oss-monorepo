// The short-vs-over cost weight (--short-cost, 2026-11-11) on both real POS exports: the Korean bakery's orders and the
// French bakery's item lines (same public mirrors and SHA-256 as eval/bakery-backtest.mjs and eval/french-bakery.mjs; the
// files are downloaded, not committed). For each sales-per-labor-hour and each weight r, every full week after the first
// four is planned from the weeks before it and scored as r x short + over person-hours. Rows: the plain average (what
// --from-sales does without the flag), the fractile rule at r with every earlier week equal, and the best weighting with
// the fractile rule; the paired difference from the average has a normal 95% interval over the tested weeks.
// Also: is the fractile r / (1 + r) the best fixed percentile in hindsight? A sweep of fixed shares 0.1-0.9 per setting.
// Output: eval/short-cost.out.txt.   node eval/short-cost.mjs [korean.csv french.csv]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const RS = [1 / 3, 1, 2, 3, 5];
const f = (x) => x.toFixed(1);
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name}`);
  console.log("splh    r     average: short over cost | fractile (all weeks): short over cost  vs avg (95% CI)      | best fractile weighting, vs avg");
  for (const splh of F.splh) for (const r of RS) {
    const b = backtestSales(text, { splh, shortCost: r });
    const a = b.methods[0], q = b.methods.find((m) => m.id === "q-all");
    const best = b.methods.slice(1).reduce((x, y) => (y.miss < x.miss ? y : x));
    const ci = (m) => `${m.vsDefault >= 0 ? "+" : ""}${f(m.vsDefault)} (${f(m.ci[0])} to ${f(m.ci[1])})`;
    console.log(`${String(splh).padEnd(6)}${r.toFixed(2).padStart(5)}  ${f(a.short).padStart(13)} ${f(a.over).padStart(4)} ${f(a.miss).padStart(5)} | ${f(q.short).padStart(27)} ${f(q.over).padStart(4)} ${f(q.miss).padStart(5)}  ${ci(q).padEnd(20)}| ${best.label.replace(/, short cost.*/, "")}: ${ci(best)}`);
  }
  // Hindsight check of the rule: at the middle splh, which fixed share would have been cheapest for each r?
  const splh = F.splh[1];
  const shares = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9];
  const runs = shares.map((p) => ({ p, b: backtestSales(text, { splh, shortCost: p / (1 - p) }) }));
  console.log(`\nsplh ${splh}: weighted cost per week of the fractile rule (all weeks equal) run at each fixed share p, scored at each r`);
  console.log("r      " + shares.map((p) => p.toFixed(2).padStart(7)).join("") + "   best p  vs r/(1+r)");
  for (const r of RS) {
    const costs = runs.map(({ b }) => { const q = b.methods.find((m) => m.id === "q-all"); return r * q.short + q.over; });
    const k = costs.indexOf(Math.min(...costs));
    console.log(`${r.toFixed(2).padEnd(7)}${costs.map((c) => f(c).padStart(7)).join("")}   ${shares[k].toFixed(2).padStart(6)}  ${(r / (1 + r)).toFixed(2)}`);
  }
}
