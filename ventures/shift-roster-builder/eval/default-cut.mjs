// The priced cut without --short-cost (2026-11-11). eval/cost-cut.mjs measured the cost-aware cut only for the fractile
// rule under --short-cost; the plain average, which is what --from-sales gives by default, was still cut the old way
// (every run shorter than --min-shift stretched to a whole shift). Here the default plan is cut both ways and scored on
// the shifts, short + over at equal weight (r = 1), plus the half-life rows and, with a short-cost weight r, the average
// row cut at that r. Every full week after the first four is planned from the weeks before it; paired differences with a
// normal 95% interval over the tested weeks. Same public mirrors and SHA-256 as eval/short-cost.mjs; downloaded, not
// committed. Minimum staff 1, --max-shift 8.   node eval/default-cut.mjs [korean.csv french.csv]   Output: eval/default-cut.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { backtestSales } from "../demand.mjs";

const FILES = [
  { name: "Korean bakery (orders, KRW)", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splh: [15000, 30000, 60000] },
  { name: "French bakery (item lines, EUR)", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splh: [20, 40, 80] },
];
const f = (x) => x.toFixed(1);
const paired = (wx, wy) => {
  const d = wx.map((x, k) => x - wy[k]);
  const md = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - md) ** 2, 0) / Math.max(1, d.length - 1));
  const half = 1.96 * sd / Math.sqrt(d.length);
  return `${md >= 0 ? "+" : ""}${f(md)} (${f(md - half)} to ${f(md + half)})`;
};
for (const [i, F] of FILES.entries()) {
  const bytes = process.argv[2 + i] ? await readFile(process.argv[2 + i]) : Buffer.from(await (await fetch(F.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== F.sha) { console.error(`${F.name}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  const text = bytes.toString("utf8");
  console.log(`\n== ${F.name}: no --short-cost, scored short + over`);
  console.log("splh   min-shift | profile cost | plain cut: short over sched cost | priced cut: short over sched cost | priced - plain (95% CI)   | best priced row, vs plain average");
  for (const splh of F.splh) for (const minShift of [3, 4, 6]) {
    const prof = backtestSales(text, { scoreClosed: false, splh, minShift }).methods[0];
    const P = backtestSales(text, { scoreClosed: false, splh, minShift, shifts: true, costCut: false }), C = backtestSales(text, { scoreClosed: false, splh, minShift, shifts: true });
    const a = P.methods[0], c = C.methods[0];
    const best = C.methods.reduce((x, y) => (y.miss < x.miss ? y : x));
    console.log(`${String(splh).padEnd(7)}${String(minShift).padEnd(10)}| ${f(prof.miss).padStart(12)} | ${f(a.short).padStart(16)} ${f(a.over).padStart(4)} ${f(a.scheduled).padStart(5)} ${f(a.miss).padStart(5)} | ${f(c.short).padStart(17)} ${f(c.over).padStart(4)} ${f(c.scheduled).padStart(5)} ${f(c.miss).padStart(5)} | ${paired(C.perWeek.all, P.perWeek.all).padEnd(26)}| ${best.label}: ${paired(C.perWeek[best.id], P.perWeek.all)}`);
  }
  console.log(`\n== ${F.name}: the average row under --short-cost r, min-shift 4, scored r x short + over`);
  console.log("splh   r     | average plain cut | average priced cut | priced - plain (95% CI)");
  for (const splh of F.splh) for (const r of [1 / 3, 3]) {
    const P = backtestSales(text, { scoreClosed: false, splh, shortCost: r, shifts: true, costCut: false }), C = backtestSales(text, { scoreClosed: false, splh, shortCost: r, shifts: true });
    console.log(`${String(splh).padEnd(7)}${r.toFixed(2).padEnd(6)}| ${f(P.methods[0].miss).padStart(17)} | ${f(C.methods[0].miss).padStart(18)} | ${paired(C.perWeek.all, P.perWeek.all)}`);
  }
}
