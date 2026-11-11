// Placing the plain average's shortest-shift stretch (2026-11-11). eval/cost-cut.mjs measured the cost-aware cut under
// --short-cost; without the flag (what most users run) a run shorter than --min-shift was still stretched later-first,
// blind to the data. Now the stretch goes to the window whose added hours past dates most often needed (cutShifts
// cost.place: every run is still staffed, nothing is dropped, and windows into fewer shut hours come first). For both
// real POS exports (same mirrors and SHA-256 as eval/short-cost.mjs; downloaded, not committed), every full week after the
// first four is planned from the weeks before it with the plain average, cut into shifts, and scored as r x short + over
// person-hours a week (r = 1 is the plain backtest's own score), old stretch vs placed stretch, paired 95% interval.
// Output: eval/place-cut.out.txt.   node eval/place-cut.mjs [korean.csv french.csv]
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const f = (x) => x.toFixed(1);
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name}  (plain average, max shift 8, minimum staff 1; person-hours a week)`);
  console.log("splh   min-shift  r     old stretch: short over sched cost | placed: short over sched cost | placed - old (95% CI)");
  for (const splh of F.splh) for (const minShift of [4, 6]) for (const r of [1 / 3, 1, 3]) {
    // With shortCost r the backtest scores r x short + over; its first row ("all") stays the plain average.
    const run = (costCut) => backtestSales(text, { splh, minShift, shortCost: r, shifts: true, costCut });
    const oldB = run(false), newB = run(true);
    const cost = (b) => b.perWeek.all;
    const a = oldB.methods[0], c = newB.methods[0], wa = cost(oldB), wc = cost(newB);
    const d = wc.map((x, k) => x - wa[k]), md = d.reduce((x, y) => x + y, 0) / d.length;
    const sd = Math.sqrt(d.reduce((x, y) => x + (y - md) ** 2, 0) / Math.max(1, d.length - 1)), half = 1.96 * sd / Math.sqrt(d.length);
    const m = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    console.log(`${String(splh).padEnd(7)}${String(minShift).padEnd(11)}${r.toFixed(2).padEnd(6)}${f(a.short).padStart(18)} ${f(a.over).padStart(5)} ${f(a.scheduled).padStart(5)} ${f(m(wa)).padStart(6)} | ${f(c.short).padStart(13)} ${f(c.over).padStart(5)} ${f(c.scheduled).padStart(5)} ${f(m(wc)).padStart(6)} | ${md >= 0 ? "+" : ""}${f(md)} (${f(md - half)} to ${f(md + half)})`);
  }
}
